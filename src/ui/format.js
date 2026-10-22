export { money, ordinal } from '../engine/util.js'

export function lapTime(sec) {
  if (sec == null) return 'No time'
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export const gap = (sec) => (sec == null ? '—' : sec === 0 ? '—' : `+${sec.toFixed(3)}`)

export function raceGap(r) {
  if (r.status === 'dnf') return `DNF (${r.reason})`
  if (r.pos === 1) return 'Winner'
  if (r.lapsDown > 0) return `+${r.lapsDown} lap${r.lapsDown > 1 ? 's' : ''}`
  return `+${r.gap.toFixed(1)} s`
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

// Your two drivers each get their own colour, so either can be picked out at a
// glance: the first takes the team colour, the second a colour chosen to
// stand well apart from it.
const SECOND_COLORS = ['#ffd23f', '#00d1ff', '#f2f2f2', '#b48cff', '#3ddc84', '#ff4fa3']
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
export function secondColor(first) {
  const a = rgb(first)
  const dist = (c) => { const b = rgb(c); return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 }
  return SECOND_COLORS.reduce((best, c) => (dist(c) > dist(best) ? c : best))
}
// `slot` is 0 or 1 when known (a race entry); otherwise the driver's place in the team.
export function driverColor(game, id, slot = null) {
  const first = teamColor(game, 'player')
  const s = slot ?? game.teams.player.drivers.indexOf(id)
  return s === 0 ? first : secondColor(first)
}
