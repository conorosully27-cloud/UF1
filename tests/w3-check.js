// Race weekend W3 check: knockout qualifying. Three sessions drop the right
// cars, the choices for your cars change only your cars' laps, tyre sets,
// big laps and tows do what they say, the strategist reads the weather, and
// over many weekends the front-runners are rarely caught out.
// Usage: node tests/w3-check.js [seasons]

import { newGame, startSeason, createWeekendRace, completeRace, PLAYER } from '../src/engine/game.js'
import { runToEnd, runQualiSession, qualiPlan, QUALI } from '../src/engine/weekend.js'
import {
  beginWeekend, startQualifying, setQualiPlan, setTow, runSession, runQualifying, qualiOutlook, objectivesNow, startRace, setWing,
  quickFinish,
} from '../src/engine/live.js'
import { objectiveStatus } from '../src/engine/highlights.js'
import { clone } from '../src/engine/util.js'

const SEASONS = Number(process.argv[2] || 30)
const setup = (seed, extra = {}) => newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false }, involvement: 'live', ...extra })
const MIDFIELD = { aero: 77, chassis: 77 }

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const expectThrow = (fn) => { try { fn(); return false } catch { return true } }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

function seasonGame(seed, car = null) {
  const g = setup(seed)
  if (car) Object.assign(g.teams[PLAYER].car, car)
  startSeason(g)
  return g
}
// A fresh race state for this round with your cars under the player's control.
function liveState(g) {
  g.weekend = { live: true, wing: [3, 3] }
  const st = createWeekendRace(g, { liveQuali: true })
  g.weekend = null
  return st
}
const mine = (st) => st.cars.filter((c) => c.e.isPlayer)
const lapsOf = (st, s, id) => st.qs.sessions[s].rows.find((r) => r.id === id)?.laps.map((l) => l.time)

// ---- The knockout ----
{
  const g = seasonGame(3)
  const st = createWeekendRace(g)
  const ses = st.qs.sessions
  check('three sessions: 24 cars, then 17, then 10', ses.length === 3 && ses[0].rows.length === 24 && ses[1].rows.length === 17 && ses[2].rows.length === 10)
  const q = st.quali
  check('Q3 decides 1st to 10th, Q2 11th to 17th, Q1 18th to 24th',
    q.every((x) => (x.pos <= 10 ? x.session === 3 : x.pos <= 17 ? x.session === 2 : x.session === 1)), q.map((x) => x.session).join(''))
  check('the grid follows qualifying, apart from penalties', st.cars.every((c) => c.grid === c.qPos || c.m.gridDrop))
  check('every car starts the race with a tyre and a plan', st.cars.every((c) => c.tyre && Array.isArray(c.plan) && c.stints.length === 1))
}

// ---- Your choices touch only your cars ----
{
  const g = seasonGame(5, MIDFIELD)
  const a = liveState(g)
  const b = clone(a)
  const [m0, m1] = mine(a).map((c) => c.id)
  runQualiSession(a, { [m0]: { runs: 2, push: 'normal' }, [m1]: { runs: 2, push: 'normal' } })
  runQualiSession(b, { [m0]: { runs: 2, push: 'big' }, [m1]: { runs: 2, push: 'normal' }, tow: { giver: m0, taker: m1 } })
  const rivals = a.cars.filter((c) => !c.e.isPlayer)
  check('a different plan for your cars does not change any rival\'s laps', rivals.every((c) => JSON.stringify(lapsOf(a, 0, c.id)) === JSON.stringify(lapsOf(b, 0, c.id))))
  const la = a.qs.sessions[0].rows.find((r) => r.id === m0).laps
  const lb = b.qs.sessions[0].rows.find((r) => r.id === m0).laps
  const clean = la.map((l, i) => [l, lb[i]]).filter(([x, y]) => x.time !== null && y.time !== null && !x.error && !y.error && !x.flagged && !y.flagged)
  check('a big-risk lap is quicker by the stated margin, less the cost of giving a tow', clean.length > 0 && clean.every(([x, y]) => near(y.time - x.time, -QUALI.bigPush + QUALI.towCost, 1e-6)), clean.map(([x, y]) => (y.time - x.time).toFixed(3)).join(', '))
  const ta = a.qs.sessions[0].rows.find((r) => r.id === m1).laps
  const tb = b.qs.sessions[0].rows.find((r) => r.id === m1).laps
  const gain = QUALI.towGain * a.track.w.power / 0.25
  const tc = ta.map((l, i) => [l, tb[i]]).filter(([x, y]) => x.time !== null && y.time !== null && !x.flagged && !y.flagged)
  check('a tow makes the car behind quicker by the stated gain', tc.length > 0 && tc.every(([x, y]) => near(x.time - y.time, gain, 1e-6)), `${gain.toFixed(3)} s`)
  const g2 = seasonGame(5, MIDFIELD)
  const c = liveState(g2)
  runQualiSession(c, { [m0]: { runs: 1, push: 'normal' }, [m1]: { runs: 1, push: 'normal' } })
  check('the race\'s luck does not depend on qualifying choices', a.key === c.key && a.chaos === c.chaos && JSON.stringify(a.cond) === JSON.stringify(c.cond) && a.cars.every((x, i) => x.pace === c.cars[i].pace))
}

