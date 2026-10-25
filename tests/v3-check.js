// Visuals V3 and V4 check: what the car on the Car tab shows.
//   1. A new team's car has nothing in design, in the factory or new, and
//      Power is the supplier's.
//   2. An upgrade shows in design, then in the factory, then as a new part
//      for the race after it is fitted, then as nothing again.
//   3. An upgrade that gave nothing shows as a dud.
//   4. The car's third stage: more detail as a rating rises, the sponsors'
//      names on the car, and a rival's car to compare against.
//   (The 3D car and the flat drawing are checked in the browser.)
// Usage: node tests/v3-check.js

import { newGame, startSeason, simulateRound, PLAYER } from '../src/engine/game.js'
import { effectiveCar } from '../src/engine/core.js'
import { startProject } from '../src/engine/development.js'
import { partStates, CAR_AREAS, detailTier, carLook, compareCars } from '../src/ui/carParts.js'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

const g = newGame({ seed: 12, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false } })
startSeason(g)

// 1. A new car.
let s = partStates(g)
check('every rating and Power is shown', Object.keys(CAR_AREAS).every((a) => s[a]?.label))
check('a new car has nothing under way', Object.values(s).every((p) => p.state === null && p.queue.length === 0))
check('Power is the supplier\'s', s.power.rating === effectiveCar(g, PLAYER).power && s.power.supplier === g.suppliers[g.teams[PLAYER].supplier].name)

// 2. One upgrade from the drawing board to the car.
startProject(g, { area: 'tyreCare', size: 'minor', approach: 'standard' })
s = partStates(g)
check('a new project shows in design', s.tyreCare.state === 'design' && s.tyreCare.progress === 0 && s.tyreCare.queue[0]?.stage === 'design', JSON.stringify(s.tyreCare.queue))
check('only its own rating changes', ['aero', 'chassis', 'reliability'].every((a) => s[a].state === null))
const seen = []
for (let i = 0; i < 12 && !seen.includes('new'); i++) {
  simulateRound(g)
  s = partStates(g)
  if (seen[seen.length - 1] !== s.tyreCare.state) seen.push(s.tyreCare.state)
}
check('it goes from design to the factory to a new part', seen.join(' → ').endsWith('build → new') && seen[0] !== null, seen.join(' → '))
check('progress runs from 0 to 1', [s.aero, s.tyreCare].every((p) => p.progress === null || (p.progress >= 0 && p.progress <= 1)))
check('a new part says what it gained', s.tyreCare.last?.gain > 0)
simulateRound(g)
s = partStates(g)
check('after another race it is no longer new', s.tyreCare.state === null, String(s.tyreCare.state))

// 3. A dud.
g.dev.log.push({ season: g.season, round: g.round - 1, area: 'aero', size: 'minor', approach: 'aggressive', gain: 0, dud: true })
check('an upgrade that gave nothing shows as a dud', partStates(g).aero.state === 'dud')

// 4. Detail, names and a rival.
check('detail comes at 60, 75 and 88', [59.9, 60, 74.9, 75, 87.9, 88, 99].map(detailTier).join('') === '0112233')
const mine = carLook(g, PLAYER)
check('a new team\'s car has the least detail', Object.values(mine.tiers).every((x) => x <= 1), JSON.stringify(mine.tiers))
g.sponsors.deals = [
  { id: 1, name: 'Partner Co', tier: 'partner' },
  { id: 2, name: 'Big Title', tier: 'title' },
  { id: 3, name: 'Principal Ltd', tier: 'principal' },
]
let d = carLook(g, PLAYER).decals
check('the title sponsor is on the sidepods and rear wing', d.pods === 'BIG TITLE' && d.rear === 'BIG TITLE')
check('the others are on the nose and front wing, principal first', d.nose === 'PRINCIPAL LTD' && d.front === 'PARTNER CO', JSON.stringify(d))
g.sponsors.deals = []
d = carLook(g, PLAYER).decals
check('without a title sponsor, the team\'s name', d.pods === 'TEST GP' && !d.nose)
const top = Object.values(g.teams).filter((t) => t.id !== PLAYER).sort((a, b) => b.car.aero - a.car.aero)[0]
const theirs = carLook(g, top.id)
check('a rival\'s car carries its name and its own detail', theirs.decals.pods === top.name.toUpperCase() && theirs.tiers.aero === detailTier(top.car.aero) && theirs.tiers.aero >= 2)
const cmp = compareCars(g, top.id)
check('the comparison covers every rating and Power', Object.keys(CAR_AREAS).every((a) => Math.abs(cmp[a].gap - (cmp[a].mine - cmp[a].theirs)) < 1e-9) && cmp.aero.gap < 0)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
