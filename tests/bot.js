// Scripted managers used by the checks. They play through the same engine
// functions the interface calls.

import { PLAYER, getStandings } from '../src/engine/core.js'
import { forecast, canSpend, takeLoan, repayLoan, bankLimit, headCost, roundsLeft, takeAdvance, advanceLimit, perRound, PRIZE, DIFFICULTY } from '../src/engine/economy.js'
import { capacity, chassisCap, plannedSpendPerRound, diminishing } from '../src/engine/development.js'
import { buildFacility, hire, hireKeyStaff } from '../src/engine/hq.js'
import { acceptOffer, freeSlots } from '../src/engine/sponsors.js'
import { FACILITY_COST, FACILITY_TIME, MAX_BUILDS, headcountCap, engineerCount } from '../src/engine/org.js'
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

// ---- Milestone 5: the balance managers (design section 9) ----
import { offerContract, offerInterest, marketDemand, canApproach, releaseCost, releaseDriver, answerApproach, SIGNS_AT } from '../src/engine/people.js'
import { changeSupplier, setPartsPackage, paceTable } from '../src/engine/game.js'
import { setPay } from '../src/engine/hq.js'
import { overall } from '../src/engine/data/drivers.js'
import { backingBase } from '../src/engine/contracts.js'
import { ROUNDS } from '../src/engine/core.js'

const raceDrivers = (g) => g.teams[PLAYER].drivers.map((id) => g.drivers[id]).filter((d) => !d.contract?.expired)

// What a driver is worth to the team per season, in £m, against what they cost.
// A point of Overall is worth more as the team climbs; backing pays in cash.
function driverWorth(g, d) {
  const perPoint = 0.25 + Math.pow(g.reputation / 25, 2)
  return overall(d) * perPoint + backingBase(d) * 0.8
}

// The cheapest offer this driver is likely to accept, or null.
function bestOffer(g, d, role = 'race') {
  const demand = marketDemand(g, d, role)
  for (const mult of [1, 1.15, 1.3, 1.5]) {
    const o = { role, salary: demand * mult, years: d.age >= 32 ? 1 : Math.max(2, d.prefYears), numberOne: false, releaseClause: false }
    if (d.loanFrom) o.years = 1
    if (o.years !== d.prefYears && offerInterest(g, d, { ...o, years: d.prefYears }, false).estimate >= SIGNS_AT + 4) o.years = d.prefYears
    if (offerInterest(g, d, o, false).estimate >= SIGNS_AT + 4) return o
  }
  return null
}

function competentDrivers(g) {
  if (g.phase !== 'preseason' || g.market.closed) return
  for (const a of g.approaches.slice()) {
    if (a.kind === 'staff') answerApproach(g, a.id, g.org.keyStaff[a.role].rating >= 70 && g.finance.cash > 5)
    else answerApproach(g, a.id, overall(g.drivers[a.driverId]) < 80 && a.fee > 4)
  }
  const budget = Math.max(2, g.reputation / 2.5) // most a driver's salary can be, net of backing
  const pool = Object.values(g.drivers).filter((d) => (!d.teamId || d.contract?.expired) && !d.retired && overall(d) >= 72 && !canApproach(g, d))
  const offers = pool.map((d) => ({ d, o: bestOffer(g, d) })).filter((x) => x.o && x.o.salary - backingBase(x.d) * 0.8 <= budget)
    .map((x) => ({ ...x, net: driverWorth(g, x.d) - x.o.salary })).sort((a, b) => b.net - a.net)
  // Replace a weak driver under contract if a much better one will come and the pay-off is affordable.
  for (const cur of raceDrivers(g).sort((a, b) => driverWorth(g, a) - driverWorth(g, b))) {
    const top = offers.find((x) => x.d.teamId !== PLAYER)
    if (!top) break
    const gain = top.net - (driverWorth(g, cur) - cur.contract.salary)
    if (gain > 4 + releaseCost(cur) && canSpend(g, releaseCost(cur) + 2)) { releaseDriver(g, cur.id); break }
  }
  for (const x of offers) {
    if (raceDrivers(g).length >= 2) break
    if (x.d.teamId === PLAYER && x.d.contract?.role !== 'race') continue
    try { offerContract(g, x.d.id, x.o) } catch { /* seat or approach rules */ }
  }
  autoDrivers(g) // anything still empty
}

