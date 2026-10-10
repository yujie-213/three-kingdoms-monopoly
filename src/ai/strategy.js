import { Phase, canUpgrade, upgradeCost, rent, cityGroup, cashReserve, disposalOptions, canShop, shopPrice } from '../core/game.js';

// Only explicit public values enter this view: no seed or RNG state.
export function publicView(state) {
  const player = state.players.find((item) => item.id === state.order[state.turnIndex]);
  const tile = state.board[player.position];
  return { phase: state.phase, revision: state.revision, actorId: player.id, cash: player.cash,
    reserve: Math.max(state.config.aiReserves[player.aiStyle] ?? state.config.aiCashReserve, cashReserve(state, player)), tile: { ...tile },
    laps: player.laps, ownedCount: state.board.filter((land) => land.ownerId === player.id).length, upgrades: player.stats.upgrades,
    newEconomy: state.config.segmentedIncome,
    cards: [...player.cards], moveBonus: player.moveBonus, shieldThreshold: state.config.aiShieldThreshold,
    activeCardUsed: state.activeCardUsed, repairReady: state.repairReady,
    upgradeable: state.board.filter((land) => canUpgrade(state, land)).map((land) => ({ id: land.id, cost: upgradeCost(state, land), discountCost: upgradeCost(state, land, true), gain: rent(state, land, land.level + 1) - rent(state, land), complete: cityGroup(state, land)?.complete })),
    commerceTargets: state.board.filter((land) => land.ownerId === player.id && land.tradeUntilRound <= state.round).map((land) => ({ id: land.id, rent: rent(state, land) })),
    shopAvailable: canShop(state, player),
    shopOffer: canShop(state, player) ? state.shopOffer : null,
    shopPrice: canShop(state, player) ? shopPrice(state) : null,
    cardPrices: { ...state.config.cardPrices },
    capacity: state.config.cardCapacity, pendingCard: state.pendingCard,
    price: state.config.landPrices[tile.tier],
    upgradeCost: upgradeCost(state, tile),
    debt: state.debt ? { ...state.debt } : null,
    adjustmentCost: state.config.diceAdjustCost,
    diceTargets: state.phase === Phase.DICE_DECISION ? [-1, 0, 1].filter((delta) => state.dice + delta >= 1 && state.dice + delta <= state.config.diceSides).map((delta) => {
      const land = state.board[(player.position + state.dice + delta) % state.board.length];
      const group = cityGroup(state, { ...land, ownerId: player.id });
      return { delta, ownerId: land.ownerId, type: land.type, price: state.config.landPrices[land.tier] || 0, rent: land.ownerId && land.ownerId !== player.id ? rent(state, land) : 0, groupOwned: group?.owned || 0, groupSize: group?.tileIds.length || 0 };
    }) : [],
    disposalOptions: state.phase === Phase.DEBT_RESOLUTION ? disposalOptions(state, player.id) : [],
    sellable: state.board.filter((item) => item.ownerId === player.id).map((item) => ({ id: item.id, refund: Math.floor(item.investment * state.config.assetSellbackRatio) })),
  };
}
export function chooseCommand(view) {
  const base = { revision: view.revision, actorId: view.actorId };
  const buildingReserve = view.reserve + (view.newEconomy && view.laps < 2 && view.ownedCount < 8 ? 300 : 0);
  const canBuild = !view.newEconomy || view.laps > 0 || view.upgrades < 2;
  const building = canBuild && [...view.upgradeable].filter((land) => view.cash - land.cost >= buildingReserve).sort((a, b) => Number(b.complete) - Number(a.complete) || b.gain / b.cost - a.gain / a.cost)[0];
  switch (view.phase) {
    case Phase.TURN_START:
      if (!view.activeCardUsed) {
        if (canBuild && view.cards.includes('repair') && view.upgradeable.some((land) => view.cash - land.discountCost >= buildingReserve)) return { ...base, type: 'USE_CARD', card: 'repair' };
        if (view.cards.includes('fortune')) return { ...base, type: 'USE_CARD', card: 'fortune' };
        const commerce = [...view.commerceTargets].sort((a, b) => b.rent - a.rent)[0];
        if (view.cards.includes('commerce') && commerce) return { ...base, type: 'USE_CARD', card: 'commerce', tileId: commerce.id };
        if (view.cards.includes('stride') && !view.moveBonus) return { ...base, type: 'USE_CARD', card: 'stride' };
      }
      if (building) return { ...base, type: 'MANAGE_UPGRADE', tileId: building.id };
      return { ...base, type: 'ROLL' };
    case Phase.DICE_DECISION: {
      const score = (target) => target.rent ? -target.rent * (view.cards.includes('rentShield') ? 0.5 : 1) : target.type === 'land' && !target.ownerId && view.cash - target.price - (target.delta ? view.adjustmentCost : 0) >= view.reserve ? target.groupOwned === target.groupSize - 1 ? 240 : target.groupOwned ? 140 : target.price * 0.15 : 0;
      const normal = view.diceTargets.find((target) => target.delta === 0);
      const best = [...view.diceTargets].sort((a, b) => score(b) - score(a))[0];
      return best.delta && score(best) - score(normal) > view.adjustmentCost + 20 && view.cash - view.adjustmentCost >= view.reserve
        ? { ...base, type: 'ADJUST_DICE', delta: best.delta } : { ...base, type: 'CONFIRM_MOVE' };
    }
    case Phase.EXTRA_ROLL: return { ...base, type: 'ROLL' };
    case Phase.CARD_DECISION: return { ...base, type: view.cash < view.debt.amount || view.debt.amount >= view.shieldThreshold ? 'USE_SHIELD' : 'PAY_RENT' };
    case Phase.CARD_GAIN_DECISION: {
      const priority = { rentShield: 5, repair: 4, commerce: 3, fortune: 2, stride: 1 };
      const lowest = view.cards.reduce((best, card, index) => priority[card] < priority[view.cards[best]] ? index : best, 0);
      return priority[view.pendingCard] > priority[view.cards[lowest]]
        ? { ...base, type: 'KEEP_CARD', replaceIndex: lowest } : { ...base, type: 'DECLINE_CARD' };
    }
    case Phase.BUY_DECISION: return { ...base, type: view.cash - view.price >= view.reserve ? 'BUY' : 'PASS' };
    case Phase.UPGRADE_DECISION: return { ...base, type: canBuild && view.cash - view.upgradeCost >= buildingReserve ? 'UPGRADE' : 'PASS' };
    case Phase.TURN_END:
      if (building) return { ...base, type: 'MANAGE_UPGRADE', tileId: building.id };
      if (view.shopAvailable) {
        if (view.shopOffer === 'rentShield' && !view.cards.includes('rentShield') && view.cards.length < view.capacity && view.cash - view.shopPrice >= view.reserve) return { ...base, type: 'BUY_CARD', card: view.shopOffer };
        return { ...base, type: 'FREE_CARD' };
      }
      return { ...base, type: 'END_TURN' };
    case Phase.DEBT_RESOLUTION: {
      const recovery = view.sellable.reduce((sum, land) => sum + land.refund, 0);
      if (view.cash + recovery < view.debt.amount) return { ...base, type: 'BANKRUPT' };
      const options = view.disposalOptions;
      const priority = options[0].priority;
      const candidates = options.filter((option) => option.priority === priority);
      const choice = candidates.filter((option) => option.refund >= view.debt.amount - view.cash).sort((a, b) => a.rentLoss + a.incomeLoss - b.rentLoss - b.incomeLoss)[0] || candidates[0];
      return { ...base, type: choice.type, tileId: choice.tileId };
    }
    default: return null;
  }
}
