import { describe, it, expect } from 'vitest';
import { createGame, dispatch, currentPlayer, Phase, rent, assets, cityGroup } from '../../src/core/game.js';
import { exportSave, importSave } from '../../src/core/save.js';
import { createAutoSave, AUTO_SAVE_KEY, AUTO_SAVE_BACKUP_KEY } from '../../src/core/auto-save.js';
import { chooseCommand, publicView } from '../../src/ai/strategy.js';

const act = (s, type, extra = {}) => dispatch(s, { type, actorId: currentPlayer(s).id, revision: s.revision, ...extra });
function own(s, index, ownerId = currentPlayer(s).id) {
  Object.assign(s.board[index], { ownerId, level: 1, investment: s.config.landPrices[s.board[index].tier] });
}
function nextOwnTurn(s) {
  for (let i = 0; i < 3; i++) { s.phase = Phase.TURN_END; s = act(s, 'END_TURN').state; }
  return s;
}

describe('classic growth and safe management', () => {
  it('defaults to classic and never ends at the advanced mode cutoff', () => {
    let s = createGame({ seed: 'classic' });
    expect(s.mode).toBe('classic'); expect(s.config.salaryPerLap).toBe(300);
    for (let i = 0; i < 123; i++) { s.phase = Phase.TURN_END; s = act(s, 'END_TURN').state; }
    expect(s.completedRounds).toBe(41); expect(s.phase).toBe(Phase.TURN_START);
  });
  it('actively builds away from the landing and shares the one-per-turn limit', () => {
    const s = createGame(); own(s, 1); own(s, 3);
    const built = act(s, 'MANAGE_UPGRADE', { tileId: 'tile-3' });
    expect(built.accepted).toBe(true); expect(built.state.board[3].level).toBe(2);
    expect(currentPlayer(built.state).position).toBe(0);
    expect(act(built.state, 'MANAGE_UPGRADE', { tileId: 'tile-1' }).accepted).toBe(false);
    const next = nextOwnTurn(built.state);
    expect(act(next, 'MANAGE_UPGRADE', { tileId: 'tile-1' }).accepted).toBe(true);
    expect(importSave(exportSave(built.state))).toEqual(built.state);
  });
  it('cannot upgrade newly bought land, enemy land, while moving or while in debt', () => {
    let s = createGame({ config: { diceSides: 1 } });
    s = act(act(s, 'ROLL').state, 'FINISH_MOVE').state;
    s = act(s, 'BUY').state;
    expect(act(s, 'MANAGE_UPGRADE', { tileId: 'tile-1' }).accepted).toBe(false);
    own(s, 3, s.order[1]);
    expect(act(s, 'MANAGE_UPGRADE', { tileId: 'tile-3' }).accepted).toBe(false);
    s = nextOwnTurn(s);
    const moving = act(s, 'ROLL').state;
    expect(act(moving, 'MANAGE_UPGRADE', { tileId: 'tile-1' }).accepted).toBe(false);
    s.phase = Phase.DEBT_RESOLUTION; s.debt = { amount: 80, creditorId: null, reason: '税费', tileId: null };
    const snapshot = structuredClone(s);
    expect(act(s, 'MANAGE_UPGRADE', { tileId: 'tile-1' }).accepted).toBe(false);
    expect(s).toEqual(snapshot);
  });
  it('discounted investment survives saving and sells back at 60% of actual money spent', () => {
    let s = createGame(); own(s, 1); currentPlayer(s).cards = ['repair', 'fortune'];
    s = act(s, 'USE_CARD', { card: 'repair' }).state;
    expect(act(s, 'USE_CARD', { card: 'fortune' }).accepted).toBe(false);
    s = act(s, 'MANAGE_UPGRADE', { tileId: 'tile-1' }).state;
    expect(s.board[1]).toMatchObject({ investment: 195, level: 2, discountedLevels: [2] });
    expect(assets(s, currentPlayer(s).id).recovery).toBe(117);
    expect(importSave(exportSave(s))).toEqual(s);
    currentPlayer(s).cash = 0; s.phase = Phase.DEBT_RESOLUTION;
    s.debt = { amount: 80, creditorId: null, reason: '税费', tileId: null };
    s = act(s, 'SELL', { tileId: 'tile-1' }).state;
    expect(currentPlayer(s).cash).toBe(37); expect(s.debt).toBeNull();
    expect(s.board[1]).toMatchObject({ discountedLevels: [], tradeUntilRound: 0 });
    expect(importSave(exportSave(s))).toEqual(s);
  });
  it('repairs expire at the next actor and skipped actors cannot manage or buy cards', () => {
    let s = createGame(); own(s, 1); currentPlayer(s).cards = ['repair'];
    s = act(s, 'USE_CARD', { card: 'repair' }).state;
    s.players.find((p) => p.id === s.order[1]).skipTurns = 1;
    s.phase = Phase.TURN_END; s = act(s, 'END_TURN').state;
    expect(s.repairReady).toBe(false); expect(s.turnSkipped).toBe(true);
    own(s, 3);
    expect(act(s, 'MANAGE_UPGRADE', { tileId: 'tile-3' }).accepted).toBe(false);
    expect(act(s, 'BUY_CARD', { card: 'fortune' }).accepted).toBe(false);
    expect(chooseCommand(publicView(s)).type).toBe('END_TURN');
  });
  it('city groups contain 2–3 land cells and partial and complete ownership earn distinct bonuses', () => {
    const s = createGame(); own(s, 1); own(s, 3);
    expect(cityGroup(s, s.board[1]).complete).toBe(false); expect(rent(s, s.board[1])).toBe(17);
    own(s, 4);
    expect(cityGroup(s, s.board[1]).complete).toBe(true); expect(rent(s, s.board[1])).toBe(20);
    for (const land of s.board.filter((tile) => tile.type === 'land')) {
      expect(cityGroup(s, land).tileIds.length).toBeGreaterThanOrEqual(2);
      expect(cityGroup(s, land).tileIds.length).toBeLessThanOrEqual(3);
    }
  });
  it('commerce only targets own cities, does not stack, expires, and sale breaks group bonuses', () => {
    let s = createGame(); own(s, 1); own(s, 3); own(s, 4); own(s, 6, s.order[1]);
    currentPlayer(s).cards = ['commerce'];
    expect(act(s, 'USE_CARD', { card: 'commerce', tileId: 'tile-6' }).accepted).toBe(false);
    s = act(s, 'USE_CARD', { card: 'commerce', tileId: 'tile-1' }).state;
    expect(rent(s, s.board[1])).toBe(23); expect(s.board[6].tradeUntilRound).toBe(0);
    expect(importSave(exportSave(s))).toEqual(s);
    s = nextOwnTurn(s); currentPlayer(s).cards = ['commerce'];
    expect(act(s, 'USE_CARD', { card: 'commerce', tileId: 'tile-1' }).accepted).toBe(false);
    currentPlayer(s).cash = 0; s.phase = Phase.DEBT_RESOLUTION;
    s.debt = { amount: 80, creditorId: null, reason: '税费', tileId: null };
    s = act(s, 'SELL', { tileId: 'tile-4' }).state;
    expect(rent(s, s.board[1])).toBe(21);
    s = nextOwnTurn(nextOwnTurn(s));
    expect(rent(s, s.board[1])).toBe(17);
  });
  it('shop enforces turn limits, capacity, cash and actual price without consuming RNG', () => {
    const s = createGame();
    currentPlayer(s).position = 2; s.phase = Phase.TURN_END; s.shopVisit = 'tile-2'; s.shopOffer = 'rentShield'; s.rollCount = 1;
    const bought = act(s, 'BUY_CARD', { card: 'rentShield' }).state;
    expect(currentPlayer(bought).cash).toBe(3125); expect(bought.rngState).toBe(s.rngState);
    expect(act(bought, 'BUY_CARD', { card: 'stride' }).accepted).toBe(false);
    expect(importSave(exportSave(bought))).toEqual(bought);
    currentPlayer(s).cards = ['stride', 'fortune', 'repair'];
    expect(act(s, 'BUY_CARD', { card: 'commerce' }).accepted).toBe(false);
    currentPlayer(s).cards = []; currentPlayer(s).cash = 1;
    expect(act(s, 'BUY_CARD', { card: 'stride' }).accepted).toBe(false);
    expect(act(s, 'BUY_CARD', { card: 'enemyAttack' }).accepted).toBe(false);
  });
  it('records actual rent once and keeps history through bankruptcy', () => {
    let s = createGame({ config: { diceSides: 1 } }); own(s, 1, s.order[1]);
    const ownerId = s.order[1];
    s = act(act(s, 'ROLL').state, 'FINISH_MOVE').state;
    expect(s.players.find((p) => p.id === ownerId).stats).toMatchObject({ rentCollected: 15, largestRent: 15 });
    expect(act(s, 'FINISH_MOVE').accepted).toBe(false);
    expect(importSave(exportSave(s))).toEqual(s);
  });
  it('migrates v3 with its original economy and mode without adding group income', () => {
    const s = createGame({ mode: 'rounds' });
    s.version = 3; s.config.salaryPerLap = 500; s.config.rentMultipliers = [0.15, 0.4, 0.9];
    for (const key of ['groupRentBonus', 'repairDiscount', 'tradeRentBonus', 'tradeDuration', 'cardPrices']) delete s.config[key];
    for (const key of ['upgradeUsed', 'activeCardUsed', 'repairReady', 'purchasedThisTurn', 'shopUsed', 'turnSkipped']) delete s[key];
    s.players.forEach((p) => { delete p.stats; delete p.wealthHistory; });
    s.board.forEach((tile) => { delete tile.discountedLevels; delete tile.tradeUntilRound; });
    const loaded = importSave(JSON.stringify({ format: 'three-kingdoms-monopoly', version: 3, state: s }));
    expect(loaded.mode).toBe('rounds'); expect(loaded.config.salaryPerLap).toBe(500);
    expect(loaded.config.rentMultipliers).toEqual([0.15, 0.4, 0.9]); expect(loaded.config.groupRentBonus).toBe(0);
    expect(importSave(exportSave(loaded))).toEqual(loaded);
  });
});