function competentSupply(g) {
  if (g.phase !== 'preseason') return
  const team = g.teams[PLAYER]
  // With the bought-in parts, Chassis is capped 8 below the supplier's own car.
  const capFor = (s) => (g.partsPackage ? Math.max(50, g.teams[s.worksTeam].car.chassis - 8) : 99)
  const value = (s) => (s.power - 1) * (1.2 + g.reputation / 30) + s.reliability * 0.3 - s.price - Math.max(0, team.car.chassis + 8 - capFor(s)) * 3
  const best = Object.values(g.suppliers).filter((s) => g.reputation >= s.minReputation).sort((a, b) => value(b) - value(a))[0]
  if (best && best.id !== team.supplier && value(best) > value(g.suppliers[team.supplier]) + 1) tryDo(() => changeSupplier(g, best.id))
  const f = g.org.facilities
  if (g.partsPackage && f.designOffice.level >= 3 && f.factory.level >= 3 && team.car.chassis >= chassisCap(g) - 1.5) tryDo(() => setPartsPackage(g, false))
}

// Running costs and income a full season from now, if nothing changes: the
// prize for the position the team is holding, owner funding tapering, and
// facility instalments finished.
export function nextSeasonNet(g) {
  const pr = perRound(g, 99)
  const pos = playerPos(g)
  const prize = PRIZE[pos - 1] * (1 - g.finance.prizeShareLost)
  const owner = DIFFICULTY[g.difficulty].owner[g.season - (g.phase === 'preseason' ? 1 : 0)] || 0
  const income = prize + (pr.income.sponsors + pr.income.backing + pr.income.merchandise) * ROUNDS + owner
  const costs = Object.values(pr.costs).reduce((s, v) => s + v, 0) * ROUNDS
  return income - costs
}

// Season targets chosen with the plan in mind: a sponsor-income target the
// signed deals already cover, a development target the designers can reach,
// and a cautious sporting level while the owner is uneasy.
export function competentTargets(g) {
  const offer = g.targets.offer
  const pick = (cat) => offer.filter((o) => o.category === cat)
  const top = (o, value, lowerBetter = false) => ['stretch', 'standard', 'safe'].find((l) => (lowerBetter ? value <= o.marks[l] : value >= o.marks[l] * 1.1)) ?? null
  // Results objectives are judged against the average team; this one is better than average, so Standard is a fair bet
  // unless the owner is uneasy. Positions and race counts it can see coming are preferred to single best finishes.
  const prefer = ['ahead', 'points', 'podiums', 'wins', 'pos', 'best']
  const sport = pick('sporting').sort((a, b) => prefer.indexOf(a.id) - prefer.indexOf(b.id))[0]
  const sportLevel = g.confidence < 60 ? 'safe' : 'standard'
  const fees = g.sponsors.deals.reduce((s, d) => s + d.fee, 0)
  const sponsor = pick('commercial').find((o) => o.id === 'sponsor')
  const cash = pick('commercial').find((o) => o.id === 'cash')
  let com = sponsor && top(sponsor, fees) ? { o: sponsor, level: top(sponsor, fees) } : { o: cash ?? pick('commercial')[0], level: 'safe' }
  g.botCashFloor = com.o.id === 'cash' ? com.o.marks[com.level] : 0
  const rating = pick('technical').find((o) => o.id === 'rating')
  const cap = capacity(g)
  const car = g.teams[PLAYER].car
  const aeroGain = cap.aero * 13 * 0.1 * diminishing(car.aero) // about 13 rounds of in-season aero work
  // Facility levels are in the team's own hands, so that target is the safest technical bet.
  const facilities = pick('technical').find((o) => o.id === 'facilities')
  const tech = facilities ? { o: facilities, level: g.confidence < 60 ? 'safe' : 'standard' }
    : rating && top(rating, aeroGain) ? { o: rating, level: top(rating, aeroGain) } : { o: pick('technical').find((o) => o.id === 'classified') ?? pick('technical')[0], level: 'safe' }
  return [{ o: sport, level: sportLevel }, com, tech].map(({ o, level }) => ({ id: o.id, area: o.area, level }))
}

