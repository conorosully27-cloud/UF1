// Shared constants and read-only helpers used across the engine.

import { TRACK_BY_ID } from './data/tracks.js'
import { overall } from './data/drivers.js'
import { carScore } from './weekend.js'
import { playerOps } from './org.js'
import { clone, clamp, ordinal } from './util.js'

export const SAVE_VERSION = 5
export const START_YEAR = 2027
export const PLAYER = 'player'
export const START_REPUTATION = 10
export const ROUNDS = 16

export { clone, clamp, ordinal }

export function year(game) {
  return START_YEAR + game.season - 1
}

// Rounds played since the start of the save.
export function clock(game) {
  return (game.season - 1) * ROUNDS + game.round
}

export function currentTrack(game) {
  return TRACK_BY_ID[game.calendar[Math.min(game.round, game.calendar.length - 1)]]
}

// Aero testing allowance: 70% for the champions up to 125% for 12th.
export function atrFor(pos) {
  return 0.7 + 0.05 * (pos - 1)
}

// How much of a new part's gain is missing in its first race, by Wind Tunnel level.
const FRESH_PENALTY = [0.3, 0.3, 0.3, 0.15, 0.15, 0]

// Ratings the simulation uses for a team's car right now.
export function effectiveCar(game, teamId) {
  const t = game.teams[teamId]
  const s = game.suppliers[t.supplier]
  const car = {
    aero: t.car.aero, chassis: t.car.chassis, tyreCare: t.car.tyreCare,
    power: s.power - (t.works ? 0 : 1) + (t.powerBonus || 0),
    reliability: 0.65 * t.car.reliability + 0.35 * s.reliability,
  }
  if (teamId === PLAYER && game.dev) {
    const share = FRESH_PENALTY[game.org.facilities.windTunnel.level]
    for (const f of game.dev.fresh) car[f.area] -= f.amount * share
  }
  return car
}

export function teamOps(game, teamId) {
  return teamId === PLAYER ? playerOps(game.org) : game.teams[teamId].ops
}

function countback(a, b) {
  for (let p = 0; p < a.length; p++) if (a[p] !== b[p]) return b[p] - a[p]
  return 0
}

export function getStandings(game, results = game.results) {
  const cars = Object.values(game.teams).reduce((n, t) => n + t.drivers.length, 0)
  const blank = () => new Array(cars).fill(0)
  const drivers = {}
  const constructors = {}
  for (const t of Object.values(game.teams)) constructors[t.id] = { id: t.id, name: t.name, points: 0, finishes: blank(), best: null, wins: 0, podiums: 0 }
  const driverRow = (id, teamId) => ({ id, name: game.drivers[id].name, teamId, points: 0, finishes: blank(), best: null, wins: 0, podiums: 0 })
  for (const res of results) {
    for (const r of res.race) {
      const d = (drivers[r.id] ??= driverRow(r.id, r.teamId))
      const c = constructors[r.teamId]
      for (const x of [d, c]) {
        x.points += r.points
        x.finishes[r.pos - 1]++
        if (x.best === null || r.pos < x.best) x.best = r.pos
        if (r.pos === 1) x.wins++
        if (r.pos <= 3) x.podiums++
      }
    }
  }
  for (const t of Object.values(game.teams)) for (const id of t.drivers) drivers[id] ??= driverRow(id, t.id)
  const order = (a, b) => b.points - a.points || countback(a.finishes, b.finishes) || a.name.localeCompare(b.name)
  return {
    drivers: Object.values(drivers).sort(order),
    constructors: Object.values(constructors).sort(order),
  }
}

export function playerPosition(game) {
  if (!game.results.length) return game.lastStandings.indexOf(PLAYER) + 1
  return getStandings(game).constructors.findIndex((c) => c.id === PLAYER) + 1
}

// Seconds per lap behind the fastest car, for display.
export function paceTable(game, w = { aero: 0.4, chassis: 0.35, power: 0.25 }) {
  const rows = Object.values(game.teams).map((t) => {
    const car = effectiveCar(game, t.id)
    return { id: t.id, name: t.name, car, score: carScore(car, w) }
  })
  const top = Math.max(...rows.map((r) => r.score))
  for (const r of rows) r.gap = (top - r.score) * 0.05
  return rows.sort((a, b) => b.score - a.score)
}

// What the player's team has achieved so far this season. Used for sponsor
// targets, season targets and the pre-season projection.
export function seasonMetrics(game) {
  const st = getStandings(game)
  const me = st.constructors.find((c) => c.id === PLAYER)
  const ahead = {}
  let classified = 0
  for (const res of game.results) {
    const mine = res.race.filter((r) => r.teamId === PLAYER)
    if (mine.length === 2 && mine.every((r) => r.status === 'finished')) classified++
    const best = Math.min(...mine.map((r) => r.pos))
    const worst = {}
    for (const r of res.race) if (r.teamId !== PLAYER) worst[r.teamId] = Math.max(worst[r.teamId] || 0, r.pos)
    for (const [id, pos] of Object.entries(worst)) if (best < pos) ahead[id] = (ahead[id] || 0) + 1
  }
  const order = {}
  st.constructors.forEach((c, i) => { order[c.id] = i + 1 })
  const start = game.seasonStart
  const car = game.teams[PLAYER].car
  const levels = Object.values(game.org.facilities).reduce((s, f) => s + f.level, 0)
  return {
    pos: order[PLAYER], order, points: me.points, best: me.best ?? 24, wins: me.wins, podiums: me.podiums, classified, ahead,
    cash: game.finance.cash, sponsor: game.finance.season.income.sponsors,
    rating: start ? { aero: car.aero - start.car.aero, chassis: car.chassis - start.car.chassis } : { aero: 0, chassis: 0 },
    facilities: start ? levels - start.facilityLevels : 0,
  }
}


export function playerDrivers(game) {
  return game.teams[PLAYER].drivers.map((id) => game.drivers[id])
}

export { overall }
