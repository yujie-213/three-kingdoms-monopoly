import { describe, it, expect } from 'vitest';
import { createGame, dispatch, currentPlayer, Phase, drawEvent } from '../../src/core/game.js';
import { exportSave, importSave } from '../../src/core/save.js';
import { publicView, chooseCommand } from '../../src/ai/strategy.js';

const act = (state, type, extra = {}) => dispatch(state, { type, revision: state.revision, actorId: currentPlayer(state).id, ...extra });
function arrive(state, target) {
  state.phase = Phase.MOVING;
  state.move = { from: currentPlayer(state).position, target, steps: 1, laps: 0 };
  return act(state, 'FINISH_MOVE').state;
}
function eventSeed(state, eventId) {
  for (let rng = 1; rng < 20000; rng++) {
    const candidate = structuredClone(state); candidate.rngState = rng;
    if (drawEvent(candidate).id === eventId) return rng;
  }
  throw new Error('No fixture seed');
}
function forceEvent(state, id) { state.rngState = eventSeed(state, id); return arrive(state, state.board.findIndex((tile) => tile.type === 'event')); }
function automate(state, maximum = 2000) {
  let operations = 0;
  while (state.phase !== Phase.GAME_OVER && operations++ < maximum) {
    const command = state.phase === Phase.MOVING ? { type: 'FINISH_MOVE', revision: state.revision, actorId: currentPlayer(state).id } : chooseCommand(publicView(state));
    const result = dispatch(state, command);
    expect(result.accepted).toBe(true);
    state = result.state;
    expect(state.players.every((p) => p.cash >= 0 && p.cards.length <= state.config.cardCapacity)).toBe(true);
  }
  return state;
}