// Sensible priorities, follows the cash forecast, picks the better A/B option.
export function competent(g) {
  competentDrivers(g)
  competentSupply(g)
  for (const o of g.sponsors.offers.slice().sort((a, b) => b.value - a.value)) {
    if (freeSlots(g, o.tier) > 0) tryDo(() => acceptOffer(g, o.id, g.finance.cash < 5 ? 'guaranteed' : 'balanced'))
  }
  const car = g.teams[PLAYER].car
  const o = g.org
  const size = capacity(g).aero > 12 ? 'package' : 'major'
  g.dev.repeat.aero = { area: 'aero', size, approach: 'standard' }
  const roomChassis = car.chassis < chassisCap(g) - 1
  const mechArea = car.reliability < 72 && g.round % 3 === 1 ? 'reliability' : roomChassis && g.round % 4 !== 3 ? 'chassis' : car.tyreCare < car.chassis - 4 ? 'tyreCare' : car.reliability < 90 ? 'reliability' : 'tyreCare'
  g.dev.repeat.mech = { area: mechArea, size, approach: 'standard' }
  // In-season parts help now and carry over; bank what would arrive too late to
  // race, and bank more (it costs nothing to build) when money is short.
  const floor = (g.botCashFloor || 0) + 1
  g.settings.approach = g.phase === 'season' ? (playerPos(g) >= 9 ? 'aggressive' : playerPos(g) <= 4 ? 'conservative' : 'balanced') : g.settings.approach
  // Keep out of the overdraft: an advance on prize money, then the bank, are cheaper than a crisis.
  if (g.phase === 'season' && g.finance.cash < 0.5) tryDo(() => takeAdvance(g, Math.min(advanceLimit(g), 3 - g.finance.cash)))
  if (g.finance.cash < -2) tryDo(() => takeLoan(g, Math.min(bankLimit(g) - g.finance.bank, 4 - g.finance.cash)))
  if (g.finance.bank > 0 && g.finance.cash > 12) tryDo(() => repayLoan(g, Math.min(g.finance.bank, g.finance.cash - 10)))

  const saving = competentInvest(g, floor)
  // Whatever is left goes on parts for this season's car, after putting money
  // aside for the next building; the rest of the designers' time is banked,
  // which costs nothing to build.
  g.dev.nextYearShare = g.phase === 'season' && g.round >= 13 ? 100 : 0
  while (g.phase === 'season' && g.dev.nextYearShare < 100 && forecast(g, plannedSpendPerRound(g)) < floor + saving) g.dev.nextYearShare += 10
}

function competentInvest(g, floor) {
  const o = g.org
  if (g.finance.austerity > 0) return
  const left = Math.max(1, roundsLeft(g))
  // One-off money: what the forecast leaves above the floor before in-season parts, which can always be swapped for banked work.
  // Lasting money: what next season's books can carry.
  let spare = Math.min(forecast(g, 0), g.finance.cash + 6) - floor - 3
  let lasting = nextSeasonNet(g) - plannedSpendPerRound(g) * ROUNDS * 0.4 - 5 - g.finance.bank
  let saving = 0
  const fill = (dept, room, chunk) => {
    const n = Math.min(room, chunk)
    const year = n * headCost(o.staff[dept])
    if (n >= 1 && spare > year * (left / ROUNDS) + 1 && lasting > year && tryDo(() => hire(g, dept, n))) { spare -= year * (left / ROUNDS); lasting -= year }
  }
  // Aero is worth the most lap time; Mechanical Design only needs enough to hold its three ratings.
  const engRoom = headcountCap(o, 'aero') - engineerCount(o)
  const c0 = capacity(g)
  const aeroShare = c0.mech > c0.aero * 1.2 ? 0.85 : 0.65
  if (engRoom > 0) { fill('aero', Math.ceil(engRoom * aeroShare), 20); fill('mech', engRoom - Math.ceil(engRoom * aeroShare), 20) }
  const cap = capacity(g)
  const pending = (d) => o.staff[d].heads + o.staff[d].incoming.reduce((s, x) => s + x.heads, 0)
  if (cap.build < (cap.aero + cap.mech) * 1.1) fill('manufacturing', headcountCap(o, 'manufacturing') - pending('manufacturing'), 15)
  fill('raceTeam', headcountCap(o, 'raceTeam') - pending('raceTeam'), 10)
  fill('commercial', headcountCap(o, 'commercial') - pending('commercial'), 5)
  for (const d of ['aero', 'mech']) {
    const extra = o.staff[d].heads * headCost(o.staff[d]) * 0.2
    if (o.staff[d].pay !== 'premium' && spare > extra && lasting > extra * 2) { setPay(g, d, 'premium'); spare -= extra * (left / ROUNDS); lasting -= extra }
  }
  // Design Office and Factory to level 3 first-ish: that is what it takes to drop the parts package's Chassis cap.
  // Once the car is near the midfield, race operations matter as much as more downforce.
  const order = ['designOffice', 'cfd', 'factory', 'windTunnel', 'commercial', 'raceOps', 'simulator', 'academy']
  const nearMidfield = carGap(g) < 0.8
  const active = Object.values(o.facilities).filter((f) => f.building).length
  if (active < MAX_BUILDS) {
    // With Chassis pressing against the parts package's cap, going in-house comes first.
    const capped = g.partsPackage && g.teams[PLAYER].car.chassis >= chassisCap(g) - 4
    const inHouse = (id) => capped && (id === 'factory' || id === 'designOffice') && o.facilities[id].level < 3
    const rank = (id) => o.facilities[id].level + order.indexOf(id) * 0.35 + (id === 'academy' ? 2 : 0) - (nearMidfield && (id === 'raceOps' || id === 'simulator') ? 2 : 0) - (inHouse(id) ? 4 : 0)
    const next = order.filter((id) => !o.facilities[id].building && o.facilities[id].level < 5).sort((a, b) => rank(a) - rank(b))[0]
    const cost = next ? FACILITY_COST[o.facilities[next].level] : 0
    const instalments = Math.min(left, FACILITY_TIME[o.facilities[next]?.level ?? 0]) / FACILITY_TIME[o.facilities[next]?.level ?? 0]
    if (next && spare > cost * instalments + 1 && lasting > cost * 0.06 + 1 && nextSeasonNet(g) > cost * (1 - instalments) + 2) {
      if (tryDo(() => buildFacility(g, next))) { spare -= cost * instalments; lasting -= cost * 0.06 }
    } else if (next && lasting > cost * 0.06 + 1) saving = Math.min(cost * instalments, 12)
  }
  // Better key staff whenever someone clearly better is available and affordable; race staff once the car is competitive.
  let hired = 0
  const roleWeight = { technicalDirector: 3, headOfAero: 3, chiefStrategist: nearMidfield ? 3 : 1, raceEngineer1: nearMidfield ? 2 : 0.5, raceEngineer2: nearMidfield ? 2 : 0.5, commercialDirector: 1.5 }
  for (const c of g.staffMarket.slice().sort((a, b) => (b.rating - o.keyStaff[b.role].rating) * roleWeight[b.role] - (a.rating - o.keyStaff[a.role].rating) * roleWeight[a.role])) {
    const cur = o.keyStaff[c.role]
    const raise = c.salary - cur.salary
    if (hired >= 2) break
    if (c.rating >= cur.rating + 6 && g.reputation >= c.minReputation && spare > c.buyout * 2 + 1 && lasting > raise + 1) {
      if (tryDo(() => hireKeyStaff(g, c.id))) { spare -= c.buyout; lasting -= raise; hired++ }
    }
  }
  if (nearMidfield && o.staff.raceTeam.pay !== 'premium') {
    const extra = o.staff.raceTeam.heads * headCost(o.staff.raceTeam) * 0.2
    if (spare > extra && lasting > extra * 2) setPay(g, 'raceTeam', 'premium')
  }
  return saving
}

