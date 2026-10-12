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

export function makeRng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    normal: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-12)
      const v = next()
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weightedPick: (arr, weights) => {
      const total = weights.reduce((s, w) => s + w, 0)
      let r = next() * total
      for (let i = 0; i < arr.length; i++) {
        r -= weights[i]
        if (r <= 0) return arr[i]
      }
      return arr[arr.length - 1]
    },
    shuffle: (arr) => {
      const out = arr.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
  }
  return rng
}

export function streamRng(seed, ...keys) {
  return makeRng(hashString([seed, ...keys].join('|')))
}
