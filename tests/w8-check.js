// Race weekend W8 check: where the race in 3D puts each car.
//   1. On the grid the cars stand two by two, alternating sides.
//   2. In the race a car level with the one ahead moves alongside it, and a
//      third alongside goes to the other side; with a gap they line up again.
//   3. A car in the pit lane is marked so, and a retired car is parked off
//      the track.
//   4. Every place is on the lap (0 to 1), follows the speed profile, and
//      behind the safety car follows it less, as on the 2D map.
//   (The circuit, the cars and the cameras are checked in the browser.)
// Usage: node tests/w8-check.js

import { placements, TRACK_W } from '../src/ui/racePlace.js'
import { getProfile } from '../src/ui/speedProfile.js'
import { TRACKS } from '../src/engine/data/tracks.js'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const car = (id) => ({ id, e: { name: id, isPlayer: false } })
const row = (id, d, extra = {}) => ({ c: car(id), d, gap: 0, tyre: 'M', ...extra })
const circuit = { profile: getProfile('silverstone') }

// 1. The grid.
const grid = { order: Array.from({ length: 6 }, (_, i) => row(`g${i}`, -0.004 - i * 0.0035)), gone: [], leaderD: 0, lap: 0, under: null }
const g = placements(grid, circuit).list
check('the grid is two by two, alternating sides', g.every((p, i) => p.lat === (i % 2 ? -0.95 : 0.95)), g.map((p) => p.lat).join(' '))

// 2. Side by side.
const race = { order: [row('a', 5.5), row('b', 5.499), row('c', 5.498), row('d', 5.48)], gone: [], leaderD: 5.5, lap: 6, under: null, timed: true }
const r = placements(race, circuit).list
check('a car level with the one ahead moves alongside, a third to the other side', r[0].lat === 0 && r[1].lat > 0 && r[2].lat < 0, r.map((p) => p.lat).join(' '))
check('with a gap the cars line up again', r[3].lat === 0)

// 3. The pit lane and a retirement.
const stops = { ...race, order: [row('a', 5.5), row('b', 5.01, { pit: true, laneF: 0.01 })], gone: [row('x', 5.3, { out: true })] }
const s = placements(stops, circuit).list
check('a car in the pit lane is marked so', s[1].pit === true && s[1].lat === 0)
check('a retired car is parked off the track', s[2].gone && s[2].lat > TRACK_W / 2)

// 4. On the lap, on the profile, slower behind the safety car.
let onLap = true
for (const t of TRACKS) {
  const c = { profile: getProfile(t.id) }
  const snap = { order: Array.from({ length: 20 }, (_, i) => row(`r${i}`, 10 - i * 0.031)), gone: [], leaderD: 10, lap: 11, under: null, timed: true }
  if (!placements(snap, c).list.every((p) => p.f >= 0 && p.f < 1)) onLap = false
}
check('every place on every circuit is on the lap', onLap)
const { where: normal } = placements({ ...race, order: [], gone: [] }, circuit)
const { where: slow } = placements({ ...race, under: 'sc', order: [], gone: [] }, circuit)
const p = circuit.profile
const d = 3.37
check('cars follow the speed profile', Math.abs(normal(d) - p.warp(d)) < 1e-9)
check('behind the safety car they follow it less', Math.abs(slow(d) - d) < Math.abs(normal(d) - d) && Math.abs(slow(d) - (d + (p.warp(d) - d) * 0.3)) < 1e-9)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
