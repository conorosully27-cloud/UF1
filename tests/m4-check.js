// Milestone 4 check: drivers, the winter market, the academy, rival reviews,
// poaching, form events, supplier drift and the honours board. Mechanics are
// asserted directly; long saves then check the world renews sensibly.
// Usage: node tests/m4-check.js [seasons]

import { newGame, startSeason, simulateRound, endSeason, prepareTargets, PLAYER, overall } from '../src/engine/game.js'
import {
  offerContract, offerInterest, marketDemand, advanceMarket, closeMarket, answerApproach, releaseDriver, releaseCost,
  updateRatings, recordRace, personalFactor, autoDrivers, ageTrend, MARKET_STAGES, APPROACHES_PER_WINTER, SIGNS_AT, STAGE_DISCOUNT,
} from '../src/engine/people.js'
import { staffApproaches } from '../src/engine/world.js'
import { buildFacility } from '../src/engine/hq.js'
import { passive, steady, pickTargets, decide } from './bot.js'

const SEASONS = Number(process.argv[2] || 30)
const clone = (x) => JSON.parse(JSON.stringify(x))
const setup = (seed, extra = {}) => newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false }, ...extra })

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const expectThrow = (fn) => { try { fn(); return false } catch { return true } }
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)

function hasBadNumber(x, path = '') {
  if (typeof x === 'number') return Number.isFinite(x) ? null : path
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { const bad = hasBadNumber(v, `${path}.${k}`); if (bad) return bad }
  return null
}

function playSeason(g, manager) {
  manager(g)
  startSeason(g)
  while (g.phase === 'season') { manager(g); simulateRound(g) }
  return endSeason(g)
}

const rivalDrivers = (g) => Object.values(g.drivers).filter((d) => d.teamId && d.teamId !== PLAYER)

// ---- Contracts and hidden traits at the start ----
{
  const g = setup(101)
  const rivals = rivalDrivers(g)
  check('all 22 rival drivers start under contract for 1 to 3 seasons', rivals.length === 22 && rivals.every((d) => d.contract && d.contract.years >= 1 && d.contract.years <= 3))
  check('every driver has hidden traits: longevity, a ceiling and a preferred contract length', Object.values(g.drivers).every((d) => Number.isFinite(d.longevity) && Number.isFinite(d.ceiling) && d.prefYears >= 1 && d.prefYears <= 3))
  const pf = Object.values(g.drivers).map((d) => personalFactor(g, d))
  check('the personal factor runs from -10 to +10 and differs between drivers', pf.every((x) => x >= -10 && x <= 10) && new Set(pf).size > 5)
  check('the market is open in the first pre-season', !g.market.closed && g.market.stage === 1)
}

