import { describe, it, expect } from 'vitest';
import { createGame, currentPlayer, dispatch, Phase, cityGroup, rent, groupIncome, demolitionValue, disposalOptions, prosperityMultiplier, canUpgrade } from '../../src/core/game.js';
import { exportSave, importSave } from '../../src/core/save.js';
import { chooseCommand, publicView } from '../../src/ai/strategy.js';

const act = (s, type, extra = {}) => dispatch(s, { type, actorId: currentPlayer(s).id, revision: s.revision, ...extra });
function own(s, index, level = 1, ownerId = currentPlayer(s).id) {
  const tile = s.board[index], price = s.config.landPrices[tile.tier];
  Object.assign(tile, { ownerId, level, investment: price + s.config.upgradeMultipliers.slice(0, level - 1).reduce((sum, ratio) => sum + Math.round(price * ratio), 0) });
}
function travel(s, from, steps) {
  currentPlayer(s).position = from;
  s.phase = Phase.MOVING; s.dice = steps; s.rollCount = 1;
  s.move = { from, steps, target: (from + steps) % s.board.length, laps: Math.floor((from + steps) / s.board.length) };
  return act(s, 'FINISH_MOVE').state;
}
function circle(s) { for (let index = 0; index < 10; index++) s = travel(s, index * 4, 4); return s; }

describe('v5 travel income and property economy', () => {
  it('pays exactly 500 for each opening lap and 300 afterwards, without stationary income', () => {
    let s = createGame({ config: { eventsEnabled: false } });
    expect(currentPlayer(s).cash).toBe(3200);
    s = circle(s); expect(currentPlayer(s).cash).toBe(3700);
    s = circle(s); expect(currentPlayer(s).cash).toBe(4200);
    s = circle(s); expect(currentPlayer(s).cash).toBe(4500);
    expect(currentPlayer(s).laps).toBe(3);
    s.phase = Phase.TURN_END;
    const ended = act(s, 'END_TURN').state;
    expect(ended.players.find((p) => p.id === currentPlayer(s).id).cash).toBe(4500);
  });
  it('settles each crossed checkpoint once, before a payable landing', () => {
    let s = createGame({ config: { eventsEnabled: false } });
    own(s, 10, 1, s.order[1]); currentPlayer(s).cash = 0;
    s = travel(s, 9, 1);
    expect(currentPlayer(s).cash).toBe(100); // 125 supply minus 25 rent.
    expect(s.debt).toBeNull();
    expect(act(s, 'FINISH_MOVE').accepted).toBe(false);
    expect(importSave(exportSave(s))).toEqual(s);
  });
  it('keeps the compact economy explicit and totals its four segments to 80', () => {
    let s = createGame({ economy: 'compact', config: { eventsEnabled: false } });
    s = circle(s);
    expect(currentPlayer(s).cash).toBe(580);
    expect(s.config.openingBonusPerLap).toBe(0);
    expect(importSave(exportSave(s))).toEqual(s);
  });
  it('distinguishes partial and complete groups and pays each full group once per lap', () => {
    let s = createGame({ config: { eventsEnabled: false } });
    own(s, 1); own(s, 3);
    expect(cityGroup(s, s.board[1])).toMatchObject({ owned: 2, complete: false, bonus: 0.15, income: 0 });
    expect(rent(s, s.board[1])).toBe(17);
    own(s, 4); own(s, 10); own(s, 11);
    expect(groupIncome(s, currentPlayer(s).id)).toBe(200);
    expect(rent(s, s.board[1])).toBe(20);
    s = travel(s, 39, 1);
    expect(currentPlayer(s).cash).toBe(3525); // last 125 segment and 120 + 80.
    expect(groupIncome(s, currentPlayer(s).id)).toBe(200);
    expect(importSave(exportSave(s))).toEqual(s);
  });
  it('locks level three until the owner completes a lap and preserves independent city upgrades', () => {
    let s = createGame({ config: { eventsEnabled: false } }); own(s, 4, 2);
    expect(canUpgrade(s, s.board[4])).toBe(false);
    expect(act(s, 'MANAGE_UPGRADE', { tileId: 'tile-4' }).accepted).toBe(false);
    s = travel(s, 39, 1);
    expect(canUpgrade(s, s.board[4])).toBe(true);
    s = act(s, 'MANAGE_UPGRADE', { tileId: 'tile-4' }).state;
    expect(s.board[4].investment).toBe(1040);
    expect(rent(s, s.board[4])).toBe(400);
  });
});

