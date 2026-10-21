// The race weekend run live (RACE_WEEKEND.md): the player sets the car up in
// practice, runs the three qualifying sessions, picks start tyres and runs the pit wall
// during the race. The weekend is kept in game.weekend, so a save made part-way through
// carries on where it left off.

import { PLAYER, clamp, ordinal, currentTrack } from './core.js'
import { preRace, postRace, createWeekendRace, completeRace, recommendedWing } from './game.js'
import {
  stepRace, runToEnd, advice, neutralGain, bestStop, planRest, TYRES, ORDERS, DEFAULT_ORDERS, tyreLife, wearRate, lapAt, tyreDelta,
  beginQualiSession, endQualiSession, qualiPlan, qualiDrop, qualiPace, QUALI, addCarMods,
} from './weekend.js'
import { INCIDENT_DAY, isIncidentCard, resolveDecision, bestChoice } from './decisions.js'
import { weekendObjectives, objectiveStatus } from './highlights.js'
import { hashString, streamRng } from './rng.js'
import { startPractice, engineersBalance, practiceRun, fridayWeather, SETUP } from './practice.js'

const ROLLOUTS = 4
const SLICKS = ['S', 'M', 'H']
const clone = (x) => JSON.parse(JSON.stringify(x))
const surname = (name) => name.split(' ').slice(-1)[0]

export const weekendActive = (game) => !!game.weekend?.live

const myCars = (state) => state.cars.filter((c) => c.e.isPlayer)
const carById = (state, id) => state.cars.find((c) => c.id === id)

// ---- Before the race ----

export function beginWeekend(game) {
  if (game.weekend) throw new Error('A race weekend is already under way')
  // A race-weekend card drawn for this round comes up during the weekend instead.
  const dec = game.decision
  const incident = dec && !dec.resolved && isIncidentCard(dec.id) ? dec : null
  if (incident) game.decision = null
  preRace(game)
  const wingAdvice = [0, 1].map((s) => recommendedWing(game, s))
  const friday = fridayWeather(game)
  game.weekend = {
    live: true, season: game.season, round: game.round, phase: 'briefing',
    wing: wingAdvice.map((a) => a.level), wingAdvice, balance: [0, 1].map((s) => engineersBalance(game, s)), orders: [{ ...DEFAULT_ORDERS }, { ...DEFAULT_ORDERS }],
    objectives: weekendObjectives(game), calls: [], answered: {}, boxes: {}, log: [], radio: [], snapshots: [], state: null,
    friday, forecast: forecast(game, friday),
    incident: incident ? { ...incident, day: INCIDENT_DAY[incident.id] } : null,
  }
  return game.weekend
}

// ---- Incidents ----

const PHASE_DAY = { briefing: 0, practice: 1, quali: 2, grid: 3, race: 4, flag: 4 }
export const DAY_NAMES = ['Thursday', 'Friday', 'Saturday', 'Sunday']

// The weekend's incident, once its day has come: Friday's after the first
// practice run (or on Saturday when practice is left to the engineers).
export function incidentDue(game) {
  const w = game.weekend
  const inc = w?.incident
  if (!inc || inc.resolved) return null
  const today = PHASE_DAY[w.phase]
  if (inc.day === 1 && w.phase === 'practice') return w.practice?.cars.some((c) => c.runs.length) ? inc : null
  return inc.day <= today ? inc : null
}

function settleFirst(game) {
  if (incidentDue(game)) throw new Error('Deal with the incident first')
}

// Answers the incident. Effects on the cars apply to this weekend straight
// away, even when qualifying or the race is already set up.
export function resolveIncident(game, choice) {
  const w = game.weekend
  const inc = incidentDue(game)
  if (!inc) throw new Error('There is no incident waiting')
  const n = { mods: game.weekendMods.length, buffs: game.buffs.length, later: game.delayed.length }
  resolveDecision(game, choice, inc)
  const added = game.weekendMods.slice(n.mods).map((x) => ({ car: x.car, mods: x.mods, timed: x.timed }))
  // Decided after the round's own countdown, so it lasts as long as it would have before the weekend.
  for (const b of game.buffs.slice(n.buffs)) { b.roundsLeft--; added.push({ car: b.car, mods: b.mods }) }
  for (const d of game.delayed.slice(n.later)) d.roundsLeft--
  if (w.state) {
    for (const x of added) {
      for (const c of myCars(w.state)) {
        if (x.car !== 'both' && x.car !== c.e.slot) continue
        addCarMods(c, x.mods)
        if (x.timed) (c.timed ??= []).push({ ...x.timed })
      }
    }
  }
  if (w.skipQuali && w.phase === 'quali' && !incidentDue(game)) { w.skipQuali = false; runQualifying(game) }
  return inc
}

// The team's own pick, for a weekend left to the strategist.
const teamChoice = (game) => bestChoice(game, game.weekend.incident)

