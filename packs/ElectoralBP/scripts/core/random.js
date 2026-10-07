// Seeded PRNG so every election can be reproduced ("recounted") from its seed.

export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  const str = parts.join("|");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seed) {
  let a = seed >>> 0;
  let spare = null;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    seed: seed >>> 0,
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    normal(mean = 0, sd = 1) {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return mean + sd * v;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mean + sd * mag * Math.cos(2 * Math.PI * v);
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    weighted(items, weightOf) {
      const total = items.reduce((s, it) => s + Math.max(0, weightOf(it)), 0);
      if (total <= 0) return items[0];
      let r = next() * total;
      for (const it of items) {
        r -= Math.max(0, weightOf(it));
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    },
  };
  return rng;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function softmax(values, temperature = 1) {
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  const exps = values.map((v) => Math.exp((v - max) / temperature));
  const sum = exps.reduce((s, v) => s + v, 0);
  return exps.map((v) => v / sum);
}