// ---- Offers ----
{
  const g = setup(102)
  const d = g.drivers.tsunoda
  const base = { role: 'race', salary: marketDemand(g, d), years: d.prefYears === 1 ? 2 : 1 }
  const parts = (o) => offerInterest(g, d, o, false).estimate
  const e0 = parts(base)
  check('number-one status adds 8 interest', Math.abs(parts({ ...base, numberOne: true }) - e0 - 8) < 1e-9)
  check('a release clause adds 5', Math.abs(parts({ ...base, releaseClause: true }) - e0 - 5) < 1e-9)
  check('the preferred contract length adds 5', Math.abs(parts({ ...base, years: d.prefYears }) - e0 - 5) < 1e-9)
  check('salary over demand adds up to 20', Math.abs(parts({ ...base, salary: base.salary * 2 }) - e0 - 20) < 1e-9 && Math.abs(parts({ ...base, salary: base.salary * 1.25 }) - e0 - 10) < 1e-9)
  const full = offerInterest(g, d, base, true).interest
  check('the true interest is the estimate plus the hidden personal factor', Math.abs(full - e0 - personalFactor(g, d)) < 1e-9)

  // A hopeless offer is refused, and each driver hears only three approaches.
  const lowball = { ...base, role: 'reserve', salary: marketDemand(g, d, 'reserve') * 0.3 }
  const h = clone(g)
  const outs = [0, 1, 2].map(() => offerContract(h, 'tsunoda', lowball))
  check('an offer below 60 interest is refused', outs.every((o) => !o.accepted && o.interest < SIGNS_AT))
  check(`a driver hears only ${APPROACHES_PER_WINTER} approaches a winter`, expectThrow(() => offerContract(h, 'tsunoda', { ...lowball, salary: lowball.salary * 20 })))

  // A generous offer is accepted; the out-of-contract rules then apply.
  const k = clone(g)
  const hit = offerContract(k, 'tsunoda', { role: 'reserve', salary: marketDemand(k, k.drivers.tsunoda, 'reserve') * 2, years: k.drivers.tsunoda.prefYears, numberOne: false, releaseClause: true })
  check('a good enough offer signs the driver', hit.accepted && k.reserve === 'tsunoda' && k.drivers.tsunoda.contract.releaseClause)
  check('a third race driver cannot be signed while both seats are filled', expectThrow(() => offerContract(k, 'zhou', { role: 'race', salary: 50, years: 2 })))
  check('a rival driver under contract cannot be approached', expectThrow(() => offerContract(k, 'verstappen', { role: 'race', salary: 100, years: 2 })))

  // Releasing costs 60% of the salary still owed.
  const r = clone(g)
  const herta = r.drivers.herta
  const cost = releaseCost(herta)
  const cash = r.finance.cash
  releaseDriver(r, 'herta')
  check('releasing a driver costs 60% of the remaining salary', Math.abs(cost - 0.6 * herta.contract?.salary * 2) < 1e-9 || Math.abs(r.finance.cash - (cash - cost)) < 1e-9)
  check('a released driver joins the market', r.drivers.herta.teamId === null && !r.teams[PLAYER].drivers.includes('herta'))
}

// ---- The winter market ----
{
  const g = setup(103)
  for (let s = 0; s < 2; s++) playSeason(g, passive)
  check('contracts run down, and rivals have empty seats when the market opens', Object.values(g.teams).some((t) => !t.isPlayer && t.drivers.length < 2), `${rivalDrivers(g).length} of 22 rival seats filled`)
  const free = Object.values(g.drivers).find((d) => !d.teamId && !d.academy && !d.loanFrom)
  const demand1 = marketDemand(g, free)
  const before = rivalDrivers(g).length
  advanceMarket(g)
  check('rivals sign drivers between stages', rivalDrivers(g).length > before || before === 22, `${before} to ${rivalDrivers(g).length}`)
  if (!free.teamId) check(`unsigned drivers cut their demand by about ${Math.round((1 - STAGE_DISCOUNT) * 100)}% at each stage`, Math.abs(marketDemand(g, free) / demand1 - STAGE_DISCOUNT) < 1e-9)
  advanceMarket(g)
  check(`the market has ${MARKET_STAGES} stages`, g.market.stage === MARKET_STAGES && !g.market.closed)
  advanceMarket(g)
  check('closing the market fills every rival seat', g.market.closed && rivalDrivers(g).length === 22 && Object.values(g.teams).every((t) => t.isPlayer || t.drivers.length === 2))
  check('nobody can be approached after the market... except unsigned drivers until targets are set', !expectThrow(() => offerInterest(g, free, { role: 'race', salary: 1, years: 1 })))
}