// The weather forecast at the strategist's precision: a strong Chief
// Strategist's numbers lean towards what will really happen, a weak one's
// stay close to the track's usual odds.
function forecast(game, friday = []) {
  const track = game.weatherOverride == null ? currentTrack(game) : { ...currentTrack(game), rain: game.weatherOverride }
  const peek = createWeekendRace(game, { liveQuali: true })
  const r = game.org.keyStaff.chiefStrategist.rating
  const k = clamp((r - 30) / 70, 0.1, 0.9)
  const lean = (base, truth) => Math.round(100 * clamp(base + ((truth ? 1 : 0) - base) * k, 0.02, 0.98))
  const race = lean(track.rain, peek.raceWeather !== 'dry')
  const out = { practice: lean(track.rain * SETUP.fridayRain, friday.includes('wet')), quali: lean(track.rain * 0.8, peek.qualiWet), race, hint: null, sure: r >= 75 }
  // A good strategist can say roughly when the rain comes or goes.
  if (r >= 70 && peek.raceWeather === 'mixed') out.hint = peek.cond[0] === 'dry' ? 'Rain is more likely late in the race' : 'A wet start that should dry out'
  else if (r >= 70 && peek.raceWeather === 'wet') out.hint = 'Rain for most of the race'
  if (r >= 70) out.qualiHint = { drying: 'Qualifying starts damp and should dry out', rain: 'Rain is likely to arrive during qualifying', wet: 'A wet qualifying' }[peek.qs.weather] ?? null
  return out
}

export function setWing(game, slot, level) {
  const w = game.weekend
  if (!w || (w.phase !== 'briefing' && w.phase !== 'practice')) throw new Error('The wing is set before qualifying')
  w.wing[slot] = clamp(Math.round(level), 1, 5)
}

// ---- Friday: practice ----

// Practice and qualifying can each be played or left to the team, in the
// settings or for one weekend. The race is always played.
export const playsPractice = (game) => game.settings.practice !== false
export const playsQualifying = (game) => game.settings.quali !== 'strategist'

export function beginPractice(game) {
  const w = game.weekend
  if (!w || w.phase !== 'briefing') throw new Error('Practice is before qualifying')
  w.balance ??= [0, 1].map((s) => engineersBalance(game, s)) // a save from before practice
  settleFirst(game)
  w.phase = 'practice'
  startPractice(w, game)
}

// One practice run for each car, once any incident is dealt with.
export function runPractice(game) {
  settleFirst(game)
  practiceRun(game)
}

// On from the briefing or practice: qualifying, or straight to the grid when
// the strategist runs it (in the settings, or `skipQuali` for this weekend).
// Practice not run keeps the engineers' setup.
export function toQualifying(game, { skipQuali = !playsQualifying(game) } = {}) {
  startQualifying(game)
  if (!skipQuali) return
  // An incident due now is answered first; qualifying then runs itself.
  if (incidentDue(game)) game.weekend.skipQuali = true
  else runQualifying(game)
}

// ---- Saturday: qualifying ----

const strategistRating = (game) => game.org.keyStaff.chiefStrategist.rating

// Into qualifying: the wing is locked and Q1 is next.
export function startQualifying(game) {
  const w = game.weekend
  if (!w || (w.phase !== 'briefing' && w.phase !== 'practice')) throw new Error('Qualifying has already started')
  settleFirst(game)
  w.state = createWeekendRace(game, { liveQuali: true })
  w.phase = 'quali'
  w.qRadio = []
  w.tow = null
  adviseSession(game)
}

// The strategist's plan for each of your cars still in qualifying, as the default.
function adviseSession(game) {
  const w = game.weekend
  const st = w.state
  const read = strategistRating(game) >= 60
  w.qChoices = {}
  for (const i of st.qs.left) {
    const c = st.cars[i]
    if (!c.e.isPlayer || c.qCrash) continue
    const p = qualiPlan(st, c, read)
    w.qChoices[c.id] = { runs: p.runs, push: p.push }
  }
  if (w.tow && !(w.tow.giver in w.qChoices && w.tow.taker in w.qChoices)) w.tow = null
}

export function setQualiPlan(game, carId, plan) {
  const w = game.weekend
  if (!w || w.phase !== 'quali') throw new Error('Qualifying is not running')
  if (!w.qChoices[carId]) throw new Error('That car is not in this session')
  if (plan.runs === 1 || plan.runs === 2) w.qChoices[carId].runs = plan.runs
  if (plan.push === 'normal' || plan.push === 'big') w.qChoices[carId].push = plan.push
}

// One of your cars gives the other a tow; `takerId` null for none.
export function setTow(game, takerId) {
  const w = game.weekend
  if (!w || w.phase !== 'quali') throw new Error('Qualifying is not running')
  if (!takerId) { w.tow = null; return }
  const ids = Object.keys(w.qChoices)
  if (ids.length !== 2 || !ids.includes(takerId)) throw new Error('Both cars must be in the session for a tow')
  w.tow = { taker: takerId, giver: ids.find((id) => id !== takerId) }
}

