import { characters, factions, boardDefinition } from '../data/board.js';
import { confirmedRules, experimentalDefaults, economyProfiles, validateConfig } from '../config/game-config.js';
import { seedValue, shuffle, nextRandom } from './random.js';
import { events, cards } from '../data/events.js';

export const Phase = Object.freeze({
  TURN_START: 'TURN_START', MOVING: 'MOVING', BUY_DECISION: 'BUY_DECISION',
  UPGRADE_DECISION: 'UPGRADE_DECISION', DEBT_RESOLUTION: 'DEBT_RESOLUTION',
  TURN_END: 'TURN_END', GAME_OVER: 'GAME_OVER',
  EXTRA_ROLL: 'EXTRA_ROLL', CARD_DECISION: 'CARD_DECISION', CARD_GAIN_DECISION: 'CARD_GAIN_DECISION',
});

export function createGame({ humanId = 'liu', seed = '三国-1', mode = 'rounds', economy = 'standard', config = {}, board = boardDefinition } = {}) {
  if (!characters.some((character) => character.id === humanId)) throw new Error('未知角色');
  const human = characters.find((character) => character.id === humanId);
  const selectedCharacters = factions.map((faction) => characters.find((character) => character.id === (faction.id === human.factionId ? humanId : faction.defaultCharacterId)));
  if (!['rounds', 'classic'].includes(mode)) throw new Error('未知终局模式');
  if (!Object.hasOwn(economyProfiles, economy)) throw new Error('未知经济预设');
  const settings = { ...experimentalDefaults, ...economyProfiles[economy], ...config, ...confirmedRules,
    defaultRoundLimit: config.defaultRoundLimit ?? confirmedRules.defaultRoundLimit };
  settings.boardSize = board.length;
  validateConfig(settings);
  if (!Number.isInteger(settings.initialCash) || settings.initialCash < 0 || !Number.isInteger(settings.defaultRoundLimit) || settings.defaultRoundLimit < 1) throw new Error('初始现金与轮数必须是合法整数');
  if (!Number.isInteger(settings.diceSides) || settings.diceSides < 1 || settings.diceCount !== 1) throw new Error('本原型仅支持一颗正整数面数骰子');
  if (board.length < 2 || board.filter((tile) => tile.type === 'start').length !== 1) throw new Error('地图必须有且只有一个起点');
  const startIndex = board.findIndex((tile) => tile.type === 'start');
  const shuffled = shuffle(selectedCharacters.map((character) => character.id), seedValue(seed));
  return {
    version: 3, seed: String(seed), mode, rngState: shuffled.state, config: settings,
    phase: Phase.TURN_START, revision: 0, round: 1, completedRounds: 0,
    order: shuffled.order, roundRemaining: [...shuffled.order], turnIndex: 0, startIndex, dice: null, debt: null,
    move: null, pendingCard: null, extraRollUsed: false, rollCount: 0,
    players: selectedCharacters.map((character) => ({ ...character, human: character.id === humanId,
      aiStyle: character.id === humanId ? null : selectedCharacters.filter((p) => p.id !== humanId).findIndex((p) => p.id === character.id) === 0 ? 'conservative' : 'aggressive',
      cash: settings.initialCash, position: startIndex, laps: 0, alive: true, cards: [], skipTurns: 0, moveBonus: 0 })),
    board: board.map((tile, index) => ({ ...tile, index, ownerId: null, level: 0, investment: 0 })),
    log: ['新局开始：开局站在起点不领取俸禄。'],
  };
}

export const currentPlayer = (state) => state.players.find((player) => player.id === state.order[state.turnIndex]);

export function landPrice(state, tile) { return state.config.landPrices[tile.tier]; }
export function rent(state, tile, level = tile.level) {
  return Math.round(landPrice(state, tile) * state.config.rentMultipliers[level - 1]);
}
export function upgradeCost(state, tile) {
  return Math.round(landPrice(state, tile) * state.config.upgradeMultipliers[tile.level - 1]);
}
export function assets(state, playerId) {
  const player = state.players.find((item) => item.id === playerId);
  const lands = state.board.filter((tile) => tile.ownerId === playerId);
  const investment = lands.reduce((sum, tile) => sum + tile.investment, 0);
  const landValue = lands.reduce((sum, tile) => sum + Math.min(tile.investment, landPrice(state, tile)), 0);
  return { cash: player.cash, investment, total: player.cash + investment,
    landValue, buildingValue: investment - landValue,
    recovery: lands.reduce((sum, tile) => sum + Math.floor(tile.investment * state.config.assetSellbackRatio), 0), count: lands.length };
}
export function ranking(state) {
  const rows = state.players.map((player) => ({ ...player, ...assets(state, player.id) }))
    .sort((a, b) => Number(b.alive) - Number(a.alive) || b.total - a.total);
  return rows.map((row, index) => ({ ...row, rank: index > 0 && rows[index - 1].total === row.total && rows[index - 1].alive === row.alive
    ? rows.findIndex((item) => item.total === row.total && item.alive === row.alive) + 1 : index + 1 }));
}

