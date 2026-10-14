// Race weekend W5 check: the A/B deck folded into the live weekend. Cards a
// live weekend covers are not drawn; the other race-weekend cards come up as
// incidents on the day they would happen, hold the weekend until answered,
// and do to the cars exactly what they do before a quick-simmed weekend.
// Usage: node tests/w5-check.js

import { newGame, startSeason, simulateRound, createWeekendRace, PLAYER } from '../src/engine/game.js'
import {
  beginWeekend, beginPractice, runPractice, toQualifying, runSession, startRace, quickFinish, incidentDue, resolveIncident,
} from '../src/engine/live.js'
import { forceDecision, deferredIncident, isIncidentCard, LIVE_CALLS, INCIDENT_DAY, DECK, resolveDecision, bestChoice } from '../src/engine/decisions.js'

const setup = (seed, involvement = 'live') => newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['herta', 'doohan'], reserveId: 'crawford', options: { decisions: true, targets: false }, involvement })

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const expectThrow = (fn) => { try { fn(); return false } catch { return true } }
const mine = (st) => st.cars.filter((c) => c.e.isPlayer)

// A fresh season with a named card on the table for round one.
function withCard(id, seed = 3) {
  const g = setup(seed)
  startSeason(g)
  if (!forceDecision(g, id)) throw new Error(`${id} does not apply here`)
  return g
}

// ---- The deck ----
{
  const weekendCards = DECK.filter((d) => d.type === 'Race weekend' || d.type === 'Reliability').map((d) => d.id)
  const sorted = weekendCards.every((id) => LIVE_CALLS.has(id) || isIncidentCard(id))
  check('every race-weekend card is either covered by the live weekend or an incident', sorted, `${weekendCards.length} cards: ${LIVE_CALLS.size} covered, ${Object.keys(INCIDENT_DAY).length} incidents`)
  check('no card is both', !Object.keys(INCIDENT_DAY).some((id) => LIVE_CALLS.has(id)))
  // Over two live seasons, no covered card is drawn, and weekend cards wait for the weekend.
  const g = setup(21)
  let drawn = 0
  let covered = 0
  let deferred = 0
  let incidents = 0
  for (let s = 0; s < 2; s++) {
    startSeason(g)
    while (g.phase === 'season') {
      if (g.decision && !g.decision.resolved) {
        drawn++
        if (LIVE_CALLS.has(g.decision.id)) covered++
        if (deferredIncident(g)) deferred++
        else resolveDecision(g, bestChoice(g)) // the round's HQ decision
      }
      beginWeekend(g)
      if (g.weekend.incident) incidents++
      quickFinish(g)
    }
    g.season++; g.round = 0; g.results = []; g.phase = 'preseason'
  }
  check('a live season never draws a card the live weekend covers', covered === 0, `${drawn} drawn`)
  check('race-weekend cards wait for the weekend, and come up there', deferred > 5 && deferred === incidents, `${incidents} incidents in 32 rounds`)
}

// ---- On the day ----
{
  const g = withCard('driver-ill')
  check('the card is held back from the pit wall while playing live', deferredIncident(g))
  beginWeekend(g)
  check('Thursday: at the briefing, and the weekend waits for it', g.decision === null && incidentDue(g)?.id === 'driver-ill' && expectThrow(() => beginPractice(g)) && expectThrow(() => toQualifying(g)))
  resolveIncident(g, 'b')
  beginPractice(g)
  check('a reserve standing in is the one who drives', g.weekend.state === null && mine(createWeekendRace(g)).some((c) => c.id === g.reserve))
}
{
  const g = withCard('practice-crash')
  beginWeekend(g)
  check('Friday: nothing at the briefing', !incidentDue(g))
  beginPractice(g)
  check('nor before the first run', !incidentDue(g))
  runPractice(g)
  check('then after the first run, holding the next', incidentDue(g)?.id === 'practice-crash' && expectThrow(() => runPractice(g)) && expectThrow(() => toQualifying(g)))
}
{
  const g = withCard('practice-crash')
  beginWeekend(g)
  toQualifying(g, { skipQuali: true })
  check('Friday with practice left to the engineers: on Saturday, before qualifying runs', g.weekend.phase === 'quali' && incidentDue(g)?.id === 'practice-crash' && expectThrow(() => runSession(g)))
  resolveIncident(g, 'b')
  check('and qualifying then runs itself as asked', g.weekend.phase === 'grid')
}
{
  const g = withCard('overheat')
  beginWeekend(g)
  toQualifying(g, { skipQuali: true })
  check('Sunday: not before the grid', g.weekend.phase === 'grid' && !!incidentDue(g) && expectThrow(() => startRace(g)))
}

// ---- The same effect as before a quick sim ----
// The cars after an incident answered on Saturday or Sunday match the cars
// built with the card answered before the weekend.
for (const [id, choice] of [['overheat', 'a'], ['overheat', 'b'], ['quali-engine-mode', 'a'], ['gearbox-fault', 'b'], ['vibration', 'a']]) {
  const late = withCard(id)
  beginWeekend(late)
  toQualifying(late, { skipQuali: false })
  if (!incidentDue(late)) { late.weekend.phase = 'grid' } // a Sunday card: look from the grid
  resolveIncident(late, choice)
  const early = withCard(id)
  beginWeekend(early)
  early.weekend.incident.shownIn = 'test'
  early.weekend.phase = ['briefing', 'quali', 'quali', 'grid'][early.weekend.incident.day] // due, with no race set up yet
  resolveIncident(early, choice)
  early.weekend.phase = 'briefing'
  const st = createWeekendRace(early, { liveQuali: true })
  const pick = (s) => mine(s).map((c) => [c.pace, c.qBase, c.pMech, c.pCrash, c.m])
  const a = JSON.stringify(pick(late.weekend.state))
  const b = JSON.stringify(pick(st))
  check(`${id} ${choice.toUpperCase()} late does what it does early`, a === b)
}
{
  // A two-race buff lasts two races whenever it is decided.
  const g = withCard('pit-crew-injury')
  beginWeekend(g)
  beginPractice(g)
  runPractice(g)
  resolveIncident(g, 'a')
  const left = g.buffs.find((b) => b.mods.pitTime)?.roundsLeft
  const q = setup(3, 'quick')
  startSeason(q)
  forceDecision(q, 'pit-crew-injury')
  q.decision.reveal = true
  resolveDecision(q, 'a')
  simulateRound(q)
  check('a buff from an incident runs out when it would from the pit wall', left === q.buffs.find((b) => b.mods.pitTime)?.roundsLeft, `${left}`)
}
{
  // Quick sim of a live player's weekend: the card is put to them first.
  const g = withCard('overheat')
  g.decision.reveal = true
  check('quick-simming shows the card on the pit wall instead', !deferredIncident(g))
  const h = withCard('gearbox-fault')
  beginWeekend(h)
  const res = quickFinish(h)
  check('a weekend left to the strategist answers the incident itself', res.race.length === 24 && h.decisionLog.some((l) => l.id === 'gearbox-fault'))
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