// What the session looks like from the pit wall: how many go out, the
// conditions now and (as well as the strategist can tell) later, and where
// each of your cars should end up.
export function qualiOutlook(game) {
  const w = game.weekend
  const st = w.state
  const qs = st.qs
  if (!qs || qs.done) return null
  const s = qs.session
  const r = strategistRating(game)
  const early = qs.slots[s * 2]
  const late = qs.slots[s * 2 + 1]
  let lateText
  if (r >= 70) lateText = late === early ? 'no change expected' : late === 'dry' ? 'drying: slicks for the final runs' : early === 'dry' ? 'rain arriving for the final runs' : `turning ${late} for the final runs`
  else if (r >= 50) lateText = late === early ? 'probably no change' : 'conditions may change late on'
  else lateText = 'hard to say'
  const field = qs.left.map((i) => st.cars[i]).filter((c) => !c.qCrash)
  const order = field.slice().sort((a, b) => qualiPace(st, a, late) - qualiPace(st, b, late))
  const cars = {}
  for (const id of Object.keys(w.qChoices)) {
    const c = carById(st, id)
    const p = qualiPlan(st, c, r >= 60)
    const rank = order.indexOf(c) + 1
    let outlook
    if (p.margin === null) outlook = r >= 60 ? `Projected about P${rank} on pace` : rank <= 3 ? 'In the fight for pole' : 'Fighting for the front of the grid'
    else if (r >= 80) outlook = `About ${Math.abs(p.margin).toFixed(2)} s ${p.margin >= 0 ? 'inside' : 'short of'} the cut on pace`
    else if (r >= 60) outlook = Math.abs(p.margin) < 0.05 ? 'Right on the cut' : `Around ${Math.max(0.1, Math.round(Math.abs(p.margin) * 10) / 10).toFixed(1)} s ${p.margin >= 0 ? 'inside' : 'short of'} the cut`
    else outlook = p.margin > 0.3 ? 'Should get through' : p.margin < -0.3 ? 'Unlikely to get through' : 'On the bubble'
    cars[id] = { advice: { runs: p.runs, push: p.push }, why: p.why, outlook, sets: c.sets }
  }
  const towGain = QUALI.towGain * (st.track.w.power / 0.25)
  return { session: s, n: qs.left.length, drop: qualiDrop(qs.left.length, s), early, late: lateText, cars, towGain }
}

// A session as it happens: `startSession` sends the cars out for their first
// runs; with those laps on the board the pit wall makes the call on each of
// your cars' final runs (`setLateRun`); `finishSession` runs the final laps,
// any late flag and the knockouts. `runSession` does all three on the plan.
export function startSession(game) {
  const w = game.weekend
  if (!w || w.phase !== 'quali') throw new Error('Qualifying is not running')
  settleFirst(game)
  const st = w.state
  if (st.qs.current) return
  beginQualiSession(st, { ...w.qChoices, tow: w.tow })
  w.lateChoices = {}
  for (const row of st.qs.current.rows) {
    const c = st.cars[row.idx]
    if (c.e.isPlayer && !c.qCrash && !row.note) w.lateChoices[c.id] = { ...lateAdvice(game, c, row) }
  }
}

// The strategist's word on a car's final run, once its first lap is in. It
// sticks to the plan (as the quick sim and every rival do) and says when
// staying in the garage to save a set of Softs would be safe.
export function lateAdvice(game, c, row) {
  const st = game.weekend.state
  const s = st.qs.session
  const p = qualiPlan(st, c, strategistRating(game) >= 60)
  const banked = row.laps.some((l) => l.time !== null && !l.error)
  const safe = banked && s < 2 && p.margin !== null && p.margin > (s === 0 ? 1.0 : 0.6)
  const why = !row.laps.length ? 'One run, at the end, when the track is quickest.'
    : safe ? 'That lap should be safely through: you could stay in and save a set.'
      : s === 2 ? 'Pole is decided now: everything on the last lap.'
        : row.laps.some((l) => l.crash) ? 'Car damaged.' : 'One more run to make sure.'
  return { go: true, push: row.push, why, safe }
}

export function setLateRun(game, carId, choice) {
  const w = game.weekend
  const ch = w?.lateChoices?.[carId]
  if (!ch) throw new Error('That car has no final run to decide')
  const row = w.state.qs.current.rows.find((r) => r.id === carId)
  if (choice.go === false && !row.laps.some((l) => l.time !== null)) throw new Error('No time on the board: the car has to run')
  if (typeof choice.go === 'boolean') ch.go = choice.go
  if (choice.push === 'normal' || choice.push === 'big') ch.push = choice.push
}

// `watch` keeps the session on screen (`w.qReplay`) while its final runs
// play out, even after Q3 has set the grid; `doneWatching` moves on.
export function finishSession(game, { watch = false } = {}) {
  const w = game.weekend
  if (!w || w.phase !== 'quali') throw new Error('Qualifying is not running')
  settleFirst(game)
  const st = w.state
  if (!st.qs.current) startSession(game)
  const s = st.qs.session
  endQualiSession(st, w.lateChoices ?? {})
  w.lateChoices = null
  w.qReplay = watch ? s : null
  const ses = st.qs.sessions[s]
  const say = (c, text) => w.qRadio.push({ session: s + 1, id: c.id, text: `${surname(c.e.name)}: "${text}"` })
  for (const row of ses.rows) {
    const c = st.cars[row.idx]
    if (!c.e.isPlayer) continue
    if (row.laps.some((l) => l.crash)) say(c, "I've lost it. I'm in the wall, sorry.")
    else if (row.time === null) say(c, row.laps.some((l) => l.flagged) ? 'The flag came out on my lap! No time.' : 'No lap. That hurts.')
    else if (row.out) say(c, `P${row.pos}. ${row.pos === ses.rows.length - ses.drop + 1 ? 'So close.' : 'That was all there was.'}`)
    else if (s < 2) say(c, row.pos > ses.rows.length - ses.drop - 2 ? `Phew, P${row.pos}. Through!` : `P${row.pos}, through to Q${s + 2}.`)
    else say(c, row.pos === 1 ? 'POLE! Yes! What a car!' : `P${row.pos}. ${row.pos <= 3 ? 'Front rows, great job.' : 'Good lap.'}`)
    if (row.laps.some((l) => l.error && !l.crash)) say(c, 'I made a mistake on one lap.')
  }
  if (st.qs.done) {
    w.phase = 'grid'
    w.qChoices = {}
    w.tow = null
  } else adviseSession(game)
}