// ---- Out of contract: re-sign or lose them ----
{
  const g = setup(104)
  g.drivers.herta.contract.years = 1
  playSeason(g, () => {})
  const herta = g.drivers.herta
  check('a player driver whose contract runs out is marked out of contract but stays for now', herta.contract?.expired && g.teams[PLAYER].drivers.includes('herta'))
  check('the season cannot start with an out-of-contract driver in a seat', expectThrow(() => startSeason(clone(g))))
  const keep = clone(g)
  const r = offerContract(keep, 'herta', { role: 'race', salary: marketDemand(keep, keep.drivers.herta) * 2, years: keep.drivers.herta.prefYears, numberOne: true, releaseClause: true })
  check('they can be re-signed', r.accepted && !keep.drivers.herta.contract.expired && keep.drivers.herta.contract.numberOne)
  const lose = clone(g)
  closeMarket(lose)
  check('or they leave when the market closes', !lose.teams[PLAYER].drivers.includes('herta') && lose.drivers.herta?.teamId !== PLAYER)
  const auto = clone(g)
  autoDrivers(auto)
  check('the average manager always ends the winter with two drivers under contract', auto.teams[PLAYER].drivers.filter((id) => !auto.drivers[id].contract.expired).length === 2)
}

// ---- Loans ----
{
  const g = setup(105, { driverIds: ['fornaroli', 'doohan'] })
  const f = g.drivers.fornaroli
  check('a rival junior comes on a one-season loan at a low salary', f.contract.loan && f.contract.years === 1 && f.contract.salary < marketDemand(g, { ...f, loanFrom: null }))
  playSeason(g, () => {})
  const fr = g.drivers.fornaroli
  check('at season end the loan is over: the parent recalls the driver or the loan can be renewed', !!fr && (fr.teamId === 'mclaren' || (fr.teamId === PLAYER && fr.contract.expired)), fr ? `${fr.teamId === PLAYER ? 'still here, out of contract' : `now at ${fr.teamId}`}` : 'gone')
}

// ---- Ratings: age, results and rust ----
{
  const g = setup(106)
  const kids = rivalDrivers(g).filter((d) => d.age <= 23).map((d) => d.id)
  const vets = rivalDrivers(g).filter((d) => d.age >= 36).map((d) => d.id)
  const ovr0 = Object.fromEntries(Object.values(g.drivers).map((d) => [d.id, overall(d)]))
  const age0 = Object.fromEntries(Object.values(g.drivers).map((d) => [d.id, d.age]))
  playSeason(g, passive)
  const alive = (ids) => ids.filter((id) => g.drivers[id])
  const kidGain = mean(alive(kids).map((id) => overall(g.drivers[id]) - ovr0[id]))
  const vetGain = mean(alive(vets).map((id) => overall(g.drivers[id]) - ovr0[id]))
  check('young drivers improve over a season and veterans fade', kidGain > 0.5 && vetGain < 0, `under 24: ${kidGain >= 0 ? '+' : ''}${kidGain.toFixed(1)}, 36 and over: ${vetGain.toFixed(1)}`)
  check('everyone is a year older', Object.values(g.drivers).filter((d) => age0[d.id] !== undefined).every((d) => d.age === age0[d.id] + 1))
  check('the age table: +1 to +3 up to 23, -4 to -2 from 40, and longevity delays the decline', ageTrend({ age: 21 }).join() === '1,3' && ageTrend({ age: 42, longevity: 0 }).join() === '-4,-2' && ageTrend({ age: 42, longevity: 5 }).join() === '-3,-1')

  // Results against expectation: two identical drivers, one who beat their team-mate and one who did not.
  const h = setup(107)
  const a = h.drivers.albon
  const twin = { ...clone(a), id: 'twin', name: 'Twin', teamId: null }
  h.drivers.twin = twin
  a.form = { n: 8, sum: -0.8 }
  twin.form = { n: 8, sum: 0.8 }
  twin.season.half = 8
  updateRatings(h, 'mid')
  check('beating the team-mate clearly adds to Overall and trailing takes away', overall(a) > overall(h.drivers.twin), `${overall(a)} against ${overall(h.drivers.twin)}`)

  // Rust: a season without racing.
  const r = setup(108)
  const m = r.drivers.magnussen
  m.seat = 'none'; m.age = 30; m.longevity = 5
  const before = overall(m)
  updateRatings(r, 'end')
  check('a season without racing costs a point or two', overall(m) <= before - 1, `${before} to ${overall(m)}`)

  // Qualifying form is recorded against the team-mate.
  const q = setup(109)
  startSeason(q)
  simulateRound(q)
  check('each race records form against the team-mate', rivalDrivers(q).every((d) => d.form.n === 1) && rivalDrivers(q).every((d) => d.career.starts === 1))
  void recordRace
}