describe('paid dice routing and reliable resumption', () => {
  it('previews without moving or paying, adjusts once without another RNG draw and restores exactly', () => {
    let s = createGame({ seed: '三国-1', config: { eventsEnabled: false } });
    s = act(s, 'ROLL').state;
    expect(s.phase).toBe(Phase.DICE_DECISION);
    expect(currentPlayer(s).position).toBe(0);
    expect(currentPlayer(s).cash).toBe(3200);
    expect(act(s, 'FINISH_MOVE').accepted).toBe(false);
    expect(importSave(exportSave(s))).toEqual(s);
    const rng = s.rngState, dice = s.dice, delta = dice === 6 ? -1 : 1;
    s = act(s, 'ADJUST_DICE', { delta }).state;
    expect(s.rngState).toBe(rng); expect(s.dice).toBe(dice + delta);
    expect(currentPlayer(s)).toMatchObject({ cash: 3140, diceAdjustUsed: true, position: 0 });
    expect(act(s, 'ADJUST_DICE', { delta }).accepted).toBe(false);
    const loaded = importSave(exportSave(s));
    expect(loaded).toEqual(s);
    const moved = act(loaded, 'FINISH_MOVE').state;
    expect(currentPlayer(moved).position).toBe(dice + delta);
    expect(currentPlayer(moved).cash).toBe(3140);
  });
  it('free confirmation preserves cash, endpoints reject invalid deltas and the opportunity resets only on crossing', () => {
    let s = createGame(); s.phase = Phase.DICE_DECISION; s.dice = 1; s.rollCount = 1;
    s.move = { from: 0, steps: 1, target: 1, laps: 0, previewed: true };
    for (const delta of [-1, 0, 2, '1']) expect(act(s, 'ADJUST_DICE', { delta }).accepted).toBe(false);
    const confirmed = act(s, 'CONFIRM_MOVE').state;
    expect(currentPlayer(confirmed).cash).toBe(3200);
    currentPlayer(s).diceAdjustUsed = true;
    s = travel(s, 28, 2); expect(currentPlayer(s).diceAdjustUsed).toBe(true);
    s = travel(s, 39, 1); expect(currentPlayer(s).diceAdjustUsed).toBe(false);
    expect(currentPlayer(s).laps).toBe(1);
  });
  it('skips routing when poor, using stride, on an extra roll or after this lap opportunity is spent', () => {
    for (const kind of ['poor', 'stride', 'extra', 'used']) {
      let s = createGame();
      if (kind === 'poor') currentPlayer(s).cash = 59;
      if (kind === 'stride') { currentPlayer(s).cards = ['stride']; s = act(s, 'USE_CARD', { card: 'stride' }).state; }
      if (kind === 'extra') { s.phase = Phase.EXTRA_ROLL; s.extraRollUsed = true; s.rollCount = 1; }
      if (kind === 'used') currentPlayer(s).diceAdjustUsed = true;
      expect(act(s, 'ROLL').state.phase).toBe(Phase.MOVING);
    }
  });
  it('rejects corrupt routing snapshots instead of silently re-rolling or charging again', () => {
    const s = act(createGame(), 'ROLL').state;
    for (const mutate of [x => { x.players.find(p => p.id === x.order[x.turnIndex]).diceAdjustUsed = true; }, x => { x.move.steps++; }, x => { x.move.previewed = false; }]) {
      const envelope = JSON.parse(exportSave(s)); mutate(envelope.state);
      expect(() => importSave(JSON.stringify(envelope))).toThrow();
    }
  });
});

