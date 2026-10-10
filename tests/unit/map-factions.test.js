import { describe, it, expect } from 'vitest';
import { boardDefinition, characters, factions, cellCoordinates } from '../../src/data/board.js';
import { createGame, currentPlayer, dispatch } from '../../src/core/game.js';
import { exportSave, importSave } from '../../src/core/save.js';

describe('40-cell historical route and faction roster', () => {
  it('covers four contiguous regions and distinct physical city locations', () => {
    expect(boardDefinition).toHaveLength(40);
    expect(new Set(cellCoordinates.map((coordinate) => coordinate.join(','))).size).toBe(40);
    const lands = boardDefinition.filter((tile) => tile.type === 'land');
    expect(lands).toHaveLength(29);
    expect(new Set(lands.map((tile) => tile.county)).size).toBe(29);
    expect(lands.every((tile) => tile.province && tile.commandery && tile.county && tile.history)).toBe(true);
    expect(boardDefinition.map((tile) => tile.regionId)).toEqual([
      ...Array(10).fill('central'), ...Array(10).fill('jing'), ...Array(10).fill('east'), ...Array(10).fill('west'),
    ]);
  });
  it.each(characters.map((character) => character.id))('starts exactly one general per faction with human %s', (humanId) => {
    const state = createGame({ humanId });
    expect(state.players.map((player) => player.factionId)).toEqual(factions.map((faction) => faction.id));
    expect(state.players.filter((player) => player.human).map((player) => player.id)).toEqual([humanId]);
    expect(importSave(exportSave(state))).toEqual(state);
  });
  it('supports a future alternate general without adding a fourth player', () => {
    characters.push({ id: 'test-wei', factionId: 'wei', name: '测试主将', symbol: '测', portraitKey: 'cao' });
    try {
      const state = createGame({ humanId: 'test-wei' });
      expect(state.players.map((player) => player.id)).toEqual(['liu', 'test-wei', 'sun']);
      expect(importSave(exportSave(state))).toEqual(state);
      const invalid = JSON.parse(exportSave(state));
      invalid.state.order = invalid.state.order.map((id) => id === 'test-wei' ? 'cao' : id);
      expect(() => importSave(JSON.stringify(invalid))).toThrow('回合角色未参战');
    } finally { characters.pop(); }
  });
  it('pays the new salary once across the last tile and restores the exact pending move', () => {
    const state = createGame({ config: { diceSides: 1 } });
    currentPlayer(state).position = 39;
    const rolled = dispatch(state, { type: 'ROLL', actorId: currentPlayer(state).id, revision: state.revision }).state;
    expect(rolled.move).toMatchObject({ from: 39, target: 0, laps: 1 });
    const loaded = importSave(exportSave(rolled));
    const ended = dispatch(loaded, { type: 'FINISH_MOVE', actorId: currentPlayer(loaded).id, revision: loaded.revision }).state;
    expect(currentPlayer(ended).cash).toBe(3325);
    expect(currentPlayer(ended).laps).toBe(1);
    expect(importSave(exportSave(ended))).toEqual(ended);
  });
  it('rejects legacy boards with a clear explanation and preserves the original object', () => {
    const state = createGame();
    const old = { format: 'three-kingdoms-monopoly', version: 2, state: { ...state, version: 2 } };
    expect(() => importSave(JSON.stringify(old))).toThrow('旧版24格存档无法恢复');
    expect(state.board).toHaveLength(40);
  });
});
