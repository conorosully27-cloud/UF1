// Milestone 2 check: money, development, HQ, sponsors, rivals and the season
// rollover. Mechanics are asserted directly; the scripted managers then play
// whole saves to show the economy and the world behave sensibly.
// Usage: node tests/m2-check.js [seasons]

import { newGame, startSeason, simulateRound, endSeason, effectiveCar, paceTable, PLAYER } from '../src/engine/game.js'
import { forecast, perRound, takeLoan, repayLoan, takeAdvance, advanceLimit, bankLimit, prizeThisSeason, COST_CAP } from '../src/engine/economy.js'
import { startProject, capacity, expectedGain, tighteningPlan, chassisCap } from '../src/engine/development.js'
import { buildFacility, hire, fire, hireKeyStaff } from '../src/engine/hq.js'
import { acceptOffer, endDeal, freeSlots, slotTiers } from '../src/engine/sponsors.js'
import { passive, steady, reckless } from './bot.js'

const SEASONS = Number(process.argv[2] || 12)
const setup = (seed, difficulty = 'normal') => newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false }, difficulty })

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const expectThrow = (fn) => { try { fn(); return false } catch { return true } }

function playSeason(g, manager) {
  manager(g)
  startSeason(g)
  while (g.phase === 'season') { manager(g); simulateRound(g) }
  const books = { ...g.finance.season, cash: g.finance.cash }
  const summary = endSeason(g)
  return { summary, books }
}

function hasBadNumber(x, path = '') {
  if (typeof x === 'number') return Number.isFinite(x) ? null : path
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { const bad = hasBadNumber(v, `${path}.${k}`); if (bad) return bad }
  return null
}

