// Car development: engineering capacity, upgrade projects, next year's car
// and the annual tightening (design section 5.2).

import { PLAYER, clamp, clock, playerDrivers } from './core.js'
import { cfdMultiplier } from './org.js'
import { streamRng } from './rng.js'
import { canSpend, spend, capRoom } from './economy.js'

export const SIZES = {
  minor: { label: 'Minor', units: 10, gain: 1.0, cost: 0.4 },
  major: { label: 'Major', units: 23, gain: 2.5, cost: 0.9 },
  package: { label: 'Package', units: 52, gain: 6.0, cost: 2.0 },
}

// `mult` is the gain multiplier when the part works; `dud` is the chance it does nothing.
export const APPROACHES = {
  safe: { label: 'Safe', mult: 0.85, width: 0.5, dud: 0 },
  standard: { label: 'Standard', mult: 1.0, width: 1.0, dud: 0 },
  aggressive: { label: 'Aggressive', mult: 1.75, width: 1.0, dud: 0.2 },
}

export const AREAS = {
  aero: { label: 'Aero', pool: 'aero' },
  chassis: { label: 'Chassis', pool: 'mech' },
  reliability: { label: 'Reliability', pool: 'mech' },
  tyreCare: { label: 'Tyre Care', pool: 'mech' },
}

export const AERO_OUTPUT = 0.16 // work units per aerodynamicist per round at skill 50
export const MECH_OUTPUT = 0.27 // per mechanical designer: one department covers three ratings
export const BUILD_OUTPUT = 0.24 // build units per factory worker per round at skill 50
// Work banked for next year is no more efficient than an in-season upgrade.
// Its advantages are that it costs nothing to manufacture and is added after
// the winter's tightening, so none of it is lost to the rule change.
export const BANK_EFFICIENCY = 1.0
export const RUSH_COST = 1.5
const FACTORY_COST = [1.05, 1.0, 0.95, 0.9, 0.85, 0.8]
const MECH_BANK_SPLIT = { chassis: 0.6, tyreCare: 0.2, reliability: 0.2 }
export const TIGHTENING = { hard: 0.11, soft: 0.05, tyreCare: 0.04, reliability: 0.02 }
export const CHASSIS_FLOOR = 45 // with the bought-in parts package

// The closer a rating is to 100, the less each unit of work adds. Above 50
// the curve steepens, so the last few points cost the most.
export const DIMINISHING_POWER = 1.3
export const diminishing = (rating) => Math.max(0.03, rating <= 50 ? (100 - rating) / 50 : Math.pow((100 - rating) / 50, DIMINISHING_POWER))

export function initialDev() {
  return {
    queues: { aero: [], mech: [] }, builds: [], nextYearShare: 0, banked: { aero: 0, mech: 0 },
    fresh: [], log: [], nextId: 1, repeat: { aero: null, mech: null }, nextPenalty: { aero: null, mech: null },
  }
}

// A strong Technical Director or Head of Aero gets more out of the same people.
export const leadMult = (rating) => 0.6 + rating / 125

export function capacity(game) {
  const o = game.org
  const bonus = 1 + (game.bonus?.capacity || 0)
  const aero = o.staff.aero.heads * (o.staff.aero.skill / 50) * AERO_OUTPUT * cfdMultiplier(o) *
    leadMult(o.keyStaff.headOfAero.rating) * game.atr[PLAYER] * bonus
  const mech = o.staff.mech.heads * (o.staff.mech.skill / 50) * MECH_OUTPUT *
    leadMult(o.keyStaff.technicalDirector.rating) * (game.partsPackage ? 1.15 : 1) * bonus
  const build = o.staff.manufacturing.heads * (o.staff.manufacturing.skill / 50) * BUILD_OUTPUT
  return { aero, mech, build }
}

// Half-width of the outcome range for a standard project, as a share of the gain.
export function rollWidth(game, pool) {
  const o = game.org
  const drivers = playerDrivers(game)
  const feedback = drivers.reduce((s, d) => s + d.feedback, 0) / Math.max(1, drivers.length)
  const facility = pool === 'aero' ? 0.5 - 0.07 * o.facilities.windTunnel.level : 0.55 - 0.05 * o.facilities.designOffice.level
  const lead = pool === 'aero' ? o.keyStaff.headOfAero.rating : o.keyStaff.technicalDirector.rating
  return clamp(facility - (lead - 50) / 400 - (feedback - 75) / 300, 0.1, 0.6)
}

