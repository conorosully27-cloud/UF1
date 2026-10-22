// Qualifying (DESIGN.md 5.10): three knockout sessions, run in two stages each
// so the live weekend can play them as they happen. Split from weekend.js,
// which re-exports all of this and runs qualifying when it sets up a race.

import { mixRng } from './rng.js'
import { SIM, idealWing, wingLoss, wetSetupEffect, gridUp } from './weekend.js'

// Qualifying (DESIGN.md 5.10): three knockout sessions. In each one a
// car runs once, late, or twice: an early banker lap and a late attempt. Each
// run takes a new set of Softs while there is one left. The track gets
// quicker, a flag can spoil the late laps, and rain or a drying track decides
// which of the two runs counts.
export const QUALI = {
  sets: 4, // new Soft sets for qualifying
  usedTyre: 0.3, // seconds slower on a used set
  evolution: 0.2, // seconds quicker each session
  lateGain: 0.12, // a late run against an early one in the same session
  bigPush: 0.12, // a big-risk lap is this much quicker...
  bigErr: 3, // ...and this many times likelier to go wrong
  errScale: 0.7, // per run: a weekend has up to six runs a car
  crashShare: 0.15, // share of mistakes that end in the wall
  lateFlag: 0.04, // chance a yellow or red flag spoils the late laps, before any crash
  beatFlag: 0.6, // share of cars that finish their late lap before a flag
  restart: 0.5, // chance the session restarts with time for one more lap, for a car left with no time
  towGain: 0.1, // a tow at a track with average Power weighting
  towCost: 0.04, // the car giving the tow
  condTime: { dry: 0, damp: 4.5, wet: 8 },
}
const QRNG = { run: 11, flag: 12, beat: 13, read: 14 }
// Cars knocked out in a session: Q3 keeps ten, Q1 and Q2 drop the rest evenly.
export const qualiDrop = (n, s) => (s >= 2 ? 0 : Math.ceil((n - 10) / (2 - s)))

// The six runs of qualifying (early and late in each session), dry, damp or wet.
export function qualiConditions(rng, wet) {
  const slots = new Array(6).fill('dry')
  if (!wet) return { weather: 'dry', slots }
  const u = rng.next()
  if (u < 0.4) {
    for (let i = 0; i < 6; i++) slots[i] = i >= 4 && rng.chance(0.5) ? 'damp' : 'wet'
    return { weather: 'wet', slots }
  }
  const k = rng.int(1, 5)
  if (u < 0.7) {
    // Drying: damp (wet at the start if the drying is late), then slicks from run k.
    for (let i = 0; i < 6; i++) slots[i] = i >= k ? 'dry' : i === 0 && k >= 3 ? 'wet' : 'damp'
    return { weather: 'drying', slots, change: k }
  }
  // Rain arriving at run k.
  const heavy = rng.chance(0.5)
  for (let i = 0; i < 6; i++) slots[i] = i < k ? 'dry' : i === k || !heavy ? 'damp' : 'wet'
  return { weather: 'rain', slots, change: k }
}

// A car's qualifying pace in given conditions, before the run's own luck.
export function qualiPace(state, c, cond) {
  if (cond === 'dry') return c.qBase + wetSetupEffect(c.m, false)
  const dr = c.e.driver
  return c.qBase + QUALI.condTime[cond] + (100 - dr.wet) * SIM.wetPerPoint * (cond === 'wet' ? 1 : 0.6) +
    wingLoss(c.wing, idealWing(state.track, c.e.car, true)) - wingLoss(c.wing, c.idealWing) + wetSetupEffect(c.m, true)
}

// The strategist's plan for a car in this session: one late run or two, and
// how hard to push. `read` is whether the pit wall reads the weather right.
export function qualiPlan(state, c, read = true) {
  const qs = state.qs
  const s = qs.session
  const early = qs.slots[s * 2]
  const late = qs.slots[s * 2 + 1]
  const field = qs.left.map((i) => state.cars[i]).filter((x) => !x.qCrash)
  const pace = (x) => qualiPace(state, x, late)
  const sorted = field.slice().sort((a, b) => pace(a) - pace(b))
  // Damaged cars set no time and take places in the drop zone first.
  const drop = Math.max(0, qualiDrop(qs.left.length, s) - (qs.left.length - field.length))
  let runs = 2
  let push = 'normal'
  let why = 'Two runs: a banker, then the real lap.'
  let margin = null
  if (drop > 0) {
    const firstOut = sorted[sorted.length - drop]
    const lastIn = sorted[sorted.length - drop - 1] ?? sorted[0]
    margin = c === firstOut || pace(c) >= pace(firstOut) ? pace(lastIn) - pace(c) : pace(firstOut) - pace(c)
    // One run saves a set for later, but a late flag would leave no time: only when well clear.
    if (margin > (s === 0 ? 1.0 : 0.6) && c.sets >= 1) { runs = 1; why = 'Well clear of the cut: one run saves a set of tyres for later.' }
    if (Math.abs(margin) < 0.15) { push = 'big'; why = 'On the bubble: two runs, and a big lap.' }
  } else if (c.sets < 2) { runs = 1; why = 'One new set left: one run on it.' }
  if (read && QUALI.condTime[late] < QUALI.condTime[early]) { runs = 1; why = 'The track is getting quicker: one late run when it is fastest.' }
  if (read && QUALI.condTime[late] > QUALI.condTime[early]) { runs = 2; why = 'Rain is coming: bank a lap early.' }
  return { runs, push, why, margin }
}

