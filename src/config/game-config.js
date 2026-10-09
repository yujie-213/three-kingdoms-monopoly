// Confirmed constraints and provisional experiments must stay separate.
export const confirmedRules = Object.freeze({
  playerCount: 3,
  humanPlayerCount: 1,
  maxBuildingLevel: 3,
  assetSellbackRatio: 0.6,
  defaultRoundLimit: 40,
});

// PROJECT_SPEC.md §3: NOT final product rules. Prototype defaults, see DECISIONS.
export const experimentalDefaults = Object.freeze({
  boardSize: 40,
  diceCount: 1,
  diceSides: 6,
  initialCash: 1800,
  salaryPerLap: 500,
  landPrices: Object.freeze({ village: 150, county: 250, capital: 400 }),
  ordinaryEventFineCap: 150,
  cardCapacity: 3,
  eventWeights: Object.freeze({ economy: 65, movement: 20, strategy: 15 }),
  sellbackRounding: 'floor',
  assetValuation: 'cash-plus-actual-investment',
  initialOrder: 'seeded-shuffle',
  rentMultipliers: Object.freeze([0.15, 0.40, 0.90]),
  upgradeMultipliers: Object.freeze([0.75, 1.00]),
  tiePolicy: 'shared-rank',
  aiCashReserve: 200,
  aiReserves: Object.freeze({ conservative: 300, aggressive: 100 }),
  aiShieldThreshold: 60,
  strideBonus: 2,
  fortuneAmount: 100,
  facilityAmounts: Object.freeze({ inn: 60, marketTax: 80, garden: 80, redCliff: 50 }),
  eventsEnabled: true,
});

export const presentationSettings = Object.freeze({
  delays: Object.freeze({ normal: 650, fast: 100, instant: 0 }),
});

export const economyProfiles = Object.freeze({
  standard: Object.freeze({ initialCash: 1800, salaryPerLap: 500 }),
  compact: Object.freeze({ initialCash: 500, salaryPerLap: 80 }),
});

export function validateConfig(config) {
  const invalid = (message) => { throw new Error(`配置无效：${message}`); };
  const whole = (value, max = 1000000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  for (const key of ['initialCash', 'salaryPerLap', 'ordinaryEventFineCap', 'aiCashReserve', 'aiShieldThreshold', 'fortuneAmount']) if (!whole(config[key])) invalid(key);
  if (!whole(config.defaultRoundLimit, 10000) || config.defaultRoundLimit < 1 || config.diceCount !== 1 || !whole(config.diceSides, 20) || config.diceSides < 1 || !whole(config.strideBonus, 24)) invalid('轮数/骰子/额外步数');
  if (!whole(config.cardCapacity, 20) || config.cardCapacity < 1 || typeof config.eventsEnabled !== 'boolean') invalid('锦囊/事件');
  const groups = { landPrices: ['village', 'county', 'capital'], eventWeights: ['economy', 'movement', 'strategy'], aiReserves: ['conservative', 'aggressive'], facilityAmounts: ['inn', 'marketTax', 'garden', 'redCliff'] };
  for (const [name, fields] of Object.entries(groups)) if (!config[name] || fields.some((field) => !whole(config[name][field]))) invalid(name);
  if (groups.landPrices.some((field) => config.landPrices[field] < 1) || groups.eventWeights.reduce((sum, field) => sum + config.eventWeights[field], 0) <= 0) invalid('价格/事件权重');
  for (const [name, length] of [['rentMultipliers', 3], ['upgradeMultipliers', 2]]) {
    if (!Array.isArray(config[name]) || config[name].length !== length || config[name].some((v) => !Number.isFinite(v) || v <= 0 || v > 10)) invalid(name);
    if (groups.landPrices.some((field) => config[name].some((v) => Math.round(v * config.landPrices[field]) < 1))) invalid('费用取整后必须至少1金');
  }
}
