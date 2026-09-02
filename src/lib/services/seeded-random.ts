/**
 * Deterministic pseudo-randomness.
 *
 * Search results must be stable: the same route and dates have to return the
 * same offers on every request, or price comparison and price alerts would
 * compare against numbers that changed underneath them.
 */

/** FNV-1a: small, fast, and stable across processes (unlike hashCode tricks). */
export function hashSeed(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  const input = parts.join("|");

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/** mulberry32 PRNG - deterministic sequence from a 32-bit seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export function randomInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function pickMany<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const chosen: T[] = [];

  while (chosen.length < count && pool.length) {
    chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }

  return chosen;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