// A session is run in two stages, so it can be played as it happens: the
// banker laps of cars doing two runs, then (after the pit wall has seen them)
// the final runs, any late flag and the classification. Every lap has its own
// keyed rolls, so splitting a session never changes its result.
export const QUALI_MINUTES = [18, 15, 12]
const QCLOCK = { early: [0.2, 0.5], call: 0.6, late: [0.84, 0.98], flag: [0.9, 0.97] }

function qualiLap(state, c, run, n, plan, tow) {
  const qs = state.qs
  const s = qs.session
  const Q = QUALI
  const rng = mixRng(qs.key, s + 1, QRNG.run, c.idx + 1, n)
  const cnd = qs.slots[s * 2 + run]
  const dr = c.e.driver
  const wet = cnd !== 'dry'
  const push = run === 1 && plan.latePush ? plan.latePush : plan.push
  let t = qualiPace(state, c, cnd) - s * Q.evolution - (run === 1 ? Q.lateGain : 0)
  const used = c.sets <= 0
  if (used) t += Q.usedTyre
  else c.sets--
  if (push === 'big') t -= Q.bigPush
  if (tow?.taker === c.id) t -= Q.towGain * (state.track.w.power / 0.25)
  if (tow?.giver === c.id) t += Q.towCost
  const sd = (SIM.qualiSdBase + (100 - dr.consistency) * SIM.qualiSdCons) * (wet ? 1.8 : 1)
  t += rng.normal(0, sd)
  const pErr = (0.01 + (100 - dr.consistency) * 0.0012) * (wet ? 2 : 1) * (push === 'big' ? Q.bigErr : 1) * Q.errScale
  if (rng.chance(pErr)) {
    if (rng.chance(Q.crashShare)) return { run, cond: cnd, used, crash: true, time: null }
    t += rng.range(0.6, 2.0)
    return { run, cond: cnd, used, error: true, time: t }
  }
  return { run, cond: cnd, used, time: t }
}

// When in the session (seconds from its start) a lap is completed, for playback.
function lapClock(qs, idx, n, [lo, hi]) {
  const len = QUALI_MINUTES[qs.session] * 60
  return Math.round(len * (lo + mixRng(qs.key, qs.session + 1, 21, idx + 1, n).next() * (hi - lo)))
}

// Stage one. `choices` gives the player's cars a plan ({ runs, push }) and
// `tow` names { giver, taker }; everyone else's pit wall decides for itself,
// reading the weather as well as its strategy rating allows.
export function beginQualiSession(state, choices = {}) {
  const qs = state.qs
  const s = qs.session
  if (qs.done || qs.current) return state
  const R = (label, c) => mixRng(qs.key, s + 1, label, c ? c.idx + 1 : 0, 0)
  const field = qs.left.map((i) => state.cars[i])
  const tow = choices.tow && field.some((c) => c.id === choices.tow.giver && !c.qCrash) ? choices.tow : null
  const plans = {}
  for (const c of field) {
    if (c.qCrash) continue
    const mine = c.controlled && choices[c.id]
    plans[c.id] = mine ? { runs: choices[c.id].runs === 1 ? 1 : 2, push: choices[c.id].push === 'big' ? 'big' : 'normal' }
      : qualiPlan(state, c, R(QRNG.read, c).chance(0.45 + c.e.ops.strategy / 180))
  }
  const rows = []
  for (const c of field) {
    const row = { id: c.id, idx: c.idx, laps: [], time: null, runs: 0, push: 'normal' }
    rows.push(row)
    if (c.qCrash) { row.note = 'damaged'; continue }
    const plan = plans[c.id]
    row.runs = plan.runs
    row.push = plan.push
    if (plan.runs === 2) {
      const l = qualiLap(state, c, 0, 0, plan, tow)
      l.at = lapClock(qs, c.idx, 0, QCLOCK.early)
      row.laps.push(l)
      if (l.crash) c.qCrash = true
    }
  }
  qs.current = { s, plans, tow, rows, call: Math.round(QUALI_MINUTES[s] * 60 * QCLOCK.call) }
  return state
}

