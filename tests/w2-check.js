// Race weekend W2 check: the live weekend. The same choices give the same
// race, a save made mid-race carries on unchanged, the pit wall raises calls
// with estimates, good and bad calls are worth places, and the weekend
// objectives pay out at a sensible rate.
// Usage: node tests/w2-check.js [weekends]

import { newGame, startSeason, simulateRound, endSeason, PLAYER } from '../src/engine/game.js'
import {
  beginWeekend, setWing, runQualifying, setStartTyre, setOrders, startRace, answerCall, nextBlock, handOver, finishWeekend, boxCar,
  objectivesNow, quickFinish, weekendActive,
} from '../src/engine/live.js'
import { LIVE_CALLS } from '../src/engine/decisions.js'
import { OBJECTIVE_REWARD } from '../src/engine/highlights.js'
import { steady } from './bot.js'

const WEEKENDS = Number(process.argv[2] || 32)
const clone = (x) => JSON.parse(JSON.stringify(x))
const setup = (seed, extra = {}) => newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false }, involvement: 'live', ...extra })

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const expectThrow = (fn) => { try { fn(); return false } catch { return true } }
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
const finish = (res) => res.race.filter((r) => r.teamId === PLAYER).map((r) => (r.status === 'dnf' ? 23 : r.pos))

// Plays one live weekend: `policy(call, game)` picks each option, `beforeBlock` can change orders.
function playLive(g, policy, { beforeBlock, roundTrip } = {}) {
  beginWeekend(g)
  runQualifying(g)
  startRace(g)
  let calls = 0
  let blocks = 0
  while (g.weekend.phase === 'race') {
    for (const call of g.weekend.calls) {
      if (call.id in g.weekend.answered) continue
      calls++
      answerCall(g, call.id, policy(call, g))
    }
    if (beforeBlock) beforeBlock(g, blocks)
    nextBlock(g)
    blocks++
    if (roundTrip === blocks) g = Object.assign(g, clone(g))
  }
  const result = finishWeekend(g)
  return { result, calls }
}
const follow = (call) => call.recommend
const best = (call) => Object.keys(call.estimates).reduce((b, k) => (call.estimates[k] < call.estimates[b] ? k : b))
const worst = (call) => Object.keys(call.estimates).reduce((b, k) => (call.estimates[k] > call.estimates[b] ? k : b))

function seasonGame(seed, extra) {
  const g = setup(seed, extra)
  startSeason(g)
  return g
}

// ---- Phases and guards ----
{
  const g = seasonGame(11)
  check('nothing to finish before a weekend starts', expectThrow(() => finishWeekend(g)) && !weekendActive(g))
  beginWeekend(g)
  check('a weekend opens on the briefing with a forecast, wing advice and objectives',
    g.weekend.phase === 'briefing' && g.weekend.forecast.race >= 0 && g.weekend.wingAdvice.length === 2 && g.weekend.objectives.length >= 2)
  check('the quick path refuses to run in the middle of a live weekend', expectThrow(() => simulateRound(g)))
  check('a second weekend cannot be started on top of the first', expectThrow(() => beginWeekend(g)))
  setWing(g, 0, 9)
  check('the wing level is kept between 1 and 5', g.weekend.wing[0] === 5)
  check('the race cannot start before qualifying', expectThrow(() => startRace(g)))
  runQualifying(g)
  check('the wing is locked after qualifying', expectThrow(() => setWing(g, 0, 3)))
  const mine = g.weekend.state.cars.filter((c) => c.e.isPlayer)
  check('the qualifying objective is settled on the grid and the race ones are still open',
    objectivesNow(g).every((o) => (o.kind === 'qualiAhead' ? typeof o.now === 'boolean' : o.now === null)))
  if (g.weekend.state.cond[0] === 'dry') {
    setStartTyre(g, mine[0].id, 'S')
    check('a start tyre can be chosen on a dry grid, and the plan follows it', mine[0].tyre === 'S' && mine[0].plan.length >= 1)
    check('wet tyres cannot start a dry race', expectThrow(() => setStartTyre(g, mine[0].id, 'W')))
  }
  check('a rival car cannot be given orders', expectThrow(() => setOrders(g, g.weekend.state.cars.find((c) => !c.e.isPlayer).id, { pace: 'push' })))
  startRace(g)
  setOrders(g, mine[1].id, { pace: 'push', stance: 'attack', engine: 'high' })
  check('standing orders change on the car', mine[1].orders.pace === 'push' && mine[1].orders.engine === 'high')
  boxCar(g, mine[0].id, 'H')
  const stops = mine[0].stops
  while (g.weekend.calls.some((c) => !(c.id in g.weekend.answered))) answerCall(g, g.weekend.calls.find((c) => !(c.id in g.weekend.answered)).id, 'stay')
  nextBlock(g)
  const after = g.weekend.state.cars.find((c) => c.id === mine[0].id)
  check('a stop called from the car controls happens in the next block', after.stops === stops + 1 && after.tyre === 'H')
  handOver(g)
  check('handing over runs the race to the flag', g.weekend.phase === 'flag' && g.weekend.state.done)
  const round = g.round
  const res = finishWeekend(g)
  check('the finished weekend files a result and moves the round on', g.round === round + 1 && g.results.length === 1 && !g.weekend && res.race.length === 24)
  check('the debrief is kept and the objectives are settled', g.lastDebrief?.round === round && res.objectives.every((o) => typeof o.met === 'boolean') && !!res.ratings)
}