const carGap = (g) => paceTable(g).find((r) => r.id === PLAYER).gap

// Spreads money evenly and picks A/B options at random. Watches this season's
// cash forecast but plans no further, and has no priorities: every facility
// and every department gets the same share, upgrades are small and safe, and
// drivers are whoever will sign at a fair price.
export function naive(g) {
  autoDrivers(g)
  for (const o of g.sponsors.offers.slice()) if (freeSlots(g, o.tier) > 0) tryDo(() => acceptOffer(g, o.id, 'balanced'))
  const areas = ['chassis', 'reliability', 'tyreCare']
  g.dev.repeat.aero = { area: 'aero', size: 'minor', approach: 'standard' }
  g.dev.repeat.mech = { area: g.teams[PLAYER].car.chassis < chassisCap(g) - 1 ? areas[g.round % 3] : areas[1 + (g.round % 2)], size: 'minor', approach: 'standard' }
  g.dev.nextYearShare = 25
  while (g.phase === 'season' && g.dev.nextYearShare < 100 && forecast(g, plannedSpendPerRound(g)) < 0) g.dev.nextYearShare += 25
  if (g.phase === 'season' && g.finance.cash < 0) tryDo(() => takeAdvance(g, Math.min(advanceLimit(g), 2 - g.finance.cash)))
  if (g.finance.austerity > 0) return
  const o = g.org
  const left = Math.max(1, roundsLeft(g))
  // Plans only to the end of the current season.
  let spare = Math.min(forecast(g, 0), g.finance.cash) - 5
  let lasting = Infinity
  // One facility after another in a fixed rotation, and the same few heads for every department.
  const ids = Object.keys(o.facilities)
  const next = ids[(g.season * 3 + Math.floor(g.round / 6)) % ids.length]
  const cost = FACILITY_COST[Math.min(4, o.facilities[next].level)]
  if (spare > cost && lasting > cost * 0.06 + 1 && tryDo(() => buildFacility(g, next))) { spare -= cost; lasting -= cost * 0.06 }
  for (const d of Object.keys(o.staff)) {
    const year = 3 * headCost(o.staff[d])
    if (spare > year * (left / ROUNDS) + 1 && lasting > year && tryDo(() => hire(g, d, 3))) { spare -= year * (left / ROUNDS); lasting -= year }
  }
}

export const MANAGERS = { competent, naive, reckless, steady, passive }

function playerPos(g) {
  if (!g.results.length) return g.lastStandings.indexOf(PLAYER) + 1
  return getStandings(g).constructors.findIndex((c) => c.id === PLAYER) + 1
}
