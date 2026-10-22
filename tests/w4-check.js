// Race weekend W4 check: Friday practice. The dials do what they say, the
// drivers' feedback points the right way, the engineers' setup costs about
// what the quick path's does, following the feedback pays, practice changes
// only your cars, and practice and qualifying can each be skipped while the
// race is always run.
// Usage: node tests/w4-check.js [weekends]

import { newGame, startSeason, PLAYER } from '../src/engine/game.js'
import {
  beginWeekend, beginPractice, toQualifying, setWing, startRace, nextLap, setAutoCalls, finishWeekend, playsPractice, playsQualifying,
} from '../src/engine/live.js'
import { practiceRun, setBalance, setRunKind, idealBalance, engineersBalance, balanceLoss, SETUP } from '../src/engine/practice.js'
import { teamOps } from '../src/engine/core.js'

const N = Number(process.argv[2] || 400)
const setup = (seed, extra = {}) => newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false }, involvement: 'live', ...extra })

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const expectThrow = (fn) => { try { fn(); return false } catch { return true } }
const mine = (st) => st.cars.filter((c) => c.e.isPlayer)

function weekend(seed) {
  const g = setup(seed)
  startSeason(g)
  beginWeekend(g)
  return g
}

// ---- The flow ----
{
  const g = weekend(1)
  check('practice is on by default, as is qualifying', playsPractice(g) && playsQualifying(g))
  check('balance is set only in practice', expectThrow(() => setBalance(g, 0, 1)))
  beginPractice(g)
  check('into practice from the briefing', g.weekend.phase === 'practice' && g.weekend.practice.cars.every((c) => c.left === SETUP.runs))
  for (let i = 0; i < SETUP.runs + 2; i++) practiceRun(g)
  const runs = g.weekend.practice.cars.map((c) => c.runs.length)
  check(`each car gets ${SETUP.runs} runs and no more`, runs.every((n) => n === SETUP.runs), runs.join(', '))
  check('every setup run comes back with a time and two lines of feedback', g.weekend.practice.cars.every((c) => c.runs.every((r) => r.time > 60 && r.notes.length === 2)))
  toQualifying(g)
  check('then qualifying, with the setup locked', g.weekend.phase === 'quali' && expectThrow(() => setWing(g, 0, 3)))
}
{
  const a = weekend(2)
  const b = weekend(2)
  for (const g of [a, b]) { beginPractice(g); setBalance(g, 0, 2); practiceRun(g); setRunKind(g, 1, 'long'); practiceRun(g) }
  check('same choices, same practice', JSON.stringify(a.weekend.practice) === JSON.stringify(b.weekend.practice))
}

// ---- What the setup is worth ----
{
  const g = weekend(3)
  beginPractice(g)
  const ideal = idealBalance(g, 0)
  setBalance(g, 0, ideal)
  setBalance(g, 1, ideal <= 0 ? ideal + 2 : ideal - 2)
  toQualifying(g, { skipQuali: true })
  const [c0, c1] = mine(g.weekend.state)
  check('the ideal balance costs nothing; two steps off cost 0.4 s a lap', c0.setupLoss === 0 && Math.abs(c1.setupLoss - 4 * SETUP.balanceCost) < 1e-9, `${c0.setupLoss}, ${c1.setupLoss.toFixed(3)}`)
}
{
  // Rivals' cars are the same whatever your cars do in practice.
  const runWith = (bal, kind) => {
    const g = weekend(4)
    beginPractice(g)
    setBalance(g, 0, bal); setRunKind(g, 0, kind)
    practiceRun(g)
    toQualifying(g, { skipQuali: true })
    return g.weekend.state.cars.filter((c) => !c.e.isPlayer).map((c) => [c.pace, c.setupLoss, c.wing])
  }
  check('practice changes only your cars', JSON.stringify(runWith(-2, 'setup')) === JSON.stringify(runWith(2, 'long')))
}
{
  const g = weekend(5)
  g.weekend.friday = ['dry', 'dry', 'dry'] // a wet long run teaches nothing (w55-check)
  beginPractice(g)
  setRunKind(g, 1, 'long')
  practiceRun(g)
  toQualifying(g, { skipQuali: true })
  const [c0, c1] = mine(g.weekend.state)
  check('a long run means a little less tyre wear in the race', c1.m.wearMult === SETUP.longRunWear && c0.m.wearMult === undefined)
}