// ---- Same choices, same race; a mid-race save carries on ----
{
  const a = seasonGame(21)
  const b = clone(a)
  const c = clone(a)
  const ra = playLive(a, follow).result
  const rb = playLive(b, follow).result
  check('the same choices on the same save give the same race', JSON.stringify(ra.race) === JSON.stringify(rb.race) && JSON.stringify(ra.events) === JSON.stringify(rb.events))
  const rc = playLive(c, follow, { roundTrip: 3 }).result
  check('a save written mid-race and loaded again finishes the same way', JSON.stringify(ra.race) === JSON.stringify(rc.race))
  const d = seasonGame(21)
  const rd = playLive(d, follow, { beforeBlock: (g, n) => { if (n === 2) for (const car of g.weekend.state.cars.filter((x) => x.e.isPlayer)) setOrders(g, car.id, { pace: 'push' }) } }).result
  const rivals = (r) => JSON.stringify(r.race.filter((x) => x.teamId !== PLAYER && x.status === 'dnf').map((x) => [x.id, x.reason]))
  check('a different order for your cars does not change rivals\' breakdowns', rivals(ra) === rivals(rd), `${rivals(ra)} vs ${rivals(rd)}`)
}

// ---- Many weekends: calls, call values and the quick path ----
// Measured with a midfield car: at the very back the gaps are too big for a
// call to change many places, so a season-1 car is reported for information.
const MIDFIELD = { aero: 75, chassis: 75, reliability: 85, tyreCare: 80 }
for (const car of [MIDFIELD, null]) {
  const tally = { follow: [], best: [], worst: [], quick: [] }
  const n = car ? WEEKENDS : WEEKENDS / 2
  let calls = 0; let weekends = 0; let callsWithEstimates = 0; let total = 0; let recOk = 0
  const kinds = {}
  const values = []
  let retirements = 0
  for (let i = 0; i < n; i++) {
    const seed = 300 + Math.floor(i / 4)
    const base = seasonGame(seed)
    if (car) Object.assign(base.teams[PLAYER].car, car)
    for (let k = 0; k < i % 4 * 4; k++) simulateRound(base)
    for (const [name, policy] of [['follow', follow], ['best', best], ['worst', worst]]) {
      const g = clone(base)
      g.org.keyStaff.chiefStrategist.rating = 90
      const spy = (call, gg) => {
        if (name === 'follow') {
          total++
          kinds[call.kind] = (kinds[call.kind] || 0) + 1
          if (call.options.every((o) => typeof call.estimates[o.key] === 'number' && call.estimateText[o.key])) callsWithEstimates++
          if (call.options.some((o) => o.key === call.recommend)) recOk++
        }
        return policy(call, gg)
      }
      const out = playLive(g, spy)
      tally[name].push(...finish(out.result))
      if (name === 'follow') { calls += out.calls; weekends++ }
      if (name === 'worst') {
        values.push(...g.lastDebrief.values.filter((v) => !v.retired).map((v) => v.places))
        retirements += g.lastDebrief.values.filter((v) => v.retired).length
      }
    }
    const q = clone(base)
    tally.quick.push(...finish(simulateRound(q)))
  }
  const m = Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, mean(v)]))
  if (!car) {
    console.log(`      season-1 car, for information: follow ${m.follow.toFixed(2)}, worst estimate ${m.worst.toFixed(2)}, quick ${m.quick.toFixed(2)}; bad calls ${mean(values).toFixed(2)} places a call`)
    continue
  }
  console.log(`      average finish per car: follow ${m.follow.toFixed(2)}, best estimate ${m.best.toFixed(2)}, worst estimate ${m.worst.toFixed(2)}, quick ${m.quick.toFixed(2)} (${WEEKENDS} weekends)`)
  console.log(`      calls: ${(calls / weekends).toFixed(1)} a weekend; ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}`)
  check('the pit wall raises calls most weekends', calls / weekends >= 1, `${(calls / weekends).toFixed(1)} a weekend`)
  check('every call has an estimate for each option and a recommendation among them', callsWithEstimates === total && recOk === total)
  check('following the strategist on the pit wall finishes close to the quick path', Math.abs(m.follow - m.quick) < 1, `${m.follow.toFixed(2)} vs ${m.quick.toFixed(2)}`)
  check('picking the worst option at every call costs places', m.worst - m.follow > 0.3, `${(m.worst - m.follow).toFixed(2)} places a car`)
  check('the debrief values bad calls as places lost on average', mean(values) < 0, `${mean(values).toFixed(2)} places a call over ${values.length} calls`)
  check('no single call is worth an absurd number of places, unless a retirement is involved', values.every((v) => Math.abs(v) <= 12), `largest ${Math.max(...values.map(Math.abs))}; ${retirements} call(s) with a retirement in one version`)
}

