// Race weekend W6 check: the race lap by lap, and qualifying as it happens.
//   Race: one step is one lap; a safety car or VSC stays out several laps with
//   nobody passing; the pit wall is asked once per safety car; a call's
//   options are compared on the same futures.
//   Qualifying: a session runs in two stages with a call between them, gives
//   the same result as running it in one go, and plays against its clock.
// Usage: node tests/w6-check.js

import { newGame, startSeason, buildEntries, migrateSave, PLAYER } from '../src/engine/game.js'
import {
  beginWeekend, runQualifying, toQualifying, startRace, nextLap, answerCall, handOver,
  startSession, finishSession, setLateRun, doneWatching, runSession,
} from '../src/engine/live.js'
import { createRace, stepRace, runToEnd, QUALI_MINUTES } from '../src/engine/weekend.js'
import { currentTrack } from '../src/engine/core.js'
import { streamRng } from '../src/engine/rng.js'

const setup = (seed, extra = {}) => newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false }, involvement: 'live', ...extra })
const clone = (x) => JSON.parse(JSON.stringify(x))

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const expectThrow = (fn) => { try { fn(); return false } catch { return true } }

function quickRace(i) {
  const g = setup(400 + i, { involvement: 'quick' })
  startSeason(g)
  g.round = i % g.calendar.length
  return createRace(currentTrack(g), buildEntries(g), streamRng(g.seed, 'w6', i))
}

// ---- The race, lap by lap ----
{
  const st = quickRace(0)
  stepRace(st)
  check('a race steps one lap at a time', st.lap === 1 && st.cond.length === st.laps)
  // Over many races: how long neutral periods last, and that nobody passes under them.
  let periods = 0
  let laps = 0
  let passesUnder = 0
  let lapsUnder = 0
  for (let i = 0; i < 150; i++) {
    const r = quickRace(i)
    let run = 0
    while (!r.done) {
      const passes = r.cars.map((c) => c.passes)
      stepRace(r)
      const under = r.neutralNow === 'sc' || r.neutralNow === 'vsc'
      if (under) {
        lapsUnder++
        run++
        // No overtaking: only a stop (or a retirement) changes the order.
        if (r.cars.some((c, k) => c.passes > passes[k])) passesUnder++
      } else if (run) { periods++; laps += run; run = 0 }
    }
    if (run) { periods++; laps += run }
  }
  check('a safety car or VSC stays out several laps', periods > 30 && laps / periods >= 2.5 && laps / periods <= 5, `${periods} periods, ${(laps / periods).toFixed(1)} laps each`)
  check('nobody passes behind the safety car or under the VSC', passesUnder === 0, `${passesUnder} laps with a pass out of ${lapsUnder}`)
}
{
  // The live race: a frame a lap, and the pit wall asked once a safety car.
  let scCalls = 0
  let periods = 0
  let frames = 0
  let laps = 0
  for (let i = 0; i < 12; i++) {
    const g = setup(450 + i)
    startSeason(g)
    g.round = i % g.calendar.length
    beginWeekend(g)
    runQualifying(g)
    startRace(g)
    const w = g.weekend
    while (w.phase === 'race') {
      for (const call of w.calls) {
        if (call.id in w.answered) continue
        if (call.kind === 'sc' || call.kind === 'vsc') scCalls++
        answerCall(g, call.id, call.recommend)
      }
      nextLap(g)
    }
    periods += w.state.events.filter((e) => e.type === 'sc' || e.type === 'vsc').length
    frames += w.frames.length
    laps += w.state.laps
  }
  check('the playback has a frame for every lap', frames === laps, `${frames} frames, ${laps} laps`)
  check('the pit wall is asked about a safety car at most once a car each time', scCalls <= periods * 2, `${scCalls} calls for ${periods} safety cars or VSCs`)
}
{
  // Same choices, same race, lap by lap.
  const a = setup(470)
  startSeason(a)
  const b = clone(a)
  for (const g of [a, b]) { beginWeekend(g); runQualifying(g); startRace(g); handOver(g) }
  check('the same save gives the same race', JSON.stringify(a.weekend.state.order) === JSON.stringify(b.weekend.state.order) && JSON.stringify(a.weekend.state.events) === JSON.stringify(b.weekend.state.events))
}

