// Scripted managers used by the checks. They play through the same engine
// functions the interface calls.

import { PLAYER } from '../src/engine/core.js'
import { forecast, canSpend, takeLoan, bankLimit, headCost, roundsLeft } from '../src/engine/economy.js'
import { capacity, chassisCap, plannedSpendPerRound } from '../src/engine/development.js'
import { buildFacility, hire, hireKeyStaff } from '../src/engine/hq.js'
import { acceptOffer, freeSlots } from '../src/engine/sponsors.js'
import { FACILITY_COST, MAX_BUILDS, headcountCap, engineerCount } from '../src/engine/org.js'
import { autoDrivers } from '../src/engine/people.js'

const BUILD_ORDER = ['designOffice', 'cfd', 'windTunnel', 'factory', 'raceOps', 'simulator', 'commercial']
const tryDo = (fn) => { try { fn(); return true } catch { return false } }

// Does nothing beyond keeping two drivers under contract.
export function passive(g) { autoDrivers(g) }

// Sensible but simple: takes sponsors, keeps the designers busy, banks work
// for next year from mid-season, and invests whatever the forecast can spare.
export function steady(g, { buffer = 4, bank = 50 } = {}) {
  autoDrivers(g)
  for (const o of g.sponsors.offers.slice().sort((a, b) => b.value - a.value)) {
    if (freeSlots(g, o.tier) > 0) tryDo(() => acceptOffer(g, o.id, 'balanced'))
  }
  const car = g.teams[PLAYER].car
  g.dev.repeat.aero = { area: 'aero', size: 'minor', approach: 'standard' }
  const mechArea = car.chassis < chassisCap(g) - 1 && (g.round % 4 !== 3) ? 'chassis' : car.reliability < car.tyreCare + 8 ? 'reliability' : 'tyreCare'
  g.dev.repeat.mech = { area: mechArea, size: 'minor', approach: 'standard' }
  g.dev.nextYearShare = g.phase === 'season' && g.round >= 8 ? bank : 0

  if (g.finance.austerity > 0) return
  const left = Math.max(1, roundsLeft(g))
  let spare = Math.min(forecast(g, plannedSpendPerRound(g)), g.finance.cash + 6) - buffer
  const o = g.org

  // Fill the departments the facilities have room for, engineers first.
  const fill = (dept, room, chunk) => {
    const n = Math.min(room, chunk)
    const cost = n * headCost(o.staff[dept]) * (left / 16)
    if (n >= 1 && spare > cost + 1 && tryDo(() => hire(g, dept, n))) spare -= cost
  }
  const engRoom = headcountCap(o, 'aero') - engineerCount(g.org)
  if (engRoom > 0) { fill('aero', Math.ceil(engRoom / 2), 10); fill('mech', Math.floor(engRoom / 2), 10) }
  const cap = capacity(g)
  const pending = (d) => o.staff[d].heads + o.staff[d].incoming.reduce((s, x) => s + x.heads, 0)
  if (cap.build < (cap.aero + cap.mech) * 1.15) fill('manufacturing', headcountCap(o, 'manufacturing') - pending('manufacturing'), 10)
  fill('commercial', headcountCap(o, 'commercial') - pending('commercial'), 5)

  // Build the lowest-level useful facility the forecast can carry.
  const active = Object.values(o.facilities).filter((f) => f.building).length
  if (active < MAX_BUILDS) {
    // Performance facilities count as a level lower than they are, so they are built first.
    const rank = (id) => o.facilities[id].level - (BUILD_ORDER.indexOf(id) < 4 ? 1.5 : 0)
    const next = BUILD_ORDER.filter((id) => !o.facilities[id].building && o.facilities[id].level < 5)
      .sort((a, b) => rank(a) - rank(b) || BUILD_ORDER.indexOf(a) - BUILD_ORDER.indexOf(b))[0]
    if (next && spare > FACILITY_COST[o.facilities[next].level] + 2) tryDo(() => buildFacility(g, next))
  }

  // Upgrade a key role when a clearly better person is available and affordable.
  for (const c of g.staffMarket.slice().sort((a, b) => b.rating - a.rating)) {
    const cur = o.keyStaff[c.role]
    if (c.rating >= cur.rating + 10 && g.reputation >= c.minReputation && spare > c.buyout + (c.salary - cur.salary) * 2 + 3) {
      if (tryDo(() => hireKeyStaff(g, c.id))) { spare -= c.buyout + (c.salary - cur.salary); break }
    }
  }
}

// Spends everything and borrows to the limit.
export function reckless(g) {
  steady(g, { buffer: -40, bank: 0 })
  const room = bankLimit(g) - g.finance.bank
  if (room > 0.5) tryDo(() => takeLoan(g, room))
  const o = g.org
  for (const id of BUILD_ORDER) if (canSpend(g, 1)) tryDo(() => buildFacility(g, id))
  for (const d of ['aero', 'mech', 'manufacturing', 'raceTeam']) tryDo(() => hire(g, d, 10))
  void o
}

// ---- Milestone 3: decisions and season targets ----
import { resolveDecision, bestChoice } from '../src/engine/decisions.js'
import { prepareTargets, startSeason, simulateRound, endSeason } from '../src/engine/game.js'
import { streamRng } from '../src/engine/rng.js'

// mode: 'best' takes the option the valuation prefers, 'worst' the other, 'random' a coin toss.
export function decide(g, mode = 'best') {
  if (!g.decision || g.decision.resolved) return
  const best = bestChoice(g)
  const other = best === 'a' ? 'b' : 'a'
  const coin = streamRng(g.seed, 'botCoin', g.season, g.round).chance(0.5)
  resolveDecision(g, mode === 'best' ? best : mode === 'worst' ? other : coin ? 'a' : 'b')
}

// The first objective offered in each category, all at the same level.
export function pickTargets(g, level = 'standard') {
  return ['sporting', 'commercial', 'technical'].map((cat) => {
    const o = g.targets.offer.find((x) => x.category === cat)
    return { id: o.id, area: o.area, level }
  })
}

export function playFullSeason(g, manager, { level = 'standard', choose = 'best', runs = 40 } = {}) {
  manager(g)
  if (g.options.targets) { prepareTargets(g, runs); startSeason(g, pickTargets(g, level)) } else startSeason(g)
  while (g.phase === 'season') { manager(g); decide(g, choose); simulateRound(g) }
  const books = { ...g.finance.season, cash: g.finance.cash }
  const summary = endSeason(g)
  return { summary, books }
}
