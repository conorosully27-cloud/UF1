// Milestone 1 check: structure, determinism and calibration of the weekend
// simulation against the targets in DESIGN.md section 5.10.
// Usage: node tests/m1-check.js [seasons]

import { newGame, startSeason, simulateRound, raceRound, endSeason, getStandings, effectiveCar, PLAYER } from '../src/engine/game.js'
import { carScore, SIM } from '../src/engine/weekend.js'
import { TRACK_BY_ID } from '../src/engine/data/tracks.js'

const SEASONS = Number(process.argv[2] || 1000)
// For tuning: SIM_OVERRIDE='{"dayFormSd":0.04}' node tests/m1-check.js 200
if (process.env.SIM_OVERRIDE) Object.assign(SIM, JSON.parse(process.env.SIM_OVERRIDE))
const setup = (seed) => newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false } })

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const band = (name, value, lo, hi, fmt = (v) => (v * 100).toFixed(1) + '%') => {
  const ok = value >= lo && value <= hi
  console.log(`${ok ? 'IN  ' : 'OUT '}  ${name.padEnd(38)} ${fmt(value).padStart(8)}   target ${fmt(lo)}-${fmt(hi)}`)
  return ok
}

// ---- Structure and determinism ----
{
  const a = setup(42)
  const b = setup(42)
  startSeason(a); startSeason(b)
  let same = true
  let structure = true
  for (let r = 0; r < 16; r++) {
    const ra = simulateRound(a)
    const rb = simulateRound(b)
    if (JSON.stringify(ra) !== JSON.stringify(rb)) same = false
    const pos = new Set(ra.race.map((x) => x.pos))
    const ids = new Set(ra.race.map((x) => x.id))
    if (ra.race.length !== 24 || pos.size !== 24 || ids.size !== 24 || ra.quali.length !== 24) structure = false
    const pts = ra.race.reduce((s, x) => s + x.points, 0)
    const finishers = ra.race.filter((x) => x.status === 'finished').length
    if (finishers >= 10 && pts !== 101) structure = false
    for (const x of ra.race) if (x.status === 'finished' && !(x.gap >= 0)) structure = false
  }
  check('24 cars classified, unique positions, 101 points per race', structure)
  check('same seed gives the same season', same)
  check('season ends after 16 rounds', a.phase === 'seasonEnd')
  const c = setup(43)
  startSeason(c)
  check('different seed gives a different result', JSON.stringify(simulateRound(c).race) !== JSON.stringify(a.results[0].race))
  const st = getStandings(a)
  check('standings list 12 teams and 24 drivers', st.constructors.length === 12 && st.drivers.length === 24)
  endSeason(a)
  check('season rolls over', a.season === 2 && a.phase === 'preseason' && a.history.length === 1)
}

// ---- Calibration ----
// Cars are held fixed here: only the weekend simulation is under test.
const nextSeason = (g) => { g.season++; g.round = 0; g.results = []; g.phase = 'preseason' }
const game = setup(7)
const teamIds = Object.keys(game.teams)
const fastestAt = {}
for (const [tid, track] of Object.entries(TRACK_BY_ID)) {
  let best = null
  for (const id of teamIds) {
    const s = carScore(effectiveCar(game, id), track.w)
    if (!best || s > best.s) best = { id, s }
  }
  fastestAt[tid] = best.id
}
const slowThree = teamIds
  .map((id) => ({ id, s: carScore(effectiveCar(game, id), { aero: 0.4, chassis: 0.35, power: 0.25 }) }))
  .sort((a, b) => a.s - b.s).slice(0, 3).map((x) => x.id)

const rivalSlowThree = teamIds.filter((id) => id !== PLAYER)
  .map((id) => ({ id, s: carScore(effectiveCar(game, id), { aero: 0.4, chassis: 0.35, power: 0.25 }) }))
  .sort((a, b) => a.s - b.s).slice(0, 3).map((x) => x.id)

