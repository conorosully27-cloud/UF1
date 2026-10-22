// Small helpers used across the engine, the screens and the checks. This file
// imports nothing, so any module can use it without an import cycle.

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
export const clone = (x) => JSON.parse(JSON.stringify(x))
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
export const surname = (name) => name.split(' ').slice(-1)[0]

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export const money = (m, digits = 1) => `${m < 0 ? '−' : ''}£${Math.abs(m).toFixed(digits)}m`