function log(state, message) {
  state.log.push(message); state._events?.push(message);
  if (state.log.length > 5000) state.log.splice(0, state.log.length - 5000);
}
function resetLand(tile) { tile.ownerId = null; tile.level = 0; tile.investment = 0; }
function endGame(state, reason) { state.phase = Phase.GAME_OVER; state.endReason = reason; log(state, reason); }
function finishLanding(state) { state.phase = Phase.TURN_END; }
function settleDebt(state) {
  const player = currentPlayer(state);
  if (player.cash < state.debt.amount) return;
  const { amount, creditorId } = state.debt;
  player.cash -= amount;
  const creditor = state.players.find((item) => item.id === creditorId);
  if (creditor) creditor.cash += amount;
  log(state, `${player.name} ${creditor ? `向 ${creditor.name} ` : ''}支付 ${amount} 金（${state.debt.reason || '过路费'}）。`);
  state.debt = null;
  finishLanding(state);
}
function payment(state, amount, creditorId, reason, tileId = null) {
  state.debt = { amount, creditorId, reason, tileId };
  const player = currentPlayer(state);
  if (creditorId && player.cards.includes('rentShield')) {
    state.phase = Phase.CARD_DECISION;
    log(state, `${player.name} 可在扣租 ${amount} 金前使用空城计。`);
    return;
  }
  state.phase = Phase.DEBT_RESOLUTION;
  settleDebt(state);
  if (state.debt) log(state, `${player.name} 欠款 ${amount} 金（${reason}），请卖地筹款。`);
}
function draw(state, length) {
  const random = nextRandom(state.rngState);
  state.rngState = random.state;
  return Math.floor(random.value * length);
}
export function drawEvent(state) {
  const weights = state.config.eventWeights;
  const categories = ['economy', 'movement', 'strategy'];
  const total = categories.reduce((sum, category) => sum + weights[category], 0);
  let choice = draw(state, total);
  const category = categories.find((key) => { choice -= weights[key]; return choice < 0; });
  const pool = events.filter((event) => event.category === category);
  return pool[draw(state, pool.length)];
}
function gainCard(state, card = Object.keys(cards)[draw(state, Object.keys(cards).length)]) {
  const player = currentPlayer(state);
  log(state, `${player.name} 获得锦囊：${cards[card].name}。`);
  if (player.cards.length >= state.config.cardCapacity) {
    state.pendingCard = card; state.phase = Phase.CARD_GAIN_DECISION;
  } else { player.cards.push(card); finishLanding(state); }
}
function resolveEvent(state) {
  const event = drawEvent(state);
  const player = currentPlayer(state);
  log(state, `事件抽签：${event.name}。`);
  if (event.effect === 'money') {
    if (event.amount >= 0) { player.cash += event.amount; log(state, `${player.name} 获得 ${event.amount} 金。`); finishLanding(state); }
    else payment(state, Math.min(-event.amount, state.config.ordinaryEventFineCap), null, event.name);
  } else if (event.effect === 'skip') {
    player.skipTurns++; log(state, `${player.name} 下一次行动机会将跳过。`); finishLanding(state);
  } else if (event.effect === 'extraRoll') {
    if (state.extraRollUsed) { log(state, '本回合已触发急行军，重复事件不再额外移动。'); finishLanding(state); }
    else { state.extraRollUsed = true; state.phase = Phase.EXTRA_ROLL; log(state, '急行军：本回合额外掷一次骰。'); }
  } else gainCard(state, event.card);
}
function landing(state) {
  const player = currentPlayer(state);
  const tile = state.board[player.position];
  if (tile.type !== 'land') {
    if (tile.type === 'start') { log(state, '停在起点，本次跨线奖励已结算。'); finishLanding(state); }
    else if (!state.config.eventsEnabled) { log(state, `${tile.name}：事件关闭，无效果。`); finishLanding(state); }
    else if (tile.type === 'event') resolveEvent(state);
    else if (tile.effect === 'marketTax') payment(state, state.config.facilityAmounts.marketTax, null, '集市税费');
    else if (tile.effect === 'card') gainCard(state);
    else if (tile.effect === 'advice') gainCard(state, 'rentShield');
    else {
      const amount = state.config.facilityAmounts[tile.effect] || 0;
      player.cash += amount; log(state, `${tile.name}：${player.name} 获得补给 ${amount} 金。`); finishLanding(state);
    }
  } else if (!tile.ownerId) state.phase = Phase.BUY_DECISION;
  else if (tile.ownerId === player.id) state.phase = tile.level < state.config.maxBuildingLevel ? Phase.UPGRADE_DECISION : Phase.TURN_END;
  else {
    payment(state, rent(state, tile), tile.ownerId, `${tile.name} 过路费`, tile.id);
  }
}

