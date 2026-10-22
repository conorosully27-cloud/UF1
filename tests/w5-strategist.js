// Race weekend W5 check: what the pit wall is worth (RACE_WEEKEND.md, principle 1).
// The same races, with the same luck, run four ways from the grid:
//   average: every call as the team's strategist (rated 60) recommends
//   expert:  every call to the option the numbers say is best
//   bad:     every call to an option picked at random, as a player who
//            ignores the strategist and the numbers might
//   (worst:  every call to the option the numbers say is worst, for scale)
// Targets: the expert gains about a place per car per race over the
// average strategist, and the bad one loses about as much.
// Usage: node tests/w5-strategist.js [races]   (RATING=80 for another strategist)

import { newGame, startSeason, PLAYER } from '../src/engine/game.js'
import { beginWeekend, runQualifying, startRace, nextLap, answerCall } from '../src/engine/live.js'
import { clone } from '../src/engine/util.js'

// 240 races: the random player's loss and the expert's gain are each about
// 0.65 places, and 120 races leave too much noise to tell them from the band.
const RACES = Number(process.argv[2] || 240)
const RATING = Number(process.env.RATING || 60)

let failures = 0
const band = (name, value, lo, hi) => {
  const ok = value >= lo && value <= hi
  if (!ok) failures++
  console.log(`${ok ? 'IN  ' : 'OUT '}  ${name.padEnd(44)} ${value.toFixed(2).padStart(6)}   target ${lo} to ${hi}`)
}

const POLICY = {
  average: (call) => call.recommend,
  expert: (call) => Object.keys(call.estimates).reduce((b, k) => (call.estimates[k] < call.estimates[b] ? k : b)),
  bad: (call) => { const keys = Object.keys(call.estimates); return keys[hash(call.id) % keys.length] },
  worst: (call) => Object.keys(call.estimates).reduce((b, k) => (call.estimates[k] > call.estimates[b] ? k : b)),
}
const hash = (text) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)

// Finishing places of your two cars (a retirement counts as last).
function run(game, policy) {
  const g = clone(game)
  const w = g.weekend
  let calls = 0
  let differ = 0
  while (w.phase === 'race') {
    for (const call of w.calls) {
      if (call.id in w.answered) continue
      const key = policy(call)
      calls++
      if (key !== call.recommend) differ++
      answerCall(g, call.id, key)
    }
    nextLap(g)
  }
  const st = w.state
  const places = st.cars.filter((c) => c.e.isPlayer).map((c) => (c.status === 'running' ? st.order.indexOf(c.idx) + 1 : 24))
  return { places, calls, differ }
}

const total = { average: 0, expert: 0, bad: 0, worst: 0 }
let cars = 0
let calls = 0
let expertDiffer = 0
const swings = []
const t0 = Date.now()
for (let i = 0; i < RACES; i++) {
  const g = newGame({ seed: 500 + i, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false }, involvement: 'live' })
  // A midfield car, where places are there to be won and lost.
  Object.assign(g.teams[PLAYER].car, { aero: 77, chassis: 77 })
  g.org.keyStaff.chiefStrategist.rating = RATING
  startSeason(g)
  g.round = i % g.calendar.length
  beginWeekend(g)
  runQualifying(g)
  startRace(g)
  const res = {}
  for (const [name, policy] of Object.entries(POLICY)) res[name] = run(g, policy)
  for (const name of Object.keys(total)) total[name] += res[name].places.reduce((s, p) => s + p, 0)
  cars += 2
  calls += res.average.calls
  expertDiffer += res.expert.differ
  swings.push(res.average.places.reduce((s, p) => s + p, 0) - res.expert.places.reduce((s, p) => s + p, 0))
}
const per = (name) => total[name] / cars
console.log(`Over ${RACES} races (${((Date.now() - t0) / RACES).toFixed(0)} ms a race): ${(calls / RACES).toFixed(1)} calls a race, the expert overrules the strategist on ${(expertDiffer / RACES).toFixed(1)} a race`)
console.log(`  Average finishing place: average ${per('average').toFixed(2)}, expert ${per('expert').toFixed(2)}, bad ${per('bad').toFixed(2)}, worst every time ${per('worst').toFixed(2)}`)
console.log(`  Races where the expert gains places: ${swings.filter((x) => x > 0).length}, loses places: ${swings.filter((x) => x < 0).length}`)
if (RATING === 60) {
  band('Expert gain over average, places per car', per('average') - per('expert'), 0.6, 1.5)
  band('Bad strategist loss, places per car', per('bad') - per('average'), 0.6, 1.5)
} else console.log(`  Strategist rated ${RATING}: the expert gains ${(per('average') - per('expert')).toFixed(2)} places a car`)
console.log(failures ? `\n${failures} measure(s) out of band` : '\nAll measures in band')
process.exit(failures ? 1 : 0)
