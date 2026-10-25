// Visuals V5 check: the smaller pieces.
//   1. Every circuit on the calendar has an outline to draw, and a speed
//      profile for the briefing.
//   2. Each race files the cash after it, for the Finance chart.
//   3. The livery: a team without one gets a second colour and a badge; a
//      chosen one is kept; initials come from the team's name.
//   (The charts, the HQ drawing and the badge are checked in the browser.)
// Usage: node tests/v5-check.js

import { newGame, startSeason, simulateRound, PLAYER } from '../src/engine/game.js'
import { TRACKS } from '../src/engine/data/tracks.js'
import { TRACK_MAPS } from '../src/ui/data/trackMaps.js'
import { speedPieces } from '../src/ui/speedProfile.js'
import { livery, initials, BADGE_SHAPES } from '../src/ui/livery.js'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

// 1. Outlines.
const missing = TRACKS.filter((t) => !TRACK_MAPS[t.id]?.length || !speedPieces(t.id).length).map((t) => t.id)
check('every circuit has an outline and a speed profile', missing.length === 0, missing.join(', '))

// 2. Cash after each round.
const g = newGame({ seed: 8, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], options: { decisions: false, targets: false } })
startSeason(g)
let ok = true
for (let i = 0; i < 4; i++) {
  const res = simulateRound(g)
  if (res.cash !== g.finance.cash) ok = false
}
check('each race files the cash after it', ok && g.results.every((r) => typeof r.cash === 'number'))

// 3. The livery.
const team = g.teams[PLAYER]
const plain = livery(team)
check('a team without a livery gets a second colour and a shield', plain.accent && plain.accent !== team.color && plain.badge === 'shield')
team.livery = { accent: '#ffd23f', badge: 'hexagon' }
check('a chosen livery is kept', livery(team).accent === '#ffd23f' && livery(team).badge === 'hexagon' && BADGE_SHAPES.hexagon)
check('initials come from the name', initials('Phoenix Racing') === 'PR' && initials('Apex') === 'AP' && initials('  ') === '?' && initials('Team 7 GP') === 'T7')

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