export function doneWatching(game) {
  if (game.weekend) game.weekend.qReplay = null
}

// Runs the next session in one go with your plans; after Q3, on to the grid.
export function runSession(game) {
  startSession(game)
  finishSession(game)
}

// Qualifying with the strategist's plans, from the briefing or part-way through.
export function runQualifying(game) {
  const w = game.weekend
  if (!w || !['briefing', 'practice', 'quali'].includes(w.phase)) throw new Error('Qualifying has already run')
  if (w.phase !== 'quali') startQualifying(game)
  while (w.phase === 'quali') runSession(game)
}

export function setStartTyre(game, carId, comp) {
  const w = game.weekend
  if (!w || w.phase !== 'grid') throw new Error('Start tyres are chosen on the grid')
  const st = w.state
  const c = carById(st, carId)
  if (!c?.e.isPlayer || !TYRES[comp]) throw new Error('Not one of your cars')
  if (st.cond[0] === 'dry' && TYRES[comp].wet) throw new Error('The track is dry')
  c.tyre = comp
  c.used = [comp]
  c.stints = [{ comp, lap: 0 }]
  c.two = TYRES[comp].wet
  c.plan = TYRES[comp].wet ? [] : planRest(st, c, 0, comp, 0, false).stops
}

// Standing orders: pace, stance, engine, and the lap-one call before the start.
export function setOrders(game, carId, orders) {
  const w = game.weekend
  if (!w?.state) throw new Error('No race under way')
  const c = carById(w.state, carId)
  if (!c?.e.isPlayer) throw new Error('Not one of your cars')
  for (const k of ['pace', 'stance', 'engine', 'lap1']) if (orders[k] && ORDERS[k][orders[k]]) c.orders[k] = orders[k]
}

// A stop called from the car's controls, made on the next lap. `comp` null cancels it.
export function boxCar(game, carId, comp) {
  const w = game.weekend
  if (!w || w.phase !== 'race') throw new Error('The race is not running')
  const c = carById(w.state, carId)
  if (!c?.e.isPlayer || c.status !== 'running') throw new Error('Not one of your running cars')
  if (comp && !TYRES[comp]) throw new Error('Unknown tyre')
  w.boxes ??= {}
  if (comp) w.boxes[carId] = comp
  else delete w.boxes[carId]
}

export function startRace(game) {
  const w = game.weekend
  if (!w || w.phase !== 'grid') throw new Error('The race is not on the grid')
  settleFirst(game)
  w.phase = 'race'
  w.startSnapshot = JSON.stringify(w.state)
  w.calls = []
  w.radio.push(...myCars(w.state).map((c) => ({ lap: 0, id: c.id, text: `${surname(c.e.name)}: "Starting P${c.grid} on ${TYRES[c.tyre].name}s. Let's go."` })))
}

// ---- Pit-wall calls ----

// Expected finishing position for `carId` if `apply` is done now, averaged
// over a few possible futures. The strategist does not know the real one.
function estimate(state, carId, apply, salt) {
  let total = 0
  for (let k = 0; k < ROLLOUTS; k++) {
    const st = clone(state)
    st.key = hashString(`${state.key}|estimate|${salt}|${k}`)
    total += finishAfter(st, carId, apply)
  }
  return total / ROLLOUTS
}

// Applies one decision, then lets the strategist run every car to the flag.
function finishAfter(st, carId, apply) {
  const orders = apply(st) || {}
  // The decided car does exactly what the option says for this lap; everyone else is up to the strategists.
  for (const c of st.cars) c.controlled = c.id === carId
  stepRace(st, orders)
  runToEnd(st)
  const order = st.order.map((i) => st.cars[i])
  const c = carById(st, carId)
  if (c.status !== 'running') return 25
  return order.indexOf(c) + 1
}

const boxOption = (comp) => ({ key: `box:${comp}`, label: `Box for ${TYRES[comp].name}s`, box: comp })
const STAY = { key: 'stay', label: 'Stay out', box: null }

function callOptions(state, c, preferred) {
  const cnd = state.cond[state.seg]
  const comps = cnd === 'dry' ? SLICKS : cnd === 'wet' ? ['W', 'I'] : ['I', 'W']
  const list = [preferred, ...comps.filter((x) => x !== preferred)].filter(Boolean).slice(0, 2).map(boxOption)
  return [...list, STAY]
}