// ---- Mechanics ----
{
  const g = setup(11)
  const pr = perRound(g)
  const inc = Object.values(pr.income).reduce((s, v) => s + v, 0) * 16
  const cost = Object.values(pr.costs).reduce((s, v) => s + v, 0) * 16
  const backing = pr.income.backing * 16
  console.log(`Season 1 as it starts: income £${inc.toFixed(1)}m (of which driver backing £${backing.toFixed(1)}m), running costs £${cost.toFixed(1)}m before development and damage`)
  const net = inc - backing - cost - 5 - 2
  check('season 1 roughly breaks even without driver backing, after £5m of development and £2m of damage', Math.abs(net) < 8, `net £${net.toFixed(1)}m`)
  check('starting cash is £10m on Normal', g.finance.cash === 10)
  check('starting sponsors fill three slots', g.sponsors.deals.length === 3 && slotTiers(g).length === 3)

  const cap = capacity(g)
  check('capacity starts near 6.2 aero and 9.5 mechanical units a round, and the factory can keep up', cap.aero > 5.6 && cap.aero < 6.8 && cap.mech > 8.7 && cap.mech < 10.4 && cap.build > cap.aero + cap.mech, `aero ${cap.aero.toFixed(2)}, mech ${cap.mech.toFixed(2)}, build ${cap.build.toFixed(2)}`)

  const cash0 = g.finance.cash
  const aero0 = g.teams[PLAYER].car.aero
  startProject(g, { area: 'aero', size: 'minor', approach: 'standard' })
  check('starting a project costs money at once', g.finance.cash < cash0)
  startSeason(g)
  let fitted = -1
  let sawFresh = false
  for (let r = 0; r < 10 && fitted < 0; r++) {
    simulateRound(g)
    if (g.teams[PLAYER].car.aero > aero0) { fitted = r; sawFresh = g.dev.fresh.length > 0 && effectiveCar(g, PLAYER).aero < g.teams[PLAYER].car.aero }
  }
  check('a minor aero upgrade is designed, built and fitted within 10 rounds', fitted >= 0, `fitted in round ${fitted + 1}, gain ${(g.teams[PLAYER].car.aero - aero0).toFixed(2)}`)
  check('a new part runs below full value in its first race', sawFresh)
  simulateRound(g)
  check('and at full value after that', g.dev.fresh.length === 0)
  const e = expectedGain(g, 'aero', 'minor', 'aggressive')
  check('aggressive projects show a higher expectation and a dud risk', e.dud === 0.2 && e.expected > expectedGain(g, 'aero', 'minor', 'standard').expected)

  // Facilities
  const lvl = g.org.facilities.designOffice.level
  buildFacility(g, 'designOffice')
  check('a facility cannot be built twice at once', expectThrow(() => buildFacility(g, 'designOffice')))
  buildFacility(g, 'cfd')
  check('only two builds run at once', expectThrow(() => buildFacility(g, 'factory')))
  for (let r = 0; r < 4; r++) simulateRound(g)
  check('the Design Office finishes after 4 rounds', g.org.facilities.designOffice.level === lvl + 1 && !g.org.facilities.designOffice.building)

  // Staff
  const heads = g.org.staff.aero.heads
  hire(g, 'aero', 10)
  check('new hires are not productive at once', g.org.staff.aero.heads === heads)
  for (let r = 0; r < 3 && g.phase === 'season'; r++) simulateRound(g)
  check('and are after three rounds', g.org.staff.aero.heads === heads + 10)
  check('hiring is limited by the Design Office', expectThrow(() => hire(g, 'aero', 500)))
  const c0 = g.finance.cash
  fire(g, 'commercial', 2)
  check('redundancies cost severance', g.finance.cash < c0 && g.org.staff.commercial.heads === 13)

  // Borrowing
  takeLoan(g, 5)
  check('a bank loan adds cash and debt', g.finance.bank === 5)
  check('the bank has a limit', expectThrow(() => takeLoan(g, bankLimit(g))))
  repayLoan(g, 5)
  check('and can be repaid', g.finance.bank === 0)
  const prizeBefore = perRound(g).income.prize
  const lim = advanceLimit(g)
  takeAdvance(g, lim)
  check('a prize advance halves the remaining prize payments', Math.abs(perRound(g).income.prize - prizeBefore / 2) < 1e-6 && advanceLimit(g) < 1e-6)

  // Key staff
  const cand = g.staffMarket.find((c) => c.minReputation <= g.reputation && c.leave > 0)
  if (cand) {
    hireKeyStaff(g, cand.id)
    check('a poached hire starts gardening leave', g.org.arrivals.length === 1 && g.org.keyStaff[cand.role].name !== cand.name)
  }
  const tooGood = g.staffMarket.find((c) => c.minReputation > g.reputation)
  if (tooGood) check('top staff refuse a team with too little reputation', expectThrow(() => hireKeyStaff(g, tooGood.id)))

  // Season end
  while (g.phase === 'season') simulateRound(g)
  check('the rule change is announced at mid-season', g.tighteningKnown)
  const hard = tighteningPlan(g)
  const rivalBefore = { ...g.teams.mercedes.car }
  g.dev.banked.aero += 20
  endSeason(g)
  const w = g.winterReport
  check('the winter takes 11% off Aero if it is hardest hit, 5% if not', Math.abs(w.afterLoss.aero / w.before.aero - (hard === 'aero' ? 0.89 : 0.95)) < 1e-6)
  check('the parts package stops Chassis falling below its floor', w.afterLoss.chassis >= 45 - 1e-9)
  check('banked work is added after the loss', w.after.aero > w.afterLoss.aero)
  check('rivals are tightened and then develop', g.teams.mercedes.car.aero !== rivalBefore.aero && g.teams.mercedes.car.aero > rivalBefore.aero * 0.89)
  check('prize money in season 2 follows the final position', Math.abs(prizeThisSeason(g) - 56) < 1e-9 || g.lastStandings.indexOf(PLAYER) !== 11)
  check('the state holds no broken numbers', !hasBadNumber(g), hasBadNumber(g) || '')
}

// ---- Determinism ----
{
  const a = setup(21); const b = setup(21)
  for (let s = 0; s < 2; s++) { playSeason(a, steady); playSeason(b, steady) }
  check('same seed and same choices give the same save', JSON.stringify(a) === JSON.stringify(b))
}

// ---- Sponsor shapes ----
{
  const g = setup(31)
  startSeason(g)
  let took = false
  for (let r = 0; r < 16 && !took; r++) {
    simulateRound(g)
    if (r === 0) endDeal(g, g.sponsors.deals.find((d) => d.tier === 'partner').id)
    const o = g.sponsors.offers.find((x) => freeSlots(g, x.tier) > 0 && !x.demand)
    if (o) { acceptOffer(g, o.id, 'incentive'); took = true; const d = g.sponsors.deals.at(-1); check('an incentive deal pays a lower fee and a larger bonus', d.fee < d.value * 0.5 && d.bonus > d.value && !!d.target) }
  }
  check('a freed sponsor slot can be refilled within a season', took)
}

