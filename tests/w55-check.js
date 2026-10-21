// Race weekend W5.5 check: holes that broke the spell.
//   1. An incident's chance is rolled when it is answered but only told when
//      it happens on track, in the race feed, and a known fault takes its
//      share of the blame for a retirement.
//   2. A practice crash ends that car's Friday.
//   3. Friday can be wet, and a wet run teaches less.
//   4. (The timing tower's "+1 lap" is checked in the browser.)
//   5. Teammates boxing on the same lap queue in the box.
// Usage: node tests/w55-check.js

import { newGame, startSeason, buildEntries, PLAYER } from '../src/engine/game.js'
import { beginWeekend, beginPractice, runPractice, toQualifying, startRace, handOver, finishWeekend, incidentDue, resolveIncident } from '../src/engine/live.js'
import { forceDecision, optionValue } from '../src/engine/decisions.js'
import { fridayWeather, practiceRun, setRunKind, SETUP } from '../src/engine/practice.js'
import { createRace, runToEnd, raceResult } from '../src/engine/weekend.js'
import { currentTrack } from '../src/engine/core.js'
import { streamRng } from '../src/engine/rng.js'

const setup = (seed, extra = {}) => newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], reserveId: 'crawford', options: { decisions: true, targets: false }, involvement: 'live', ...extra })

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const mine = (st) => st.cars.filter((c) => c.e.isPlayer)

// A live weekend with a named card, its chance forced to come up (`roll` 0)
// or not (0.99), answered on its day; the race then run by the strategist.
function play(id, choice, roll, seed = 3) {
  const g = setup(seed)
  startSeason(g)
  if (!forceDecision(g, id)) throw new Error(`${id} does not apply here`)
  g.decision.rolls = Array(8).fill(roll)
  beginWeekend(g)
  const settle = () => { if (incidentDue(g)) resolveIncident(g, choice) }
  settle()
  toQualifying(g, { skipQuali: true })
  settle()
  settle()
  const told = g.decisionLog.at(-1).outcome.slice()
  const grid = mine(g.weekend.state).map((c) => c.grid)
  startRace(g)
  handOver(g)
  const st = g.weekend.state
  const events = st.events.filter((e) => e.card)
  const res = finishWeekend(g)
  return { g, st, told, grid, events, res, log: g.decisionLog.at(-1) }
}

// ---- 1. Incidents happen when they happen ----
{
  const a = play('launch-maps', 'a', 0)
  const b = play('launch-maps', 'a', 0.99)
  check('launch map: answering it says nothing of how the start will go', a.told.join() === b.told.join() && !/stall|strong/i.test(a.told.join()), a.told.join(' '))
  check('a stall is in the feed at the start, for one car', a.events.length === 1 && a.events[0].lap === 1 && /bogs down/.test(a.events[0].text))
  check('strong starts are in the feed at the start, for both cars', b.events.length === 2 && b.events.every((e) => e.lap === 1 && /strong start/.test(e.text)))
  check('and the card in the log says what happened, after the race', a.log.outcome.some((l) => /bogs down/.test(l)))
}
{
  // A seed where the car lasts long enough for the actuator to fail.
  let hit
  for (let seed = 3; seed < 20; seed++) {
    hit = play('actuator', 'b', 0, seed)
    if (hit.events.length) break
  }
  const miss = play('actuator', 'b', 0.99)
  const ev = hit.events[0]
  const laps = hit.st.laps
  check('actuator: nothing said when it is left', hit.told.length === 0 && miss.told.length === 0)
  check('a failure comes partway through the race, in the feed', hit.events.length === 1 && ev.lap > 0.05 * laps && ev.lap < 0.8 * laps, ev ? `lap ${ev.lap} of ${laps}` : 'none')
  check('no failure, no word of it', miss.events.length === 0)
  const c = hit.st.cars.find((x) => x.id === ev.ids[0])
  check('and the car is slower from then on', c.m.racePace >= 0.8 - 1e-9)
}
{
  const hit = play('tyre-pressures', 'b', 0)
  const ev = hit.events[0]
  check('tyre pressures: the stewards\' penalty comes in the race', ev && ev.type === 'penalty' && ev.lap > 1 && /60-second/.test(ev.text))
  const r = hit.res.race.find((x) => x.id === ev.ids[0])
  check('and is added to the race time', r.status === 'dnf' || r.penalty >= 60, `penalty ${r.penalty}`)
}
{
  const hit = play('ride-height', 'b', 0)
  const miss = play('ride-height', 'b', 0.99)
  check('plank wear: caught, both cars start from the back, told once qualifying is over', hit.grid.every((p) => p >= 21) && hit.events.length === 1 && hit.events[0].lap === 0, hit.grid.join(', '))
  check('not caught, nothing said', miss.events.length === 0 && miss.told.length === 0)
}
{
  const hit = play('fuel-load', 'a', 0)
  const miss = play('fuel-load', 'a', 0.99)
  check('fuel load: saving or not shows in the race, once for the team', hit.events.length === 1 && miss.events.length === 1 && hit.events[0].lap > 1 && /save fuel/.test(hit.events[0].text) && /on target/.test(miss.events[0].text))
}
{
  // The scripted managers value the options as before: a timed effect counts for its share of the race.
  const g = setup(3)
  startSeason(g)
  forceDecision(g, 'actuator')
  const v = optionValue(g, 'b')
  check('the strategist still prices the risk of leaving the actuator', v < -0.05 && v > -0.6, v.toFixed(3))
}
{
  // A known fault takes its share of the blame: over many races with a vibration ignored.
  let blamed = 0
  let other = 0
  for (let i = 0; i < 300; i++) {
    const g = setup(100 + i, { options: { decisions: false, targets: false } })
    startSeason(g)
    g.round = i % g.calendar.length
    g.weekendMods = [{ car: 0, mods: { dnfAdd: 0.14, failWhy: 'power unit', failNote: 'the vibration from Friday' } }]
    const st = createRace(currentTrack(g), buildEntries(g), streamRng(g.seed, 'w55', i))
    runToEnd(st)
    const c = mine(st).find((x) => x.e.slot === 0)
    if (c.status === 'dnf' && !['crash', 'collision'].includes(c.reason)) {
      if (st.events.some((e) => e.type === 'dnf' && e.text.includes('the vibration from Friday'))) blamed++
      else other++
    }
  }
  // The fault is about half this car's mechanical risk, so about half its failures.
  check('a car retiring with a known fault often retires with that fault', blamed / (blamed + other) > 0.35 && blamed >= 15, `${blamed} blamed, ${other} other failures`)
}