// ---- A strategist's precision ----
{
  const g = seasonGame(41)
  const texts = {}
  for (const rating of [90, 65, 40]) {
    const h = clone(g)
    h.org.keyStaff.chiefStrategist.rating = rating
    playLive(h, (call) => { texts[rating] ??= call.estimateText[call.options[0].key]; return call.recommend })
  }
  check('a strong strategist gives a position, an average one a range, a weak one a feel',
    /^about P\d+$/.test(texts[90] ?? 'about P1') && /^P\d+–P\d+$|retirement/.test(texts[65] ?? 'P1–P2') && !/P\d/.test(texts[40] ?? ''), JSON.stringify(texts))
}

// ---- The live weekend and the decision deck ----
{
  const g = seasonGame(51, { options: { decisions: true, targets: false } })
  const drawn = []
  while (g.phase === 'season') {
    if (g.decision && !g.decision.resolved) { drawn.push(g.decision.id); g.decision.resolved = true; g.decision.choice = 'a'; g.decision.outcome = [] }
    quickFinish((beginWeekend(g), g))
  }
  check('race-weekend cards the live race covers are not drawn on the pit wall', drawn.every((id) => !LIVE_CALLS.has(id)), drawn.filter((id) => LIVE_CALLS.has(id)).join(', '))
}

// ---- Objectives over seasons ----
{
  const rates = []
  const conf = []
  for (let seed = 700; seed < 712; seed++) {
    const g = newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false } })
    for (let s = 0; s < 2; s++) {
      steady(g)
      startSeason(g)
      while (g.phase === 'season') { steady(g); simulateRound(g) }
      const t = g.objectiveTally
      rates.push(t.met / t.total)
      conf.push(t.met * OBJECTIVE_REWARD.confidence)
      endSeason(g)
    }
  }
  check('weekend objectives are met often but not always', mean(rates) > 0.3 && mean(rates) < 0.75, `${Math.round(mean(rates) * 100)}% met`)
  check('a season of objectives is worth a few points of owner confidence, not twenty', mean(conf) >= 2 && mean(conf) <= 9, `${mean(conf).toFixed(1)} a season`)
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