export function chassisCap(game) {
  if (!game.partsPackage) return 99
  const works = game.teams[game.suppliers[game.teams[PLAYER].supplier].worksTeam]
  return Math.max(CHASSIS_FLOOR + 5, works.car.chassis - 8)
}

export function projectCost(game, size, rush) {
  return SIZES[size].cost * (rush ? RUSH_COST : 1) * FACTORY_COST[game.org.facilities.factory.level]
}

// What the player is told to expect before committing.
export function expectedGain(game, area, size, approach) {
  const rating = game.teams[PLAYER].car[area]
  const ap = APPROACHES[approach]
  const base = SIZES[size].gain * diminishing(rating) * (area === 'reliability' ? 1 + 0.08 * (game.org.facilities.factory.level - 1) : 1)
  const width = rollWidth(game, AREAS[area].pool) * ap.width
  return {
    expected: base * ap.mult * (1 - ap.dud),
    low: ap.dud ? 0 : base * ap.mult * (1 - width),
    high: base * ap.mult * (1 + width),
    dud: ap.dud,
  }
}

export function startProject(game, { area, size, approach = 'standard', rush = false }, quiet = false) {
  if (!AREAS[area] || !SIZES[size] || !APPROACHES[approach]) throw new Error('Unknown project')
  if (area === 'chassis' && game.teams[PLAYER].car.chassis >= chassisCap(game) - 0.05) {
    // A repeating project at the cap stops quietly; the designers bank the work instead.
    if (quiet) return null
    throw new Error('Chassis is at the limit of the bought-in parts package. Go in-house to develop it further.')
  }
  const cost = projectCost(game, size, rush)
  if (!canSpend(game, cost)) { if (quiet) return null; throw new Error('Not enough cash for this project') }
  if (capRoom(game) < cost) { if (quiet) return null; throw new Error('This would break the cost cap') }
  spend(game, 'development', cost, true)
  const p = { id: game.dev.nextId++, area, size, approach, rush, units: SIZES[size].units, done: 0, stage: 'design', buildDone: 0, cost }
  game.dev.queues[AREAS[area].pool].push(p)
  return p
}

// Money the auto-repeat setting will commit per round, for the cash forecast.
export function plannedSpendPerRound(game) {
  const cap = capacity(game)
  const share = 1 - game.dev.nextYearShare / 100
  let total = 0
  for (const pool of ['aero', 'mech']) {
    const spec = game.dev.repeat[pool]
    if (spec) total += (cap[pool] * share / SIZES[spec.size].units) * projectCost(game, spec.size, spec.rush)
  }
  return total
}

export function cancelProject(game, id) {
  for (const q of Object.values(game.dev.queues)) {
    const i = q.findIndex((p) => p.id === id)
    if (i >= 0) { q.splice(i, 1); return } // the money is not refunded
  }
  throw new Error('Only projects still in design can be cancelled')
}

function applyUpgrade(game, p) {
  const car = game.teams[PLAYER].car
  const before = car[p.area]
  const ap = APPROACHES[p.approach]
  const rng = streamRng(game.seed, 'upgrade', p.id)
  const width = rollWidth(game, AREAS[p.area].pool) * ap.width
  const dud = ap.dud > 0 && rng.chance(ap.dud)
  const mult = dud ? 0 : ap.mult * rng.range(1 - width, 1 + width)
  // A decision can leave the next upgrade compromised, or a part fitted untested.
  const pool = AREAS[p.area].pool
  const knock = (p.gainMult ?? 1) * (game.dev.nextPenalty[pool] ?? 1)
  game.dev.nextPenalty[pool] = null
  let gain = SIZES[p.size].gain * diminishing(before) * mult * knock
  if (p.area === 'reliability') gain *= 1 + 0.08 * (game.org.facilities.factory.level - 1)
  const limit = p.area === 'chassis' ? chassisCap(game) : 99
  gain = Math.max(0, Math.min(gain, limit - before))
  car[p.area] = before + gain
  if (gain > 0 && p.area !== 'reliability') game.dev.fresh.push({ area: p.area, amount: gain, races: 1 })
  const entry = { season: game.season, round: game.round, area: p.area, size: p.size, approach: p.approach, gain, dud }
  game.dev.log.push(entry)
  game.news.push(dud
    ? `The ${SIZES[p.size].label.toLowerCase()} ${AREAS[p.area].label} upgrade did not work: no gain`
    : `${SIZES[p.size].label} ${AREAS[p.area].label} upgrade fitted: +${gain.toFixed(2)}`)
}