const tally = {
  races: 0, starts: 0, dnf: 0, scRaces: 0, wet: 0, poleWin: 0, fastestWin: 0, slowStarts: 0, slowPoints: 0,
  moved: 0, lapped: 0, fastestDayWin: 0, rivalSlowStarts: 0, rivalSlowPoints: 0, playerPointsRaces: 0, playerAheadCadillac: 0, playerAheadAnyCadillac: 0, titles: {}, winners: {},
}
const teamPoints = Object.fromEntries(teamIds.map((id) => [id, 0]))
const teamPosSum = Object.fromEntries(teamIds.map((id) => [id, 0]))
const t0 = Date.now()
for (let s = 0; s < SEASONS; s++) {
  startSeason(game)
  for (let r = 0; r < 16; r++) {
    const res = raceRound(game)
    tally.races++
    tally.starts += res.race.length
    tally.dnf += res.stats.retirements
    if (res.stats.safetyCars > 0) tally.scRaces++
    if (res.weather.race !== 'dry') tally.wet++
    const winner = res.race[0]
    if (winner.grid === 1) tally.poleWin++
    if (winner.teamId === fastestAt[res.trackId]) tally.fastestWin++
    if (res.detail[winner.id].paceRank === 1) tally.fastestDayWin++
    tally.winners[winner.teamId] = (tally.winners[winner.teamId] || 0) + 1
    let bestPlayer = 99
    let bestCadillac = 99
    let worstCadillac = 0
    for (const x of res.race) {
      if (slowThree.includes(x.teamId)) { tally.slowStarts++; if (x.points > 0) tally.slowPoints++ }
      if (rivalSlowThree.includes(x.teamId)) { tally.rivalSlowStarts++; if (x.points > 0) tally.rivalSlowPoints++ }
      if (x.status === 'finished') { tally.moved += Math.abs(x.grid - x.pos); if (x.lapsDown > 0) tally.lapped++ }
      if (x.teamId === PLAYER) { if (x.points > 0) tally.playerPointsRaces++; bestPlayer = Math.min(bestPlayer, x.pos) }
      if (x.teamId === 'cadillac') { bestCadillac = Math.min(bestCadillac, x.pos); worstCadillac = Math.max(worstCadillac, x.pos) }
    }
    if (bestPlayer < bestCadillac) tally.playerAheadCadillac++
    if (bestPlayer < worstCadillac) tally.playerAheadAnyCadillac++
  }
  const st = getStandings(game)
  st.constructors.forEach((c, i) => { teamPoints[c.id] += c.points; teamPosSum[c.id] += i + 1 })
  tally.titles[st.constructors[0].id] = (tally.titles[st.constructors[0].id] || 0) + 1
  nextSeason(game)
}
const ms = Date.now() - t0

console.log(`\nCalibration over ${SEASONS} seasons (${tally.races} races, ${(ms / tally.races).toFixed(2)} ms per race)`)
const finished = tally.starts - tally.dnf
let inBand = 0
inBand += band('Retirements per start', tally.dnf / tally.starts, 0.10, 0.12)
inBand += band('Races with a safety car', tally.scRaces / tally.races, 0.55, 0.60)
inBand += band('Wet or mixed races', tally.wet / tally.races, 0.10, 0.15)
// A design choice: a little more chaos than real F1, so pole and the fastest
// car win less often and the front does not go stale (DESIGN.md 5.10).
inBand += band('Pole converts to a win', tally.poleWin / tally.races, 0.35, 0.45)
inBand += band('Fastest car on the day wins', tally.fastestDayWin / tally.races, 0.40, 0.55)
inBand += band('Bottom-three rival car scores points', tally.rivalSlowPoints / tally.rivalSlowStarts, 0.05, 0.10)
console.log(`${inBand} of 6 calibration measures in band`)

console.log('\nFor information:')
console.log(`  Places gained or lost per finisher: ${(tally.moved / finished).toFixed(2)}`)
console.log(`  Lapped finishers per race: ${(tally.lapped / tally.races).toFixed(1)}`)
console.log(`  Player scores points in ${(100 * tally.playerPointsRaces / (tally.races * 2)).toFixed(1)}% of starts`)
console.log(`  Player's best car beats Cadillac's best in ${(100 * tally.playerAheadCadillac / tally.races).toFixed(1)}% of races`)
console.log(`  Player's best car beats at least one Cadillac in ${(100 * tally.playerAheadAnyCadillac / tally.races).toFixed(1)}% of races`)
console.log(`  Slowest three teams: ${slowThree.join(', ')}`)
console.log('\n  Team            avg points  avg pos  titles  wins')
for (const id of teamIds.sort((a, b) => teamPoints[b] - teamPoints[a])) {
  console.log(`  ${game.teams[id].name.padEnd(15)} ${(teamPoints[id] / SEASONS).toFixed(1).padStart(9)} ${(teamPosSum[id] / SEASONS).toFixed(2).padStart(8)} ${String(tally.titles[id] || 0).padStart(7)} ${String(tally.winners[id] || 0).padStart(5)}`)
}

// ---- Scenario: one clearly fastest car ----
// The real grid has four cars within 0.15 s, so "the fastest car wins" is close
// to a coin toss between them. This checks the rate when one car is clear.
{
  const g = setup(99)
  g.teams.mercedes.car.aero += 5
  g.teams.mercedes.car.chassis += 5
  let wins = 0
  let races = 0
  for (let s = 0; s < Math.max(20, SEASONS / 5); s++) {
    startSeason(g)
    for (let r = 0; r < 16; r++) { const res = raceRound(g); races++; if (res.race[0].teamId === 'mercedes') wins++ }
    nextSeason(g)
  }
  console.log('\nScenario: Mercedes given a further 0.2 s a lap, about 0.3 s clear of the field')
  band('Clearly fastest car wins', wins / races, 0.55, 0.75)
}

console.log(failures ? `\n${failures} structural check(s) FAILED` : '\nAll structural checks passed')
process.exit(failures ? 1 : 0)