// What needs deciding before the next lap. Each call has options, the
// strategist's recommendation and an estimate for each option.
export function computeCalls(game) {
  const w = game.weekend
  const st = w.state
  const calls = []
  if (st.done) return (w.calls = calls)
  const S = st.S
  const left = S - st.seg
  const lapsLeft = Math.round(left * st.segLaps)
  const order = st.order.map((i) => st.cars[i])
  const strategist = game.org.keyStaff.chiefStrategist.rating
  for (const c of myCars(st)) {
    if (c.status !== 'running') continue
    const adv = advice(st, c)
    const age = Math.round(c.wear / wearRate(st, c))
    const tyreText = `${TYRES[c.tyre].name}s, ${Math.round(tyreLife(c) * 100)}% worn (${age} laps)`
    let call = null
    if (st.neutral === 'red') {
      // The race is stopped: a free change of tyres for the restart.
      const comp = bestStop(st, c, st.seg).comp
      const opts = callOptions(st, c, comp).map((o) => (o.box ? { ...o, label: `Fit ${TYRES[o.box].name}s` } : { ...o, label: 'Keep these tyres' }))
      call = { kind: 'red', title: 'Red flag: tyres for the restart?', text: `${c.e.name}: ${tyreText}, ${lapsLeft} laps left. Every car can change tyres for nothing while the race is stopped.`, options: opts, recommend: adv ? `box:${adv.comp}` : 'stay' }
    } else if (st.neutral && st.neutralStart === st.seg && left >= 3) {
      // Asked once, on the first lap under the safety car; the Box button stays open after that.
      const g = neutralGain(st, c, st.seg, st.neutral)
      const what = st.neutral === 'sc' ? 'safety car' : 'virtual safety car'
      const why = c.lastStop >= st.seg - 8 ? 'The tyres are almost new.' : lapsLeft < 10 ? `Only ${lapsLeft} laps left.` : g.seconds > 1 ? `A stop costs about ${Math.round(st.track.pitLoss * (st.neutral === 'sc' ? 0.5 : 0.6))} s instead of ${st.track.pitLoss} s.` : 'The saving does not beat the current plan.'
      call = { kind: st.neutral, title: `Box under the ${what}?`, text: `${c.e.name}: ${tyreText}. ${why}`, options: callOptions(st, c, g.comp), recommend: adv ? `box:${adv.comp}` : 'stay' }
    } else if (adv?.reason === 'puncture' || adv?.reason === 'sc' || adv?.reason === 'vsc') {
      // Nothing to decide: the car limps in for the best tyre, and the radio
      // says so; or the safety car was already put to the pit wall on its first lap.
    } else if (adv) {
      const titles = { plan: 'The planned stop is due', cliff: 'The tyres are falling off', rain: 'Rain: switch tyres?', drying: 'The track is drying', damage: 'Front-wing damage', 'compound rule': 'A second compound is needed', puncture: 'Puncture' }
      call = { kind: adv.reason, title: titles[adv.reason] ?? 'Box?', text: `${c.e.name}: ${tyreText}, ${lapsLeft} laps left.`, options: callOptions(st, c, adv.comp), recommend: `box:${adv.comp}` }
      if (adv.reason === 'compound rule') call.text += ' The rules require two dry compounds: staying out brings a 20-second penalty.'
    } else {
      // The car just behind has stopped: the undercut.
      const i = order.indexOf(c)
      const behind = order[i + 1]
      if (behind && behind.lastStop === st.seg - 1 && behind.t - c.t < 2.5 + st.track.pitLoss && tyreLife(c) > 0.3 && left >= 5) {
        const comp = bestStop(st, c, st.seg).comp
        call = { kind: 'undercut', title: 'Undercut threat', text: `${behind.e.name} has just stopped for fresh ${TYRES[behind.tyre].name}s. ${c.e.name} is on ${tyreText}.`, options: [{ ...boxOption(comp), label: `Cover: box for ${TYRES[comp].name}s` }, STAY], recommend: null }
      } else if (c.wingDamage > 0 && left >= 5 && w.damageSeen?.[c.id] !== c.wingDamage) {
        // Asked when the damage happens, not every lap after.
        (w.damageSeen ??= {})[c.id] = c.wingDamage
        call = { kind: 'damage', title: 'Front-wing damage', text: `${c.e.name} is losing about ${c.wingDamage.toFixed(1)} s a lap. A new nose adds about 6 s to a stop.`, options: callOptions(st, c, bestStop(st, c, st.seg).comp), recommend: 'stay' }
      }
    }
    if (call) calls.push({ ...call, id: `${st.seg}-${c.id}-${call.kind}`, carId: c.id, seg: st.seg })
  }
  // Team-mates running together, the one behind quicker.
  const mine = myCars(st).filter((c) => c.status === 'running')
  if (mine.length === 2 && !st.teamHold[PLAYER] && left >= 5 && !(w.lastTeamCall >= st.seg - 10)) {
    const [a, b] = mine.slice().sort((x, y) => order.indexOf(x) - order.indexOf(y))
    const pace = (x) => x.pace + tyreDelta(x, st.cond[st.seg]) + ORDERS.pace[x.orders.pace].pace
    if (order.indexOf(b) === order.indexOf(a) + 1 && b.t - a.t < 1.2 && pace(a) - pace(b) > 0.15) {
      const faster = pace(a) - pace(b)
      calls.push({
        id: `${st.seg}-team`, kind: 'teammates', carId: b.id, seg: st.seg, title: 'Team-mates together',
        text: `${b.e.name} is about ${faster.toFixed(2)} s a lap quicker than ${a.e.name}, ${(b.t - a.t).toFixed(1)} s behind.`,
        options: [{ key: 'swap', label: `Swap: let ${surname(b.e.name)} through` }, { key: 'race', label: 'Let them race' }, { key: 'hold', label: 'Hold positions' }],
        recommend: faster > 0.3 ? 'swap' : 'race',
      })
    }
  }
  // Estimates, at the strategist's precision.
  for (const call of calls) {
    call.estimates = {}
    for (const o of call.options) {
      const pos = estimate(st, call.carId, (s2) => applyOption(s2, call, o.key), call.id)
      call.estimates[o.key] = pos
    }
    const keys = Object.keys(call.estimates)
    call.recommend = strategistPick(call, keys, strategist, streamRng(st.key, 'judge', call.id))
    call.precision = strategist >= 80 ? 'sharp' : strategist >= 60 ? 'rough' : 'vague'
    call.estimateText = Object.fromEntries(keys.map((k) => [k, k === call.recommend && strategist < 60 ? "the strategist's pick" : estimateText(call.estimates[k], call.estimates[call.recommend], strategist)]))
  }
  w.calls = calls
  return calls
}

