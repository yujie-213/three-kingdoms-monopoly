import { mkdir, writeFile } from 'node:fs/promises';
import { createGame, dispatch, currentPlayer, Phase, ranking } from '../src/core/game.js';
import { chooseCommand, publicView } from '../src/ai/strategy.js';

const samples = [];
const landTotals = {};
const bankruptcyCauses = {};
for (const groupName of ['rounds', 'classic-standard', 'classic-compact']) {
  const mode = groupName === 'rounds' ? 'rounds' : 'classic';
  const economy = groupName === 'classic-compact' ? 'compact' : 'standard';
  const count = 30;
  for (let index = 0; index < count; index++) {
    let state = createGame({ seed: `验收-${groupName}-${index}`, mode, economy });
    const firstSeat = state.order[0];
    const firstDisposal = {}, firstSale = {}, secondLap = {};
    let operations = 0;
    const stepLimit = mode === 'rounds' ? 2000 : 10000;
    while (state.phase !== Phase.GAME_OVER && operations < stepLimit) {
      operations++;
      const command = state.phase === Phase.MOVING ? { type: 'FINISH_MOVE', revision: state.revision, actorId: currentPlayer(state).id } : chooseCommand(publicView(state));
      const previousActor = currentPlayer(state);
      if (['SELL', 'DEMOLISH'].includes(command.type) && !firstDisposal[previousActor.id]) firstDisposal[previousActor.id] = { circle: previousActor.laps + 1, round: state.round, type: command.type, cities: state.board.filter((tile) => tile.ownerId === previousActor.id).length };
      if (command.type === 'SELL' && !firstSale[previousActor.id]) firstSale[previousActor.id] = { circle: previousActor.laps + 1, round: state.round };
      const result = dispatch(state, command);
      if (!result.accepted) throw new Error(`Illegal action: ${result.error}`);
      state = result.state;
      const movedActor = state.players.find((p) => p.id === previousActor.id);
      if (previousActor.laps < 2 && movedActor.laps >= 2) secondLap[movedActor.id] = { cash: movedActor.cash, cities: state.board.filter((tile) => tile.ownerId === movedActor.id).length, debt: Boolean(state.debt) };
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
      purchases: state.players.reduce((sum, p) => sum + p.stats.purchases, 0), upgrades: state.players.reduce((sum, p) => sum + p.stats.upgrades, 0), collectedRent: state.players.reduce((sum, p) => sum + p.stats.rentCollected, 0),
      firstDisposal, firstSale, secondLap, prosperityStartRound: state.prosperityStartRound,
      tiedWinners: state.phase === Phase.GAME_OVER ? ranking(state).filter((p) => p.rank === 1).map((p) => p.id) : [], endReason: state.endReason || 'simulation step limit' });
  }
}
const report = {
  purpose: 'v5 segmented income, groups, paid routing, demolition and prosperity simulations; not human feedback or proof of balance. All seats use the same public strategy with reserve 600 in standard games.',
  samples: samples.length,
  summary: Object.fromEntries(['rounds', 'classic-standard', 'classic-compact'].map((name) => {
    const group = samples.filter((sample) => sample.group === name);
    return [name, { samples: group.length, completed: group.filter((s) => s.completed).length,
      averageRounds: Number((group.reduce((sum, s) => sum + s.rounds, 0) / group.length).toFixed(2)),
      medianRounds: [...group].sort((a, b) => a.rounds - b.rounds)[Math.floor(group.length / 2)].rounds,
      maxRounds: Math.max(...group.map((s) => s.rounds)),
      firstCircleDisposals: group.reduce((sum, s) => sum + Object.values(s.firstDisposal).filter((d) => d.circle === 1).length, 0),
      secondCircleDisposals: group.reduce((sum, s) => sum + Object.values(s.firstDisposal).filter((d) => d.circle === 2).length, 0),
      noDisposalThroughSecondCircle: group.reduce((sum, s) => sum + ['liu', 'cao', 'sun'].filter((id) => s.secondLap[id] && (!s.firstDisposal[id] || s.firstDisposal[id].circle > 2)).length, 0),
      secondLapReached: group.reduce((sum, s) => sum + Object.keys(s.secondLap).length, 0),
      secondLapMedianCash: Object.values(group.flatMap((s) => Object.values(s.secondLap))).map((p) => p.cash).sort((a, b) => a - b)[Math.floor(group.reduce((sum, s) => sum + Object.keys(s.secondLap).length, 0) / 2)],
      prosperityGames: group.filter((s) => s.prosperityStartRound !== null).length,
      averageUpgrades: Number((group.reduce((sum, s) => sum + s.upgrades, 0) / group.length).toFixed(2)),
      bankruptcies: group.reduce((sum, s) => sum + s.bankruptcies, 0),
      firstSeatWins: group.filter((s) => s.completed && s.tiedWinners.includes(s.firstSeat)).length,
      wins: Object.fromEntries(['liu', 'cao', 'sun'].map((id) => [id, group.filter((s) => s.completed && s.tiedWinners.includes(id)).length])) }];
  })),
  landTotals, bankruptcyCauses, runs: samples,
};
await mkdir('docs/reports', { recursive: true });
await writeFile('docs/reports/simulation-economy-v5.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary, null, 2));
if (samples.some((sample) => !sample.completed)) console.log('Some classic games hit the simulation cap; see report. No artificial round limit was added to classic mode.');
