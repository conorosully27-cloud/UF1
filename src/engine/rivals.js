// Rival car development. Each rival has a development rate per area, set so
// that it holds its starting rating against the annual tightening. Half the
// year's work lands over the winter and half as in-season upgrades.

import { PLAYER, ROUNDS, clamp } from './core.js'
import { diminishing, tightenCar, TIGHTENING } from './development.js'
import { DIFFICULTY } from './economy.js'
import { streamRng } from './rng.js'

const AREAS = ['aero', 'chassis', 'tyreCare', 'reliability']
const PACKAGES = 3
const AVERAGE_LOSS = { aero: (TIGHTENING.hard + TIGHTENING.soft) / 2, chassis: (TIGHTENING.hard + TIGHTENING.soft) / 2, tyreCare: TIGHTENING.tyreCare, reliability: TIGHTENING.reliability }

// One year at development rate `d`: in-season packages, the winter loss, then
// the winter work. Returns the rating at the start of next season.
function yearOn(start, d, atr, loss) {
  let r = start
  for (let i = 0; i < PACKAGES; i++) r += ((0.5 * d) / PACKAGES) * diminishing(r) * atr
  r *= 1 - loss
  return r + 0.5 * d * diminishing(r) * atr
}

// The rate at which a team neither gains nor loses over a year.
function holdingRate(rating, atr, loss) {
  let lo = 0
  let hi = 400
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (yearOn(rating, mid, atr, loss) < rating) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function initRivals(game) {
  game.rivals = {}
  const ai = DIFFICULTY[game.difficulty].aiDev
  for (const t of Object.values(game.teams)) {
    if (t.isPlayer) continue
    const atr = game.atr[t.id]
    const dev = {}
    for (const a of AREAS) dev[a] = holdingRate(t.car[a], a === 'aero' ? atr : 1, AVERAGE_LOSS[a]) * ai
    game.rivals[t.id] = { dev, base: { ...dev }, upgrades: [] }
  }
  scheduleRivalUpgrades(game)
}

export function scheduleRivalUpgrades(game) {
  for (const [id, r] of Object.entries(game.rivals)) {
    const rng = streamRng(game.seed, 'rivalSchedule', game.season, id)
    r.upgrades = rng.shuffle([...Array(13).keys()].map((i) => i + 2)).slice(0, PACKAGES)
  }
}

function develop(game, id, share, rng, lo, hi) {
  const t = game.teams[id]
  const r = game.rivals[id]
  const gains = {}
  for (const a of AREAS) {
    const atr = a === 'aero' ? game.atr[id] : 1
    const gain = share * r.dev[a] * diminishing(t.car[a]) * atr * rng.range(lo, hi)
    t.car[a] = Math.min(99, t.car[a] + gain)
    gains[a] = gain
  }
  return gains
}

// In-season upgrades. Called before each race.
export function rivalRound(game) {
  for (const id of Object.keys(game.rivals)) {
    if (!game.rivals[id].upgrades.includes(game.round)) continue
    const g = develop(game, id, 0.5 / PACKAGES, streamRng(game.seed, 'rivalUpgrade', game.season, game.round, id), 0.6, 1.4)
    if (g.aero + g.chassis > 0.9) game.news.push(`${game.teams[id].name} bring an upgrade (+${g.aero.toFixed(1)} Aero, +${g.chassis.toFixed(1)} Chassis)`)
  }
}

// The rivals' winter: the rules tighten, then half a year of work is added,
// then each team's development rate drifts.
export function rivalWinter(game, hard) {
  for (const id of Object.keys(game.rivals)) {
    tightenCar(game.teams[id].car, hard)
    const rng = streamRng(game.seed, 'rivalWinter', game.season, id)
    develop(game, id, 0.5, rng, 0.75, 1.25)
    const r = game.rivals[id]
    for (const a of AREAS) {
      // A random walk that is pulled back towards the team's starting level.
      const drifted = Math.pow(r.dev[a] * Math.exp(rng.normal(0, 0.05)), 0.9) * Math.pow(r.base[a], 0.1)
      r.dev[a] = clamp(drifted, r.base[a] * 0.7, r.base[a] * 1.35)
    }
  }
}

export { ROUNDS, PLAYER }
