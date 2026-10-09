import { describe, it, expect } from 'vitest';
import { createGame, Phase, dispatch, currentPlayer, assets, ranking, rent } from '../../src/core/game.js';
import { nextRandom } from '../../src/core/random.js';
import { chooseCommand, publicView } from '../../src/ai/strategy.js';

describe('M1 initialization', () => {
  it('starts all three together with equal cash, one human and no salary', () => {
    const state = createGame({ humanId: 'sun' });
    expect(state.players.map((player) => player.position)).toEqual([0, 0, 0]);
    expect(state.players.map((player) => player.cash)).toEqual([1800, 1800, 1800]);
    expect(state.players.filter((player) => player.human).map((player) => player.id)).toEqual(['sun']);
    expect(state.phase).toBe(Phase.TURN_START);
    expect(state.board).toHaveLength(40);
    expect(state.board.filter((tile) => tile.type === 'land')).toHaveLength(29);
  });
  it('reproduces order and random state from a seed', () => {
    expect(createGame({ seed: 'abc' })).toEqual(createGame({ seed: 'abc' }));
    const state = createGame();
    expect(nextRandom(state.rngState)).toEqual(nextRandom(state.rngState));
  });
  it('creates independent new games without old ownership', () => {
    const first = createGame();
    first.board[1].ownerId = 'liu';
    first.players[0].cash = 0;
    expect(createGame().board[1].ownerId).toBeNull();
    expect(createGame().players[0].cash).toBe(1800);
  });
  it('supports a different start index', () => {
    const state = createGame({ board: [{ id: 'a', type: 'special' }, { id: 'b', type: 'start' }] });
    expect(state.players.map((player) => player.position)).toEqual([1, 1, 1]);
  });
  it('rejects invalid initialization', () => {
    expect(() => createGame({ humanId: 'unknown' })).toThrow();
    expect(() => createGame({ config: { initialCash: -1 } })).toThrow();
  });
});

function act(state, type, extra = {}) {
  return dispatch(state, { type, revision: state.revision, actorId: currentPlayer(state).id, ...extra });
}
function landed(index = 1) {
  const state = createGame();
  currentPlayer(state).position = index;
  state.phase = Phase.MOVING;
  state.move = { target: index, laps: 0 };
  return act(state, 'FINISH_MOVE').state;
}

