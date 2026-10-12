export const money = (m, digits = 1) => `${m < 0 ? '−' : ''}£${Math.abs(m).toFixed(digits)}m`

export function lapTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export const gap = (sec) => (sec === 0 ? '—' : `+${sec.toFixed(3)}`)

export function raceGap(r) {
  if (r.status === 'dnf') return `DNF (${r.reason})`
  if (r.pos === 1) return 'Winner'
  if (r.lapsDown > 0) return `+${r.lapsDown} lap${r.lapsDown > 1 ? 's' : ''}`
  return `+${r.gap.toFixed(1)} s`
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export const pct = (x) => `${Math.round(x * 100)}%`
