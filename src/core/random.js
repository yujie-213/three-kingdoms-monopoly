export function generateSeed() {
  return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)),
    (value) => value.toString(16).padStart(8, '0')).join('');
}

export function seedValue(seed) {
  let value = 2166136261;
  for (const char of String(seed)) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value || 1;
}

export function nextRandom(state) {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  value >>>= 0;
  return { state: value, value: value / 4294967296 };
}

export function shuffle(ids, randomState) {
  const order = [...ids];
  let state = randomState;
  for (let i = order.length - 1; i > 0; i--) {
    const random = nextRandom(state);
    state = random.state;
    const j = Math.floor(random.value * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { order, state };
}