// Over many weekends: the engineers' own setup costs about what the quick
// path's rolled setup loss does, so skipping practice is neither a penalty
// nor a shortcut; and a player who follows the feedback does better.
{
  let eng = 0
  let rolled = 0
  let followed = 0
  let pointing = 0
  let lines = 0
  for (let i = 0; i < N; i++) {
    const g = weekend(1000 + i)
    for (const slot of [0, 1]) {
      const d = g.drivers[g.teams[PLAYER].drivers[slot]]
      const skill = Math.min(100, 0.6 * teamOps(g, PLAYER).setup + 0.4 * d.feedback)
      rolled += 0.08 * (1.6 - skill / 100) // the mean of |N(0, 1)| × 0.1 × (1.6 − skill / 100)
      eng += balanceLoss(engineersBalance(g, slot), idealBalance(g, slot))
    }
    // The scripted player moves the balance one step the way the driver says, each run.
    beginPractice(g)
    for (let r = 0; r < SETUP.runs; r++) {
      practiceRun(g)
      for (const slot of [0, 1]) {
        const p = g.weekend.practice.cars[slot]
        const note = p.runs[p.runs.length - 1].notes[1]
        const off = p.balance - idealBalance(g, slot)
        const says = /understeer/i.test(note) ? 1 : /rear/i.test(note) ? -1 : 0
        if (off !== 0) { lines++; if (Math.sign(off) === says) pointing++ }
        if (says) setBalance(g, slot, p.balance - says)
      }
    }
    for (const slot of [0, 1]) followed += balanceLoss(g.weekend.practice.cars[slot].balance, idealBalance(g, slot))
  }
  const per = (x) => x / (2 * N)
  console.log(`  Setup loss a lap: quick path ${per(rolled).toFixed(3)} s, engineers' setup ${per(eng).toFixed(3)} s, following the feedback ${per(followed).toFixed(3)} s`)
  check("the engineers' setup costs about what the quick path's does", Math.abs(per(eng) - per(rolled)) < 0.015)
  check('following the feedback beats the engineers by 0.03 s a lap or more', per(eng) - per(followed) >= 0.03, `${(per(eng) - per(followed)).toFixed(3)} s`)
  check('when the balance is off, the driver says which way at least 70% of the time', pointing / lines >= 0.7, `${(100 * pointing / lines).toFixed(0)}%`)
}

// ---- Skipping ----
{
  const g = weekend(6)
  g.settings.practice = false
  g.settings.quali = 'strategist'
  check('practice and qualifying can be turned off in the settings', !playsPractice(g) && !playsQualifying(g))
  const before = g.weekend.balance.slice()
  toQualifying(g)
  check('then the briefing goes straight to the grid on the engineers\' setup', g.weekend.phase === 'grid' && g.weekend.state.qs.done && JSON.stringify(g.weekend.balance) === JSON.stringify(before))
}
{
  const g = weekend(7)
  beginPractice(g)
  toQualifying(g, { skipQuali: true })
  check('qualifying can be skipped for one weekend from practice', g.weekend.phase === 'grid')
  // The race is always run, but the strategist can take the calls.
  startRace(g)
  setAutoCalls(g, true)
  let blocks = 0
  while (g.weekend.phase === 'race' && blocks < 100) { nextLap(g); blocks++ }
  check('with the strategist on the calls the race plays to the flag without stopping', g.weekend.phase === 'flag')
  const res = finishWeekend(g)
  check('and the result is filed', res.race.length === 24 && !g.weekend)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
