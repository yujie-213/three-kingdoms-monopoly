import { describe, it, expect } from 'vitest';
import { createGame, dispatch, currentPlayer, Phase, canShop, shopPrice, drawEvent } from '../../src/core/game.js';
import { importSave, exportSave } from '../../src/core/save.js';
import { publicView, chooseCommand } from '../../src/ai/strategy.js';
import { cards } from '../../src/data/events.js';
import { reportSummary, battleReportMarkup } from '../../src/ui/battle-report.js';

const act = (s, type, extra = {}) => dispatch(s, { type, actorId: currentPlayer(s).id, revision: s.revision, ...extra });
const game = () => createGame({ seed: '设施与战报', config: { diceSides: 1, diceAdjustEnabled: false } });
function arrive(s, target) {
  currentPlayer(s).position = (target + s.board.length - 1) % s.board.length;
  s.phase = Phase.TURN_START; s.rollCount = 0;
  return act(act(s, 'ROLL').state, 'FINISH_MOVE').state;
}

describe('facility-only card shops', () => {
  it('opens only after landing, preserves each facility effect and denies remote/start/skipped purchases', () => {
    for (const [index, income] of [[2, 60], [13, 0], [29, -80]]) {
      let s = game();
      currentPlayer(s).position = index;
      expect(act(s, 'BUY_CARD', { card: 'rentShield' }).accepted).toBe(false);
      s = arrive(s, index);
      expect(canShop(s)).toBe(true);
      expect(currentPlayer(s).cash).toBe(3200 + income);
      expect(currentPlayer(s).cards).toEqual([]);
      expect(importSave(exportSave(s))).toEqual(s);
      const rng = s.rngState;
      const offer = s.shopOffer, cost = shopPrice(s);
      s = act(s, 'BUY_CARD', { card: offer }).state;
      expect(currentPlayer(s).cash).toBe(3200 + income - cost);
      expect(s.rngState).toBe(rng);
      expect(act(s, 'BUY_CARD', { card: 'stride' }).accepted).toBe(false);
      expect(importSave(exportSave(s))).toEqual(s);
    }
    const s = game(); s.phase = Phase.TURN_END;
    expect(act(s, 'BUY_CARD', { card: 'stride' }).accepted).toBe(false);
    currentPlayer(s).position = 2; s.shopVisit = 'tile-2'; s.turnSkipped = true;
    expect(canShop(s)).toBe(false);
  });
  it('does not grant purchases for passing a shop or staying there next turn, including AI', () => {
    let s = arrive(game(), 3);
    expect(canShop(s)).toBe(false);
    expect(publicView(s).shopAvailable).toBe(false);
    s = arrive(s, 13);
    expect(publicView(s).shopAvailable).toBe(true);
    expect(['BUY_CARD', 'FREE_CARD']).toContain(chooseCommand(publicView(s)).type);
    const actorId = currentPlayer(s).id;
    for (let i = 0; i < 3; i++) { s.phase = Phase.TURN_END; s = act(s, 'END_TURN').state; }
    expect(currentPlayer(s).id).toBe(actorId);
    expect(currentPlayer(s).position).toBe(13);
    expect(s.shopVisit).toBeNull();
    s.phase = Phase.TURN_END;
    expect(act(s, 'BUY_CARD', { card: 'stride' }).accepted).toBe(false);
  });
  it('cannot stockpile shields, while a fixed duplicate gift leaves cash and bag untouched', () => {
    let s = arrive(game(), 13); currentPlayer(s).cards = ['rentShield'];
    const before = structuredClone(s);
    expect(act(s, 'BUY_CARD', { card: 'rentShield' })).toMatchObject({ accepted: false, state: before });
    for (let rng = 1; rng < 20000; rng++) {
      s.rngState = rng;
      if (drawEvent(structuredClone(s)).id === 'advice') break;
    }
    s.phase = Phase.MOVING; s.rollCount = 1; s.dice = 1;
    currentPlayer(s).position = 4; s.move = { from: 4, target: 5, steps: 1, laps: 0 };
    s = act(s, 'FINISH_MOVE').state;
    expect(s.phase).toBe(Phase.TURN_END);
    expect(currentPlayer(s).cards).toEqual(['rentShield']);
    expect(currentPlayer(s).cardBag).toEqual([]);
  });
});