describe('automatic save recovery', () => {
  function storage() {
    const values = new Map();
    return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  }
  it('restores the exact move and management limits, falling back to the previous valid snapshot', () => {
    const db = storage(); const saves = createAutoSave(() => db);
    const start = createGame(); own(start, 1);
    const built = act(start, 'MANAGE_UPGRADE', { tileId: 'tile-1' }).state;
    saves.save(built);
    const moving = act(built, 'ROLL').state; saves.save(moving);
    const reopened = createAutoSave(() => db);
    expect(reopened.restore().state).toEqual(moving);
    reopened.save(moving);
    expect(importSave(db.getItem(AUTO_SAVE_BACKUP_KEY))).toEqual(built);
    db.setItem(AUTO_SAVE_KEY, '{');
    const fallback = createAutoSave(() => db);
    expect(fallback.restore().state).toEqual(built);
    fallback.save(built);
    expect(importSave(db.getItem(AUTO_SAVE_KEY))).toEqual(built);
    expect(importSave(db.getItem(AUTO_SAVE_BACKUP_KEY))).toEqual(built);
  });
  it('reports unavailable or full storage and rejects corrupt snapshots', () => {
    const blocked = createAutoSave(() => { throw new Error('blocked'); });
    expect(blocked.restore().state).toBeNull(); expect(blocked.save(createGame())).toBe(false);
    const quota = createAutoSave(() => ({ setItem() { throw new Error('quota'); } }));
    expect(quota.save(createGame())).toBe(false);
    const db = storage(); db.setItem(AUTO_SAVE_KEY, '{}');
    expect(createAutoSave(() => db).restore()).toMatchObject({ state: null });
  });
});