// ---- 2. A practice crash ends that car's Friday ----
{
  const g = setup(3)
  startSeason(g)
  forceDecision(g, 'practice-crash')
  const slot = g.decision.params.slot
  beginWeekend(g)
  g.weekend.friday = ['dry', 'dry', 'dry']
  beginPractice(g)
  runPractice(g)
  const p = g.weekend.practice.cars
  check('the crashed car sets no time and has no runs left', p[slot].runs[0].crash && p[slot].runs[0].time === null && p[slot].left === 0)
  check('its teammate carries on', p[1 - slot].runs[0].time > 60 && p[1 - slot].left === SETUP.runs - 1)
  check('and the incident is put to you after that run', incidentDue(g)?.id === 'practice-crash')
  resolveIncident(g, 'a')
  runPractice(g)
  check('new parts or not, the crashed car does not run again on Friday', p[slot].runs.length === 1 && p[1 - slot].runs.length === 2)
}

// ---- 3. A wet Friday ----
{
  let wet = 0
  let n = 0
  for (let i = 0; i < 300; i++) {
    const g = setup(200 + i, { options: { decisions: false, targets: false } })
    startSeason(g)
    g.round = i % g.calendar.length
    const f = fridayWeather(g)
    n++
    if (f.includes('wet')) wet++
  }
  check('Friday is wet now and then', wet / n > 0.05 && wet / n < 0.35, `${(100 * wet / n).toFixed(0)}% of weekends`)
  const g = setup(5, { options: { decisions: false, targets: false } })
  startSeason(g)
  beginWeekend(g)
  g.weekend.friday = ['wet', 'wet', 'dry']
  beginPractice(g)
  setRunKind(g, 1, 'long')
  practiceRun(g)
  const [a, b] = g.weekend.practice.cars
  check('a wet setup run is slower and says it is hard to read', a.runs[0].wet && /Wet track/.test(a.runs[0].notes[0]) && a.runs[0].time > currentTrack(g).baseLap + SETUP.wetLap - 1)
  check('a wet long run teaches nothing about the race tyres', !b.longRun)
  setRunKind(g, 1, 'long'); practiceRun(g); practiceRun(g)
  check('a dry one does', b.longRun)
  check('the briefing forecasts Friday too', typeof g.weekend.forecast.practice === 'number')
}

// ---- 5. Double-stacking ----
{
  let stacks = 0
  let waited = 0
  let races = 0
  let calm = 0
  let calmStacks = 0
  for (let i = 0; i < 200; i++) {
    const g = setup(300 + i, { options: { decisions: false, targets: false }, involvement: 'quick' })
    startSeason(g)
    g.round = i % g.calendar.length
    const st = createRace(currentTrack(g), buildEntries(g), streamRng(g.seed, 'stack', i))
    runToEnd(st)
    races++
    const quiet = st.safetyCars + st.vscs + st.reds === 0 && st.raceWeather === 'dry'
    if (quiet) calm++
    for (const e of st.events.filter((x) => /^Double stack/.test(x.text))) {
      stacks++
      if (quiet) calmStacks++
      const [c, mate] = e.ids.map((id) => st.cars.find((x) => x.id === id))
      if (c.e.teamId === mate.e.teamId && c.notes.some((n) => /behind .* in the box/.test(n))) waited++
    }
  }
  check('teammates boxing together queue in the box', stacks > 0 && waited === stacks, `${stacks} double stacks in ${races} races`)
  // Under a safety car or in changing weather everyone boxes at once, as in real races.
  check('in a dry race with no safety car, strategists split the stops', calmStacks / calm < 0.1, `${calmStacks} in ${calm} such races; ${stacks} in all ${races}`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
