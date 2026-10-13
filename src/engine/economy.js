// Money: recurring income and costs, the cash forecast, borrowing, the cost
// cap and the crisis that replaces game over (design sections 4 and 5.7).

import { PLAYER, ROUNDS, clamp } from './core.js'
import { HEAD_COST, PAY, TUNNEL_RENT, ACADEMY_COST, facilityUpkeep, staffName, keyStaffSalary } from './org.js'
import { PARTS_PACKAGE_PRICE } from './data/suppliers.js'
import { streamRng } from './rng.js'

export const PRIZE = [140, 128, 117, 107, 98, 90, 83, 77, 71, 66, 61, 56] // £m by last season's position
export const NEW_ENTRANT = 36
export const OVERDRAFT = -5
export const COST_CAP = 150
export const RACE_OPS = 0.9 // £m per round
export const CAR_BUILD = 7 // £m per season
export const DIFFICULTY = {
  easy: { cash: 20, owner: [20, 20, 20, 20, 12, 6], aiDev: 0.85 },
  normal: { cash: 10, owner: [20, 12, 6], aiDev: 1 },
  hard: { cash: 5, owner: [20, 12, 6], aiDev: 1.15 },
}

const blankSeason = () => ({
  income: { prize: 0, sponsors: 0, backing: 0, merchandise: 0, owner: 0, bonuses: 0, other: 0 },
  costs: { workforce: 0, keyStaff: 0, drivers: 0, powerUnit: 0, raceOps: 0, carBuild: 0, facilities: 0, development: 0, damage: 0, other: 0 },
  cap: 0,
})

export function initialFinance(difficulty) {
  return {
    cash: DIFFICULTY[difficulty].cash, prizeShareLost: 0,
    overdraftRounds: 0, austerity: 0, crises: 0, season: blankSeason(), lastRound: null, history: [],
  }
}

// There is no borrowing. Cash can dip into a small overdraft, but a team in
// the red cannot start any new spending until it has climbed back above zero.
export const inOverdraft = (game) => game.finance.cash < 0
export const canSpend = (game, amount) => !inOverdraft(game) && game.finance.cash - amount >= OVERDRAFT

export function spend(game, category, amount, countsForCap = false) {
  game.finance.cash -= amount
  game.finance.season.costs[category] += amount
  if (countsForCap) game.finance.season.cap += amount
}

export function earn(game, category, amount) {
  game.finance.cash += amount
  game.finance.season.income[category] += amount
}

export function prizeThisSeason(game) {
  const pos = game.lastStandings.indexOf(PLAYER) + 1
  const gross = game.season === 1 ? NEW_ENTRANT : PRIZE[pos - 1]
  return gross * (1 - game.finance.prizeShareLost)
}

export function ownerFunding(game) {
  return DIFFICULTY[game.difficulty].owner[game.season - 1] || 0
}

export function merchandise(game) {
  return (0.3 + Math.pow(game.reputation, 1.5) * 0.022) * (1 + 0.06 * game.org.facilities.commercial.level)
}

export function headCost(dept) {
  return HEAD_COST * PAY[dept.pay].cost * (0.6 + dept.skill / 125)
}

const deptHeads = (dept) => dept.heads + dept.incoming.reduce((s, x) => s + x.heads, 0)

// Recurring income and costs for one round, as things stand. `ahead` looks
// that many rounds into the future so facility instalments drop off on time.
export function perRound(game, ahead = 0) {
  const o = game.org
  const f = game.finance
  const team = game.teams[PLAYER]
  const supplier = game.suppliers[team.supplier]
  const income = {
    prize: prizeThisSeason(game) / ROUNDS,
    sponsors: game.sponsors.deals.reduce((s, d) => s + d.fee, 0) / ROUNDS,
    backing: team.drivers.reduce((s, id) => s + (game.drivers[id].contract?.backing || 0), 0) / ROUNDS,
    merchandise: merchandise(game) / ROUNDS,
    owner: ownerFunding(game) / ROUNDS,
  }
  let workforce = 0
  let capWorkforce = 0
  for (const [id, dept] of Object.entries(o.staff)) {
    const c = (deptHeads(dept) * headCost(dept)) / ROUNDS
    workforce += c
    if (id !== 'commercial') capWorkforce += c
  }
  let keyStaff = 0
  let capKey = 0
  for (const [role, k] of Object.entries(o.keyStaff)) {
    keyStaff += k.salary / ROUNDS
    if (role !== 'commercialDirector') capKey += k.salary / ROUNDS
  }
  const driverIds = [...team.drivers, ...(game.reserve ? [game.reserve] : [])]
  let building = 0
  for (const fac of Object.values(o.facilities)) if (fac.building && fac.building.roundsLeft > ahead) building += fac.building.perRound
  const juniors = Object.values(game.drivers).filter((d) => d.academy && !d.teamId).length
  const costs = {
    workforce, keyStaff,
    drivers: driverIds.reduce((s, id) => s + (game.drivers[id].contract?.salary || 0), 0) / ROUNDS,
    powerUnit: (supplier.price + (game.partsPackage ? PARTS_PACKAGE_PRICE : 0)) / ROUNDS,
    raceOps: RACE_OPS,
    carBuild: CAR_BUILD / ROUNDS,
    facilities: (facilityUpkeep(o) + juniors * ACADEMY_COST) / ROUNDS + (o.facilities.windTunnel.level === 0 ? TUNNEL_RENT : 0) + building,
  }
  const sum = (x) => Object.values(x).reduce((s, v) => s + v, 0)
  return { income, costs, net: sum(income) - sum(costs), cap: capWorkforce + capKey + RACE_OPS + CAR_BUILD / ROUNDS }
}