// ---- Tyre sets ----
{
  const g = seasonGame(7, { aero: 92, chassis: 92 })
  const st = liveState(g)
  const ids = mine(st).map((c) => c.id)
  const two = Object.fromEntries(ids.map((id) => [id, { runs: 2, push: 'normal' }]))
  for (let s = 0; s < 3; s++) runQualiSession(st, two)
  const fast = mine(st).filter((c) => c.qSession === 3 && !c.qCrash)
  const q3 = fast.map((c) => st.qs.sessions[2].rows.find((r) => r.id === c.id))
  check('two runs in every session uses all four new sets by Q3, and Q3 runs on used tyres', fast.length > 0 && fast.every((c) => c.sets === 0) && q3.every((r) => r.laps.every((l) => l.used)), `${fast.length} car(s) in Q3`)
}

// ---- The strategist reads the weather ----
{
  let drying = 0; let dryingOne = 0; let rain = 0; let rainTwo = 0; let weekends = 0
  for (let seed = 100; seed < 100 + SEASONS * 4 && (drying < 5 || rain < 5); seed++) {
    const g = seasonGame(seed)
    for (let round = 0; round < 16; round++) {
      g.round = round
      const st = liveState(g)
      weekends++
      for (let s = 0; s < 3; s++) {
        const early = st.qs.slots[s * 2]; const late = st.qs.slots[s * 2 + 1]
        const c = st.cars.find((x) => st.qs.left.includes(x.idx) && !x.e.isPlayer)
        const p = qualiPlan(st, c, true)
        if (QUALI.condTime[late] < QUALI.condTime[early]) { drying++; if (p.runs === 1) dryingOne++ }
        if (QUALI.condTime[late] > QUALI.condTime[early]) { rain++; if (p.runs === 2) rainTwo++ }
        runQualiSession(st)
      }
    }
  }
  check('on a drying track the strategist goes for one late run; with rain coming, two', drying > 0 && rain > 0 && dryingOne === drying && rainTwo === rain, `${drying} drying and ${rain} rain sessions in ${weekends} weekends`)
}