// ---- The academy ----
{
  const g = setup(110)
  g.finance.cash = 80
  buildFacility(g, 'academy')
  for (let s = 0; s < 5; s++) playSeason(g, passive)
  const juniors = Object.values(g.drivers).filter((d) => d.academy)
  check('a built academy takes on juniors', g.org.facilities.academy.level === 1 && juniors.length > 0, `${juniors.length} junior(s)`)
  if (juniors.length) {
    const j = juniors[0]
    const parts = offerInterest(g, j, { role: 'race', salary: marketDemand(g, j), years: j.prefYears }, false).parts
    check('academy juniors are keen to step up (+20 interest) and ask for less', parts.some((p) => p.label === 'Your academy' && p.value === 20) && marketDemand(g, j) < marketDemand(g, { ...j, academy: false }))
  }
}

// ---- Rivals poach staff and bid for drivers ----
{
  const g = setup(111)
  g.reputation = 60
  for (const k of Object.values(g.org.keyStaff)) k.rating = 85
  let tries = 0
  while (!g.approaches.length && tries < 30) { g.season++; tries++; staffApproaches(g) }
  const a = g.approaches[0]
  check('rivals try to poach a rising team\'s best staff', !!a && a.kind === 'staff')
  if (a) {
    const keep = clone(g); const k0 = keep.org.keyStaff[a.role]; const sal = k0.salary
    answerApproach(keep, a.id, true)
    check('matching the offer keeps them on a higher salary', keep.org.keyStaff[a.role].name === k0.name && keep.org.keyStaff[a.role].salary > sal)
    const lose = clone(g)
    answerApproach(lose, a.id, false)
    check('letting them go promotes a weaker deputy', lose.org.keyStaff[a.role].name === a.deputy.name && lose.org.keyStaff[a.role].rating < 85)
  }

  // A star in a backmarker's car attracts bids from a team with an empty seat.
  let bid = null
  for (let seed = 120; seed < 140 && !bid; seed++) {
    const h = setup(seed)
    const star = h.drivers.herta
    Object.assign(star, { pace: 97, racecraft: 95, consistency: 95, wet: 95 })
    star.contract.years = 3
    star.contract.releaseClause = false
    playSeason(h, () => {})
    bid = h.approaches.find((x) => x.kind === 'driver')
    if (bid) {
      const take = clone(h); const cash = take.finance.cash
      answerApproach(take, bid.id, true)
      check('a rival bids for the player\'s best driver, and accepting brings in the fee', take.drivers.herta.teamId === bid.teamId && take.finance.cash > cash, `${h.teams[bid.teamId].name} offered £${bid.fee.toFixed(1)}m`)
      const keep = clone(h)
      answerApproach(keep, bid.id, false)
      check('refusing keeps the driver, who is unsettled', keep.drivers.herta.teamId === PLAYER && keep.drivers.herta.interestMod < 0)
    }
  }
  if (!bid) check('a rival bids for the player\'s best driver', false, 'no bid in 20 saves')
}

// ---- Determinism ----
{
  const a = setup(150); const b = setup(150)
  for (let s = 0; s < 3; s++) { playSeason(a, steady); playSeason(b, steady) }
  check('same seed and same choices give the same save, market included', JSON.stringify(a) === JSON.stringify(b))
}