// ---- Crisis ----
{
  const g = setup(41)
  let crises = 0
  for (let s = 0; s < 6; s++) { playSeason(g, reckless); crises = g.finance.crises }
  check('a reckless manager hits a crisis and the save carries on', crises > 0 && g.season === 7, `${crises} crises, ${Math.round(g.finance.prizeShareLost * 100)}% of prize money signed away`)
  check('the crisis leaves no broken numbers', !hasBadNumber(g), hasBadNumber(g) || '')
}

// ---- Managers over a long save ----
function longSave(label, manager, seed) {
  const g = setup(seed)
  console.log(`\n${label}`)
  console.log('  Yr  Pos  Pts   Cash   Income  Costs  CapSpend  Aero  Chas  Rel  Tyre  Gap(s)  Staff  FacLv  Rep  Sponsors')
  const rows = []
  for (let s = 0; s < SEASONS; s++) {
    const { summary, books } = playSeason(g, manager)
    const sum = (x) => Object.values(x).reduce((t, v) => t + v, 0)
    const car = g.teams[PLAYER].car
    const staff = Object.values(g.org.staff).reduce((t, d) => t + d.heads, 0)
    const fac = Object.values(g.org.facilities).reduce((t, f) => t + f.level, 0)
    const gap = paceTable(g).find((r) => r.id === PLAYER).gap
    const sponsors = books.income.sponsors + books.income.bonuses
    rows.push({ pos: summary.playerPos, cash: books.cash, gap })
    console.log(`  ${String(s + 1).padStart(2)}  ${String(summary.playerPos).padStart(3)} ${String(summary.playerPoints).padStart(4)}  ${books.cash.toFixed(1).padStart(6)}  ${sum(books.income).toFixed(1).padStart(6)} ${sum(books.costs).toFixed(1).padStart(6)}  ${books.cap.toFixed(1).padStart(7)}  ${car.aero.toFixed(1)}  ${car.chassis.toFixed(1)} ${car.reliability.toFixed(0).padStart(4)}  ${car.tyreCare.toFixed(0).padStart(4)}  ${gap.toFixed(2).padStart(6)}  ${String(staff).padStart(5)}  ${String(fac).padStart(5)}  ${g.reputation.toFixed(0).padStart(3)}  ${sponsors.toFixed(1).padStart(7)}`)
  }
  check(`${label}: no broken numbers`, !hasBadNumber(g), hasBadNumber(g) || '')
  return { g, rows }
}

const idle = longSave('Passive manager (does nothing)', passive, 51)
const st = longSave('Steady manager (sensible, simple)', steady, 51)
check('the steady manager ends higher up than the passive one', st.rows.at(-1).pos < idle.rows.at(-1).pos)
check('the steady manager closes the gap to the front', st.rows.at(-1).gap < st.rows[0].gap)
check('the steady manager never needs rescuing', st.g.finance.crises === 0)
check('the steady manager stays under the cost cap', st.g.finance.history.every((h) => h.cap <= COST_CAP + 1e-6))

// ---- World health with no player influence ----
{
  const g = setup(61)
  const champs = []
  let minGap = 9; let maxGap = 0
  const start = Object.fromEntries(Object.values(g.teams).filter((t) => !t.isPlayer).map((t) => [t.id, t.car.aero + t.car.chassis]))
  for (let s = 0; s < 30; s++) {
    const { summary } = playSeason(g, passive)
    champs.push(summary.constructors[0].id)
    const rivals = paceTable(g).filter((r) => r.id !== PLAYER)
    const spread = rivals.at(-1).gap - rivals[0].gap
    minGap = Math.min(minGap, spread); maxGap = Math.max(maxGap, spread)
  }
  const changes = champs.filter((c, i) => i > 0 && c !== champs[i - 1]).length
  const drift = Object.values(g.teams).filter((t) => !t.isPlayer).map((t) => `${t.name} ${(t.car.aero + t.car.chassis - start[t.id] >= 0 ? '+' : '')}${(t.car.aero + t.car.chassis - start[t.id]).toFixed(0)}`)
  console.log(`\nRival world over 30 seasons: front-to-back gap ${minGap.toFixed(2)}-${maxGap.toFixed(2)} s, ${new Set(champs).size} different champion teams, title changed hands ${changes} times`)
  console.log(`  Aero + Chassis change after 30 seasons: ${drift.join(', ')}`)
  check('the rival field stays between 0.8 and 2.2 s from front to back', minGap > 0.8 && maxGap < 2.2)
  check('more than one team wins the title in 30 seasons', new Set(champs).size > 1)
  check('30 seasons leave no broken numbers', !hasBadNumber(g), hasBadNumber(g) || '')
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