describe('saved individual random bags', () => {
  it('shop free draw consumes the exclusive choice even when a full hand declines it', () => {
    let s = arrive(game(), 13);
    currentPlayer(s).cards = ['rentShield', 'fortune', 'repair'];
    currentPlayer(s).cardBag = ['rentShield', 'commerce', 'stride'];
    const cash = currentPlayer(s).cash, offer = s.shopOffer;
    s = act(s, 'FREE_CARD').state;
    expect(s.phase).toBe(Phase.CARD_GAIN_DECISION);
    expect(s.pendingCard).toBe('commerce'); expect(s.shopUsed).toBe(true);
    expect(s.shopOffer).toBe(offer); expect(currentPlayer(s).cash).toBe(cash);
    expect(importSave(exportSave(s))).toEqual(s);
    s = act(s, 'DECLINE_CARD').state;
    expect(currentPlayer(s).cardBag).toEqual(['stride']);
    expect(act(s, 'FREE_CARD').accepted).toBe(false);
    expect(act(s, 'BUY_CARD', { card: offer }).accepted).toBe(false);
  });
  it('fixes the offer across restore, sells only that card at half price and leaves the bag intact', () => {
    for (const id of Object.keys(cards)) {
      let s = arrive(game(), 13); s.shopOffer = id;
      currentPlayer(s).cardBag = ['fortune', 'repair'];
      expect(act(s, 'BUY_CARD', { card: Object.keys(cards).find(x => x !== id) }).accepted).toBe(false);
      const restored = importSave(exportSave(s));
      const bought = act(restored, 'BUY_CARD', { card: id });
      expect(bought.accepted).toBe(true); s = bought.state;
      expect(currentPlayer(s).cash).toBe(3200 - Math.ceil(s.config.cardPrices[id] / 2));
      expect(s.rngState).toBe(restored.rngState);
      expect(currentPlayer(s).cardBag).toEqual(['fortune', 'repair']);
      expect(act(s, 'FREE_CARD').accepted).toBe(false);
    }
  });
  it('AI buys the visible shield when affordable, otherwise chooses free without seeing the bag', () => {
    let s = arrive(game(), 13); s.shopOffer = 'rentShield';
    expect(chooseCommand(publicView(s))).toMatchObject({ type: 'BUY_CARD', card: 'rentShield' });
    currentPlayer(s).cards = ['rentShield'];
    expect(chooseCommand(publicView(s)).type).toBe('FREE_CARD');
    currentPlayer(s).cards = []; currentPlayer(s).cash = 0;
    expect(chooseCommand(publicView(s)).type).toBe('FREE_CARD');
    expect(publicView(s)).not.toHaveProperty('cardBag');
    expect(publicView(s)).not.toHaveProperty('rngState');
    s = act(s, 'FREE_CARD').state;
    expect(chooseCommand(publicView(s)).type).toBe('END_TURN');
  });
  it('migrates a current v6 shop visit once, preserving consumed choices and fixed offers on reload', () => {
    const old = JSON.parse(exportSave(arrive(game(), 13)));
    old.version = old.state.version = 6;
    delete old.state.shopOffer; delete old.state.config.shopPriceRatio;
    old.state.shopUsed = true;
    const s = importSave(JSON.stringify(old));
    expect(s.version).toBe(7); expect(s.shopOffer).toBeTruthy(); expect(canShop(s)).toBe(false);
    expect(importSave(exportSave(s))).toEqual(s);
    const broken = JSON.parse(exportSave(s)); broken.state.shopOffer = 'invalid';
    expect(() => importSave(JSON.stringify(broken))).toThrow();
  });
  it('distributes all five cards in a cycle, preserves the next draw after restore and isolates players', () => {
    let s = game(); const drawn = [];
    const actorId = currentPlayer(s).id;
    for (let i = 0; i < 10; i++) {
      currentPlayer(s).cards = [];
      const restored = importSave(exportSave(s));
      const original = arrive(structuredClone(s), 23);
      s = arrive(restored, 23);
      expect(s).toEqual(original);
      drawn.push(currentPlayer(s).cards[0]);
    }
    expect(new Set(drawn.slice(0, 5))).toEqual(new Set(Object.keys(cards)));
    expect(new Set(drawn.slice(5))).toEqual(new Set(Object.keys(cards)));
    expect(s.players.filter((p) => p.id !== actorId).every((p) => p.cardBag.length === 0)).toBe(true);
  });
  it('skips an already held shield and consumes rejected rewards without re-rolling', () => {
    let s = game(); currentPlayer(s).cards = ['rentShield'];
    currentPlayer(s).cardBag = ['rentShield', 'fortune', 'stride'];
    s = arrive(s, 23);
    expect(currentPlayer(s).cards).toEqual(['rentShield', 'fortune']);
    expect(currentPlayer(s).cardBag).toEqual(['stride']);
    currentPlayer(s).cards = ['rentShield', 'fortune', 'repair'];
    s = arrive(s, 23);
    expect(s.pendingCard).toBe('stride');
    expect(importSave(exportSave(s))).toEqual(s);
    s = act(s, 'DECLINE_CARD').state;
    expect(currentPlayer(s).cardBag).toEqual([]);
    expect(s.pendingCard).toBeNull();
  });
  it('migrates v5 without discarding paid cards and rejects corrupt bags and shopping tokens', () => {
    const envelope = JSON.parse(exportSave(game()));
    envelope.version = envelope.state.version = 5;
    delete envelope.state.shopVisit;
    envelope.state.players.forEach((p) => { delete p.cardBag; delete p.battleReport; });
    envelope.state.players[0].cards = ['rentShield', 'rentShield'];
    const loaded = importSave(JSON.stringify(envelope));
    expect(loaded.players[0].cards).toEqual(['rentShield', 'rentShield']);
    expect(importSave(exportSave(loaded))).toEqual(loaded);
    for (const mutate of [s => { s.players[0].cardBag = ['fortune', 'fortune']; }, s => { s.shopVisit = 'tile-2'; }]) {
      const broken = JSON.parse(exportSave(game())); mutate(broken.state);
      expect(() => importSave(JSON.stringify(broken))).toThrow();
    }
  });
});