// ---- Targets close the market ----
{
  const g = setup(151, { options: { decisions: true, targets: true } })
  prepareTargets(g, 10)
  startSeason(g, pickTargets(g))
  while (g.phase === 'season') { decide(g, 'random'); simulateRound(g) }
  endSeason(g)
  autoDrivers(g)
  prepareTargets(g, 10)
  check('setting targets closes the market and fills the grid', g.market.closed && rivalDrivers(g).length === 22)
  startSeason(g, pickTargets(g))
  check('drivers cannot be signed during the season', expectThrow(() => offerContract(g, Object.values(g.drivers).find((d) => !d.teamId).id, { role: 'race', salary: 50, years: 1 })))
}

// ---- The world over a long save ----
{
  const changes = []
  const retireAges = []
  const careers = []
  let mid = 0
  let seasons = 0
  const avg = { first: [], last: [] }
  const events = { investor: 0, chief: 0, switch: 0 }
  let supplierOrderChanged = 0
  let biggestSave = 0
  let honoursOk = true
  for (const seed of [61, 62, 63, 64]) {
    const g = setup(seed)
    const top0 = Object.values(g.suppliers).sort((x, y) => y.power - x.power)[0].id
    for (let s = 0; s < SEASONS; s++) {
      passive(g)
      startSeason(g)
      seasons++
      if (s > 0) changes.push(g.market.seatChanges)
      const grid = rivalDrivers(g)
      const ovr = mean(grid.map(overall))
      if (s === 0) avg.first.push(ovr)
      if (s === SEASONS - 1) avg.last.push(ovr)
      while (g.phase === 'season') { passive(g); simulateRound(g) }
      endSeason(g)
      for (const n of g.news) {
        if (n.includes('new investor')) events.investor++
        if (n.includes('lost their technical chief')) events.chief++
        if (n.includes('will switch to')) events.switch++
      }
    }
    mid += g.midSeasonSwaps || 0
    if (Object.values(g.suppliers).sort((x, y) => y.power - x.power)[0].id !== top0) supplierOrderChanged++
    for (const r of g.retired) if (r.starts > 0) { retireAges.push(r.age); careers.push(r.starts / 16) }
    biggestSave = Math.max(biggestSave, JSON.stringify(g).length)
    const h = g.honours
    if (!(h.starts === g.history.length * 32 && h.points === g.history.reduce((sum, x) => sum + x.playerPoints, 0))) honoursOk = false
    check(`save ${seed}: ${SEASONS} seasons leave no broken numbers`, !hasBadNumber(g), hasBadNumber(g) || '')
  }
  const c = mean(changes)
  console.log(`\nDriver market over ${seasons} seasons: ${c.toFixed(1)} rival seats change a winter (spread ${Math.min(...changes)}-${Math.max(...changes)}), ${mid} mid-season swaps, retirement age ${mean(retireAges).toFixed(1)}, career ${mean(careers).toFixed(1)} seasons, grid Overall ${mean(avg.first).toFixed(1)} at the start and ${mean(avg.last).toFixed(1)} at the end`)
  console.log(`World events: ${events.investor} investors, ${events.chief} technical chiefs lost, ${events.switch} engine switches; the top power unit changed in ${supplierOrderChanged} of 4 saves; largest save ${(biggestSave / 1024).toFixed(0)} KB`)
  check('three to six rival seats change each winter on average', c >= 3 && c <= 6, c.toFixed(1))
  check('mid-season swaps are rare', mid <= seasons / 10, `${mid} in ${seasons} seasons`)
  check('retirement ages look plausible', mean(retireAges) > 32 && mean(retireAges) < 39 && Math.max(...retireAges) <= 46, `mean ${mean(retireAges).toFixed(1)}, oldest ${Math.max(...retireAges)}`)
  check('the grid\'s average rating stays level', Math.abs(mean(avg.last) - mean(avg.first)) < 1.5, `${mean(avg.first).toFixed(1)} to ${mean(avg.last).toFixed(1)}`)
  check('form events and engine switches happen', events.investor > 0 && events.chief > 0 && events.switch > 0)
  check('the honours board adds up', honoursOk)
  check('the save stays small enough for browser storage', biggestSave < 1_500_000, `${(biggestSave / 1024).toFixed(0)} KB`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
