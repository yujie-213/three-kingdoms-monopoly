export const cards = Object.freeze({
  rentShield: { name: '空城计', description: '免除本次敌地过路费；扣款前决定使用。' },
  stride: { name: '千里走单骑', description: '掷骰前使用，本回合首次移动额外 +2 格。' },
  fortune: { name: '生财有道', description: '掷骰前使用，立即获得 100 金。' },
  repair: { name: '修城令', description: '掷骰前使用，本回合一次升级费用减半；未建设则随回合结束失效。' },
  commerce: { name: '商路兴盛', description: '掷骰前对一座己方城池使用，本轮及接下来两轮租金提高25%，不重复叠加。' },
});

export const events = [
  { id: 'reward', name: '朝廷赏赐', category: 'economy', effect: 'money', amount: 150 },
  { id: 'trade', name: '商路兴盛', category: 'economy', effect: 'money', amount: 100 },
  { id: 'harvest', name: '丰收', category: 'economy', effect: 'money', amount: 80 },
  { id: 'bandits', name: '山贼', category: 'economy', effect: 'money', amount: -100 },
  { id: 'tax', name: '朝廷征税', category: 'economy', effect: 'money', amount: -120 },
  { id: 'supply', name: '粮草损耗', category: 'economy', effect: 'money', amount: -80 },
  { id: 'relief', name: '救济百姓', category: 'economy', effect: 'money', amount: -50 },
  { id: 'gift', name: '商贾馈赠', category: 'economy', effect: 'money', amount: 60 },
  { id: 'march', name: '急行军', category: 'movement', effect: 'extraRoll' },
  { id: 'delay', name: '军令延误', category: 'movement', effect: 'skip' },
  { id: 'advice', name: '卧龙献策', category: 'strategy', effect: 'card', card: 'rentShield' },
  { id: 'discovery', name: '妙计偶得', category: 'strategy', effect: 'card' },
];
