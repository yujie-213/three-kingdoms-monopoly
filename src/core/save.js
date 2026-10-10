import { Phase, createGame, currentPlayer, rent, canUpgrade, drawShopOffer } from './game.js';
import { boardDefinition, characters, factions } from '../data/board.js';
import { confirmedRules, experimentalDefaults, validateConfig } from '../config/game-config.js';
import { cards } from '../data/events.js';

const fail = (message) => { throw new Error(`存档无效：${message}`); };
const requireValue = (condition, message) => { if (!condition) fail(message); };
const integer = (value, max = 1000000000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validCard = (value) => Object.hasOwn(cards, value);

export function exportSave(state) {
  return JSON.stringify({ format: 'three-kingdoms-monopoly', version: 7, state }, null, 2);
}
function migrateV6(envelope) {
  const s = envelope.state;
  requireValue(object(s) && s.version === 6 && object(s.config) && integer(s.rngState, 4294967295) && s.rngState > 0 && Array.isArray(s.log), '旧版锦囊铺状态');
  s.config.shopPriceRatio = confirmedRules.shopPriceRatio;
  s.shopOffer = s.shopVisit === null ? null : drawShopOffer(s);
  s.version = envelope.version = 7;
  s.log.push('锦囊铺已更新：每次停靠可选免费随机锦囊或一张固定五折商品，两者只能选一项。');
}
function migrateV5(envelope) {
  const s = envelope.state;
  requireValue(object(s) && s.version === 5 && Array.isArray(s.players), '旧版锦囊状态缺失');
  s.version = 6; s.shopVisit = null;
  for (const p of s.players) {
    requireValue(object(p) && Array.isArray(p.cards), '旧版背包');
    // Keep legacy cards instead of silently deleting paid inventory. They cannot be replenished until used.
    p.cardBag = []; p.battleReport = { moments: [], defeat: null };
  }
  envelope.version = 6;
  requireValue(Array.isArray(s.log), '旧版日志');
  s.log.push('锦囊规则已更新：仅本次停靠颍川驿、隆中或江东集市可买一张；已有空城计不能补购或重复领取。随机赠送采用个人五种牌袋。旧战报从恢复后开始记录。');
}
function migrateV4(envelope) {
  const s = envelope.state;
  requireValue(object(s) && s.version === 4 && object(s.config) && Array.isArray(s.players), '旧版经营状态缺失');
  // Continue legacy matches with their original economy, without granting new income.
  Object.assign(s.config, { segmentedIncome: false, openingBonusPerLap: 0, openingBonusLaps: 0, groupIncomePerCity: 0, groupPartialRentBonus: 0, level3AfterLap: 0, diceAdjustEnabled: false, diceAdjustCost: 60, prosperityEnabled: false, prosperityOwnedThreshold: 24, prosperityLevel3Threshold: 6, prosperityInterval: 12, prosperityStep: 0.25, recommendedReserve: s.config.aiCashReserve });
  s.version = 5; s.prosperityStartRound = null;
  for (const p of s.players) { requireValue(object(p), '旧版角色'); p.diceAdjustUsed = false; }
  envelope.version = 5;
  requireValue(Array.isArray(s.log), '旧版日志');
  s.log.push('旧存档已迁移：沿用原经济规则；新局使用分段补给、城组收入、骰子调度和商业繁荣。');
}

function migrateV3(envelope) {
  const s = envelope.state;
  requireValue(object(s) && s.version === 3 && object(s.config) && Array.isArray(s.players) && Array.isArray(s.board), '旧版状态缺失');
  s.config = { ...s.config, groupRentBonus: 0, repairDiscount: 0.5, tradeRentBonus: 0.5, tradeDuration: 3, cardPrices: { ...experimentalDefaults.cardPrices } };
  Object.assign(s, { version: 4, upgradeUsed: s.phase === Phase.TURN_END, activeCardUsed: false, repairReady: false, purchasedThisTurn: [], shopUsed: false, turnSkipped: false });
  for (const tile of s.board) {
    requireValue(object(tile), '旧版地图');
    Object.assign(tile, { discountedLevels: [], tradeUntilRound: 0 });
  }
  for (const p of s.players) {
    requireValue(object(p), '旧版角色');
    const wealth = p.cash + s.board.filter((tile) => tile.ownerId === p.id).reduce((sum, tile) => sum + tile.investment, 0);
    p.stats = { rentCollected: 0, largestRent: 0, peakAssets: wealth, purchases: 0, upgrades: 0, milestones: [] };
    p.wealthHistory = [{ round: s.round, assets: wealth }];
  }
  envelope.version = 4;
  requireValue(Array.isArray(s.log), '旧版日志');
  s.log.push('v3存档已迁移：财富统计从本次恢复开始累计。');
}

export function importSave(text) {
  const ids = characters.map((character) => character.id);
  requireValue(typeof text === 'string' && text.length <= 2000000, '文件过大或非文本');
  let envelope;
  try {
    envelope = JSON.parse(text, (key, value) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('含不支持的字段');
      return value;
    });
  } catch (error) { throw new Error(`无法读取存档：${error.message}`); }
  requireValue(object(envelope) && envelope.format === 'three-kingdoms-monopoly' && [3, 4, 5, 6, 7].includes(envelope.version), '格式或版本不兼容；支持40格v3/v4/v5/v6/v7存档，旧版24格存档无法恢复');
  if (envelope.version === 3) migrateV3(envelope);
  if (envelope.version === 4) migrateV4(envelope);
  if (envelope.version === 5) migrateV5(envelope);
  if (envelope.version === 6) migrateV6(envelope);
  const s = envelope.state;
  requireValue(object(s) && s.version === 7 && object(s.config), '缺少游戏状态');
  const c = s.config;
  validateConfig(c);
  for (const [key, value] of Object.entries(confirmedRules)) {
    if (key !== 'defaultRoundLimit') requireValue(c[key] === value, `确认规则 ${key} 不一致`);
  }
  for (const key of ['initialCash', 'salaryPerLap', 'ordinaryEventFineCap', 'aiCashReserve', 'aiShieldThreshold', 'strideBonus', 'fortuneAmount']) requireValue(integer(c[key]), `配置 ${key}`);
  requireValue(integer(c.defaultRoundLimit, 10000) && c.defaultRoundLimit > 0, '限轮配置');
  requireValue(c.diceCount === 1 && integer(c.diceSides, 100) && c.diceSides > 0, '骰子配置');
  requireValue(c.boardSize === boardDefinition.length && integer(c.cardCapacity, 20) && c.cardCapacity > 0 && typeof c.eventsEnabled === 'boolean', '地图/锦囊配置');
  for (const [key, fields] of [['landPrices', ['village', 'county', 'capital']], ['eventWeights', ['economy', 'movement', 'strategy']], ['aiReserves', ['conservative', 'aggressive']], ['facilityAmounts', ['inn', 'marketTax', 'garden', 'redCliff']]]) {
    requireValue(object(c[key]), `缺少 ${key}`);
    for (const field of fields) requireValue(integer(c[key][field]), `配置 ${key}.${field}`);
  }
  requireValue(Object.values(c.landPrices).every((value) => value > 0) && c.eventWeights.economy + c.eventWeights.movement + c.eventWeights.strategy > 0, '价格/事件权重');
  for (const [key, length] of [['rentMultipliers', 3], ['upgradeMultipliers', 2]]) requireValue(Array.isArray(c[key]) && c[key].length === length && c[key].every((v) => Number.isFinite(v) && v > 0 && v <= 10), `配置 ${key}`);
  requireValue(c.assetValuation === 'cash-plus-actual-investment' && c.tiePolicy === 'shared-rank' && c.sellbackRounding === 'floor' && c.initialOrder === 'seeded-shuffle', '不支持的估值/流程');
  requireValue(['rounds', 'classic'].includes(s.mode) && Object.values(Phase).includes(s.phase), '模式或阶段');
  requireValue(typeof s.seed === 'string' && s.seed.length <= 80, '种子');
  requireValue(integer(s.rngState, 4294967295) && s.rngState > 0 && integer(s.revision), '随机状态/操作版本');
  requireValue(integer(s.round) && s.round > 0 && integer(s.completedRounds) && (s.round === s.completedRounds + 1 || (s.phase === Phase.GAME_OVER && s.round === s.completedRounds)), '轮数');
  requireValue(s.prosperityStartRound === null || (c.prosperityEnabled && integer(s.prosperityStartRound) && s.prosperityStartRound <= s.completedRounds), '商业繁荣起始轮');
  requireValue(Array.isArray(s.order) && s.order.length === 3 && new Set(s.order).size === 3 && s.order.every((id) => ids.includes(id)) && integer(s.turnIndex, 2), '回合顺序');
  requireValue(s.startIndex === 0 && Array.isArray(s.players) && s.players.length === 3, '起点/角色');
  for (const [index, p] of s.players.entries()) {
    requireValue(object(p) && characters.some((character) => character.id === p.id && character.factionId === factions[index].id) && typeof p.human === 'boolean' && typeof p.alive === 'boolean', '角色身份/阵营');
    for (const key of ['cash', 'laps', 'skipTurns', 'moveBonus']) requireValue(integer(p[key]), `角色 ${key}`);
    requireValue(p.skipTurns <= 100, '跳过机会数量过大');
    requireValue(typeof p.diceAdjustUsed === 'boolean' && (c.diceAdjustEnabled || !p.diceAdjustUsed), '骰子调度次数');
    requireValue(integer(p.position, c.boardSize - 1) && Array.isArray(p.cards) && p.cards.length <= c.cardCapacity && p.cards.every(validCard), '位置/背包');
    requireValue(Array.isArray(p.cardBag) && p.cardBag.length <= Object.keys(cards).length && new Set(p.cardBag).size === p.cardBag.length && p.cardBag.every(validCard), '随机锦囊牌袋');
    requireValue(object(p.battleReport) && Array.isArray(p.battleReport.moments) && p.battleReport.moments.length <= 4
      && new Set(p.battleReport.moments.map((m) => m?.key)).size === p.battleReport.moments.length
      && p.battleReport.moments.every((m) => object(m) && ['group', 'building', 'sale', 'exit'].includes(m.key) && integer(m.round) && m.round > 0 && m.round <= s.round && typeof m.title === 'string' && m.title.length <= 100 && typeof m.detail === 'string' && m.detail.length <= 300), '关键战报');
    const defeat = p.battleReport.defeat;
    requireValue(defeat === null || (object(defeat) && !p.alive && integer(defeat.round) && defeat.round > 0 && defeat.round <= s.round
      && ['amount', 'cash', 'recovery', 'shortfall'].every((key) => integer(defeat[key])) && defeat.amount > 0 && defeat.shortfall > 0
      && defeat.shortfall === defeat.amount - defeat.cash - defeat.recovery && typeof defeat.reason === 'string' && defeat.reason.length <= 100
      && (defeat.creditorId === null || (ids.includes(defeat.creditorId) && defeat.creditorId !== p.id))
      && (defeat.tileId === null || boardDefinition.some((tile) => tile.id === defeat.tileId))), '破产战报');
    requireValue(p.human ? p.aiStyle === null : ['conservative', 'aggressive'].includes(p.aiStyle), 'AI 风格');
    requireValue(p.moveBonus === 0 || p.moveBonus === c.strideBonus, '移动加步');
    requireValue(p.alive || (p.cash === 0 && p.cards.length === 0 && p.skipTurns === 0 && p.moveBonus === 0), '破产角色残余状态');
    requireValue(object(p.stats) && ['rentCollected', 'largestRent', 'peakAssets', 'purchases', 'upgrades'].every((key) => integer(p.stats[key])) && p.stats.largestRent <= p.stats.rentCollected, '财富统计');
    requireValue(Array.isArray(p.stats.milestones) && p.stats.milestones.length <= 6 && new Set(p.stats.milestones).size === p.stats.milestones.length && p.stats.milestones.every((title) => ['三座城池', '八座城池', '十五座城池', '首座三级城', '累计收租千金', '资产五千金'].includes(title)), '财富里程碑');
    requireValue(Array.isArray(p.wealthHistory) && p.wealthHistory.length > 0 && p.wealthHistory.length <= 80 && p.wealthHistory.every((point, index) => object(point) && integer(point.round) && point.round > 0 && point.round <= s.round && integer(point.assets) && (!index || point.round > p.wealthHistory[index - 1].round)), '财富历程');
  }
  requireValue(s.players.filter((p) => p.human).length === 1 && s.players.some((p) => p.alive), '玩家/存活角色数量');
  requireValue(s.order.every((id) => s.players.some((p) => p.id === id)), '回合角色未参战');
  const actor = currentPlayer(s);
  requireValue(actor.alive || [Phase.TURN_END, Phase.GAME_OVER].includes(s.phase), '已淘汰角色仍在行动');
  requireValue(Array.isArray(s.roundRemaining) && new Set(s.roundRemaining).size === s.roundRemaining.length && s.roundRemaining.every((id) => ids.includes(id) && (s.players.find((p) => p.id === id).alive || id === actor.id)), '本轮队列');
  if (s.phase !== Phase.GAME_OVER) requireValue(s.roundRemaining.includes(actor.id), '当前角色缺少行动机会');
  requireValue(Array.isArray(s.board) && s.board.length === c.boardSize, '地图');
  for (const [index, tile] of s.board.entries()) {
    const definition = boardDefinition[index];
    requireValue(object(tile) && ['id', 'index', 'name', 'type', 'tier', 'effect', 'regionId', 'province', 'commandery', 'county', 'history'].every((key) => tile[key] === definition[key]), '地图定义不匹配');
    requireValue(integer(tile.level, 3) && integer(tile.investment), '建筑/投入');
    requireValue(Array.isArray(tile.discountedLevels) && new Set(tile.discountedLevels).size === tile.discountedLevels.length && tile.discountedLevels.every((level) => Number.isInteger(level) && level >= 2 && level <= tile.level) && integer(tile.tradeUntilRound), '城池经营状态');
    if (tile.ownerId === null) requireValue(tile.level === 0 && tile.investment === 0 && tile.discountedLevels.length === 0 && tile.tradeUntilRound === 0, '无主土地含建筑/投入');
    else {
      requireValue(tile.type === 'land' && tile.level > 0 && tile.investment > 0 && s.players.some((p) => p.id === tile.ownerId && p.alive), '土地归属');
      const price = c.landPrices[tile.tier];
      const expected = price + c.upgradeMultipliers.slice(0, tile.level - 1).reduce((sum, ratio, index) => sum + Math.max(1, Math.round(Math.round(price * ratio) * (tile.discountedLevels.includes(index + 2) ? 1 - c.repairDiscount : 1))), 0);
      requireValue(tile.investment === expected, '实际投入与购买/升级记录不一致');
    }
  }
  requireValue(s.dice === null || (integer(s.dice, c.diceSides) && s.dice > 0), '骰点');
  requireValue(typeof s.extraRollUsed === 'boolean' && integer(s.rollCount, 2), '额外骰标记');
  requireValue(['upgradeUsed', 'activeCardUsed', 'repairReady', 'shopUsed', 'turnSkipped'].every((key) => typeof s[key] === 'boolean'), '回合经营标记');
  requireValue(s.shopVisit === null || (s.shopVisit === s.board[actor.position].id && boardDefinition[actor.position].cardShop
    && !s.turnSkipped && s.rollCount > 0 && [Phase.TURN_END, Phase.DEBT_RESOLUTION, Phase.CARD_GAIN_DECISION, Phase.GAME_OVER].includes(s.phase)), '设施停靠购买机会');
  requireValue(s.shopVisit === null ? s.shopOffer === null : validCard(s.shopOffer), '固定五折商品');
  if (s.shopVisit && s.phase === Phase.CARD_GAIN_DECISION) requireValue(s.shopUsed, '免费领取机会未消耗');
  requireValue(!s.repairReady || (s.activeCardUsed && !s.upgradeUsed), '修城令状态');
  requireValue(Array.isArray(s.purchasedThisTurn) && new Set(s.purchasedThisTurn).size === s.purchasedThisTurn.length && s.purchasedThisTurn.length <= 2 && s.purchasedThisTurn.every((id) => s.board.some((land) => land.id === id && land.ownerId === actor.id && land.level === 1)), '本回合购地');
  requireValue(!s.turnSkipped || (s.phase === Phase.TURN_END && s.rollCount === 0 && !s.upgradeUsed && !s.shopUsed), '跳过回合经营');
  const tile = s.board[actor.position];
  if ([Phase.MOVING, Phase.DICE_DECISION].includes(s.phase)) {
    requireValue(object(s.move) && integer(s.move.from, c.boardSize - 1) && integer(s.move.target, c.boardSize - 1) && integer(s.move.steps, c.diceSides + c.strideBonus) && s.move.steps > 0 && integer(s.move.laps), '移动快照');
    requireValue(s.move.from === actor.position && s.move.target === (s.move.from + s.move.steps) % c.boardSize && s.move.laps === Math.floor((s.move.from + s.move.steps) / c.boardSize) && s.dice !== null, '移动路径不匹配');
    requireValue(s.move.previewed === undefined || typeof s.move.previewed === 'boolean', '骰点预览');
    requireValue(s.rollCount >= 1 && (s.move.steps === s.dice || s.move.steps === s.dice + c.strideBonus), '移动步数与骰点不一致');
    if (s.phase === Phase.DICE_DECISION) requireValue(c.diceAdjustEnabled && c.diceSides > 1 && s.rollCount === 1 && !actor.diceAdjustUsed && actor.cash >= c.diceAdjustCost && s.move.steps === s.dice && s.move.previewed === true && actor.moveBonus === 0, '调度决策状态');
  } else requireValue(s.move === null, '非移动阶段仍有路径');
  if ([Phase.CARD_DECISION, Phase.DEBT_RESOLUTION].includes(s.phase)) {
    requireValue(object(s.debt) && integer(s.debt.amount) && s.debt.amount > 0 && typeof s.debt.reason === 'string' && s.debt.reason.length <= 100, '债务');
    if (s.debt.creditorId !== null) requireValue(s.players.some((p) => p.id === s.debt.creditorId && p.alive && p.id !== actor.id) && tile.ownerId === s.debt.creditorId && tile.id === s.debt.tileId && s.debt.amount === rent(s, tile), '债权人/租金');
    else requireValue(s.debt.tileId === null && s.debt.amount <= Math.max(c.ordinaryEventFineCap, c.facilityAmounts.marketTax), '系统债务');
    if (s.phase === Phase.DEBT_RESOLUTION) requireValue(actor.cash < s.debt.amount, '已足额债务尚未结算');
    else requireValue(s.debt.creditorId !== null && actor.cards.includes('rentShield'), '免租阶段');
  } else requireValue(s.debt === null, '非债务阶段仍有欠款');
  if (s.phase === Phase.CARD_GAIN_DECISION) requireValue(validCard(s.pendingCard) && actor.cards.length === c.cardCapacity, '锦囊领取状态');
  else requireValue(s.pendingCard === null, '残余待领取锦囊');
  if (s.phase === Phase.BUY_DECISION) requireValue(tile.type === 'land' && tile.ownerId === null, '购地阶段');
  if (s.phase === Phase.UPGRADE_DECISION) requireValue(canUpgrade(s, tile), '升级阶段');
  if (s.phase === Phase.EXTRA_ROLL) requireValue(s.extraRollUsed && s.rollCount === 1, '额外掷骰阶段');
  requireValue(Array.isArray(s.log) && s.log.length <= 10000 && s.log.every((item) => typeof item === 'string' && item.length <= 2000), '日志');
  if (s.phase === Phase.GAME_OVER) requireValue(typeof s.endReason === 'string' && s.endReason.length <= 200 && (s.players.filter((p) => p.alive).length === 1 || (s.mode === 'rounds' && s.completedRounds === c.defaultRoundLimit)), '终局条件');
  else requireValue(s.players.filter((p) => p.alive).length >= 2 && (s.mode === 'classic' || s.completedRounds < c.defaultRoundLimit), '存活/轮数与阶段不一致');

  // Reconstruct known fields. Unknown imported properties never reach core/UI.
  const base = createGame({ humanId: s.players.find((p) => p.human).id, seed: s.seed, mode: s.mode, config: Object.fromEntries(Object.keys(experimentalDefaults).map((key) => [key, c[key]])) });
  base.config.defaultRoundLimit = c.defaultRoundLimit;
  for (const key of ['rngState', 'phase', 'revision', 'round', 'completedRounds', 'order', 'roundRemaining', 'turnIndex', 'startIndex', 'dice', 'move', 'debt', 'pendingCard', 'shopVisit', 'shopOffer', 'extraRollUsed', 'rollCount', 'upgradeUsed', 'activeCardUsed', 'repairReady', 'purchasedThisTurn', 'shopUsed', 'turnSkipped', 'prosperityStartRound', 'log', 'endReason']) if (Object.hasOwn(s, key)) base[key] = structuredClone(s[key]);
  base.players = s.players.map((p) => ({ ...characters.find((character) => character.id === p.id), ...Object.fromEntries(['human', 'alive', 'aiStyle', 'cash', 'position', 'laps', 'cards', 'skipTurns', 'moveBonus', 'diceAdjustUsed'].map((key) => [key, structuredClone(p[key])])), stats: { ...Object.fromEntries(['rentCollected', 'largestRent', 'peakAssets', 'purchases', 'upgrades'].map((key) => [key, p.stats[key]])), milestones: [...p.stats.milestones] }, wealthHistory: p.wealthHistory.map(({ round, assets }) => ({ round, assets })) }));
  base.board = s.board.map((tile, index) => ({ ...boardDefinition[index], ownerId: tile.ownerId, level: tile.level, investment: tile.investment, discountedLevels: [...tile.discountedLevels], tradeUntilRound: tile.tradeUntilRound }));
  base.players.forEach((p, index) => {
    const saved = s.players[index];
    p.cardBag = [...saved.cardBag];
    p.battleReport = { moments: saved.battleReport.moments.map(({ key, round, title, detail }) => ({ key, round, title, detail })),
      defeat: saved.battleReport.defeat === null ? null : Object.fromEntries(['round', 'tileId', 'reason', 'amount', 'cash', 'recovery', 'shortfall', 'creditorId'].map((key) => [key, saved.battleReport.defeat[key]])) };
  });
  return base;
}
