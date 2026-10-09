import { Phase, createGame, currentPlayer, rent } from './game.js';
import { boardDefinition, characters, factions } from '../data/board.js';
import { confirmedRules, experimentalDefaults, validateConfig } from '../config/game-config.js';
import { cards } from '../data/events.js';

const fail = (message) => { throw new Error(`存档无效：${message}`); };
const requireValue = (condition, message) => { if (!condition) fail(message); };
const integer = (value, max = 1000000000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validCard = (value) => Object.hasOwn(cards, value);

export function exportSave(state) {
  return JSON.stringify({ format: 'three-kingdoms-monopoly', version: 3, state }, null, 2);
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
  requireValue(object(envelope) && envelope.format === 'three-kingdoms-monopoly' && envelope.version === 3, '格式或版本不兼容；本版使用40格魏蜀吴地图，旧版24格存档无法恢复');
  const s = envelope.state;
  requireValue(object(s) && s.version === 3 && object(s.config), '缺少游戏状态');
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
  requireValue(Array.isArray(s.order) && s.order.length === 3 && new Set(s.order).size === 3 && s.order.every((id) => ids.includes(id)) && integer(s.turnIndex, 2), '回合顺序');
  requireValue(s.startIndex === 0 && Array.isArray(s.players) && s.players.length === 3, '起点/角色');
  for (const [index, p] of s.players.entries()) {
    requireValue(object(p) && characters.some((character) => character.id === p.id && character.factionId === factions[index].id) && typeof p.human === 'boolean' && typeof p.alive === 'boolean', '角色身份/阵营');
    for (const key of ['cash', 'laps', 'skipTurns', 'moveBonus']) requireValue(integer(p[key]), `角色 ${key}`);
    requireValue(p.skipTurns <= 100, '跳过机会数量过大');
    requireValue(integer(p.position, c.boardSize - 1) && Array.isArray(p.cards) && p.cards.length <= c.cardCapacity && p.cards.every(validCard), '位置/背包');
    requireValue(p.human ? p.aiStyle === null : ['conservative', 'aggressive'].includes(p.aiStyle), 'AI 风格');
    requireValue(p.moveBonus === 0 || p.moveBonus === c.strideBonus, '移动加步');
    requireValue(p.alive || (p.cash === 0 && p.cards.length === 0 && p.skipTurns === 0 && p.moveBonus === 0), '破产角色残余状态');
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
    if (tile.ownerId === null) requireValue(tile.level === 0 && tile.investment === 0, '无主土地含建筑/投入');
    else {
      requireValue(tile.type === 'land' && tile.level > 0 && tile.investment > 0 && s.players.some((p) => p.id === tile.ownerId && p.alive), '土地归属');
      const price = c.landPrices[tile.tier];
      const expected = price + c.upgradeMultipliers.slice(0, tile.level - 1).reduce((sum, ratio) => sum + Math.round(price * ratio), 0);
      requireValue(tile.investment === expected, '实际投入与购买/升级记录不一致');
    }
  }
  requireValue(s.dice === null || (integer(s.dice, c.diceSides) && s.dice > 0), '骰点');
  requireValue(typeof s.extraRollUsed === 'boolean' && integer(s.rollCount, 2), '额外骰标记');
  const tile = s.board[actor.position];
  if (s.phase === Phase.MOVING) {
    requireValue(object(s.move) && integer(s.move.from, c.boardSize - 1) && integer(s.move.target, c.boardSize - 1) && integer(s.move.steps, c.diceSides + c.strideBonus) && s.move.steps > 0 && integer(s.move.laps), '移动快照');
    requireValue(s.move.from === actor.position && s.move.target === (s.move.from + s.move.steps) % c.boardSize && s.move.laps === Math.floor((s.move.from + s.move.steps) / c.boardSize) && s.dice !== null, '移动路径不匹配');
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
  if (s.phase === Phase.UPGRADE_DECISION) requireValue(tile.ownerId === actor.id && tile.level > 0 && tile.level < 3, '升级阶段');
  if (s.phase === Phase.EXTRA_ROLL) requireValue(s.extraRollUsed && s.rollCount === 1, '额外掷骰阶段');
  requireValue(Array.isArray(s.log) && s.log.length <= 10000 && s.log.every((item) => typeof item === 'string' && item.length <= 2000), '日志');
  if (s.phase === Phase.GAME_OVER) requireValue(typeof s.endReason === 'string' && s.endReason.length <= 200 && (s.players.filter((p) => p.alive).length === 1 || (s.mode === 'rounds' && s.completedRounds === c.defaultRoundLimit)), '终局条件');
  else requireValue(s.players.filter((p) => p.alive).length >= 2 && (s.mode === 'classic' || s.completedRounds < c.defaultRoundLimit), '存活/轮数与阶段不一致');

  // Reconstruct known fields. Unknown imported properties never reach core/UI.
  const base = createGame({ humanId: s.players.find((p) => p.human).id, seed: s.seed, mode: s.mode, config: Object.fromEntries(Object.keys(experimentalDefaults).map((key) => [key, c[key]])) });
  base.config.defaultRoundLimit = c.defaultRoundLimit;
  for (const key of ['rngState', 'phase', 'revision', 'round', 'completedRounds', 'order', 'roundRemaining', 'turnIndex', 'startIndex', 'dice', 'move', 'debt', 'pendingCard', 'extraRollUsed', 'rollCount', 'log', 'endReason']) if (Object.hasOwn(s, key)) base[key] = structuredClone(s[key]);
  base.players = s.players.map((p) => ({ ...characters.find((character) => character.id === p.id), ...Object.fromEntries(['human', 'alive', 'aiStyle', 'cash', 'position', 'laps', 'cards', 'skipTurns', 'moveBonus'].map((key) => [key, structuredClone(p[key])])) }));
  base.board = s.board.map((tile, index) => ({ ...boardDefinition[index], ownerId: tile.ownerId, level: tile.level, investment: tile.investment }));
  return base;
}