export function roundsLeft(game) {
  return game.phase === 'seasonEnd' ? 0 : ROUNDS - game.round
}

// Cash at season end if nothing changes. `planned` is what auto-repeating
// upgrades will cost per round. Excludes sponsor bonuses and crash damage.
export function forecast(game, planned = 0) {
  let cash = game.finance.cash
  for (let i = 0; i < roundsLeft(game); i++) cash += perRound(game, i).net - planned
  return cash
}

export function projectedCapSpend(game) {
  return game.finance.season.cap + perRound(game).cap * roundsLeft(game)
}

export const capRoom = (game) => COST_CAP - projectedCapSpend(game)

// Applies one round of money after the race.
export function applyRoundFinance(game, result) {
  const pr = perRound(game)
  for (const [k, v] of Object.entries(pr.income)) earn(game, k, v)
  for (const [k, v] of Object.entries(pr.costs)) spend(game, k, v)
  game.finance.season.cap += pr.cap
  let damage = 0
  for (const id of Object.keys(result.detail)) if (result.race.find((r) => r.id === id)?.teamId === PLAYER) damage += result.detail[id].damage || 0
  if (game.insured) damage *= 0.3
  if (damage > 0) spend(game, 'damage', damage, true)
  game.finance.lastRound = { income: pr.income, costs: { ...pr.costs, damage }, net: pr.net - damage }
  if (game.finance.austerity > 0) game.finance.austerity--
}

// Saves from before borrowing was removed: an outstanding bank loan, and any
// prize money taken early, are settled from cash.
export function settleOldBorrowing(game) {
  const f = game.finance
  const owed = (f.bank || 0) + (f.advancePerRound || 0) * roundsLeft(game)
  delete f.bank
  delete f.advancePerRound
  if (owed > 0.005) {
    f.cash -= owed
    game.news.push(`Borrowing has been withdrawn: £${owed.toFixed(1)}m of loans and advances has been settled from cash`)
  }
  return owed
}

// Cash below the overdraft limit for two rounds running, or (from milestone 3)
// owner confidence at zero, brings in an investor instead of ending the game.
export function checkCrisis(game) {
  const f = game.finance
  f.overdraftRounds = f.cash < OVERDRAFT ? f.overdraftRounds + 1 : 0
  if (f.overdraftRounds >= 2) triggerCrisis(game, 'cash')
  else if (game.confidence <= 0) triggerCrisis(game, 'confidence')
}

export function triggerCrisis(game, reason = 'confidence') {
  const f = game.finance
  f.crises++
  f.crisisLog = [...(f.crisisLog || []), { season: game.season, round: game.round, reason }]
  f.cash = Math.max(f.cash, 0) + 3
  f.overdraftRounds = 0
  f.prizeShareLost = clamp(f.prizeShareLost + 0.05, 0, 0.25)
  f.austerity = ROUNDS
  game.reputation = Math.max(0, game.reputation - 10)
  game.confidence = 40
  // Forced sale: the highest-paid key staff member leaves and a deputy steps up.
  const [role, top] = Object.entries(game.org.keyStaff).sort((a, b) => b[1].salary - a[1].salary)[0]
  const deputy = { name: staffName(streamRng(game.seed, 'crisis', f.crises)), rating: 45, salary: keyStaffSalary(45) }
  game.org.keyStaff[role] = deputy
  const cut = restructure(game)
  game.news.push(`Crisis: an investor has cleared the team's debts for a permanent 5% of prize money. ${top.name} has been sold on, ${cut ? `${cut} staff have been let go so the team can pay its way, ` : ''}building and hiring are frozen for ${ROUNDS} rounds, and reputation has fallen`)
}

// The investor's restructuring: the most expensive departments are cut,
// newest hires first and without severance, until the team's running costs fit
// its income again. A rescue clears the debt, but it cannot keep an
// unaffordable team going, so a crisis is never a way to fund one.
export function restructure(game) {
  const o = game.org
  let cut = 0
  for (let guard = 0; guard < 1000 && perRound(game).net < 0.05; guard++) {
    const pick = Object.values(o.staff).filter((d) => deptHeads(d) > 5).sort((a, b) => deptHeads(b) * headCost(b) - deptHeads(a) * headCost(a))[0]
    if (!pick) break
    const last = pick.incoming[pick.incoming.length - 1]
    if (last) { last.heads--; if (last.heads <= 0) pick.incoming.pop() } else pick.heads--
    cut++
  }
  return cut
}

export function closeSeasonBooks(game) {
  const f = game.finance
  const sum = (x) => Object.values(x).reduce((s, v) => s + v, 0)
  f.history.push({ season: game.season, income: f.season.income, costs: f.season.costs, totalIncome: sum(f.season.income), totalCosts: sum(f.season.costs), cap: f.season.cap, cashEnd: f.cash })
  f.season = blankSeason()
}