describe('truthful battle reports', () => {
  it('records the bankruptcy snapshot before clearing assets and distinguishes an early exit from the final result', () => {
    let s = game(); s.turnIndex = s.order.indexOf('liu');
    const p = currentPlayer(s); p.cash = 10;
    Object.assign(s.board[1], { ownerId: p.id, level: 1, investment: 150 });
    s.phase = Phase.DEBT_RESOLUTION; s.debt = { amount: 120, creditorId: null, tileId: null, reason: '朝廷征税' };
    s = act(s, 'BANKRUPT').state;
    expect(s.players.find((x) => x.human).battleReport.defeat).toMatchObject({ cash: 10, recovery: 90, amount: 120, shortfall: 20 });
    expect(importSave(exportSave(s))).toEqual(s);
    expect(reportSummary(s)).toMatchObject({ ended: false, won: false, status: '你已破产出局' });
    const markup = battleReportMarkup(s, () => '');
    expect(markup).toContain('继续观战'); expect(markup).toContain('仍差 20 金');
    expect(markup).not.toContain('<th>名次</th>');
  });
  it('supports limited-round loss and shared victory without inventing an elimination', () => {
    const s = game(); s.mode = 'rounds'; s.phase = Phase.GAME_OVER; s.endReason = '限轮结束';
    expect(reportSummary(s)).toMatchObject({ won: true, tied: true, title: '并列领先' });
    s.players.find((p) => p.id === 'cao').cash += 1;
    expect(reportSummary(s)).toMatchObject({ won: false, status: '本局未能夺魁' });
    expect(battleReportMarkup(s, () => '')).not.toContain('无法清偿');
  });
  it('keeps real round numbers for turning points and escapes imported text', () => {
    let s = game(); s.turnIndex = s.order.indexOf('liu'); s.round = 7; s.completedRounds = 6;
    Object.assign(s.board[10], { ownerId: 'liu', level: 1, investment: 260 });
    s = arrive(s, 11); s = act(s, 'BUY').state;
    const p = s.players.find((player) => player.human);
    expect(p.battleReport.moments[0]).toMatchObject({ round: 7, title: '收齐南阳城组' });
    p.battleReport.moments[0].detail = '<img onerror="bad()">';
    const markup = battleReportMarkup(s, () => '');
    expect(markup).toContain('&lt;img'); expect(markup).not.toContain('<img onerror');
  });
});
