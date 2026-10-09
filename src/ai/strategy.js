import { Phase } from '../core/game.js';

// Only explicit public values enter this view: no seed or RNG state.
export function publicView(state) {
  const player = state.players.find((item) => item.id === state.order[state.turnIndex]);
  const tile = state.board[player.position];
  return { phase: state.phase, revision: state.revision, actorId: player.id, cash: player.cash,
    reserve: state.config.aiReserves[player.aiStyle] ?? state.config.aiCashReserve, tile: { ...tile },
    cards: [...player.cards], moveBonus: player.moveBonus, shieldThreshold: state.config.aiShieldThreshold,
    capacity: state.config.cardCapacity, pendingCard: state.pendingCard,
    price: state.config.landPrices[tile.tier],
    upgradeCost: Math.round(state.config.landPrices[tile.tier] * state.config.upgradeMultipliers[tile.level - 1]),
    debt: state.debt ? { ...state.debt } : null,
    sellable: state.board.filter((item) => item.ownerId === player.id).map((item) => ({ id: item.id, refund: Math.floor(item.investment * state.config.assetSellbackRatio) })),
  };
}
export function chooseCommand(view) {
  const base = { revision: view.revision, actorId: view.actorId };
  switch (view.phase) {
    case Phase.TURN_START:
      if (view.cards.includes('fortune')) return { ...base, type: 'USE_CARD', card: 'fortune' };
      if (view.cards.includes('stride') && !view.moveBonus) return { ...base, type: 'USE_CARD', card: 'stride' };
      return { ...base, type: 'ROLL' };
    case Phase.EXTRA_ROLL: return { ...base, type: 'ROLL' };
    case Phase.CARD_DECISION: return { ...base, type: view.cash < view.debt.amount || view.debt.amount >= view.shieldThreshold ? 'USE_SHIELD' : 'PAY_RENT' };
    case Phase.CARD_GAIN_DECISION: {
      const priority = { rentShield: 3, fortune: 2, stride: 1 };
      const lowest = view.cards.reduce((best, card, index) => priority[card] < priority[view.cards[best]] ? index : best, 0);
      return priority[view.pendingCard] > priority[view.cards[lowest]]
        ? { ...base, type: 'KEEP_CARD', replaceIndex: lowest } : { ...base, type: 'DECLINE_CARD' };
    }
    case Phase.BUY_DECISION: return { ...base, type: view.cash - view.price >= view.reserve ? 'BUY' : 'PASS' };
    case Phase.UPGRADE_DECISION: return { ...base, type: view.cash - view.upgradeCost >= view.reserve ? 'UPGRADE' : 'PASS' };
    case Phase.TURN_END: return { ...base, type: 'END_TURN' };
    case Phase.DEBT_RESOLUTION: {
      const recovery = view.sellable.reduce((sum, land) => sum + land.refund, 0);
      if (view.cash + recovery < view.debt.amount) return { ...base, type: 'BANKRUPT' };
      const land = [...view.sellable].sort((a, b) => a.refund - b.refund)[0];
      return { ...base, type: 'SELL', tileId: land.id };
    }
    default: return null;
  }
}