// ---- Over many weekends ----
{
  const TOP = new Set(['mercedes', 'mclaren', 'ferrari', 'redbull'])
  const t = { races: 0, top: 0, q1: 0, q2: 0, cars: 0, noTime: 0, poleTop: 0, flags: 0, sessions: 0, weather: {} }
  for (let seed = 1; seed <= SEASONS; seed++) {
    const g = seasonGame(seed)
    while (g.phase === 'season') {
      const st = createWeekendRace(g)
      t.races++
      t.weather[st.qs.weather] = (t.weather[st.qs.weather] || 0) + 1
      for (const ses of st.qs.sessions) { t.sessions++; if (ses.flag) t.flags++ }
      for (const q of st.quali) {
        t.cars++
        if (q.noTime) t.noTime++
        if (TOP.has(q.teamId)) { t.top++; if (q.session === 1) t.q1++; if (q.session === 2) t.q2++ }
      }
      if (TOP.has(st.quali[0].teamId)) t.poleTop++
      runToEnd(st)
      completeRace(g, st)
    }
  }
  const pct = (x) => `${(x * 100).toFixed(1)}%`
  console.log(`      ${t.races} weekends: top-four cars out in Q1 ${pct(t.q1 / t.top)}, in Q2 ${pct(t.q2 / t.top)}; no time ${pct(t.noTime / t.cars)}; flags in ${pct(t.flags / t.sessions)} of sessions; qualifying ${Object.entries(t.weather).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  // About 3% in each: enough for the odd shock, not so often that the front of the grid is a lottery.
  check('a top-four car is knocked out in Q1 about 3% of the time', t.q1 / t.top > 0.015 && t.q1 / t.top < 0.045, pct(t.q1 / t.top))
  check('and in Q2 about 3% of the time', t.q2 / t.top > 0.015 && t.q2 / t.top < 0.045, pct(t.q2 / t.top))
  check('few cars end up with no time', t.noTime / t.cars < 0.04, pct(t.noTime / t.cars))
  check('pole nearly always goes to a top-four car', t.poleTop / t.races > 0.9, pct(t.poleTop / t.races))
  check('qualifying can be wet, drying or caught by rain', ['wet', 'drying', 'rain'].every((k) => t.weather[k] > 0))
}

// ---- The live session flow ----
{
  const g = seasonGame(9, MIDFIELD)
  beginWeekend(g)
  check('qualifying cannot be played from the briefing before it starts', expectThrow(() => runSession(g)))
  startQualifying(g)
  const w = g.weekend
  check('starting qualifying locks the wing and opens Q1 with the strategist\'s plans', w.phase === 'quali' && expectThrow(() => setWing(g, 0, 2)) && Object.keys(w.qChoices).length === 2)
  const ids = Object.keys(w.qChoices)
  setQualiPlan(g, ids[0], { runs: 1, push: 'big' })
  check('a plan can be changed for a car in the session', w.qChoices[ids[0]].runs === 1 && w.qChoices[ids[0]].push === 'big')
  setTow(g, ids[1])
  check('a tow names the taker and the giver', w.tow.taker === ids[1] && w.tow.giver === ids[0])
  check('the race cannot start during qualifying', expectThrow(() => startRace(g)))
  const before = objectivesNow(g)
  check('objectives are open before Q1', before.every((o) => o.now === null))
  const saved = clone(g)
  runSession(g)
  check('after Q1, Q2 is next and your cars in it get fresh plans', w.state.qs.session === 1 && Object.keys(w.qChoices).every((id) => w.state.qs.left.includes(w.state.cars.find((c) => c.id === id).idx)))
  const outlook = qualiOutlook(g)
  check('the outlook names the cut and a plan for each car', !outlook || (outlook.drop === 7 && Object.values(outlook.cars).every((x) => x.outlook && x.why)))
  runQualifying(g)
  check('the strategist can finish qualifying from part-way through', w.phase === 'grid' && w.state.qs.done && w.state.quali.length === 24)
  // A save made between sessions carries on the same way.
  const h = clone(saved)
  runSession(h)
  runQualifying(h)
  check('a save made during qualifying finishes it the same way', JSON.stringify(h.weekend.state.quali) === JSON.stringify(w.state.quali))
  const res = quickFinish(g)
  check('the weekend finishes from the grid with a full result', res.race.length === 24 && res.quali.every((q) => q.session >= 1))
}

// ---- Strategist precision ----
{
  const texts = {}
  for (const rating of [85, 65, 40]) {
    const g = seasonGame(11, MIDFIELD)
    g.org.keyStaff.chiefStrategist.rating = rating
    beginWeekend(g)
    startQualifying(g)
    texts[rating] = Object.values(qualiOutlook(g).cars)[0].outlook
  }
  check('a strong strategist gives the margin to the cut in hundredths, an average one in tenths, a weak one in words',
    /\d\.\d\d s/.test(texts[85]) && /\d\.\d s|Right on/.test(texts[65]) && !/\d/.test(texts[40]), JSON.stringify(texts))
}

// ---- Objectives ----
{
  const result = { race: [], quali: [{ pos: 15, teamId: PLAYER, session: 2 }, { pos: 20, teamId: PLAYER, session: 1 }] }
  check('"A car into Q2" and "into Q3" read the session each car reached',
    objectiveStatus({ kind: 'intoQ2' }, result) === true && objectiveStatus({ kind: 'intoQ3' }, result) === false)
  const g = seasonGame(13, MIDFIELD)
  beginWeekend(g)
  const kinds = g.weekend.objectives.map((o) => o.kind)
  check('a midfield car near a cut gets a knockout objective', kinds.includes('intoQ2') || kinds.includes('intoQ3') || kinds.includes('qualiAhead'), kinds.join(', '))
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