describe('M1 rules and legal actions', () => {
  it('does not mutate input and rejects repeat / wrong actor / wrong phase actions', () => {
    const state = createGame();
    const before = structuredClone(state);
    const first = act(state, 'ROLL');
    expect(state).toEqual(before);
    expect(first.accepted).toBe(true);
    expect(dispatch(first.state, { type: 'ROLL', actorId: currentPlayer(state).id, revision: 0 }).state).toBe(first.state);
    expect(act(first.state, 'ROLL').accepted).toBe(false);
    expect(act(state, 'ROLL', { actorId: 'intruder' }).accepted).toBe(false);
  });
  it.each([0, 1])('pays salary once on crossing or exact start, target %i', (target) => {
    const state = createGame();
    state.phase = Phase.MOVING; state.move = { target, laps: 1 };
    const next = act(state, 'FINISH_MOVE').state;
    expect(currentPlayer(next).cash).toBe(2300);
    expect(currentPlayer(next).laps).toBe(1);
    expect(act(next, 'FINISH_MOVE').accepted).toBe(false);
  });
  it('calculates crossing relative to a nonzero start index', () => {
    const state = createGame({ board: [{ id: 'a', type: 'special' }, { id: 'b', type: 'start' }, { id: 'c', type: 'special' }], config: { diceSides: 1 } });
    currentPlayer(state).position = 0;
    const rolled = act(state, 'ROLL').state;
    expect(rolled.move).toMatchObject({ target: 1, laps: 1 });
    expect(currentPlayer(act(rolled, 'FINISH_MOVE').state).cash).toBe(2300);
  });
  it('settles only final tile, not passed enemy land', () => {
    const state = createGame({ config: { diceSides: 6, eventsEnabled: false } });
    state.board[1].ownerId = state.order[1]; state.board[1].level = 3;
    state.phase = Phase.MOVING; state.move = { target: 2, laps: 0 };
    const next = act(state, 'FINISH_MOVE').state;
    expect(currentPlayer(next).cash).toBe(1800);
    expect(next.phase).toBe(Phase.TURN_END);
  });
  it('allows refusing a purchase and buys exactly level one once', () => {
    const state = landed();
    expect(act(state, 'PASS').state.board[1].ownerId).toBeNull();
    const bought = act(state, 'BUY').state;
    expect(bought.board[1]).toMatchObject({ level: 1, investment: 150, ownerId: currentPlayer(state).id });
    expect(currentPlayer(bought).cash).toBe(1650);
    expect(act(bought, 'UPGRADE').accepted).toBe(false);
    expect(act(bought, 'BUY').accepted).toBe(false);
  });
  it('upgrades only once per separate landing and refuses max level', () => {
    let state = act(landed(), 'BUY').state;
    for (const level of [2, 3]) {
      state.phase = Phase.MOVING; state.move = { target: 1, laps: 0 };
      state = act(state, 'FINISH_MOVE').state;
      state = act(state, 'UPGRADE').state;
      expect(state.board[1].level).toBe(level);
      expect(act(state, 'UPGRADE').accepted).toBe(false);
    }
    state.phase = Phase.MOVING; state.move = { target: 1, laps: 0 };
    expect(act(state, 'FINISH_MOVE').state.phase).toBe(Phase.TURN_END);
    expect(state.board[1].investment).toBe(413);
  });
  it('rejects unaffordable purchase without any ownership or cash change', () => {
    const state = landed(); currentPlayer(state).cash = 100;
    expect(act(state, 'BUY').accepted).toBe(false);
    expect(state.board[1].ownerId).toBeNull();
    expect(currentPlayer(state).cash).toBe(100);
  });
  it('rent is a player transfer and no duplicate transfer occurs', () => {
    const state = createGame();
    const owner = state.players.find((p) => p.id === state.order[1]);
    state.board[1].ownerId = owner.id; state.board[1].level = 1;
    state.phase = Phase.MOVING; state.move = { target: 1, laps: 0 };
    const next = act(state, 'FINISH_MOVE').state;
    expect(currentPlayer(next).cash).toBe(1777);
    expect(next.players.find((p) => p.id === owner.id).cash).toBe(1823);
    expect(act(next, 'FINISH_MOVE').accepted).toBe(false);
  });
  it('locks debt until 60% actual-investment sale settles original payment', () => {
    const state = createGame(); const player = currentPlayer(state);
    player.cash = 5;
    Object.assign(state.board[1], { ownerId: state.order[1], level: 1 });
    Object.assign(state.board[3], { ownerId: player.id, level: 2, investment: 263 });
    state.phase = Phase.MOVING; state.move = { target: 1, laps: 0 };
    const debt = act(state, 'FINISH_MOVE').state;
    expect(debt.phase).toBe(Phase.DEBT_RESOLUTION);
    expect(currentPlayer(debt).cash).toBe(5);
    expect(act(debt, 'ROLL').accepted).toBe(false);
    expect(act(debt, 'END_TURN').accepted).toBe(false);
    expect(act(debt, 'BANKRUPT').accepted).toBe(false);
    expect(act(debt, 'SELL', { tileId: 'tile-1' }).accepted).toBe(false);
    const sold = act(debt, 'SELL', { tileId: 'tile-3' }).state;
    expect(sold.board[3]).toMatchObject({ ownerId: null, level: 0, investment: 0 });
    expect(currentPlayer(sold).cash).toBe(139); // 5 + floor(263*.6) - 23
    expect(sold.debt).toBeNull();
    expect(sold.phase).toBe(Phase.TURN_END);
  });
  it('bankruptcy partially pays, releases assets and skips the eliminated actor', () => {
    const state = createGame(); const player = currentPlayer(state);
    player.cash = 5;
    Object.assign(state.board[1], { ownerId: state.order[1], level: 3 });
    Object.assign(state.board[3], { ownerId: player.id, level: 1, investment: 10 });
    state.phase = Phase.MOVING; state.move = { target: 1, laps: 0 };
    const next = act(act(state, 'FINISH_MOVE').state, 'BANKRUPT').state;
    expect(currentPlayer(next)).toMatchObject({ cash: 0, alive: false });
    expect(next.players.find((p) => p.id === state.order[1]).cash).toBe(1805);
    expect(next.board[3].ownerId).toBeNull();
    expect(currentPlayer(act(next, 'END_TURN').state).alive).toBe(true);
  });
  it('finishes early when only one actor survives', () => {
    const state = createGame();
    state.players.find((p) => p.id === state.order[2]).alive = false;
    currentPlayer(state).cash = 0;
    state.debt = { amount: 23, creditorId: state.order[1] };
    state.phase = Phase.DEBT_RESOLUTION;
    expect(act(state, 'BANKRUPT').state.phase).toBe(Phase.GAME_OVER);
  });
  it('counts a round only after all active actors and stops at 40 complete rounds', () => {
    let state = createGame();
    for (let turn = 1; turn <= 120; turn++) {
      state.phase = Phase.TURN_END;
      state = act(state, 'END_TURN').state;
      expect(state.completedRounds).toBe(Math.floor(turn / 3));
      expect(state.phase).toBe(turn === 120 ? Phase.GAME_OVER : Phase.TURN_START);
    }
  });
  it('uses actual investment for assets and ties share rank', () => {
    const state = createGame();
    expect(ranking(state).map((row) => row.rank)).toEqual([1, 1, 1]);
    Object.assign(state.board[1], { ownerId: 'liu', investment: 263, level: 2 });
    expect(assets(state, 'liu')).toMatchObject({ investment: 263, total: 2063, recovery: 157 });
    expect(rent(state, state.board[1])).toBe(60);
  });
  it('AI receives no future randomness and uses the same validated dispatcher', () => {
    const state = createGame(); const view = publicView(state);
    expect(view).not.toHaveProperty('rngState');
    expect(view).not.toHaveProperty('seed');
    expect(dispatch(state, chooseCommand(view)).accepted).toBe(true);
  });
  it('replays complete seeded matches without negative cash or dangling debt', () => {
    function simulate() {
      let state = createGame({ seed: '完整局', config: { eventsEnabled: false } });
      let steps = 0;
      while (state.phase !== Phase.GAME_OVER && steps++ < 1000) {
        const command = state.phase === Phase.MOVING
          ? { type: 'FINISH_MOVE', revision: state.revision, actorId: currentPlayer(state).id }
          : chooseCommand(publicView(state));
        const result = dispatch(state, command);
        expect(result.accepted).toBe(true);
        state = result.state;
        expect(state.players.every((p) => p.cash >= 0)).toBe(true);
      }
      expect(state.phase).toBe(Phase.GAME_OVER);
      expect(state.completedRounds).toBe(40);
      expect(state.debt).toBeNull();
      return state;
    }
    expect(simulate()).toEqual(simulate());
  });
});
