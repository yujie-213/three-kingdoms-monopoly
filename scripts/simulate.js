import { mkdir, writeFile } from 'node:fs/promises';
import { createGame, dispatch, currentPlayer, Phase, ranking } from '../src/core/game.js';
import { chooseCommand, publicView } from '../src/ai/strategy.js';

const samples = [];
const landTotals = {};
const bankruptcyCauses = {};
for (const groupName of ['rounds', 'classic-standard', 'classic-compact']) {
  const mode = groupName === 'rounds' ? 'rounds' : 'classic';
  const economy = groupName === 'classic-compact' ? 'compact' : 'standard';
  const count = mode === 'rounds' ? 60 : 6;
  for (let index = 0; index < count; index++) {
    let state = createGame({ seed: `验收-${groupName}-${index}`, mode, economy });
    const firstSeat = state.order[0];
    let operations = 0;
    const stepLimit = mode === 'rounds' ? 2000 : economy === 'standard' ? 2000 : 12000;
    while (state.phase !== Phase.GAME_OVER && operations < stepLimit) {
      operations++;
      const command = state.phase === Phase.MOVING ? { type: 'FINISH_MOVE', revision: state.revision, actorId: currentPlayer(state).id } : chooseCommand(publicView(state));
      const result = dispatch(state, command);
      if (!result.accepted) throw new Error(`Illegal action: ${result.error}`);
      state = result.state;
      if (state.players.some((p) => p.cash < 0 || p.cards.length > state.config.cardCapacity)) throw new Error('Invariant failed');
      for (const message of result.events) {
        const revenue = message.match(/支付 (\d+) 金（(.+) 过路费）/);
        const expense = message.match(/(?:购买|升级) (\S+).*花费 (\d+) 金/);
        const cause = message.match(/破产（([^）]+)）/);
        if (revenue) { landTotals[revenue[2]] ||= { invested: 0, rent: 0 }; landTotals[revenue[2]].rent += Number(revenue[1]); }
        if (expense) { landTotals[expense[1]] ||= { invested: 0, rent: 0 }; landTotals[expense[1]].invested += Number(expense[2]); }
        if (cause) bankruptcyCauses[cause[1]] = (bankruptcyCauses[cause[1]] || 0) + 1;
      }
    }
    const winner = ranking(state)[0];
    samples.push({ group: groupName, mode, economy, seed: state.seed, completed: state.phase === Phase.GAME_OVER, rounds: state.completedRounds,
      operations, winner: state.phase === Phase.GAME_OVER ? winner.id : null, firstSeat, bankruptcies: state.players.filter((p) => !p.alive).length,
      tiedWinners: state.phase === Phase.GAME_OVER ? ranking(state).filter((p) => p.rank === 1).map((p) => p.id) : [], endReason: state.endReason || 'simulation step limit' });
  }
}
const report = {
  purpose: 'Deterministic rule-AI smoke simulations; not human feedback or proof of balance. Human seat uses baseline reserve 200.',
  samples: samples.length,
  summary: Object.fromEntries(['rounds', 'classic-standard', 'classic-compact'].map((name) => {
    const group = samples.filter((sample) => sample.group === name);
    return [name, { samples: group.length, completed: group.filter((s) => s.completed).length,
      averageRounds: Number((group.reduce((sum, s) => sum + s.rounds, 0) / group.length).toFixed(2)),
      bankruptcies: group.reduce((sum, s) => sum + s.bankruptcies, 0),
      firstSeatWins: group.filter((s) => s.completed && s.tiedWinners.includes(s.firstSeat)).length,
      wins: Object.fromEntries(['liu', 'cao', 'sun'].map((id) => [id, group.filter((s) => s.completed && s.tiedWinners.includes(id)).length])) }];
  })),
  landTotals, bankruptcyCauses, runs: samples,
};
await mkdir('docs/reports', { recursive: true });
await writeFile('docs/reports/simulation-40.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary, null, 2));
if (samples.some((sample) => !sample.completed)) console.log('Some classic games hit the simulation cap; see report. No artificial round limit was added to classic mode.');