// How often the strategist's own judgement gets a call right: under half the
// time for a weak one, a little over half at 60, nearly always for the best.
export const judgement = (rating) => clamp(SETTLE.judgeBase + rating * SETTLE.judgePerPoint, 0.4, 0.97)
export const SETTLE = { judgeBase: -0.02, judgePerPoint: 0.0103, clearly: 0.3 }

// The strategist's pick is a judgement call, separate from the simulations
// behind the estimates. Judged right, it goes with the numbers when they
// clearly beat the textbook call. Judged wrong, it sticks with the textbook
// call where the numbers disagree, or takes the next-best option where they
// agree. A player who reads the numbers can beat a weak strategist.
function strategistPick(call, keys, strategist, rng) {
  const ranked = keys.slice().sort((a, b) => call.estimates[a] - call.estimates[b])
  const best = ranked[0]
  const textbook = call.recommend ?? best
  if (rng.chance(judgement(strategist))) return call.estimates[textbook] - call.estimates[best] > SETTLE.clearly ? best : textbook
  return textbook !== best ? textbook : ranked[1]
}

function estimateText(pos, recPos, strategist) {
  if (pos > 24) return 'likely retirement'
  const p = Math.round(pos)
  if (strategist >= 80) return `about P${p}`
  if (strategist >= 60) return `P${Math.max(1, p - 1)}–P${p + 1}`
  // A weaker strategist only has a feel for it.
  const d = pos - recPos
  return Math.abs(d) < 0.7 ? 'about the same' : d < 0 ? 'might be better' : 'probably worse'
}

// Turns an answered option into orders for the next lap (or an immediate change).
function applyOption(st, call, key) {
  const o = call.options.find((x) => x.key === key)
  if (call.kind === 'teammates') {
    if (key === 'hold') st.teamHold[PLAYER] = true
    if (key === 'swap') swapCars(st, call.carId)
    return {}
  }
  return o?.box ? { [call.carId]: { box: o.box } } : {}
}

// The car behind is waved through: the two swap places, each losing a little time.
function swapCars(st, behindId) {
  const order = st.order.map((i) => st.cars[i])
  const b = carById(st, behindId)
  const i = order.indexOf(b)
  const a = order[i - 1]
  if (!a || a.e.teamId !== b.e.teamId) return
  const ta = a.t
  a.t = b.t + 0.4
  b.t = ta + 0.2
  st.order[i - 1] = st.cars.indexOf(b)
  st.order[i] = st.cars.indexOf(a)
  a.yielded = (a.yielded || 0) + 1
}

export function answerCall(game, callId, key) {
  const w = game.weekend
  const call = w?.calls.find((c) => c.id === callId)
  if (!call) throw new Error('That call has gone')
  if (!call.options.some((o) => o.key === key)) throw new Error('Unknown option')
  w.answered[callId] = key
  if (key !== call.recommend) w.snapshots.push({ call: { id: call.id, kind: call.kind, title: call.title, carId: call.carId, seg: call.seg, options: call.options }, choice: key, recommend: call.recommend, state: JSON.stringify(w.state) })
  w.log.push({ lap: lapAt(w.state, w.state.seg), carId: call.carId, title: call.title, choice: call.options.find((o) => o.key === key).label, followed: key === call.recommend })
}

// Answers every open call the way the strategist recommends.
export function followStrategist(game) {
  for (const call of game.weekend.calls) if (!(call.id in game.weekend.answered)) answerCall(game, call.id, call.recommend)
}

// ---- Running the race ----

const openCalls = (w) => w.calls.filter((c) => !(c.id in w.answered))