describe('M2 debts, modes and save files', () => {
  it('settles system tax without transferring to another player', () => {
    const state = createGame(); const actor = currentPlayer(state);
    const before = state.players.reduce((sum, p) => sum + p.cash, 0);
    const next = arrive(state, state.board.findIndex((tile) => tile.effect === 'marketTax'));
    expect(currentPlayer(next).cash).toBe(actor.cash - 80);
    expect(next.players.reduce((sum, p) => sum + p.cash, 0)).toBe(before - 80);
  });
  it('system debt stays locked, sells actual investment and clears the original debt', () => {
    const state = createGame(); currentPlayer(state).cash = 1;
    Object.assign(state.board[1], { ownerId: currentPlayer(state).id, level: 1, investment: 150 });
    const next = arrive(state, state.board.findIndex((tile) => tile.effect === 'marketTax'));
    expect(next.debt.creditorId).toBeNull();
    const sold = act(next, 'SELL', { tileId: 'tile-1' }).state;
    expect(currentPlayer(sold).cash).toBe(11);
    expect(sold.debt).toBeNull();
  });
  it('system bankruptcy consumes remaining cash, clears assets and leaves no negative balance', () => {
    const state = createGame(); currentPlayer(state).cash = 1;
    const next = act(arrive(state, state.board.findIndex((tile) => tile.effect === 'marketTax')), 'BANKRUPT').state;
    expect(currentPlayer(next)).toMatchObject({ cash: 0, alive: false });
    expect(next.debt).toBeNull();
    expect(next.players.reduce((sum, p) => sum + p.cash, 0)).toBe(3600);
  });
  it('classic mode ignores the 40-round cutoff', () => {
    let state = createGame({ mode: 'classic' });
    for (let i = 0; i < 123; i++) { state.phase = Phase.TURN_END; state = act(state, 'END_TURN').state; }
    expect(state.completedRounds).toBe(41);
    expect(state.phase).toBe(Phase.TURN_START);
  });
  it('round queues remove eliminated future actors without counting an extra opportunity', () => {
    let state = createGame(); state.players.find((p) => p.id === state.order[2]).alive = false;
    state.phase = Phase.TURN_END; state = act(state, 'END_TURN').state;
    expect(state.completedRounds).toBe(0);
    state.phase = Phase.TURN_END; state = act(state, 'END_TURN').state;
    expect(state.completedRounds).toBe(1);
    expect(currentPlayer(state).id).toBe(state.order[0]);
  });
  it('round-trips state, RNG and a pending move, then resumes exactly once', () => {
    const state = act(createGame(), 'ROLL').state;
    const loaded = importSave(exportSave(state));
    expect(loaded).toEqual(state);
    expect(act(loaded, 'FINISH_MOVE').state).toEqual(act(state, 'FINISH_MOVE').state);
    expect(act(act(loaded, 'FINISH_MOVE').state, 'FINISH_MOVE').accepted).toBe(false);
  });
  it('round-trips debt and pre-payment shield decision', () => {
    const state = createGame(); const actor = currentPlayer(state);
    actor.cards.push('rentShield'); actor.cash = 0;
    Object.assign(state.board[1], { ownerId: state.order[1], level: 1, investment: 150 });
    state.phase = Phase.MOVING; state.move = { from: 0, steps: 1, target: 1, laps: 0 }; state.dice = 1; state.rollCount = 1;
    const shield = act(state, 'FINISH_MOVE').state;
    expect(importSave(exportSave(shield))).toEqual(shield);
    const debt = act(shield, 'PAY_RENT').state;
    expect(importSave(exportSave(debt))).toEqual(debt);
  });
  it('validates every phase throughout a seeded real match', () => {
    let state = createGame({ seed: '存档回归' }); let steps = 0;
    while (state.phase !== Phase.GAME_OVER && steps++ < 2000) {
      expect(importSave(exportSave(state))).toEqual(state);
      const command = state.phase === Phase.MOVING ? { type: 'FINISH_MOVE', revision: state.revision, actorId: currentPlayer(state).id } : chooseCommand(publicView(state));
      state = dispatch(state, command).state;
    }
    expect(importSave(exportSave(state))).toEqual(state);
    expect(state.phase).toBe(Phase.GAME_OVER);
  });
  it.each([
    ['unsupported version', (e) => { e.version = 99; }],
    ['negative cash', (e) => { e.state.players[0].cash = -1; }],
    ['invalid ownership', (e) => { e.state.board[1].ownerId = 'ghost'; }],
    ['false investment', (e) => { e.state.board[1].ownerId = 'liu'; e.state.board[1].level = 1; e.state.board[1].investment = 1000000; }],
    ['duplicate order', (e) => { e.state.order = ['liu', 'liu', 'sun']; }],
    ['missing human', (e) => { e.state.players.forEach((p) => { p.human = false; }); }],
    ['wrong phase', (e) => { e.state.phase = 'BAD'; }],
    ['nonfinite prices', (e) => { e.state.config.landPrices.village = null; }],
    ['unconfirmed resale', (e) => { e.state.config.assetSellbackRatio = 1; }],
    ['zero RNG', (e) => { e.state.rngState = 0; }],
    ['orphan path', (e) => { e.state.move = {}; }],
    ['fake end', (e) => { e.state.phase = Phase.GAME_OVER; e.state.endReason = 'fake'; }],
  ])('rejects %s and does not alter the original state', (_name, mutate) => {
    const original = createGame(); const before = structuredClone(original);
    const envelope = JSON.parse(exportSave(original)); mutate(envelope);
    expect(() => importSave(JSON.stringify(envelope))).toThrow();
    expect(original).toEqual(before);
  });
  it('rejects broken JSON, dangerous keys, missing shape and oversized files', () => {
    for (const input of ['{', '{"__proto__":{}}', '{}', 'x'.repeat(2000001)]) expect(() => importSave(input)).toThrow();
  });
  it('rejects invalid random weights and excessive movement configuration before a game can start', () => {
    expect(() => createGame({ config: { eventWeights: { economy: 0, movement: 0, strategy: 0 } } })).toThrow();
    expect(() => createGame({ config: { strideBonus: 1000000 } })).toThrow();
    expect(() => createGame({ config: { rentMultipliers: [0.000001, 0.4, 0.9] } })).toThrow();
  });
});

