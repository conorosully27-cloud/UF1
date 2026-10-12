// Seeded random numbers. Every random outcome in the game comes from a stream
// derived from the save's seed plus a label (season, round, purpose), so a
// reloaded save produces the same result for the same round.

export function hashString(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

// Methods live on the prototype, so a new stream costs one small object.
class Rng {
  constructor(seed) { this.a = seed >>> 0 }
  next() {
    this.a = (this.a + 0x6d2b79f5) | 0
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(lo, hi) { return lo + (hi - lo) * this.next() }
  int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)) }
  chance(p) { return this.next() < p }
  normal(mean = 0, sd = 1) {
    const u = Math.max(this.next(), 1e-12)
    const v = this.next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)] }
  weightedPick(arr, weights) {
    const total = weights.reduce((s, w) => s + w, 0)
    let r = this.next() * total
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i]
      if (r <= 0) return arr[i]
    }
    return arr[arr.length - 1]
  }
  shuffle(arr) {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
}

export function makeRng(seed) {
  return new Rng(seed)
}

export function streamRng(seed, ...keys) {
  return makeRng(hashString([seed, ...keys].join('|')))
}

// A stream keyed by numbers only: much cheaper than hashing a string, for
// the race simulation's many small streams.
export function mixRng(...nums) {
  let h = 0x9e3779b9
  for (const n of nums) {
    h = Math.imul(h ^ (n >>> 0), 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
  }
  return makeRng(h >>> 0)
}