// Stage two. `late` can change a controlled car's final run: { go: false } to
// stay in the garage (only with a time on the board), or { push }.
export function endQualiSession(state, late = {}) {
  const qs = state.qs
  const cur = qs.current
  if (!cur) return state
  const s = cur.s
  const Q = QUALI
  const R = (label, c, n = 0) => mixRng(qs.key, s + 1, label, c ? c.idx + 1 : 0, n)
  const len = QUALI_MINUTES[s] * 60
  const field = qs.left.map((i) => state.cars[i])
  const drop = qualiDrop(field.length, s)
  const { plans, tow, rows } = cur
  // A yellow or red flag in the closing minutes: only some cars finish their last lap.
  let flag = R(QRNG.flag).chance(Q.lateFlag)
  let flagAt = Math.round(len * (QCLOCK.flag[0] + R(22).next() * (QCLOCK.flag[1] - QCLOCK.flag[0])))
  let crashFirst = Infinity
  for (const row of rows) {
    const c = state.cars[row.idx]
    if (c.qCrash || row.note) continue
    const plan = plans[c.id]
    const choice = c.controlled ? late[c.id] : null
    if (choice?.go === false && row.laps.some((l) => l.time !== null)) { row.runs = 1; row.skipped = true; continue }
    if (choice?.push === 'big' || choice?.push === 'normal') plan.latePush = choice.push
    const l = qualiLap(state, c, 1, 1, plan, tow)
    l.at = lapClock(qs, c.idx, 1, QCLOCK.late)
    row.laps.push(l)
    if (l.crash) { c.qCrash = true; flag = true; crashFirst = Math.min(crashFirst, l.at) }
  }
  // A crash on a final run brings out the red flag there and then.
  if (crashFirst < Infinity) flagAt = crashFirst
  if (flag) {
    for (const row of rows) {
      const l = row.laps.find((x) => x.run === 1)
      const rng = R(QRNG.beat, state.cars[row.idx])
      if (!l || l.crash) continue
      if (rng.chance(Q.beatFlag)) { l.at = Math.min(l.at, flagAt - 1 - (row.idx % 20)); continue }
      l.flagged = true
      l.time = null
      l.at = flagAt
      // With no lap on the board, a restart may leave time for one more go.
      if (!row.laps.some((x) => x.time !== null) && rng.chance(Q.restart)) {
        const again = qualiLap(state, state.cars[row.idx], 1, 2, plans[row.id], tow)
        again.restart = true
        again.at = len
        if (again.crash) state.cars[row.idx].qCrash = true
        row.laps.push(again)
      }
    }
  }
  for (const row of rows) {
    const times = row.laps.map((l) => l.time).filter((t) => t !== null)
    row.time = times.length ? Math.min(...times) : null
    row.error = row.laps.some((l) => l.error)
  }
  // Cars with no time go to the back, in their base order.
  rows.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9) || state.cars[a.idx].qBase - state.cars[b.idx].qBase)
  rows.forEach((r, i) => { r.pos = i + 1; r.out = i >= rows.length - drop })
  const event = flag ? (rows.find((r) => r.laps.some((l) => l.crash && l.run === 1)) ? 'red' : 'yellow') : null
  if (event) state.events.push({ lap: 0, type: 'quali', ids: [], text: `Q${s + 1}: ${event === 'red' ? 'a crash brings out the red flag' : 'a late yellow flag'} and some final laps are lost` })
  for (const row of rows) {
    if (row.laps.some((l) => l.crash)) state.events.push({ lap: 0, type: 'quali', ids: [row.id], text: `Q${s + 1}: ${state.cars[row.idx].e.name} crashes` })
  }
  qs.sessions.push({ s, rows, drop, flag: event, flagAt: flag ? flagAt : null, length: len, call: cur.call, slots: [qs.slots[s * 2], qs.slots[s * 2 + 1]], tow })
  qs.current = null
  qs.left = rows.filter((r) => !r.out).map((r) => r.idx)
  for (const r of rows) if (r.out) state.cars[r.idx].qOut = s + 1
  qs.session++
  if (qs.session >= 3) gridUp(state)
  return state
}

// Runs the next session in one go: both stages, with every final run as planned.
export function runQualiSession(state, choices = {}) {
  beginQualiSession(state, choices)
  return endQualiSession(state)
}

