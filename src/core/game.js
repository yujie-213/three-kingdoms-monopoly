import { characters, factions, boardDefinition, cityGroups } from '../data/board.js';
import { confirmedRules, experimentalDefaults, economyProfiles, validateConfig } from '../config/game-config.js';
import { generateSeed, seedValue, shuffle, nextRandom } from './random.js';
import { events, cards } from '../data/events.js';

export const Phase = Object.freeze({
  TURN_START: 'TURN_START', DICE_DECISION: 'DICE_DECISION', MOVING: 'MOVING', BUY_DECISION: 'BUY_DECISION',
  UPGRADE_DECISION: 'UPGRADE_DECISION', DEBT_RESOLUTION: 'DEBT_RESOLUTION',
  TURN_END: 'TURN_END', GAME_OVER: 'GAME_OVER',
  EXTRA_ROLL: 'EXTRA_ROLL', CARD_DECISION: 'CARD_DECISION', CARD_GAIN_DECISION: 'CARD_GAIN_DECISION',
});

export function createGame({ humanId = 'liu', seed = generateSeed(), mode = 'classic', economy = 'standard', config = {}, board = boardDefinition } = {}) {
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
    version: 7, seed: String(seed), mode, rngState: shuffled.state, config: settings, prosperityStartRound: null,
    phase: Phase.TURN_START, revision: 0, round: 1, completedRounds: 0,
    order: shuffled.order, roundRemaining: [...shuffled.order], turnIndex: 0, startIndex, dice: null, debt: null,
    move: null, pendingCard: null, shopVisit: null, shopOffer: null, extraRollUsed: false, rollCount: 0,
    upgradeUsed: false, activeCardUsed: false, repairReady: false, purchasedThisTurn: [], shopUsed: false, turnSkipped: false,
    players: selectedCharacters.map((character) => ({ ...character, human: character.id === humanId,
      aiStyle: character.id === humanId ? null : selectedCharacters.filter((p) => p.id !== humanId).findIndex((p) => p.id === character.id) === 0 ? 'conservative' : 'aggressive',
      cash: settings.initialCash, position: startIndex, laps: 0, alive: true, cards: [], skipTurns: 0, moveBonus: 0, diceAdjustUsed: false,
      stats: { rentCollected: 0, largestRent: 0, peakAssets: settings.initialCash, purchases: 0, upgrades: 0, milestones: [] },
      wealthHistory: [{ round: 1, assets: settings.initialCash }], cardBag: [],
      battleReport: { moments: [], defeat: null } })),
    board: board.map((tile, index) => ({ ...tile, index, ownerId: null, level: 0, investment: 0, discountedLevels: [], tradeUntilRound: 0 })),
    log: [`新局开始：开局站在起点不领取补给。${settings.openingBonusPerLap ? `前${settings.openingBonusLaps}圈含开拓补助，之后每圈基础补给${settings.salaryPerLap}金。` : ''}`],
  };
}

export const currentPlayer = (state) => state.players.find((player) => player.id === state.order[state.turnIndex]);

export function drawShopOffer(state) {
  const random = nextRandom(state.rngState);
  state.rngState = random.state;
  return Object.keys(cards)[Math.floor(random.value * Object.keys(cards).length)];
}
export function shopPrice(state, card = state.shopOffer) {
  return Math.max(1, Math.ceil(state.config.cardPrices[card] * state.config.shopPriceRatio));
}

export function canShop(state, player = currentPlayer(state)) {
  const tile = state.board[player.position];
  return player.id === currentPlayer(state).id && player.alive && state.phase === Phase.TURN_END
    && !state.turnSkipped && !state.shopUsed && tile.cardShop === true && state.shopVisit === tile.id;
}

