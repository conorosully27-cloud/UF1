// Visuals V2 check: faces in place.
//   1. Moods: from interest in contract talks and from a race rating, always
//      between -1 and 1, and rising with interest and with the rating.
//   2. A driver's face in a moment carries the driver, their age and their
//      team's colour; every driver named in a season's result moments has one.
//   (Where the faces show on screen is checked in the browser.)
// Usage: node tests/v2-check.js

import { newGame, startSeason, simulateRound, PLAYER } from '../src/engine/game.js'
import { interestMood, ratingMood } from '../src/ui/faces.js'
import { faceOf, resultMoments, signedMoment, leftMoment } from '../src/ui/raceMoments.js'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const rising = (f, xs) => xs.every((x, i) => i === 0 || f(x) >= f(xs[i - 1]))
const bounded = (f, xs) => xs.every((x) => f(x) >= -1 && f(x) <= 1)

// 1. Moods.
const interests = Array.from({ length: 61 }, (_, i) => 20 + i * 1.5)
const ratings = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5)
check('interest moods stay between -1 and 1 and rise with interest', bounded(interestMood, interests) && rising(interestMood, interests))
check('a driver at the signing line looks undecided', interestMood(60) === 0)
check('rating moods stay between -1 and 1 and rise with the rating', bounded(ratingMood, ratings) && rising(ratingMood, ratings))
check('a retirement not the driver\'s fault looks unhappy', ratingMood(null) < 0)

// 2. Faces in moments.
const g = newGame({ seed: 5, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false } })
// A front-running car, so the season has points, podiums and wins to show.
Object.assign(g.teams[PLAYER].car, { aero: 99, chassis: 99, reliability: 99, tyreCare: 99 })
startSeason(g)
const mine = g.teams[PLAYER].drivers
const f = faceOf(g, mine[0], 0.5)
check('a face carries the driver, their age and the team colour', f.id === mine[0] && f.age === g.drivers[mine[0]].age && f.color === g.teams[PLAYER].color && f.mood === 0.5)
check('an unknown driver has no face', faceOf(g, 'nobody') === null)
let named = 0
let faced = 0
while (g.phase === 'season') {
  const res = simulateRound(g)
  for (const m of resultMoments(g, res)) for (const d of m.drivers ?? []) { named++; if (d.face?.id) faced++ }
}
check('every driver in a result moment has a face', named > 0 && faced === named, `${faced} of ${named}`)
const d = g.drivers[mine[0]]
check('signings and departures show the driver', signedMoment(g, d, false).drivers[0].face?.id === d.id && leftMoment(g, d).face?.id === d.id)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