// Revision + actor + phase validation reject stale/double clicks without mutation.
export function dispatch(state, command) {
  const reject = (error) => ({ state, accepted: false, error });
  if (command.revision !== state.revision) return reject('操作已过期，请按当前页面操作。');
  if (command.actorId !== currentPlayer(state).id) return reject('不是当前角色的行动。');
  const allowed = {
    ROLL: [Phase.TURN_START, Phase.EXTRA_ROLL], FINISH_MOVE: [Phase.MOVING], USE_CARD: [Phase.TURN_START],
    BUY: [Phase.BUY_DECISION], UPGRADE: [Phase.UPGRADE_DECISION],
    PASS: [Phase.BUY_DECISION, Phase.UPGRADE_DECISION],
    END_TURN: [Phase.TURN_END], SELL: [Phase.DEBT_RESOLUTION], BANKRUPT: [Phase.DEBT_RESOLUTION],
    USE_SHIELD: [Phase.CARD_DECISION], PAY_RENT: [Phase.CARD_DECISION],
    KEEP_CARD: [Phase.CARD_GAIN_DECISION], DECLINE_CARD: [Phase.CARD_GAIN_DECISION],
  };
  if (!allowed[command.type]?.includes(state.phase)) return reject('当前阶段不能执行此操作。');
  const next = structuredClone(state);
  next._events = [];
  const player = currentPlayer(next);
  const tile = next.board[player.position];
  switch (command.type) {
    case 'ROLL': {
      const random = nextRandom(next.rngState);
      next.rngState = random.state;
      next.dice = Math.floor(random.value * next.config.diceSides) + 1;
      const steps = next.dice + player.moveBonus;
      player.moveBonus = 0; next.rollCount++;
      const distance = (player.position - next.startIndex + next.board.length) % next.board.length;
      next.move = { from: player.position, steps, target: (player.position + steps) % next.board.length,
        laps: Math.floor((distance + steps) / next.board.length) };
      next.phase = Phase.MOVING;
      log(next, `${player.name} 掷出 ${next.dice} 点。`);
      break;
    }
    case 'USE_CARD': {
      const index = player.cards.indexOf(command.card);
      if (index < 0 || !['stride', 'fortune'].includes(command.card)) return reject('此锦囊不能在当前阶段使用。');
      if (command.card === 'stride' && player.moveBonus) return reject('本次移动已使用加步锦囊。');
      player.cards.splice(index, 1);
      if (command.card === 'stride') player.moveBonus = next.config.strideBonus;
      else player.cash += next.config.fortuneAmount;
      log(next, `${player.name} 使用 ${cards[command.card].name}，${command.card === 'stride' ? `本次行军额外 +${next.config.strideBonus} 格` : `获得 ${next.config.fortuneAmount} 金`}。`);
      break;
    }
    case 'USE_SHIELD': {
      const index = player.cards.indexOf('rentShield');
      if (index < 0 || !next.debt?.creditorId) return reject('没有可用的免租锦囊。');
      const creditor = next.players.find((item) => item.id === next.debt.creditorId);
      const amount = next.debt.amount;
      const location = next.board.find((item) => item.id === next.debt.tileId)?.name;
      player.cards.splice(index, 1); next.debt = null;
      log(next, `${player.name} 使用空城计，免除${location ? ` ${location} 的` : '本次'} ${amount} 金过路费（原应付给 ${creditor.name}）。`); finishLanding(next);
      break;
    }
    case 'PAY_RENT': next.phase = Phase.DEBT_RESOLUTION; settleDebt(next); break;
    case 'KEEP_CARD': {
      if (!next.pendingCard) return reject('没有待领取锦囊。');
      if (!Number.isInteger(command.replaceIndex) || command.replaceIndex < 0 || command.replaceIndex >= player.cards.length) return reject('请选择替换的锦囊。');
      const old = player.cards[command.replaceIndex];
      player.cards[command.replaceIndex] = next.pendingCard;
      log(next, `${player.name} 以 ${cards[next.pendingCard].name} 替换 ${cards[old].name}。`);
      next.pendingCard = null; finishLanding(next); break;
    }
    case 'DECLINE_CARD': next.pendingCard = null; log(next, '放弃本次新锦囊。'); finishLanding(next); break;
    case 'FINISH_MOVE': {
      player.position = next.move.target;
      if (next.move.laps) {
        player.laps += next.move.laps;
        player.cash += next.move.laps * next.config.salaryPerLap;
        log(next, `${player.name} 完成 ${next.move.laps} 圈，领取 ${next.move.laps * next.config.salaryPerLap} 金俸禄。`);
      }
      next.move = null;
      log(next, `${player.name} 到达 ${tileName(next, player.position)}。`);
      landing(next);
      break;
    }
    case 'BUY': {
      const cost = landPrice(next, tile);
      if (tile.ownerId || player.cash < cost) return reject('现金不足或土地已被购买。');
      player.cash -= cost; tile.ownerId = player.id; tile.level = 1; tile.investment = cost;
      next.phase = Phase.TURN_END;
      log(next, `${player.name} 购买 ${tile.name}，花费 ${cost} 金，立即获得一级建筑。`);
      break;
    }
    case 'UPGRADE': {
      const cost = upgradeCost(next, tile);
      if (tile.ownerId !== player.id || tile.level >= next.config.maxBuildingLevel || player.cash < cost) return reject('无法升级或现金不足。');
      player.cash -= cost; tile.investment += cost; tile.level++;
      next.phase = Phase.TURN_END;
      log(next, `${player.name} 升级 ${tile.name} 到 ${tile.level} 级，花费 ${cost} 金。`);
      break;
    }
    case 'PASS': next.phase = Phase.TURN_END; log(next, `${player.name} 放弃本次购买 / 升级。`); break;
    case 'SELL': {
      const land = next.board.find((item) => item.id === command.tileId);
      if (!land || land.ownerId !== player.id) return reject('只能出售自己的土地。');
      const refund = Math.floor(land.investment * next.config.assetSellbackRatio);
      player.cash += refund;
      log(next, `${player.name} 出售 ${land.name}，按实际投入 60% 回收 ${refund} 金。`);
      resetLand(land);
      settleDebt(next);
      break;
    }
    case 'BANKRUPT': {
      const holding = assets(next, player.id);
      if (player.cash + holding.recovery >= next.debt.amount) return reject('仍可卖地偿清，不能判定破产。');
      const creditor = next.players.find((item) => item.id === next.debt.creditorId);
      if (creditor) creditor.cash += player.cash;
      log(next, `${player.name} 破产（${next.debt.reason || '欠款'}），向 ${creditor?.name || '系统'} 部分偿付 ${player.cash} 金，其余欠款免除。`);
      player.cash = 0; player.alive = false; player.cards = []; player.moveBonus = 0; player.skipTurns = 0;
      next.board.filter((item) => item.ownerId === player.id).forEach(resetLand);
      next.debt = null; next.phase = Phase.TURN_END;
      if (next.players.filter((item) => item.alive).length <= 1) endGame(next, '仅剩一名存活角色，提前结束。');
      break;
    }
    case 'END_TURN': {
      next.roundRemaining = next.roundRemaining.filter((id) => id !== player.id && next.players.find((item) => item.id === id).alive);
      if (next.roundRemaining.length === 0) {
        next.completedRounds++;
        if (next.mode === 'rounds' && next.completedRounds >= next.config.defaultRoundLimit) {
          endGame(next, `${next.completedRounds} 个完整轮次结束，按总资产排名。`);
          break;
        }
        next.round++; next.roundRemaining = next.order.filter((id) => next.players.find((item) => item.id === id).alive);
      }
      do { next.turnIndex = (next.turnIndex + 1) % next.order.length; } while (!currentPlayer(next).alive);
      next.dice = null; next.phase = Phase.TURN_START; next.extraRollUsed = false; next.rollCount = 0;
      const incoming = currentPlayer(next);
      if (incoming.skipTurns > 0) {
        incoming.skipTurns--; next.phase = Phase.TURN_END;
        log(next, `${incoming.name} 因军令延误跳过本次行动机会（仍计入轮数）。`);
      }
      break;
    }
  }
  next.revision++;
  const events = next._events; delete next._events;
  return { state: next, accepted: true, error: null, events };
}
function tileName(state, position) { return state.board[position].name; }