// Fits the first part in the factory straight away. `mult` scales its gain.
export function rushFirstBuild(game, { mult = 1 } = {}) {
  const p = game.dev.builds.shift()
  if (!p) return
  p.gainMult = mult
  applyUpgrade(game, p)
}

// One round of design and manufacturing work. Called before each race.
export function progressDevelopment(game) {
  const cap = capacity(game)
  const now = clock(game)
  const share = game.dev.nextYearShare / 100
  // A new part runs below its full value in its first race only, so parts
  // fitted before the last race are now at full value.
  game.dev.fresh = game.dev.fresh.filter((f) => --f.races > 0)
  for (const pool of ['aero', 'mech']) {
    const q = game.dev.queues[pool]
    game.dev.banked[pool] += cap[pool] * share
    let units = cap[pool] * (1 - share)
    while (units > 1e-9) {
      if (!q.length && game.dev.repeat[pool]) startProject(game, game.dev.repeat[pool], true)
      if (!q.length) break
      const p = q[0]
      const use = Math.min(p.units - p.done, units)
      p.done += use
      units -= use
      if (p.done >= p.units - 1e-9) {
        q.shift()
        p.stage = 'build'
        p.buildFrom = now + 1 // a finished design cannot also be built this round
        if (p.rush) game.dev.builds.unshift(p)
        else game.dev.builds.push(p)
      }
    }
    // Engineers with nothing queued work on next year's car.
    if (units > 1e-9) game.dev.banked[pool] += units
  }
  let build = cap.build
  for (const p of game.dev.builds.slice()) {
    if (build <= 1e-9) break
    if (p.buildFrom > now && !p.rush) continue
    const use = Math.min(p.units - p.buildDone, build)
    p.buildDone += use
    build -= use
    if (p.buildDone >= p.units - 1e-9) {
      game.dev.builds.splice(game.dev.builds.indexOf(p), 1)
      applyUpgrade(game, p)
    }
  }
}

// Which of Aero and Chassis the rule-makers hit hardest this winter. Fixed
// from the start of the season, announced to the player at mid-season.
export function tighteningPlan(game) {
  return streamRng(game.seed, 'tightening', game.season).chance(0.5) ? 'aero' : 'chassis'
}

export function tightenCar(car, hard) {
  car.aero *= 1 - (hard === 'aero' ? TIGHTENING.hard : TIGHTENING.soft)
  car.chassis *= 1 - (hard === 'chassis' ? TIGHTENING.hard : TIGHTENING.soft)
  car.tyreCare *= 1 - TIGHTENING.tyreCare
  car.reliability *= 1 - TIGHTENING.reliability
}

// The player's winter: the rules tighten, then banked work is added.
export function playerWinter(game, hard) {
  const car = game.teams[PLAYER].car
  const before = { ...car }
  tightenCar(car, hard)
  if (game.partsPackage) car.chassis = Math.max(car.chassis, CHASSIS_FLOOR)
  const afterLoss = { ...car }
  const add = (area, units) => {
    const limit = area === 'chassis' ? chassisCap(game) : 99
    car[area] = Math.min(limit, car[area] + (units / 10) * BANK_EFFICIENCY * diminishing(car[area]))
  }
  add('aero', game.dev.banked.aero)
  for (const [area, part] of Object.entries(MECH_BANK_SPLIT)) add(area, game.dev.banked.mech * part)
  const banked = { ...game.dev.banked }
  game.dev.banked = { aero: 0, mech: 0 }
  game.dev.fresh = []
  return { hard, before, afterLoss, after: { ...car }, banked }
}