// One lap. Open calls must be answered first.
export function nextLap(game) {
  const w = game.weekend
  if (!w || w.phase !== 'race') throw new Error('The race is not running')
  if (openCalls(w).length) throw new Error('Answer the pit wall first')
  const st = w.state
  const orders = {}
  for (const c of myCars(st)) orders[c.id] = { ...c.orders }
  for (const call of w.calls) {
    const key = w.answered[call.id]
    if (key === undefined) continue
    if (call.kind === 'teammates') { w.lastTeamCall = st.seg; applyOption(st, call, key); continue }
    const o = call.options.find((x) => x.key === key)
    if (o?.box) orders[call.carId].box = o.box
  }
  for (const [id, comp] of Object.entries(w.boxes ?? {})) if (orders[id] && !orders[id].box) orders[id].box = comp
  w.boxes = {}
  w.lastOrder = st.order.slice()
  const before = Object.fromEntries(myCars(st).map((c) => [c.id, { pos: st.order.indexOf(c.idx), passes: c.passes, status: c.status, damage: c.wingDamage, stops: c.stops, forced: c.forced }]))
  const neutralBefore = st.neutral
  const running0 = st.cars.map((c) => c.status === 'running')
  const frame = { seg: st.seg, t0: st.cars.map((c) => round3(c.t)), stops0: st.cars.map((c) => c.stops), tyre0: st.cars.map((c) => c.tyre), events0: st.events.length }
  stepRace(st, orders)
  // What the lap looked like, for the track map to play back: every car's
  // race time at both ends of it, who stopped, who retired, and any
  // safety car running during it.
  Object.assign(frame, {
    t1: st.cars.map((c) => round3(c.t)), stops1: st.cars.map((c) => c.stops), out: st.cars.filter((c) => running0[c.idx] && c.status !== 'running').map((c) => c.idx),
    under: st.neutralNow, events1: st.events.length,
  })
  ;(w.frames ??= []).push(frame)
  // A whole race's laps, for playback (the longest race is 78 laps).
  if (w.frames.length > 90) w.frames.splice(0, w.frames.length - 90)
  w.calls = []
  w.answered = {}
  radio(w, st, before, neutralBefore)
  if (st.done) { w.phase = 'flag'; return }
  computeCalls(game)
  if (w.autoCalls) followStrategist(game)
}

// The strategist makes the pit-wall calls (or stops making them) while the race plays on.
export function setAutoCalls(game, on) {
  const w = game.weekend
  if (!w || w.phase !== 'race') throw new Error('The race is not running')
  w.autoCalls = !!on
  if (on) followStrategist(game)
}

const round3 = (x) => Math.round(x * 1000) / 1000

// Whether the lap just run had something worth stopping for: a safety car,
// a change in the weather, or one of your cars crashing, retiring, damaged or punctured.
function keyMoment(w) {
  const f = w.frames?.[w.frames.length - 1]
  if (!f) return false
  const st = w.state
  const mine = new Set(myCars(st).map((c) => c.id))
  // A safety car counts on the lap it comes out, not every lap it is out.
  return (!!st.neutral && st.neutralStart === st.seg) || st.events.slice(f.events0).some((e) => e.type === 'weather' || e.type === 'sc' || e.type === 'vsc' ||
    (e.ids.some((id) => mine.has(id)) && ['dnf', 'incident', 'error'].includes(e.type)))
}

// Runs laps to the next key moment: a pit-wall call, a safety car, a change
// in the weather or trouble for one of your cars; or to the flag.
export function playToMoment(game) {
  const w = game.weekend
  if (openCalls(w).length) throw new Error('Answer the pit wall first')
  do nextLap(game)
  while (w.phase === 'race' && !openCalls(w).length && !keyMoment(w))
}

// Runs laps until the pit wall has something to decide, or the flag.
export function playToCall(game) {
  const w = game.weekend
  if (openCalls(w).length) throw new Error('Answer the pit wall first')
  do nextLap(game)
  while (w.phase === 'race' && !openCalls(w).length)
}

// The strategist takes over for the rest of the race.
export function handOver(game) {
  const w = game.weekend
  if (!w || w.phase !== 'race') throw new Error('The race is not running')
  followStrategist(game)
  if (w.calls.length) nextLap(game)
  if (w.phase === 'race') {
    runToEnd(w.state)
    w.phase = 'flag'
  }
  w.handedOver = true
}

// The strategist runs whatever is left of the weekend, from any phase, and the result is filed.
export function quickFinish(game) {
  const w = game.weekend
  if (!w?.live) throw new Error('No race weekend under way')
  const settle = () => { if (incidentDue(game)) resolveIncident(game, teamChoice(game)) }
  settle()
  if (w.phase === 'briefing' || w.phase === 'practice') startQualifying(game)
  settle()
  if (w.phase === 'quali') runQualifying(game)
  settle()
  if (w.phase === 'grid') startRace(game)
  if (w.phase === 'race') handOver(game)
  return finishWeekend(game)
}