export function landPrice(state, tile) { return state.config.landPrices[tile.tier]; }
export function cityGroup(state, tile) {
  const group = cityGroups.find((item) => item.tileIds.includes(tile.id) && item.tileIds.every((id) => state.board.some((land) => land.id === id && land.type === 'land')));
  if (!group) return null;
  const complete = Boolean(tile.ownerId) && group.tileIds.every((id) => state.board.find((land) => land.id === id).ownerId === tile.ownerId);
  const owned = tile.ownerId ? group.tileIds.filter((id) => state.board.find((land) => land.id === id).ownerId === tile.ownerId).length : 0;
  const bonus = complete ? state.config.groupRentBonus : group.tileIds.length === 3 && owned === 2 ? state.config.groupPartialRentBonus : 0;
  return { ...group, complete, owned, bonus, income: complete ? group.tileIds.length * state.config.groupIncomePerCity : 0 };
}
export function groupIncome(state, playerId) {
  const seen = new Set();
  return state.board.filter((tile) => tile.ownerId === playerId).reduce((sum, tile) => {
    const group = cityGroup(state, tile);
    if (!group?.complete || seen.has(group.id)) return sum;
    seen.add(group.id); return sum + group.income;
  }, 0);
}
export function prosperityMultiplier(state) {
  return state.prosperityStartRound === null ? 1 : 1 + Math.floor((state.completedRounds - state.prosperityStartRound) / state.config.prosperityInterval) * state.config.prosperityStep;
}
export function rent(state, tile, level = tile.level) {
  const bonus = (cityGroup(state, tile)?.bonus || 0)
    + (tile.ownerId && tile.tradeUntilRound > state.round ? state.config.tradeRentBonus : 0);
  return Math.round(landPrice(state, tile) * state.config.rentMultipliers[level - 1] * (1 + bonus) * prosperityMultiplier(state));
}
export function upgradeCost(state, tile, discounted = state.repairReady && tile.ownerId === currentPlayer(state).id) {
  const base = Math.round(landPrice(state, tile) * state.config.upgradeMultipliers[tile.level - 1]);
  return Math.max(1, Math.round(base * (discounted ? 1 - state.config.repairDiscount : 1)));
}
export function canUpgrade(state, tile, player = currentPlayer(state)) {
  return player.alive && !state.turnSkipped && !state.upgradeUsed && tile?.type === 'land' && tile.ownerId === player.id
    && tile.level < state.config.maxBuildingLevel && (tile.level < 2 || player.laps >= state.config.level3AfterLap) && !state.purchasedThisTurn.includes(tile.id);
}
export function demolitionValue(state, tile) {
  if (!tile || tile.level < 2) return { cost: 0, refund: 0 };
  const base = Math.round(landPrice(state, tile) * state.config.upgradeMultipliers[tile.level - 2]);
  const cost = Math.max(1, Math.round(base * (tile.discountedLevels.includes(tile.level) ? 1 - state.config.repairDiscount : 1)));
  return { cost, refund: Math.floor(cost * state.config.assetSellbackRatio) };
}
export function disposalOptions(state, playerId) {
  const options = [];
  for (const tile of state.board.filter((land) => land.ownerId === playerId)) {
    const group = cityGroup(state, tile);
    const groupRent = group ? group.tileIds.reduce((sum, id) => sum + (state.board.find((land) => land.id === id).ownerId === playerId ? rent(state, state.board.find((land) => land.id === id)) : 0), 0) : 0;
    const soldTile = { ...tile }; resetLand(soldTile);
    const without = { ...state, board: state.board.map((land) => land.id === tile.id ? soldTile : land) };
    const remainingRent = group ? group.tileIds.reduce((sum, id) => sum + (without.board.find((land) => land.id === id).ownerId === playerId ? rent(without, without.board.find((land) => land.id === id)) : 0), 0) : 0;
    options.push({ type: 'SELL', tileId: tile.id, refund: Math.floor(tile.investment * state.config.assetSellbackRatio), rentLoss: group ? groupRent - remainingRent : rent(state, tile), incomeLoss: group?.income || 0, priority: group?.complete ? 3 : group?.owned >= 2 ? 1 : 0 });
    if (tile.level > 1) options.push({ type: 'DEMOLISH', tileId: tile.id, refund: demolitionValue(state, tile).refund, rentLoss: rent(state, tile) - rent(state, tile, tile.level - 1), incomeLoss: 0, priority: group?.complete ? 2 : group?.owned >= 2 ? 1 : 0 });
  }
  return options.sort((a, b) => a.priority - b.priority || (a.rentLoss + a.incomeLoss) / Math.max(1, a.refund) - (b.rentLoss + b.incomeLoss) / Math.max(1, b.refund) || a.refund - b.refund);
}
export function cashReserve(state, player = currentPlayer(state)) {
  const base = state.config.recommendedReserve;
  const risk = Math.max(0, ...Array.from({ length: state.config.diceSides }, (_, i) => state.board[(player.position + i + 1) % state.board.length]).filter((tile) => tile.type === 'land' && tile.ownerId && tile.ownerId !== player.id).map((tile) => rent(state, tile)));
  return Math.max(base, risk + (base ? 100 : 0));
}
export function assets(state, playerId) {
  const player = state.players.find((item) => item.id === playerId);
  const lands = state.board.filter((tile) => tile.ownerId === playerId);
  const investment = lands.reduce((sum, tile) => sum + tile.investment, 0);
  const landValue = lands.reduce((sum, tile) => sum + Math.min(tile.investment, landPrice(state, tile)), 0);
  return { cash: player.cash, investment, total: player.cash + investment,
    landValue, buildingValue: investment - landValue,
    recovery: lands.reduce((sum, tile) => sum + Math.floor(tile.investment * state.config.assetSellbackRatio), 0), count: lands.length,
    maxLevelCount: lands.filter((tile) => tile.level === state.config.maxBuildingLevel).length };
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
function recordMoment(state, player, key, title, detail) {
  const moment = { key, round: state.round, title, detail };
  const index = player.battleReport.moments.findIndex((item) => item.key === key);
  if (index < 0) player.battleReport.moments.push(moment);
  else if (key === 'sale') player.battleReport.moments[index] = moment;
}
function resetLand(tile) { tile.ownerId = null; tile.level = 0; tile.investment = 0; tile.discountedLevels = []; tile.tradeUntilRound = 0; }
function endGame(state, reason) { state.phase = Phase.GAME_OVER; state.endReason = reason; log(state, reason); }
function finishLanding(state) { state.phase = Phase.TURN_END; }
function settleDebt(state) {
  const player = currentPlayer(state);
  if (player.cash < state.debt.amount) return;
  const { amount, creditorId } = state.debt;
  player.cash -= amount;
  const creditor = state.players.find((item) => item.id === creditorId);
  if (creditor) {
    creditor.cash += amount;
    creditor.stats.rentCollected += amount;
    creditor.stats.largestRent = Math.max(creditor.stats.largestRent, amount);
  }
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
function receiveTravelIncome(state, player, move) {
  if (!state.config.segmentedIncome) {
    player.laps += move.laps;
    player.cash += move.laps * state.config.salaryPerLap;
    if (move.laps) { player.diceAdjustUsed = false; log(state, `${player.name} 完成 ${move.laps} 圈，领取 ${move.laps * state.config.salaryPerLap} 金俸禄。`); }
    return;
  }
  const length = state.board.length;
  const checkpoints = [...new Set(Array.from({ length: 4 }, (_, i) => Math.floor((i + 1) * length / 4)).filter((distance) => distance > 0))];
  const distance = (move.from - state.startIndex + length) % length;
  for (let step = 1; step <= move.steps; step++) {
    const position = (distance + step - 1) % length + 1;
    const checkpoint = checkpoints.indexOf(position);
    if (checkpoint < 0) continue;
    const opening = player.laps < state.config.openingBonusLaps ? state.config.openingBonusPerLap : 0;
    const part = (total) => Math.floor((checkpoint + 1) * total / checkpoints.length) - Math.floor(checkpoint * total / checkpoints.length);
    const amount = part(state.config.salaryPerLap) + part(opening);
    player.cash += amount;
    log(state, `${player.name} 领取分段补给 ${amount} 金${opening ? `（含开拓补助 ${part(opening)} 金）` : ''}。`);
    if (position === length) {
      player.laps++; player.diceAdjustUsed = false;
      const income = groupIncome(state, player.id);
      player.cash += income;
      log(state, `${player.name} 完成第 ${player.laps} 圈，城组经营收益 ${income} 金。${player.laps === state.config.openingBonusLaps && state.config.openingBonusPerLap ? `开拓补助结束，之后每圈基础补给 ${state.config.salaryPerLap} 金。` : ''}`);
    }
  }
}
function updateProsperity(state, previous) {
  if (!state.config.prosperityEnabled) return;
  const lands = state.board.filter((tile) => tile.type === 'land' && tile.ownerId);
  if (state.prosperityStartRound === null && lands.length >= state.config.prosperityOwnedThreshold && lands.filter((tile) => tile.level === 3).length >= state.config.prosperityLevel3Threshold) {
    state.prosperityStartRound = state.completedRounds;
    log(state, `进入商业繁荣：每 ${state.config.prosperityInterval} 个完整轮次租金倍率增加 ${state.config.prosperityStep}，购地、建设及固定收入保持原值。`);
  }
  if (prosperityMultiplier(state) > prosperityMultiplier(previous)) log(state, `商业繁荣：租金倍率提高至 ${prosperityMultiplier(state).toFixed(2)} 倍。`);
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
function randomCard(state, player) {
  // Each player has a separate, saved bag. Fixed gifts and purchases do not consume it.
  while (true) {
    if (!player.cardBag.length) {
      const bag = shuffle(Object.keys(cards), state.rngState);
      player.cardBag = bag.order; state.rngState = bag.state;
    }
    const card = player.cardBag.shift();
    if (card !== 'rentShield' || !player.cards.includes('rentShield')) return card;
    log(state, `${player.name} 已持有空城计，改抽下一张锦囊。`);
  }
}
function gainCard(state, card) {
  const player = currentPlayer(state);
  card ??= randomCard(state, player);
  if (card === 'rentShield' && player.cards.includes(card)) {
    log(state, `${player.name} 已持有空城计，最多持有一张，本次不重复领取。`);
    finishLanding(state); return;
  }
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
  state.shopVisit = tile.cardShop ? tile.id : null;
  state.shopOffer = state.shopVisit ? drawShopOffer(state) : null;
  if (state.shopVisit) log(state, `${player.name} 停靠${tile.name}：免费随机锦囊与五折 ${cards[state.shopOffer].name} 二选一。`);
  if (tile.type !== 'land') {
    if (tile.type === 'start') { log(state, '停在起点，本次跨线奖励已结算。'); finishLanding(state); }
    else if (!state.config.eventsEnabled) { log(state, `${tile.name}：事件关闭，无效果。`); finishLanding(state); }
    else if (tile.type === 'event') resolveEvent(state);
    else if (tile.effect === 'marketTax') payment(state, state.config.facilityAmounts.marketTax, null, '集市税费');
    else if (tile.effect === 'card') gainCard(state);
    else if (tile.effect === 'advice') { log(state, `${tile.name}：免费随机领取或购买五折锦囊，不再固定赠送空城计。`); finishLanding(state); }
    else {
      const amount = state.config.facilityAmounts[tile.effect] || 0;
      player.cash += amount; log(state, `${tile.name}：${player.name} 获得补给 ${amount} 金。`); finishLanding(state);
    }
  } else if (!tile.ownerId) state.phase = Phase.BUY_DECISION;
  else if (tile.ownerId === player.id) state.phase = canUpgrade(state, tile) ? Phase.UPGRADE_DECISION : Phase.TURN_END;
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
    MANAGE_UPGRADE: [Phase.TURN_START, Phase.TURN_END, Phase.UPGRADE_DECISION], BUY_CARD: [Phase.TURN_END], FREE_CARD: [Phase.TURN_END],
    PASS: [Phase.BUY_DECISION, Phase.UPGRADE_DECISION],
    END_TURN: [Phase.TURN_END], SELL: [Phase.DEBT_RESOLUTION], DEMOLISH: [Phase.DEBT_RESOLUTION], BANKRUPT: [Phase.DEBT_RESOLUTION],
    CONFIRM_MOVE: [Phase.DICE_DECISION], ADJUST_DICE: [Phase.DICE_DECISION],
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
      next.shopVisit = null;
      next.shopOffer = null;
      const random = nextRandom(next.rngState);
      next.rngState = random.state;
      next.dice = Math.floor(random.value * next.config.diceSides) + 1;
      const hadStride = player.moveBonus > 0;
      const steps = next.dice + player.moveBonus;
      player.moveBonus = 0; next.rollCount++;
      const distance = (player.position - next.startIndex + next.board.length) % next.board.length;
      next.move = { from: player.position, steps, target: (player.position + steps) % next.board.length,
        laps: Math.floor((distance + steps) / next.board.length) };
      next.phase = Phase.MOVING;
      if (next.config.diceAdjustEnabled && next.config.diceSides > 1 && next.rollCount === 1 && !hadStride && !player.diceAdjustUsed && player.cash >= next.config.diceAdjustCost) {
        next.phase = Phase.DICE_DECISION; next.move.previewed = true;
      }
      log(next, `${player.name} 掷出 ${next.dice} 点。`);
      break;
    }
    case 'CONFIRM_MOVE': next.phase = Phase.MOVING; break;
    case 'ADJUST_DICE': {
      if (!next.config.diceAdjustEnabled || ![-1, 1].includes(command.delta) || player.diceAdjustUsed || next.rollCount !== 1 || next.move.steps !== next.dice || next.dice + command.delta < 1 || next.dice + command.delta > next.config.diceSides || player.cash < next.config.diceAdjustCost) return reject('本圈无法调度，或调整后的骰点超出范围。');
      player.cash -= next.config.diceAdjustCost; player.diceAdjustUsed = true;
      next.dice += command.delta;
      next.move.steps = next.dice; next.move.target = (player.position + next.dice) % next.board.length;
      next.move.laps = Math.floor(((player.position - next.startIndex + next.board.length) % next.board.length + next.dice) / next.board.length);
      next.phase = Phase.MOVING;
      log(next, `${player.name} 花费 ${next.config.diceAdjustCost} 金调度，骰点${command.delta > 0 ? '+' : ''}${command.delta}，改为 ${next.dice} 点，前往 ${tileName(next, next.move.target)}。`);
      break;
    }
    case 'USE_CARD': {
      const index = player.cards.indexOf(command.card);
      if (next.activeCardUsed || index < 0 || !['stride', 'fortune', 'repair', 'commerce'].includes(command.card)) return reject('每回合最多主动使用一张锦囊。');
      if (command.card === 'stride' && player.moveBonus) return reject('本次移动已使用加步锦囊。');
      const target = next.board.find((land) => land.id === command.tileId);
      if (command.card === 'commerce' && (!target || target.ownerId !== player.id || target.tradeUntilRound > next.round)) return reject('请选择没有商路加成的己方城池。');
      if (command.card === 'repair' && (next.upgradeUsed || !next.board.some((land) => canUpgrade(next, land) && player.cash >= upgradeCost(next, land, true)))) return reject('本回合没有可以使用修城令建设的城池。');
      player.cards.splice(index, 1);
      next.activeCardUsed = true;
      if (command.card === 'stride') player.moveBonus = next.config.strideBonus;
      else if (command.card === 'fortune') player.cash += next.config.fortuneAmount;
      else if (command.card === 'repair') next.repairReady = true;
      else target.tradeUntilRound = next.round + next.config.tradeDuration;
      const effect = command.card === 'stride' ? `本次行军额外 +${next.config.strideBonus} 格` : command.card === 'fortune' ? `获得 ${next.config.fortuneAmount} 金`
        : command.card === 'repair' ? '本回合一次建设费用减半' : `${target.name} 租金提高 ${Math.round(next.config.tradeRentBonus * 100)}%，至第 ${target.tradeUntilRound} 轮开始失效`;
      log(next, `${player.name} 使用 ${cards[command.card].name}，${effect}。`);
      break;
    }
    case 'FREE_CARD': {
      if (!canShop(next, player)) return reject('仅本次停靠锦囊铺可选择一次免费或五折锦囊。');
      next.shopUsed = true;
      log(next, `${player.name} 选择免费随机锦囊，放弃本次五折购买机会。`);
      gainCard(next);
      break;
    }
    case 'BUY_CARD': {
      const cost = shopPrice(next, command.card);
      if (!canShop(next, player)) return reject('仅本次停靠颍川驿、隆中或江东集市后可购买一张锦囊。');
      if (command.card !== next.shopOffer) return reject('只能购买本次展示的五折锦囊。');
      if (command.card === 'rentShield' && player.cards.includes('rentShield')) return reject('空城计最多持有一张。');
      if (!Object.hasOwn(cards, command.card) || player.cards.length >= next.config.cardCapacity || player.cash < cost) return reject('无法购买该锦囊：现金不足或背包已满。');
      player.cash -= cost; player.cards.push(command.card); next.shopUsed = true;
      log(next, `${player.name} 五折购买锦囊 ${cards[command.card].name}，花费 ${cost} 金，放弃本次免费领取机会。`);
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
      if (next.pendingCard === 'rentShield' && player.cards.some((card, index) => card === 'rentShield' && index !== command.replaceIndex)) return reject('空城计最多持有一张。');
      const old = player.cards[command.replaceIndex];
      player.cards[command.replaceIndex] = next.pendingCard;
      log(next, `${player.name} 以 ${cards[next.pendingCard].name} 替换 ${cards[old].name}。`);
      next.pendingCard = null; finishLanding(next); break;
    }
    case 'DECLINE_CARD': next.pendingCard = null; log(next, '放弃本次新锦囊。'); finishLanding(next); break;
    case 'FINISH_MOVE': {
      receiveTravelIncome(next, player, next.move);
      player.position = next.move.target;
      next.move = null;
      log(next, `${player.name} 到达 ${tileName(next, player.position)}。`);
      landing(next);
      break;
    }
    case 'BUY': {
      const cost = landPrice(next, tile);
      if (tile.ownerId || player.cash < cost) return reject('现金不足或土地已被购买。');
      player.cash -= cost; tile.ownerId = player.id; tile.level = 1; tile.investment = cost;
      next.purchasedThisTurn.push(tile.id); player.stats.purchases++;
      const group = cityGroup(next, tile);
      if (group?.complete && next.config.groupRentBonus > 0) log(next, `${player.name} 完成 ${group.name}，城组租金提高 ${Math.round(next.config.groupRentBonus * 100)}%。`);
      next.phase = Phase.TURN_END;
      log(next, `${player.name} 购买 ${tile.name}，花费 ${cost} 金，立即获得一级建筑。`);
      break;
    }
    case 'UPGRADE':
    case 'MANAGE_UPGRADE': {
      const target = command.type === 'UPGRADE' ? tile : next.board.find((land) => land.id === command.tileId);
      if (!canUpgrade(next, target)) return reject('每回合只能建设一次，且不能升级刚购买的城池。');
      const cost = upgradeCost(next, target);
      if (player.cash < cost) return reject('建设现金不足。');
      player.cash -= cost; target.investment += cost; target.level++;
      if (next.repairReady) target.discountedLevels.push(target.level);
      next.repairReady = false; next.upgradeUsed = true; player.stats.upgrades++;
      if (next.phase === Phase.UPGRADE_DECISION) next.phase = Phase.TURN_END;
      log(next, `${player.name} 升级 ${target.name} 到 ${target.level} 级，花费 ${cost} 金。`);
      break;
    }
    case 'PASS': next.phase = Phase.TURN_END; log(next, `${player.name} 放弃本次购买 / 升级。`); break;
    case 'SELL': {
      const land = next.board.find((item) => item.id === command.tileId);
      if (!land || land.ownerId !== player.id) return reject('只能出售自己的土地。');
      const refund = Math.floor(land.investment * next.config.assetSellbackRatio);
      player.cash += refund;
      log(next, `${player.name} 出售 ${land.name}，按实际投入 60% 回收 ${refund} 金。`);
      recordMoment(next, player, 'sale', '出售城产偿付欠款', `出售${land.name}，回收${refund}金。`);
      resetLand(land);
      next.purchasedThisTurn = next.purchasedThisTurn.filter((id) => id !== land.id);
      settleDebt(next);
      break;
    }
    case 'DEMOLISH': {
      const land = next.board.find((item) => item.id === command.tileId);
      if (!land || land.ownerId !== player.id || land.level < 2) return reject('只能拆除己方二级或三级城池的一层建筑。');
      const { cost, refund } = demolitionValue(next, land);
      land.discountedLevels = land.discountedLevels.filter((level) => level !== land.level);
      land.level--; land.investment -= cost; player.cash += refund;
      log(next, `${player.name} 拆除 ${land.name} 一层建筑，降至 ${land.level} 级，按该层实际投入回收 ${refund} 金，保留土地及城组。`);
      settleDebt(next); break;
    }
    case 'BANKRUPT': {
      const holding = assets(next, player.id);
      if (player.cash + holding.recovery >= next.debt.amount) return reject('仍可卖地偿清，不能判定破产。');
      player.battleReport.defeat = { round: next.round, tileId: next.debt.tileId, reason: next.debt.reason,
        amount: next.debt.amount, cash: player.cash, recovery: holding.recovery,
        shortfall: next.debt.amount - player.cash - holding.recovery, creditorId: next.debt.creditorId };
      recordMoment(next, player, 'exit', '无法清偿欠款', `${next.debt.reason}：可用现金与可回收城产合计${player.cash + holding.recovery}金，仍差${player.battleReport.defeat.shortfall}金。`);
      const creditor = next.players.find((item) => item.id === next.debt.creditorId);
      if (creditor) { creditor.cash += player.cash; creditor.stats.rentCollected += player.cash; creditor.stats.largestRent = Math.max(creditor.stats.largestRent, player.cash); }
      log(next, `${player.name} 破产（${next.debt.reason || '欠款'}），向 ${creditor?.name || '系统'} 部分偿付 ${player.cash} 金，其余欠款免除。`);
      player.cash = 0; player.alive = false; player.cards = []; player.moveBonus = 0; player.skipTurns = 0;
      next.board.filter((item) => item.ownerId === player.id).forEach(resetLand);
      next.purchasedThisTurn = []; next.repairReady = false;
      next.debt = null; next.phase = Phase.TURN_END;
      if (next.players.filter((item) => item.alive).length <= 1) endGame(next, '仅剩一名存活角色，赢得本局。');
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
      next.upgradeUsed = false; next.activeCardUsed = false; next.repairReady = false; next.purchasedThisTurn = []; next.shopUsed = false; next.shopVisit = null; next.shopOffer = null; next.turnSkipped = false;
      const incoming = currentPlayer(next);
      if (incoming.skipTurns > 0) {
        incoming.skipTurns--; next.phase = Phase.TURN_END; next.turnSkipped = true;
        log(next, `${incoming.name} 因军令延误跳过本次行动机会（仍计入轮数）。`);
      }
      break;
    }
  }
  updateProsperity(next, state);
  updateWealth(next, state);
  next.revision++;
  const events = next._events; delete next._events;
  return { state: next, accepted: true, error: null, events };
}
function updateWealth(state, previous) {
  for (const player of state.players) {
    const value = assets(state, player.id);
    const complete = state.board.filter((tile) => tile.ownerId === player.id).map((tile) => cityGroup(state, tile)).find((group) => group?.complete
      && !cityGroup(previous, previous.board.find((tile) => tile.id === group.tileIds[0]))?.complete);
    if (complete) recordMoment(state, player, 'group', `收齐${complete.name}`, `城组经营收益${complete.income}金/圈，享受完整城组租金加成。`);
    const built = state.board.find((tile) => tile.ownerId === player.id && tile.level === state.config.maxBuildingLevel);
    if (built && !previous.board.some((tile) => tile.ownerId === player.id && tile.level === state.config.maxBuildingLevel)) recordMoment(state, player, 'building', '建成三级城池', `${built.name}完成三级建设，当前单次租金${rent(state, built)}金。`);
    player.stats.peakAssets = Math.max(player.stats.peakAssets, value.total);
    const history = player.wealthHistory;
    if (history.at(-1).round === state.round) history[history.length - 1].assets = value.total;
    else history.push({ round: state.round, assets: value.total });
    if (history.length > 80) history.shift();
    const milestones = [[3, '三座城池'], [8, '八座城池'], [15, '十五座城池']].filter(([count]) => value.count >= count).map(([, title]) => title);
    if (value.maxLevelCount >= 1) milestones.push('首座三级城');
    if (player.stats.rentCollected >= 1000) milestones.push('累计收租千金');
    if (player.stats.peakAssets >= 5000) milestones.push('资产五千金');
    for (const title of milestones) if (!player.stats.milestones.includes(title)) {
      player.stats.milestones.push(title); log(state, `${player.name} 财富里程碑：${title}。`);
    }
  }
}
function tileName(state, position) { return state.board[position].name; }