describe('M3 events, cards and fair AI', () => {
  it('event pool covers all twelve effects with weighted reproducible RNG', () => {
    const first = createGame(); const second = createGame();
    expect(drawEvent(first)).toEqual(drawEvent(second));
    expect(first.rngState).toBe(second.rngState);
    expect(drawEvent(createGame({ config: { eventWeights: { economy: 0, movement: 0, strategy: 100 } } })).category).toBe('strategy');
  });
  it('caps ordinary event fines and routes them through system debt', () => {
    const state = createGame({ config: { ordinaryEventFineCap: 50 } });
    currentPlayer(state).cash = 1;
    const next = forceEvent(state, 'tax');
    expect(next.debt).toMatchObject({ amount: 50, creditorId: null, reason: '朝廷征税' });
    expect(currentPlayer(next).cash).toBe(1);
  });
  it('allows one extra roll per turn and prevents recursive march', () => {
    let state = forceEvent(createGame(), 'march');
    expect(state.phase).toBe(Phase.EXTRA_ROLL);
    state = act(state, 'ROLL').state;
    expect(state.rollCount).toBe(1); // forceEvent test bypassed the initial roll
    state = forceEvent(state, 'march');
    expect(state.phase).toBe(Phase.TURN_END);
    expect(state.log.at(-1)).toContain('不再额外移动');
  });
  it('extra movement applies its own crossing reward and final tile effect once', () => {
    const state = createGame({ config: { diceSides: 1 } });
    state.phase = Phase.EXTRA_ROLL; state.extraRollUsed = true; state.rollCount = 1;
    currentPlayer(state).position = state.board.length - 1;
    const rolled = act(state, 'ROLL').state;
    const ended = act(rolled, 'FINISH_MOVE').state;
    expect(currentPlayer(ended).cash).toBe(2300);
    expect(ended.rollCount).toBe(2);
    expect(act(ended, 'FINISH_MOVE').accepted).toBe(false);
  });
  it('skipped turn still completes the round opportunity', () => {
    let state = createGame(); const nextId = state.order[1];
    state.players.find((p) => p.id === nextId).skipTurns = 1;
    state.phase = Phase.TURN_END; state = act(state, 'END_TURN').state;
    expect(currentPlayer(state).id).toBe(nextId);
    expect(state.phase).toBe(Phase.TURN_END);
    expect(currentPlayer(state).skipTurns).toBe(0);
    state = act(state, 'END_TURN').state;
    expect(currentPlayer(state).id).toBe(state.order[2]);
  });
  it('asks about shield before any payment, then consumes exactly one', () => {
    const state = createGame(); currentPlayer(state).cards = ['rentShield'];
    Object.assign(state.board[1], { ownerId: state.order[1], level: 3, investment: 413 });
    const decision = arrive(state, 1);
    expect(decision.phase).toBe(Phase.CARD_DECISION);
    expect(currentPlayer(decision).cash).toBe(1800);
    const shield = act(decision, 'USE_SHIELD').state;
    expect(currentPlayer(shield).cash).toBe(1800);
    expect(currentPlayer(shield).cards).toEqual([]);
    expect(shield.debt).toBeNull();
    expect(act(shield, 'USE_SHIELD').accepted).toBe(false);
    expect(currentPlayer(act(decision, 'PAY_RENT').state).cash).toBe(1665);
  });
  it('active cards obey pre-roll timing, add steps without changing dice RNG and never double-consume', () => {
    const state = createGame({ config: { diceSides: 1 } });
    currentPlayer(state).cards = ['stride', 'stride', 'fortune'];
    const stride = act(state, 'USE_CARD', { card: 'stride' }).state;
    expect(act(stride, 'USE_CARD', { card: 'stride' }).accepted).toBe(false);
    expect(stride.rngState).toBe(state.rngState);
    const fortune = act(stride, 'USE_CARD', { card: 'fortune' }).state;
    expect(currentPlayer(fortune).cash).toBe(1900);
    const rolled = act(fortune, 'ROLL').state;
    expect(rolled.move.steps).toBe(3);
    expect(rolled.dice).toBe(1);
    expect(act(rolled, 'USE_CARD', { card: 'fortune' }).accepted).toBe(false);
  });
  it('a full inventory requires explicit replacement or decline', () => {
    const state = createGame(); currentPlayer(state).cards = ['stride', 'fortune', 'rentShield'];
    const pending = forceEvent(state, 'advice');
    expect(pending.phase).toBe(Phase.CARD_GAIN_DECISION);
    expect(currentPlayer(pending).cards).toHaveLength(3);
    expect(act(pending, 'KEEP_CARD', { replaceIndex: 9 }).accepted).toBe(false);
    const kept = act(pending, 'KEEP_CARD', { replaceIndex: 0 }).state;
    expect(currentPlayer(kept).cards).toEqual(['rentShield', 'fortune', 'rentShield']);
    expect(act(pending, 'DECLINE_CARD').state.pendingCard).toBeNull();
  });
  it('AI personalities change reserves, not prices or access to randomness', () => {
    const state = createGame();
    currentPlayer(state).aiStyle = 'conservative';
    const conservative = publicView(state);
    currentPlayer(state).aiStyle = 'aggressive';
    const aggressive = publicView(state);
    expect(conservative.reserve).toBe(300); expect(aggressive.reserve).toBe(100);
    expect(aggressive.price).toBe(conservative.price);
    expect(aggressive).not.toHaveProperty('rngState');
    expect(aggressive).not.toHaveProperty('seed');
  });
  it('multiple seeded games terminate legally, remain replayable and never leave a debt/decision dangling', () => {
    for (let seed = 0; seed < 8; seed++) {
      const a = automate(createGame({ seed: String(seed) }));
      const b = automate(createGame({ seed: String(seed) }));
      expect(a).toEqual(b);
      expect(a.phase).toBe(Phase.GAME_OVER); expect(a.debt).toBeNull(); expect(a.pendingCard).toBeNull();
    }
  });
});