describe('asset protection, prosperity and legacy saves', () => {
  it('demolishes the actual discounted layer and retains ownership and complete group income', () => {
    let s = createGame(); own(s, 1); own(s, 3); own(s, 4);
    currentPlayer(s).cards = ['repair'];
    s = act(s, 'USE_CARD', { card: 'repair' }).state;
    s = act(s, 'MANAGE_UPGRADE', { tileId: 'tile-1' }).state;
    expect(demolitionValue(s, s.board[1])).toEqual({ cost: 45, refund: 27 });
    currentPlayer(s).cash = 0; s.phase = Phase.DEBT_RESOLUTION;
    s.debt = { amount: 80, creditorId: null, reason: '税费', tileId: null };
    s = act(s, 'DEMOLISH', { tileId: 'tile-1' }).state;
    expect(currentPlayer(s).cash).toBe(27);
    expect(s.board[1]).toMatchObject({ level: 1, investment: 150, discountedLevels: [] });
    expect(groupIncome(s, currentPlayer(s).id)).toBe(120);
    expect(importSave(exportSave(s))).toEqual(s);
    expect(act(s, 'DEMOLISH', { tileId: 'tile-1' }).accepted).toBe(false);
    expect(act(s, 'DEMOLISH', { tileId: 'tile-6' }).accepted).toBe(false);
  });
  it('can dismantle two different layers to settle one original debt without duplicate credit', () => {
    let s = createGame(); own(s, 1, 3);
    Object.assign(s.board[1], { investment: 315, discountedLevels: [3] });
    currentPlayer(s).cash = 0; s.phase = Phase.DEBT_RESOLUTION;
    s.debt = { amount: 80, creditorId: null, reason: '税费', tileId: null };
    s = act(s, 'DEMOLISH', { tileId: 'tile-1' }).state;
    expect(currentPlayer(s).cash).toBe(45);
    expect(s.board[1].investment).toBe(240);
    s = act(s, 'DEMOLISH', { tileId: 'tile-1' }).state;
    expect(currentPlayer(s).cash).toBe(19); expect(s.debt).toBeNull();
    expect(s.phase).toBe(Phase.TURN_END);
    expect(act(s, 'DEMOLISH', { tileId: 'tile-1' }).accepted).toBe(false);
    expect(importSave(exportSave(s))).toEqual(s);
  });
  it('recommends spare assets before breaking a complete group and gives AI the same options', () => {
    const s = createGame(); own(s, 10, 2); own(s, 11); own(s, 6);
    currentPlayer(s).cash = 0; s.phase = Phase.DEBT_RESOLUTION;
    s.debt = { amount: 80, creditorId: null, reason: '税费', tileId: null };
    expect(disposalOptions(s, currentPlayer(s).id)[0]).toMatchObject({ type: 'SELL', tileId: 'tile-6' });
    expect(chooseCommand(publicView(s))).toMatchObject({ type: 'SELL', tileId: 'tile-6' });
    s.board[6].ownerId = null; s.board[6].level = 0; s.board[6].investment = 0;
    expect(chooseCommand(publicView(s))).toMatchObject({ type: 'DEMOLISH', tileId: 'tile-10' });
  });
  it('triggers prosperity at both thresholds, advances on full rounds and never resets after liquidation', () => {
    let s = createGame(); currentPlayer(s).laps = 1;
    const lands = s.board.filter(tile => tile.type === 'land').slice(0, 24);
    lands.forEach((tile, i) => own(s, tile.index, i < 5 ? 3 : i === 5 ? 2 : 1));
    s = act(s, 'MANAGE_UPGRADE', { tileId: lands[5].id }).state;
    expect(s.prosperityStartRound).toBe(0);
    expect(prosperityMultiplier(s)).toBe(1);
    for (let i = 0; i < 36; i++) { s.phase = Phase.TURN_END; s = act(s, 'END_TURN').state; }
    expect(s.completedRounds).toBe(12); expect(prosperityMultiplier(s)).toBe(1.25);
    const actor = currentPlayer(s); actor.cash = 0; s.phase = Phase.DEBT_RESOLUTION;
    s.debt = { amount: 80, creditorId: null, reason: '税费', tileId: null };
    const before = groupIncome(s, actor.id), salary = s.config.salaryPerLap;
    s = act(s, 'DEMOLISH', { tileId: lands[0].id }).state;
    expect(s.prosperityStartRound).toBe(0); expect(prosperityMultiplier(s)).toBe(1.25);
    expect(groupIncome(s, actor.id)).toBe(before); expect(s.config.salaryPerLap).toBe(salary);
    expect(importSave(exportSave(s))).toEqual(s);
  });
  it('migrates a v4 pending movement with its old prices, rent, salary and no retroactive bonuses', () => {
    const s = createGame({ config: { initialCash: 1800, rentMultipliers: [0.25, 0.65, 1.4], upgradeMultipliers: [0.75, 1], groupRentBonus: 0.25, tradeRentBonus: 0.5, eventsEnabled: false } });
    own(s, 1, 2); currentPlayer(s).position = 39;
    s.phase = Phase.MOVING; s.dice = 1; s.rollCount = 1; s.move = { from: 39, steps: 1, target: 0, laps: 1 };
    const envelope = JSON.parse(exportSave(s)); envelope.version = envelope.state.version = 4;
    delete envelope.state.prosperityStartRound;
    envelope.state.players.forEach(p => delete p.diceAdjustUsed);
    const loaded = importSave(JSON.stringify(envelope));
    expect(loaded.config.segmentedIncome).toBe(false);
    expect(loaded.config.diceAdjustEnabled).toBe(false);
    expect(loaded.board[1].investment).toBe(263);
    expect(rent(loaded, loaded.board[1])).toBe(98);
    expect(groupIncome(loaded, currentPlayer(loaded).id)).toBe(0);
    const ended = act(loaded, 'FINISH_MOVE').state;
    expect(currentPlayer(ended).cash).toBe(2100);
    expect(importSave(exportSave(ended))).toEqual(ended);
  });
});