{
  // A race saved by an earlier build counted in steps (`seg`, `S`, `segLaps`);
  // since W6 a step was one lap, so such a save upgrades exactly.
  const g = setup(480)
  startSeason(g)
  beginWeekend(g); runQualifying(g); startRace(g)
  for (let i = 0; i < 20; i++) {
    for (const call of g.weekend.calls) if (!(call.id in g.weekend.answered)) answerCall(g, call.id, call.recommend)
    nextLap(g)
  }
  const old = clone(g)
  const st = old.weekend.state
  Object.assign(st, { seg: st.lap, S: st.laps, segLaps: 1, scSeg: st.scLap })
  delete st.lap; delete st.scLap
  for (const c of st.cars) { c.dnfSeg = c.dnfLap; delete c.dnfLap; c.plan = c.plan.map((x) => ({ seg: x.lap, comp: x.comp })) }
  migrateSave(old)
  for (const h of [g, old]) handOver(h)
  check('a race saved before the move to laps carries on exactly as it would have', JSON.stringify(g.weekend.state.order) === JSON.stringify(old.weekend.state.order) && JSON.stringify(g.weekend.state.events) === JSON.stringify(old.weekend.state.events))
}

// ---- Qualifying as it happens ----
{
  // Two stages give the same session as one go.
  let same = 0
  for (let i = 0; i < 20; i++) {
    const g = setup(500 + i)
    startSeason(g)
    g.round = i % g.calendar.length
    beginWeekend(g)
    toQualifying(g, { skipQuali: false })
    const h = clone(g)
    while (g.weekend.phase === 'quali') runSession(g)
    while (h.weekend.phase === 'quali' || h.weekend.qReplay != null) {
      if (h.weekend.qReplay != null) { doneWatching(h); continue }
      startSession(h)
      finishSession(h, { watch: true })
    }
    if (JSON.stringify(g.weekend.state.quali) === JSON.stringify(h.weekend.state.quali)) same++
  }
  check('a session run in two stages gives the same result as in one go', same === 20, `${same} of 20 weekends`)
}
{
  const g = setup(530, { })
  startSeason(g)
  Object.assign(g.teams[PLAYER].car, { aero: 88, chassis: 88 }) // through to Q2 and Q3
  beginWeekend(g)
  toQualifying(g, { skipQuali: false })
  const w = g.weekend
  const st = w.state
  startSession(g)
  const cur = st.qs.current
  const len = QUALI_MINUTES[0] * 60
  check('the first stage sets only first-run laps, before the call', cur.rows.every((r) => r.laps.every((l) => l.run === 0 && l.at < cur.call)))
  const ids = Object.keys(w.lateChoices)
  const withTime = ids.find((id) => cur.rows.find((r) => r.id === id).laps.some((l) => l.time !== null))
  check('your cars wait for the call, with the strategist going again by default', ids.length > 0 && ids.every((id) => w.lateChoices[id].go === true))
  const noTime = cur.rows.find((r) => st.cars[r.idx].e.isPlayer && !r.laps.some((l) => l.time !== null))
  if (noTime) check('a car with no time cannot stay in', expectThrow(() => setLateRun(g, noTime.id, { go: false })))
  const car = st.cars.find((c) => c.id === withTime)
  const sets = car.sets
  setLateRun(g, withTime, { go: false })
  finishSession(g, { watch: true })
  const ses = st.qs.sessions[0]
  const row = ses.rows.find((r) => r.id === withTime)
  check('staying in saves a set of Softs and keeps the first lap', car.sets === sets && row.laps.length === 1 && row.time === row.laps[0].time)
  check('final laps come after the call and before the flag falls', ses.rows.every((r) => r.laps.every((l) => l.run === 0 || (l.at >= cur.call && l.at <= len))))
  check('the session stays on screen until it has been watched', w.qReplay === 0)
  doneWatching(g)
  check('then on to the next session', w.qReplay === null && st.qs.session === 1 && w.phase === 'quali')
  // A big lap on the final run is a different lap from a normal one.
  const a = clone(g)
  const b = clone(g)
  for (const [h, push] of [[a, 'normal'], [b, 'big']]) {
    startSession(h)
    for (const id of Object.keys(h.weekend.lateChoices)) setLateRun(h, id, { push })
    finishSession(h)
  }
  const late = (h) => h.weekend.state.qs.sessions[1].rows.filter((r) => h.weekend.state.cars[r.idx].e.isPlayer).map((r) => r.laps.find((l) => l.run === 1)?.time)
  check('the push on the final run can be changed at the call', JSON.stringify(late(a)) !== JSON.stringify(late(b)))
}
{
  // Late flags in the replay: laps that beat the flag come before it, the lost ones at it.
  let flags = 0
  let ok = true
  for (let i = 0; i < 300 && flags < 10; i++) {
    const r = quickRace(i)
    for (const ses of r.qs.sessions) {
      if (!ses.flag) continue
      flags++
      for (const row of ses.rows) {
        for (const l of row.laps) {
          if (l.flagged && l.at !== ses.flagAt) ok = false
          if (l.run === 1 && !l.flagged && !l.restart && !l.crash && l.at >= ses.flagAt) ok = false
        }
      }
    }
  }
  check('a late flag falls between the laps that beat it and the ones it spoils', flags >= 5 && ok, `${flags} flagged sessions`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
