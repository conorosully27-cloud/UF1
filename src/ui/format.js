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

// Three-letter timing-screen code from a driver's surname.
export const carCode = (name) => name.split(' ').slice(-1)[0].normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()

const FALLBACK_COLORS = { mercedes: '#27f4d2', mclaren: '#ff8000', ferrari: '#e8002d', redbull: '#3671c6', racingbulls: '#6692ff', alpine: '#ff87bc', haas: '#b6babd', audi: '#c8a27a', williams: '#1868db', aston: '#229971', cadillac: '#d4af37', player: '#ff5a36' }
export const teamColor = (game, id) => game.teams[id]?.color ?? FALLBACK_COLORS[id] ?? '#8b93a3'

// Dark or light text on a team colour.
export function onColor(hex) {
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? '#111' : '#fff'
}
