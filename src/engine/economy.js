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
  costs: { workforce: 0, keyStaff: 0, drivers: 0, powerUnit: 0, raceOps: 0, carBuild: 0, facilities: 0, development: 0, damage: 0, interest: 0, other: 0 },
  cap: 0,
})

export function initialFinance(difficulty) {
  return {
    cash: DIFFICULTY[difficulty].cash, bank: 0, advancePerRound: 0, prizeShareLost: 0,
    overdraftRounds: 0, austerity: 0, crises: 0, season: blankSeason(), lastRound: null, history: [],
  }
}

export const canSpend = (game, amount) => game.finance.cash - amount >= OVERDRAFT

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

export function bankLimit(game) {
  return 5 + game.reputation * 0.5
}

export function bankRate(game) {
  return 0.14 - game.reputation * 0.0006
}

// Recurring income and costs for one round, as things stand. `ahead` looks
// that many rounds into the future so facility instalments drop off on time.
export function perRound(game, ahead = 0) {
  const o = game.org
  const f = game.finance
  const team = game.teams[PLAYER]
  const supplier = game.suppliers[team.supplier]
  const income = {
    prize: Math.max(0, prizeThisSeason(game) / ROUNDS - f.advancePerRound),
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
    interest: (f.bank * bankRate(game)) / ROUNDS,
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

export function takeLoan(game, amount) {
  if (!(amount > 0)) throw new Error('Enter an amount')
  if (game.finance.bank + amount > bankLimit(game) + 1e-9) throw new Error(`The bank will lend up to £${bankLimit(game).toFixed(1)}m in total`)
  game.finance.bank += amount
  game.finance.cash += amount
}

export function repayLoan(game, amount) {
  const pay = Math.min(amount, game.finance.bank)
  if (!(pay > 0)) throw new Error('Nothing to repay')
  if (!canSpend(game, pay)) throw new Error('Not enough cash to repay that')
  game.finance.bank -= pay
  game.finance.cash -= pay
}

export function advanceLimit(game) {
  const n = roundsLeft(game)
  if (game.phase !== 'season' || n === 0) return 0
  return Math.max(0, (prizeThisSeason(game) / ROUNDS) * 0.5 - game.finance.advancePerRound) * n
}

// Take part of the remaining prize payments now, for a 10% discount.
export function takeAdvance(game, amount) {
  if (!(amount > 0)) throw new Error('Enter an amount')
  if (amount > advanceLimit(game) + 1e-9) throw new Error(`Up to £${advanceLimit(game).toFixed(1)}m of prize money can be advanced`)
  game.finance.advancePerRound += amount / roundsLeft(game)
  earn(game, 'other', amount * 0.9)
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
  f.bank = 0
  f.overdraftRounds = 0
  f.prizeShareLost = clamp(f.prizeShareLost + 0.05, 0, 0.25)
  f.austerity = ROUNDS
  game.reputation = Math.max(0, game.reputation - 10)
  game.confidence = 40
  // Forced sale: the highest-paid key staff member leaves and a deputy steps up.
  const [role, top] = Object.entries(game.org.keyStaff).sort((a, b) => b[1].salary - a[1].salary)[0]
  const deputy = { name: staffName(streamRng(game.seed, 'crisis', f.crises)), rating: 45, salary: keyStaffSalary(45) }
  game.org.keyStaff[role] = deputy
  game.news.push(`Crisis: an investor has cleared the team's debts for a permanent 5% of prize money. ${top.name} has been sold on, building and hiring are frozen for ${ROUNDS} rounds, and reputation has fallen`)
}

export function closeSeasonBooks(game) {
  const f = game.finance
  const sum = (x) => Object.values(x).reduce((s, v) => s + v, 0)
  f.history.push({ season: game.season, income: f.season.income, costs: f.season.costs, totalIncome: sum(f.season.income), totalCosts: sum(f.season.costs), cap: f.season.cap, cashEnd: f.cash })
  f.season = blankSeason()
  f.advancePerRound = 0
}