// Short lines from the drivers about what just happened.
function radio(w, st, before, neutralBefore) {
  const lap = lapAt(st, st.seg)
  // The same kind of line from the same driver at most once every few laps.
  const said = (w.said ??= {})
  const say = (c, text, kind = null, gap = 6) => {
    if (kind && said[`${c.id}|${kind}`] > lap - gap) return
    if (kind) said[`${c.id}|${kind}`] = lap
    w.radio.push({ lap, id: c.id, text: `${surname(c.e.name)}: "${text}"` })
  }
  for (const c of myCars(st)) {
    const b = before[c.id]
    if (b.status === 'running' && c.status !== 'running') { say(c, c.reason === 'crash' ? "I'm out. Sorry, guys." : c.reason === 'collision' ? 'Someone hit me. That\'s it.' : `Car's stopped. ${c.reason[0].toUpperCase() + c.reason.slice(1)}, I think.`); continue }
    if (c.status !== 'running') continue
    const pos = st.order.indexOf(c.idx)
    if (c.stops > b.stops) say(c, `${TYRES[c.tyre].name}s on. Let's go.`)
    else if (c.passes > b.passes && pos < b.pos) say(c, `Got them! P${pos + 1}.`, 'pass', 3)
    else if (pos >= b.pos + 2 && !c.pitNow) say(c, 'I\'m losing places here.', 'lose')
    if (c.forced === 'puncture' && !b.forced) say(c, 'Puncture! Boxing this lap.')
    if (c.wingDamage > 0 && !b.damage) say(c, "I've damaged the front wing. Understeer everywhere.")
    else if (tyreLife(c) > 0.9 && tyreLife(c) < 1.15) say(c, 'These tyres are about done.', 'tyres', 10)
    // With the strategist on the calls the driver just hears the plan.
    if (st.neutral && !neutralBefore) say(c, { sc: w.autoCalls ? 'Safety car. Copy, following the plan.' : 'Safety car? What do we do?', vsc: 'VSC, VSC.', red: 'Red flag. Coming in to the pit lane.' }[st.neutral])
    if (st.cond[st.seg] && st.cond[st.seg] !== st.cond[st.seg - 1] && st.cond[st.seg] !== 'dry' && !TYRES[c.tyre].wet) say(c, "It's raining. Slicks won't last.", 'rain')
  }
  if (w.radio.length > 60) w.radio.splice(0, w.radio.length - 60)
}

// How each weekend objective stands right now, from the running order.
export function objectivesNow(game) {
  const w = game.weekend
  if (!w?.state || w.phase === 'briefing') return w?.objectives.map((o) => ({ ...o, now: null })) ?? []
  const st = w.state
  if (w.phase === 'quali') {
    // Only "into Q2" and "into Q3" can be settled part-way through qualifying.
    const done = st.qs.sessions.length
    const reached = Math.max(...st.cars.filter((c) => c.e.isPlayer).map((c) => (c.qOut ? c.qOut : done + 1)))
    return w.objectives.map((o) => {
      const need = o.kind === 'intoQ2' ? 2 : o.kind === 'intoQ3' ? 3 : 0
      return { ...o, now: need && (reached >= need || done >= need - 1) ? reached >= need : null }
    })
  }
  const running = st.order.map((i) => st.cars[i])
  const race = st.cars.map((c) => ({ id: c.id, teamId: c.e.teamId, status: c.status === 'running' ? 'finished' : 'dnf', pos: c.status === 'running' ? running.indexOf(c) + 1 : 99 }))
  const result = { race, quali: st.quali }
  return w.objectives.map((o) => ({ ...o, now: o.kind === 'qualiAhead' || w.phase !== 'grid' ? objectiveStatus(o, result) : null }))
}

// ---- After the flag ----

// What each call was worth: from the moment of the call, the race replayed
// with the strategist's choice in place of the player's, on the real luck.
function callValues(w) {
  return w.snapshots.map((s) => {
    const call = s.call
    const run = (key) => finishAfter(JSON.parse(s.state), call.carId, (st) => applyOption(st, call, key))
    const mine = run(s.choice)
    const theirs = run(s.recommend)
    // A retirement in one version of the race and not the other is luck as much as the call.
    const retired = mine > 24 && theirs <= 24 ? 'yours' : theirs > 24 && mine <= 24 ? 'theirs' : null
    return { title: call.title, carId: call.carId, lap: null, choice: call.options.find((o) => o.key === s.choice)?.label, recommend: call.options.find((o) => o.key === s.recommend)?.label, places: theirs - mine, retired }
  })
}

export function finishWeekend(game) {
  const w = game.weekend
  if (!w || w.phase !== 'flag') throw new Error('The race has not finished')
  const st = w.state
  const values = callValues(w)
  // The whole race with the strategist on the pit wall, for comparison.
  let strategistOnly = null
  if (w.startSnapshot && !w.handedOver) {
    const s0 = JSON.parse(w.startSnapshot)
    for (const c of s0.cars) Object.assign(c.orders, DEFAULT_ORDERS)
    runToEnd(s0)
    const order = s0.order.map((i) => s0.cars[i])
    strategistOnly = Object.fromEntries(myCars(s0).map((c) => [c.id, c.status === 'running' ? order.indexOf(c) + 1 : null]))
  }
  // A driver told to yield remembers it at contract time.
  for (const c of myCars(st)) if (c.yielded && game.drivers[c.id]) game.drivers[c.id].interestMod -= 3 * c.yielded
  const result = completeRace(game, st)
  postRace(game, result, w.objectives)
  game.lastDebrief = { season: w.season, round: w.round, values, strategistOnly, log: w.log, radio: w.radio.slice(-12), handedOver: !!w.handedOver }
  game.weekend = null
  return result
}

export { ordinal }
