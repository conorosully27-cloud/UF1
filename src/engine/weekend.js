// Race weekend simulation: qualifying, then a race that runs lap by lap. The
// race is a state machine: it can be stepped one lap at a time with orders
// for the player's cars, saved part-way through, or run to the end with the
// strategist making every call (Quick mode, the bots and the pre-season
// projection all do that).
//
// Laps are counted from 0 in the code (`state.lap` is the next lap to run,
// and so the number of laps done); the race feed shows them from 1.
//
// Random numbers in the race come from streams keyed by lap and car, so a
// choice for one car does not change another car's luck, and the same
// choices on the same save give the same race.
//
// This file is the single interface the rest of the game uses for a weekend.

import { POINTS } from './data/tracks.js'
import { mixRng } from './rng.js'
import { clamp } from './util.js'
import { QUALI, qualiConditions, runQualiSession } from './qualifying.js'

// Qualifying lives in qualifying.js; it is re-exported here, so the rest of the
// game still uses this file as its one interface to a weekend.
export { QUALI, QUALI_MINUTES, qualiDrop, qualiPace, qualiPlan, beginQualiSession, endQualiSession, runQualiSession } from './qualifying.js'

export const SIM = {
  secPerPoint: 0.05, // one weighted car rating point, seconds per lap
  secPerPace: 0.02, // one driver Pace point, seconds per lap
  wetPerPoint: 0.03, // one driver Wet point, seconds per lap in the rain
  teamFormSd: 0.13, // weekend-to-weekend car variation, shared by both cars
  dayFormSd: 0.03, // race-day driver variation
  lapNoise: 0.16, // lap-to-lap variation
  qualiSdBase: 0.08, qualiSdCons: 0.003, // qualifying lap variation, and how much Consistency narrows it
  gridGap: 0.4, // seconds between grid slots after lap one
  startSd: 0.9,
  strategySd: 1.2, // the strategy luck the tyre model does not cover
  scLotterySd: 0.5, // luck with safety-car timing beyond what the laps themselves model
  scCaughtOut: 0.05, // share of cars that lose out badly to safety-car timing
  incidentChance: 0.045, // per car per race: puncture, debris or damage
  rivalGridPenalty: 0.03, // per rival car per race: new power unit parts
  scDebris: 0.25, // share of a track's safety-car figure not tied to an incident
  scAfterCrash: 0.5, scAfterFailure: 0.18, scAfterContact: 0.5, scAfterLap1: 0.55,
  stationary: 2.4, // seconds a car sits in the box, which a teammate stacked behind waits out
  scAverage: 0.39, // average of the tracks' safety-car figures
  vscShare: 0.35, // share of neutralisations that are a virtual safety car
  redShare: 0.06, // share that are a red flag, more after a multi-car crash or in heavy rain (one a race at most)
  wetCrashMult: 3.2, // crash risk multiplier on a wet track
  pileUp: 0.15, // share of first-lap incidents that involve five cars
  chaosSd: 0.75, // race-to-race spread in crashes and contact: most races calm, the odd one carnage
  wetChaos: 1.4, // extra chaos in a wet or mixed race
  crashScale: 0.80, // keeps the average retirement rate where it was once the spread is wider
  wingCost: 0.04, // seconds a lap per level², away from the ideal wing
  cliff: 0.5, // extra seconds a lap, each lap, past a tyre's life
  missedCompound: 20, // seconds added if a dry race ends on one compound
  trafficPerStop: 8, // seconds of track position a stop costs at the hardest track to pass on, for planning
  scLaps: [3, 5], // laps a safety car stays out
  vscLaps: [2, 3], // laps a virtual safety car lasts
  neutralSlow: { sc: 0.4, vsc: 0.3, red: 0 }, // share of a lap slower behind the safety car or under the VSC
  neutralWear: 0.5, // tyre wear under a safety car or VSC, against racing
  neutralRisk: 0.2, // crash risk under a safety car or VSC, against racing
  passTries: 2, // a pass is tried every lap, each try with a share of the full chance: this many tries add up to one
  reactLaps: 2, // a rival pit wall's chance of reacting to rain or a drying track, spread over this many laps
}

// `pace` is seconds a lap against a Medium in the dry; `deg` seconds a lap
// lost per lap of wear; `life` laps of wear before the cliff.
export const TYRES = {
  S: { name: 'Soft', pace: -0.5, deg: 0.06, life: 16, wet: false },
  M: { name: 'Medium', pace: 0, deg: 0.035, life: 26, wet: false },
  H: { name: 'Hard', pace: 0.3, deg: 0.022, life: 38, wet: false },
  I: { name: 'Intermediate', pace: 0, deg: 0.04, life: 30, wet: true },
  W: { name: 'Wet', pace: 0, deg: 0.03, life: 40, wet: true },
}
// Seconds a lap for running a tyre in the wrong conditions.
const CONDITION = {
  dry: { S: 0, M: 0, H: 0, I: 3.5, W: 6 },
  damp: { S: 3, M: 3, H: 3.3, I: 0, W: 1.2 },
  wet: { S: 7, M: 7, H: 7.5, I: 1, W: 0 },
}
const SLICKS = ['S', 'M', 'H']
// Fraction of the usual pit loss under a safety car and a virtual safety car.
export const NEUTRAL_PIT = { sc: 0.5, vsc: 0.6, red: 0 }

// Standing orders for a car. Defaults are 'normal' / 'standard'.
export const ORDERS = {
  pace: {
    push: { label: 'Push', pace: -0.15, wear: 1.4, err: 1.3 },
    normal: { label: 'Normal', pace: 0, wear: 1, err: 1 },
    save: { label: 'Save tyres', pace: 0.25, wear: 0.6, err: 0.8 },
  },
  stance: {
    attack: { label: 'Attack', pass: 0.12, contact: 1.5 },
    normal: { label: 'Normal', pass: 0, contact: 1 },
    defend: { label: 'Defend', defend: 0.12, contact: 1.5, pace: 0.1 },
    hold: { label: 'Hold position', contact: 0.3, noPass: true },
  },
  engine: {
    high: { label: 'High', power: 2, mech: 1.5 },
    standard: { label: 'Standard', power: 0, mech: 1 },
    cool: { label: 'Cool', power: -2, mech: 0.5 },
  },
  lap1: {
    attack: { label: 'Attack', start: -0.25, risk: 1.4 },
    normal: { label: 'Normal', start: 0, risk: 1 },
    careful: { label: 'Keep out of trouble', start: 0.25, risk: 0.5 },
  },
}
export const DEFAULT_ORDERS = { pace: 'normal', stance: 'normal', engine: 'standard', lap1: 'normal' }

const APPROACH = {
  conservative: { sd: 0.6, err: 0.8, mean: 0 },
  balanced: { sd: 1.0, err: 1.0, mean: 0 },
  aggressive: { sd: 1.7, err: 1.3, mean: 0.5 },
}

const MECH_REASONS = ['power unit', 'gearbox', 'hydraulics', 'brakes', 'suspension', 'electrics', 'cooling']

// Labels for the race's random streams.
const RNG = { pit: 1, call: 2, car: 3, resolve: 4, neutral: 5, sc: 6, sclap: 7, start: 8, plan: 9, red: 10, timed: 15, blame: 16 }
const carIndex = (state, c) => c.idx

export function carScore(car, w) {
  return w.aero * car.aero + w.chassis * car.chassis + w.power * car.power
}

export function mechFailureChance(reliability) {
  return clamp(0.02 + (92 - reliability) * 0.0032, 0.012, 0.3)
}

export function crashChance(consistency) {
  return 0.010 + (100 - consistency) * 0.0014
}

// Adds a weekend effect to a car once the weekend's state exists (an
// incident decided on Saturday or Sunday), as if it had been there from the
// start: the same rules as building the entries.
export function addCarMods(c, mods) {
  for (const [k, v] of Object.entries(mods)) {
    if (typeof v !== 'number') c.m[k] = v
    else if (k === 'mechMult' || k === 'errMult' || k === 'stratSd') c.m[k] = (c.m[k] ?? 1) * v
    else c.m[k] = (c.m[k] ?? 0) + v
  }
  if (mods.racePace) c.pace += mods.racePace
  if (mods.qualiPace) c.qBase += mods.qualiPace
  c.pMech = mechFailureChance(c.e.car.reliability) * (c.m.mechMult || 1) + (c.m.dnfAdd || 0)
  c.pCrash = crashChance(c.e.driver.consistency) * c.ap.err * (c.m.errMult || 1)
}

// Something a weekend card set up happens now (see `timed` in data/deck.js):
// its effect from here on, and a line in the race feed.
function fireTimed(state, c, t, lap) {
  t.done = true
  if (c.status !== 'running') return
  const { timePenalty = 0, ...mods } = t.mods || {}
  if (timePenalty) { c.penalty += timePenalty; c.notes.push(`${timePenalty}-second penalty`) }
  if (Object.keys(mods).length) addCarMods(c, mods)
  const text = t.text.replace('{name}', c.e.name)
  if (t.once && state.events.some((e) => e.text === text)) return
  state.events.push({ lap, type: t.type ?? 'news', ids: [c.id], text, card: t.title })
}
const fireAll = (state, at, lap, when = () => true) => {
  for (const c of state.cars) for (const t of c.timed ?? []) if (!t.done && t.at === at && when(t)) fireTimed(state, c, t, lap)
}

// The wing level (1 low drag, 5 high downforce) that suits this car here:
// twisty, aero-heavy tracks want more, power tracks less, and a car strong
// on Aero wants a little more than one that relies on its engine.
export function idealWing(track, car, wet = false) {
  const base = 3 + (track.w.aero - track.w.power - 0.15) * 8
  const tilt = clamp((car.aero - car.power) / 30, -0.8, 0.8)
  return clamp(base + tilt + (wet ? 1 : 0), 1, 5)
}
export const wingLoss = (level, ideal) => SIM.wingCost * (level - ideal) ** 2

// A wet-leaning setup helps in the rain and costs time in the dry.
export function wetSetupEffect(mods, wet) {
  if (!mods.wetSetup) return 0
  return wet ? -0.25 : 0.2
}

// ---- Tyres ----

// Laps of wear per lap driven: the car's Tyre Care, the driver's Racecraft,
// the track surface and the pace order.
export function wearRate(state, c) {
  const care = clamp(1 + (75 - c.e.car.tyreCare) * 0.012, 0.6, 1.6)
  const craft = 1 + (80 - c.e.driver.racecraft) * 0.004
  return care * craft * state.track.wear * ORDERS.pace[c.orders.pace].wear * (c.m.wearMult ?? 1)
}

// Seconds over a stint of `laps` laps on `comp`, starting at `age` laps of wear, in the dry.
export function stintTime(comp, laps, rate, age = 0) {
  if (laps <= 0) return 0
  const T = TYRES[comp]
  const a0 = age
  const a1 = age + laps * rate
  let total = (T.pace + (CONDITION.dry[comp] || 0)) * laps + T.deg * ((a0 + a1) / 2) * laps
  if (a1 > T.life) {
    const o0 = Math.max(0, a0 - T.life)
    const o1 = a1 - T.life
    total += SIM.cliff * ((o0 + o1) / 2) * ((o1 - o0) / rate)
  }
  return total
}

// Seconds a lap the tyre costs right now, against a new Medium in the dry.
export function tyreDelta(c, cond, laps = 0, rate = 1) {
  const T = TYRES[c.tyre]
  const age = c.wear + (laps * rate) / 2
  const overheated = T.wet && cond === 'dry' ? 3 : 1
  return T.pace + CONDITION[cond][c.tyre] + T.deg * age * overheated + Math.max(0, age - T.life) * SIM.cliff
}

export const tyreLife = (c) => clamp(c.wear / TYRES[c.tyre].life, 0, 2)

// The best way to finish the race from lap `from` on tyre `comp` with
// `age` laps of wear: no more stops, one or two. In the dry two compounds must
// be used. Stops are tried near where the tyres' lives divide the race.
// Answers are cached: wear rates are rounded so cars with similar tyre wear share them.
const PLAN_CACHE = new Map()
// `copy` false when only the cost or the next tyre is wanted: the stops are
// then the cache's own and must not be changed.
export function planRest(state, c, from, comp, age, usedTwo, copy = true) {
  const rate = Math.round(wearRate(state, c) * 50) / 50
  const a = Math.round(age * 2) / 2
  // A stop also costs track position, which matters more where passing is hard.
  const loss = state.track.pitLoss + state.track.overtaking * SIM.trafficPerStop
  const key = `${state.laps}|${loss}|${state.wetRace ? 1 : 0}|${from}|${comp}|${a}|${usedTwo ? 1 : 0}|${rate}`
  let hit = PLAN_CACHE.get(key)
  if (!hit) {
    if (PLAN_CACHE.size > 50000) PLAN_CACHE.clear()
    hit = computePlan(state.laps, loss, state.wetRace, from, comp, a, usedTwo, rate)
    PLAN_CACHE.set(key, hit)
  }
  return copy ? { cost: hit.cost, stops: hit.stops.map((x) => ({ ...x })) } : hit
}

function computePlan(laps, loss, wetRace, from, comp, age, two, rate) {
  const lapsLeft = laps - from
  let bestCost = Infinity
  let bestStops = []
  if (two || wetRace) { bestCost = stintTime(comp, lapsLeft, rate, age) }
  const lifeA = Math.max(1, TYRES[comp].life - age)
  const first = (k) => stintTime(comp, k - from, rate, age)
  for (const c2 of SLICKS) {
    if (!two && c2 === comp && !wetRace) continue
    const k0 = from + Math.round((lifeA / (lifeA + TYRES[c2].life)) * lapsLeft)
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      if (k <= from || k >= laps) continue
      const cost = first(k) + loss + stintTime(c2, laps - k, rate)
      if (cost < bestCost) { bestCost = cost; bestStops = [{ lap: k, comp: c2 }] }
    }
  }
  for (const c2 of SLICKS) for (const c3 of SLICKS) {
    if (!two && !wetRace && c2 === comp && c3 === comp) continue
    const total = lifeA + TYRES[c2].life + TYRES[c3].life
    const k1c = from + Math.round((lifeA / total) * lapsLeft)
    const k2c = from + Math.round(((lifeA + TYRES[c2].life) / total) * lapsLeft)
    for (let k1 = k1c - 1; k1 <= k1c + 1; k1++) {
      if (k1 <= from) continue
      const head = first(k1) + loss
      if (head >= bestCost) continue
      for (let k2 = k2c - 1; k2 <= k2c + 1; k2++) {
        if (k2 <= k1 || k2 >= laps) continue
        const cost = head + stintTime(c2, k2 - k1, rate) + loss + stintTime(c3, laps - k2, rate)
        if (cost < bestCost) { bestCost = cost; bestStops = [{ lap: k1, comp: c2 }, { lap: k2, comp: c3 }] }
      }
    }
  }
  return { cost: bestCost, stops: bestStops }
}

const usedTwo = (c) => new Set(c.used.filter((t) => SLICKS.includes(t))).size >= 2 || c.used.some((t) => TYRES[t].wet)
const hasTwo = (c) => (c.two ??= usedTwo(c))

// Seconds saved by stopping now under a safety car or virtual safety car,
// against carrying on with the current tyres and plan.
export function neutralGain(state, c, lap, neutral) {
  const stay = planRest(state, c, lap, c.tyre, c.wear, hasTwo(c), false).cost
  const box = bestStop(state, c, lap)
  if (box.cost === undefined) return { seconds: 0, comp: box.comp }
  return { seconds: stay - (box.cost + (state.track.pitLoss + state.track.overtaking * SIM.trafficPerStop) * NEUTRAL_PIT[neutral]), comp: box.comp }
}

// The best tyre to fit if the car stops on lap `lap`, and the plan after it.
export function bestStop(state, c, lap) {
  if (state.cond[lap] === 'wet') return { comp: 'W', plan: [] }
  if (state.cond[lap] === 'damp') return { comp: 'I', plan: [] }
  let best = null
  for (const comp of SLICKS) {
    const two = usedTwo({ used: [...c.used, comp] })
    const p = planRest(state, c, lap, comp, 0, two, false)
    if (!best || p.cost < best.cost) best = { comp, plan: p.stops, cost: p.cost }
  }
  return best
}

// ---- Weekend set-up (qualifying is in qualifying.js) ----

// Everything rolled before the weekend: the cars, the weather for qualifying
// and the race, and the race's luck. Qualifying itself uses keyed rolls, so the
// choices made in it never change what happens to anyone else, or on Sunday.
export function createRace(track, entries, rng, opts = {}) {
  const P = SIM
  const events = []
  const qualiWet = rng.chance(track.rain * 0.8)
  const u = rng.next()
  const raceWeather = u < track.rain * 0.45 ? 'wet' : u < track.rain ? 'mixed' : 'dry'

  const teamForm = {}
  const cars = entries.map((e, idx) => {
    const m = { ...(e.mods || {}) }
    // Teams with weaker setup work swing more from one weekend to the next.
    if (!(e.teamId in teamForm)) teamForm[e.teamId] = rng.normal(0, P.teamFormSd * clamp(1 + (85 - e.ops.setup) * 0.02, 0.8, 1.6))
    const ideal = idealWing(track, e.car)
    // Rivals' engineers set the wing as well as their setup work allows; the player's comes with the entry.
    const wing = e.wing ?? clamp(Math.round(ideal + rng.normal(0, (100 - e.ops.setup) / 40)), 1, 5)
    const carDelta = (100 - carScore(e.car, track.w)) * P.secPerPoint + teamForm[e.teamId] + wingLoss(wing, ideal)
    const setupSkill = clamp(0.6 * e.ops.setup + 0.4 * e.driver.feedback + (m.setupSkill || 0), 0, 100)
    // The roll is always made, so a live weekend's own setup leaves everyone else's luck alone.
    const rolledLoss = Math.abs(rng.normal()) * 0.1 * (1.6 - setupSkill / 100)
    const setupLoss = e.setupLoss ?? rolledLoss
    if (e.wearMult) m.wearMult = (m.wearMult ?? 1) * e.wearMult
    const ap = APPROACH[e.approach] || APPROACH.balanced
    if (!e.isPlayer && rng.chance(P.rivalGridPenalty)) {
      m.gridDrop = (m.gridDrop || 0) + 10
      events.push({ lap: 0, type: 'penalty', ids: [e.id], text: `${e.name} takes new power unit parts: 10-place grid penalty` })
    }
    return {
      id: e.id, idx, e, m, ap, wing, idealWing: ideal, carDelta, setupLoss,
      qBase: carDelta + (100 - e.driver.pace) * P.secPerPace + setupLoss + (m.qualiPace || 0), sets: QUALI.sets, qOut: false,
      status: 'running', t: 0, dt: 0, traffic: 0, penalty: 0, damage: 0, pitExtra: 0, pitTime: 0, strat: 0,
      errors: 0, passes: 0, dnfLap: -1, reason: null, notes: [],
      tyre: 'M', wear: 0, used: [], stints: [], stops: 0, lastStop: -9, plan: [], wingDamage: 0, forced: null,
      orders: { ...DEFAULT_ORDERS, ...(e.orders || {}) }, controlled: !!e.controlled,
      timed: (e.timed || []).map((t) => ({ ...t })),
    }
  })
  const qc = qualiConditions(rng, qualiWet)

  // ---- The race's weather and luck ----
  const laps = track.laps
  // Track conditions lap by lap: dry, damp (intermediates) or wet (full wets).
  const cond = new Array(laps).fill('dry')
  if (raceWeather === 'wet') {
    const until = rng.int(Math.floor(laps / 2), laps)
    for (let s = 0; s < laps; s++) cond[s] = s < until ? 'wet' : 'damp'
  } else if (raceWeather === 'mixed') {
    const len = rng.int(Math.floor(laps / 3), Math.floor((2 * laps) / 3))
    const start = rng.chance(0.5) ? 0 : laps - len
    for (let s = start; s < start + len; s++) cond[s] = 'damp'
    // Sometimes a heavier spell in the middle of the shower.
    if (len >= 4 && rng.chance(0.3)) for (let s = start + Math.floor(len / 3); s < start + Math.ceil((2 * len) / 3); s++) cond[s] = 'wet'
  }
  const wetShare = cond.filter((x) => x !== 'dry').length / laps
  for (const c of cars) {
    const dr = c.e.driver
    c.pace = c.carDelta + (100 - (0.6 * dr.pace + 0.4 * dr.racecraft)) * P.secPerPace + c.setupLoss + (c.m.racePace || 0) + rng.normal(0, P.dayFormSd)
    c.pMech = mechFailureChance(c.e.car.reliability) * (c.m.mechMult || 1) + (c.m.dnfAdd || 0)
    c.pCrash = crashChance(dr.consistency) * c.ap.err * (c.m.errMult || 1)
  }
  const dayPace = (c) => c.pace + wetShare * ((100 - c.e.driver.wet) * P.wetPerPoint + wetSetupEffect(c.m, true))
  cars.slice().sort((a, b) => dayPace(a) - dayPace(b)).forEach((c, i) => { c.paceRank = i + 1 })

  const state = {
    v: RACE_STATE_VERSION, trackId: track.id,
    track: { id: track.id, name: track.name, laps, baseLap: track.baseLap, w: track.w, overtaking: track.overtaking, sc: track.sc, lap1: track.lap1, pitLoss: track.pitLoss ?? 21, wear: track.wear ?? 1 },
    laps, lap: 0, started: false, done: false,
    key: Math.floor(rng.next() * 4294967296), cond, wetRace: raceWeather === 'wet', qualiWet, raceWeather,
    scLap: rng.chance(track.sc * P.scDebris) ? rng.int(1, laps - 2) : -1,
    // Most races are calm; the odd one is carnage.
    // Rain makes it more likely still.
    chaos: clamp(Math.exp(rng.normal(0, P.chaosSd) - (P.chaosSd * P.chaosSd) / 2), 0.25, 4) * (raceWeather === 'dry' ? 1 : P.wetChaos),
    neutral: null, neutralNow: null, neutralLeft: 0, neutralStart: -1, safetyCars: 0, vscs: 0, reds: 0, teamHold: {},
    cars, order: [], events, quali: null,
    qs: { key: Math.floor(rng.next() * 4294967296), session: 0, done: false, weather: qc.weather, slots: qc.slots, change: qc.change ?? null, left: cars.map((c) => c.idx), sessions: [] },
  }
  if (!opts.liveQuali) for (let s = 0; s < 3; s++) runQualiSession(state)
  return state
}

// After Q3: the classification, grid penalties, and every car's start tyre and plan.
export function gridUp(state) {
  const qs = state.qs
  qs.done = true
  const cars = state.cars
  const order = []
  for (let s = 2; s >= 0; s--) for (const r of qs.sessions[s].rows) if (s === 2 || r.out) order.push({ ...r, s })
  const pole = qs.sessions.map((x) => x.rows[0])
  order.forEach((r, i) => {
    const c = cars[r.idx]
    c.qPos = i + 1
    c.qError = r.error
    c.qTime = r.time
    c.qSession = r.s + 1
  })
  const gridOrder = cars.slice().sort((a, b) => {
    const ka = a.qPos + (a.m.gridDrop || 0) + (a.m.gridDrop ? 0.5 : 0)
    const kb = b.qPos + (b.m.gridDrop || 0) + (b.m.gridDrop ? 0.5 : 0)
    return ka - kb
  })
  gridOrder.forEach((c, i) => { c.grid = i + 1 })
  fireAll(state, 'grid', 0)
  state.quali = order.map((r, i) => ({
    pos: i + 1, id: r.id, teamId: cars[r.idx].e.teamId, time: r.time === null ? null : state.track.baseLap + r.time,
    gap: r.time === null || pole[r.s].time === null ? null : r.time - pole[r.s].time, session: r.s + 1,
    error: r.error, noTime: r.time === null, grid: cars[r.idx].grid,
  }))
  state.order = gridOrder.map((c) => c.idx)
  // Every car's starting tyre and plan.
  const c0 = state.cond[0]
  for (const c of cars) {
    if (c0 !== 'dry') { c.tyre = c0 === 'wet' ? 'W' : 'I'; c.plan = []; continue }
    // A weaker pit wall sometimes picks a plan that is not quite the best.
    const noise = mixRng(state.key, RNG.plan, c.idx)
    const sd = (100 - c.e.ops.strategy) / 25
    let best = null
    for (const comp of SLICKS) {
      const p = planRest(state, c, 0, comp, 0, false)
      const cost = p.cost + noise.normal(0, sd)
      if (!best || cost < best.cost) best = { comp, stops: p.stops, cost }
    }
    c.tyre = c.e.startTyre ?? best.comp
    c.plan = c.e.startTyre ? planRest(state, c, 0, c.tyre, 0, false).stops : best.stops
  }
  for (const c of cars) { c.used = [c.tyre]; c.stints = [{ comp: c.tyre, lap: 0 }]; c.two = usedTwo(c) }
}

const byOrder = (state) => state.order.map((i) => state.cars[i])

// ---- Strategist ----

// What the strategist would do with this car at the start of lap `lap`:
// { comp, reason } to box, or null to stay out. `rng` decides timing for a
// rival pit wall (or a function making it, called only if needed); without it
// the answer is the strategist's advice.
export function strategistCall(state, c, lap, rngOrMake = null, neutral = state.neutralNow) {
  if (c.status !== 'running') return null
  let made = null
  const rng = rngOrMake && { chance: (p) => (made ??= typeof rngOrMake === 'function' ? rngOrMake() : rngOrMake).chance(p) }
  const left = state.laps - lap
  const cnd = state.cond[lap]
  const T = TYRES[c.tyre]
  const strategy = c.e.ops.strategy
  // A rival pit wall reacts within a lap or two, a better one sooner.
  const timely = (p) => (rng ? rng.chance(1 - (1 - p) ** (1 / SIM.reactLaps)) : true)
  if (c.forced) return { comp: bestStop(state, c, lap).comp, reason: c.forced }
  // Under a red flag every car may change tyres for nothing.
  if (neutral === 'red') { const comp = bestStop(state, c, lap).comp; return comp === c.tyre && c.wear < 3 ? null : { comp, reason: 'red' } }
  if (cnd !== 'dry' && !T.wet) {
    if (timely(0.45 + strategy / 180)) return { comp: cnd === 'wet' ? 'W' : 'I', reason: 'rain' }
    return null
  }
  if (cnd === 'damp' && c.tyre === 'W' && left >= 2 && timely(0.4 + strategy / 200)) return { comp: 'I', reason: 'drying' }
  if (cnd === 'wet' && c.tyre === 'I' && left >= 2 && timely(0.4 + strategy / 200)) return { comp: 'W', reason: 'rain' }
  if (cnd === 'dry' && T.wet) {
    if (left >= 1 && timely(0.45 + strategy / 180)) return { comp: bestStop(state, c, lap).comp, reason: 'drying' }
    return null
  }
  const ratio = tyreLife(c)
  const two = hasTwo(c)
  if (left <= 3 && !two && !state.wetRace && cnd === 'dry') return { comp: SLICKS.find((x) => !c.used.includes(x)), reason: 'compound rule' }
  if (left <= 1) return null
  const planned = c.plan.find((p) => p.lap === lap)
  // The call is made as the safety car comes out, in its first lap or two.
  if (neutral && neutral !== 'red' && left >= 3 && lap > c.lastStop + 3 && lap - state.neutralStart < 2) {
    // Box only if the cheaper stop beats the plan the car is on: fresh tyres
    // or few laps left mean staying out.
    const gain = neutralGain(state, c, lap, neutral)
    if (gain.seconds > 1 && timely(0.65 + strategy / 300)) return { comp: gain.comp, reason: neutral, gain: gain.seconds }
  }
  if (planned) {
    // A weaker pit wall is sometimes a lap or two late.
    if (rng && strategy < 85 && rng.chance((85 - strategy) / 150)) { planned.lap++; return null }
    return { comp: bestStop(state, c, lap).comp, reason: 'plan' }
  }
  if (ratio > 1.05 && left >= 5) return { comp: bestStop(state, c, lap).comp, reason: 'cliff' }
  if (c.wingDamage >= 0.3 && left >= 8) return { comp: bestStop(state, c, lap).comp, reason: 'damage' }
  return null
}

// A teammate ahead on the road who has just boxed this lap, and how long
// this car would wait behind it in the box.
const boxMate = (state, c, lap) => state.cars.find((x) => x !== c && x.e.teamId === c.e.teamId && x.status === 'running' && x.lastStop === lap && x.t <= c.t)
function stackedBehind(state, c, lap) {
  const mate = boxMate(state, c, lap)
  return mate ? Math.max(0, SIM.stationary + mate.lastExtra - (c.t - mate.t)) : 0
}

function pit(state, c, comp, lap, rng, reason) {
  const neutral = state.neutralNow
  if (neutral === 'red') {
    // A change of tyres while the race is stopped: no time lost, and not a pit stop.
    c.tyre = comp
    c.wear = 0
    c.used.push(comp)
    c.stints.push({ comp, lap: lap })
    c.forced = null
    c.two = usedTwo(c)
    c.plan = TYRES[comp].wet || state.cond[lap] !== 'dry' ? [] : planRest(state, c, lap, comp, 0, c.two).stops.filter((p) => p.lap > lap)
    return
  }
  const loss = state.track.pitLoss * (neutral ? NEUTRAL_PIT[neutral] : 1)
  let extra = Math.abs(rng.normal()) * (0.25 + (100 - c.e.ops.pit) * 0.012) + (c.m.pitTime || 0)
  if (rng.chance(0.01 + (100 - c.e.ops.pit) * 0.0012)) {
    const botch = rng.range(4, 14)
    extra += botch
    c.notes.push(`Slow pit stop cost ${botch.toFixed(1)} s`)
    state.events.push({ lap: lap + 1, type: 'pit', ids: [c.id], text: `Slow stop for ${c.e.name}` })
  }
  if (c.wingDamage > 0) { extra += 6; c.notes.push('New front wing fitted'); c.wingDamage = 0 }
  // Double-stacked: a teammate just ahead is still in the box, so this car waits behind.
  const wait = stackedBehind(state, c, lap)
  if (wait > 0.3) {
    const mate = boxMate(state, c, lap)
    extra += wait
    c.notes.push(`Waited ${wait.toFixed(1)} s behind ${mate.e.name} in the box`)
    state.events.push({ lap: lap + 1, type: 'pit', ids: [c.id, mate.id], text: `Double stack: ${c.e.name} waits ${wait.toFixed(1)} s for ${mate.e.name} in the box` })
  }
  c.lastExtra = extra
  c.dt += loss + extra
  c.pitExtra += extra
  c.pitTime += loss + extra
  c.tyre = comp
  c.wear = 0
  c.used.push(comp)
  c.stints.push({ comp, lap: lap })
  c.stops++
  c.lastStop = lap
  c.pitNow = true
  c.forced = null
  const two = c.two = usedTwo(c)
  c.plan = TYRES[comp].wet || state.cond[lap] !== 'dry' ? [] : planRest(state, c, lap, comp, 0, two).stops.filter((p) => p.lap > lap)
  const why = { plan: '', rain: ' for the rain', drying: ' as the track dries', sc: ' under the safety car', vsc: ' under the virtual safety car', cliff: ': tyres gone', damage: ' with damage', puncture: ' with a puncture', 'compound rule': ' to use a second compound' }[reason] ?? ''
  state.events.push({ lap: lap + 1, type: 'pit', ids: [c.id], text: `${c.e.name} pits${why}: ${TYRES[comp].name}s` })
}

// ---- The race ----

function retire(state, c, lap, reason, text) {
  c.status = 'dnf'
  c.dnfLap = lap
  c.reason = reason
  state.events.push({ lap: lap < 0 ? 1 : lapNo(state, lap), type: 'dnf', ids: [c.id], text })
}

// The lap number the feed shows for something on lap `lap` (counted from 0).
const lapNo = (state, lap) => clamp(lap + 1, 1, state.laps)

function start(state) {
  const P = SIM
  const rng = mixRng(state.key, RNG.start)
  fireAll(state, 'start', 1)
  // The lap on which each thing a card set up for the race happens.
  for (const c of state.cars) {
    (c.timed ?? []).forEach((t, k) => {
      if (t.at !== 'race') return
      const [lo, hi] = t.window ?? [0.2, 0.6]
      const u = mixRng(state.key, RNG.timed, c.idx + 1, k).next()
      t.lap = clamp(Math.floor(state.laps * (lo + u * (hi - lo))), 1, state.laps - 1)
    })
  }
  let order = byOrder(state)
  order.forEach((c, i) => {
    const l1 = ORDERS.lap1[c.orders.lap1] || ORDERS.lap1.normal
    c.t = i * P.gridGap + rng.normal(0, P.startSd) - (c.e.driver.racecraft - 85) * 0.02 + (c.m.startTime || 0) + l1.start
  })
  order.sort((a, b) => a.t - b.t)
  if (rng.chance(Math.min(0.95, state.track.lap1 * Math.sqrt(state.chaos)))) {
    const k = rng.chance(P.pileUp * state.chaos) ? 5 : rng.chance(0.7) ? 2 : 3
    const anchor = rng.int(3, Math.max(3, order.length - k - 1))
    const involved = order.slice(anchor, anchor + k)
    let anyOut = false
    for (const c of involved) {
      const risk = (ORDERS.lap1[c.orders.lap1] || ORDERS.lap1.normal).risk
      if (rng.chance(0.35 * risk)) {
        c.damage += rng.range(0.4, 1.0)
        retire(state, c, -1, 'collision', `${c.e.name} is out in a first-lap collision`)
        anyOut = true
      } else if (rng.chance(Math.min(1, risk))) {
        c.t += rng.range(12, 35)
        c.damage += rng.range(0.15, 0.45)
        c.wingDamage = rng.range(0.1, 0.4)
        c.notes.push('First-lap damage, pitted for repairs')
        state.events.push({ lap: 1, type: 'incident', ids: [c.id], text: `${c.e.name} is damaged in a first-lap incident and pits` })
      }
    }
    if (anyOut && rng.chance(P.scAfterLap1 * (state.track.sc / P.scAverage))) state.pendingSc = true
  }
  state.order = order.filter((c) => c.status === 'running').sort((a, b) => a.t - b.t).map((c) => state.cars.indexOf(c))
  state.started = true
}

// Stops that can wait a lap rather than queue behind a teammate.
const CAN_WAIT = new Set(['plan', 'cliff', 'compound rule', 'damage'])

// Runs one lap. `orders` maps a controlled car's id to
// { box: compound or null, pace, stance, engine }; standing orders persist.
// Cars that are not controlled get the strategist's calls.
export function stepRace(state, orders = {}) {
  if (state.done) return state
  const P = SIM
  const lap = state.lap
  const laps = state.laps
  const track = state.track
  const R = (label, c) => mixRng(state.key, lap + 1, RNG[label], c ? carIndex(state, c) + 1 : 0)
  for (const [id, o] of Object.entries(orders)) {
    const c = state.cars.find((x) => x.id === id)
    if (!c) continue
    for (const k of ['pace', 'stance', 'engine', 'lap1']) if (o[k] && ORDERS[k][o[k]]) c.orders[k] = o[k]
  }
  if (!state.started) start(state)
  fireAll(state, 'race', lap + 1, (t) => t.lap === lap)
  // A safety car or VSC stays out for a few laps.
  state.neutralNow = state.neutral
  if (state.neutralLeft > 1) state.neutralLeft--
  else { state.neutral = null; state.neutralLeft = 0 }
  const under = state.neutralNow === 'sc' || state.neutralNow === 'vsc'
  const cnd = state.cond[lap]
  const wet = cnd !== 'dry'
  const scF = track.sc / P.scAverage
  let sc = lap === state.scLap || !!state.pendingSc
  state.pendingSc = false
  const midLap = Math.floor(laps / 2)

  // Pit calls first: the stop happens on this lap.
  for (const c of byOrder(state)) {
    c.pitNow = false
    if (c.status !== 'running') continue
    let call = null
    if (c.controlled) {
      const o = orders[c.id]
      if (c.forced) call = { comp: bestStop(state, c, lap).comp, reason: c.forced }
      else if (o?.box && TYRES[o.box]) call = { comp: o.box, reason: 'call' }
      // Staying out past a planned stop puts it back a few laps; it is not forgotten.
      const planned = !call && c.plan.find((p) => p.lap === lap)
      if (planned) planned.lap = Math.min(lap + 3, laps - 2)
    } else call = strategistCall(state, c, lap, () => R('call', c))
    // A stop that can wait a lap does, rather than queue behind a teammate in the box.
    if (call && CAN_WAIT.has(call.reason) && !c.controlled && stackedBehind(state, c, lap) > 0.3 && lap < laps - 2) {
      const planned = c.plan.find((p) => p.lap === lap)
      if (planned) planned.lap++
      call = null
    }
    if (call) pit(state, c, call.comp, lap, R('pit', c), call.reason)
  }

  let order = byOrder(state)
  for (const c of order) {
    if (c.status !== 'running') continue
    const rng = R('car', c)
    const dr = c.e.driver
    const pace = ORDERS.pace[c.orders.pace]
    const stance = ORDERS.stance[c.orders.stance]
    const engine = ORDERS.engine[c.orders.engine]
    const rate = wearRate(state, c)
    const wingNow = wet ? wingLoss(c.wing, idealWing(track, c.e.car, true)) - wingLoss(c.wing, c.idealWing) : 0
    const lapPace = c.pace + tyreDelta(c, cnd, 1, rate) + pace.pace + (stance.pace || 0) - engine.power * track.w.power * P.secPerPoint +
      c.wingDamage + wingNow + (wet ? (100 - dr.wet) * P.wetPerPoint * (cnd === 'wet' ? 1 : 0.6) : 0) + wetSetupEffect(c.m, wet)
    // Behind the safety car or under the VSC every car runs the same slow lap: no gaps open or close.
    let dt = under ? P.neutralSlow[state.neutralNow] * track.baseLap : lapPace + rng.normal(0, P.lapNoise * (wet ? 2.2 : 1))
    c.lapPace = lapPace
    c.wear += rate * (under ? P.neutralWear : 1)
    const pMech = c.pMech * engine.mech
    if (rng.chance(pMech / laps)) {
      let why = rng.pick(MECH_REASONS)
      let text = `${c.e.name} retires: ${why}`
      // A fault the team knew about takes its share of the blame.
      const known = c.m.failWhy ? 1 - mechFailureChance(c.e.car.reliability) / c.pMech : 0
      if (known > 0 && mixRng(state.key, RNG.blame, lap + 1, c.idx + 1).chance(known)) {
        why = c.m.failWhy
        text = `${c.e.name} retires: ${why}${c.m.failNote ? ` (${c.m.failNote})` : ''}`
      }
      retire(state, c, lap, why, text)
      if (rng.chance(P.scAfterFailure * scF)) sc = true
      continue
    }
    // Slicks on a wet track, and a wet track itself, multiply the risk of a crash.
    const mismatch = !TYRES[c.tyre].wet && wet ? (cnd === 'wet' ? 4 : 2) : 1
    const pc = (c.pCrash / laps) * (wet ? P.wetCrashMult : 1) * mismatch * pace.err * state.chaos * P.crashScale * (under ? P.neutralRisk : 1)
    if (rng.chance(pc)) {
      c.damage += rng.range(0.4, 1.2)
      retire(state, c, lap, 'crash', `${c.e.name} crashes out`)
      if (rng.chance(P.scAfterCrash * scF)) sc = true
      continue
    }
    if (rng.chance(pc * 2)) {
      const loss = rng.range(3, 10)
      dt += loss
      c.errors++
      c.notes.push(`Driver error cost ${loss.toFixed(1)} s`)
      state.events.push({ lap: lapNo(state, lap), type: 'error', ids: [c.id], text: `${c.e.name} runs wide and loses time` })
    }
    if (rng.chance((P.incidentChance / laps) * Math.sqrt(state.chaos) * (under ? P.neutralRisk : 1))) {
      // A puncture or debris damage: the car limps to the pits for new tyres next lap.
      const loss = rng.range(8, 16)
      dt += loss
      c.damage += rng.range(0.05, 0.3)
      c.forced = 'puncture'
      c.notes.push(`Puncture cost ${loss.toFixed(0)} s and a stop`)
      state.events.push({ lap: lapNo(state, lap), type: 'incident', ids: [c.id], text: `${c.e.name} picks up a puncture and limps to the pits` })
    }
    if (lap === midLap) {
      const sd = P.strategySd * c.ap.sd * (c.m.stratSd || 1) * (wet ? 1.8 : 1)
      // A pit wall committed to an early or late call on rain gains or loses with the weather.
      const rainCall = c.m.rainPlan === 'early' ? (state.raceWeather === 'dry' ? 2.5 : -2.5) : c.m.rainPlan === 'late' ? (state.raceWeather === 'dry' ? -0.5 : 1.5) : 0
      const swing = rng.normal((75 - c.e.ops.strategy) * 0.06 + c.ap.mean + (c.m.stratMean || 0) + rainCall, sd)
      dt += swing
      c.strat += swing
    }
    c.dt += dt
    c.t += c.dt
    c.lastDt = c.dt
    c.dt = 0
  }
  if (lap > 0 && state.cond[lap] !== state.cond[lap - 1]) {
    const text = state.cond[lap] === 'dry' ? 'The track is drying: time for slicks' : state.cond[lap - 1] === 'dry' ? 'Rain is falling' : state.cond[lap] === 'wet' ? 'The rain gets heavier' : 'The rain eases'
    state.events.push({ lap: lap + 1, type: 'weather', ids: [], text })
  }
  order = under ? order.filter((c) => c.status === 'running').sort((a, b) => a.t - b.t) : resolve(state, order.filter((c) => c.status === 'running'), wet, lap)
  if (sc && !state.neutral && order.length > 1 && lap < laps - 2 && state.safetyCars + state.vscs < 3) {
    const crashes = state.cars.filter((c) => c.dnfLap === lap && (c.reason === 'crash' || c.reason === 'collision')).length
    const pRed = P.redShare + (crashes >= 2 ? 0.3 : 0) + (cnd === 'wet' ? 0.15 : 0)
    const len = R('sclap')
    if (!state.reds && R('red').chance(pRed)) {
      order = redFlag(state, order, lap)
      state.neutral = 'red'
      state.neutralLeft = 1
    } else if (R('neutral').chance(P.vscShare)) {
      state.vscs++
      state.neutral = 'vsc'
      state.neutralLeft = len.int(...P.vscLaps)
      state.events.push({ lap: lapNo(state, lap), type: 'vsc', ids: [], text: 'Virtual safety car' })
    } else {
      order = safetyCar(state, order, lap, R('sc'))
      state.neutral = 'sc'
      state.neutralLeft = len.int(...P.scLaps)
    }
    state.neutralStart = lap + 1
  }
  state.order = order.map((c) => state.cars.indexOf(c))
  state.lap++
  if (state.lap >= laps) state.done = true
  return state
}

function resolve(state, list, wet, lap) {
  const res = []
  const requeue = []
  const D = state.track.overtaking
  const thr = 0.1 + Math.pow(D, 1.5) * 1.2
  const scale = 0.08 + D * 0.14
  const lapNow = () => lapNo(state, lap)
  for (const c of list) {
    if (c.status !== 'running') continue
    let idx = res.length
    let placed = true
    while (idx > 0) {
      const a = res[idx - 1]
      if (c.t >= a.t) break
      // Each pair of cars has its own luck, so a change elsewhere in the field
      // (a stop called a lap earlier) leaves this fight as it was.
      const rng = mixRng(state.key, lap + 1, RNG.resolve, c.idx + 1, a.idx + 1)
      const cs = ORDERS.stance[c.orders.stance]
      const as = ORDERS.stance[a.orders.stance]
      const teamHold = c.e.teamId === a.e.teamId && state.teamHold[c.e.teamId]
      // Holding position: no attempt to pass, unless the car ahead is in the pits.
      if ((cs.noPass || teamHold) && !a.pitNow && !c.pitNow) {
        const nt = a.t + 0.3
        c.traffic += nt - c.t
        c.t = nt
        break
      }
      // How much quicker the car behind is a lap, and how much it gained this lap
      // (a mistake or a stop ahead settles it outright).
      const gained = a.lastDt - c.lastDt
      const delta = (a.lapPace ?? a.lastDt) - (c.lapPace ?? c.lastDt)
      if (gained < 1.5) {
        const pContact = (0.005 + (200 - c.e.driver.consistency - a.e.driver.consistency) * 0.0003) * (wet ? 1.5 : 1) * c.ap.err *
          cs.contact * as.contact * Math.sqrt(state.chaos) / SIM.passTries
        if (rng.chance(pContact)) {
          const r = rng.next()
          const at = lapNow()
          if (rng.chance(0.5)) {
            const pen = rng.chance(0.75) ? 5 : 10
            c.penalty += pen
            c.notes.push(`${pen}-second penalty for causing a collision`)
            state.events.push({ lap: at, type: 'penalty', ids: [c.id], text: `${c.e.name} gets a ${pen}-second penalty for contact with ${a.e.name}` })
          }
          if (r < 0.35) {
            c.t += rng.range(1, 2)
            a.t += rng.range(1, 2)
            state.events.push({ lap: at, type: 'incident', ids: [c.id, a.id], text: `${c.e.name} and ${a.e.name} touch; both continue` })
          } else if (r < 0.65) {
            const victim = rng.chance(0.5) ? c : a
            victim.damage += rng.range(0.15, 0.5)
            victim.wingDamage = Math.max(victim.wingDamage, rng.range(0.15, 0.6))
            victim.notes.push('Front wing damaged in contact')
            state.events.push({ lap: at, type: 'incident', ids: [c.id, a.id], text: `${c.e.name} and ${a.e.name} collide; ${victim.e.name} damages the front wing` })
            if (victim === a) {
              res.splice(idx - 1, 1)
              idx--
              a.t += rng.range(3, 8)
              requeue.push(a)
              continue
            }
            c.t += rng.range(3, 8)
            requeue.push(c)
            placed = false
            break
          } else {
            const both = r >= 0.9
            const victim = rng.chance(0.5) ? c : a
            const out = both ? [c, a] : [victim]
            for (const v of out) {
              v.damage += rng.range(0.4, 1.0)
              retire(state, v, lap, 'collision', `${v.e.name} is out after contact`)
            }
            if (rng.chance(SIM.scAfterContact * (state.track.sc / SIM.scAverage))) state.pendingSc = true
            if (out.includes(a)) { res.splice(idx - 1, 1); idx-- }
            if (out.includes(c)) { placed = false; break }
            continue
          }
        }
      }
      // Low drag helps the attacker and the defender on the straights.
      let p = 1 / (1 + Math.exp(-(delta - thr) / scale)) + (c.e.driver.racecraft - a.e.driver.racecraft) * 0.004 +
        (cs.pass || 0) - (as.defend || 0) + (a.wing - c.wing) * 0.02
      // Tried every lap, so each try has a share of the full chance (SIM.passTries).
      // In a pit phase the order is settled on time: the undercut and overcut.
      p = gained > 2 || c.pitNow || a.pitNow ? 1 : 1 - (1 - clamp(p, 0.02, 0.98)) ** (1 / SIM.passTries)
      if (rng.chance(p)) {
        c.t = Math.min(c.t + 0.3, a.t - 0.1)
        c.passes++
        idx--
      } else {
        const nt = a.t + rng.range(0.3, 0.8)
        c.traffic += nt - c.t
        c.t = nt
        break
      }
    }
    if (!placed) continue
    res.splice(idx, 0, c)
    // Cars this one passed queue up behind it if it was then held up.
    for (let j = idx + 1; j < res.length; j++) {
      if (res[j].t < res[j - 1].t + 0.2) {
        const nt = res[j - 1].t + 0.2
        res[j].traffic += nt - res[j].t
        res[j].t = nt
      } else break
    }
  }
  for (const c of requeue) if (c.status === 'running') res.push(c)
  return res.sort((a, b) => a.t - b.t)
}

// The race is stopped: the cars line up in order for a standing restart,
// and every car gets a change of tyres for nothing.
function redFlag(state, list, lap) {
  state.reds = 1
  state.events.push({ lap: lapNo(state, lap), type: 'red', ids: [], text: 'Red flag: the race is stopped' })
  const lead = list[0].t
  list.forEach((c, k) => { c.t = lead + k * 0.6 })
  return list
}

function safetyCar(state, list, lap, rng) {
  state.safetyCars++
  state.events.push({ lap: lapNo(state, lap), type: 'sc', ids: [], text: 'Safety car: the field bunches up' })
  let prevOld = list[0].t
  let prevNew = list[0].t
  for (let k = 1; k < list.length; k++) {
    const gap = Math.min(list[k].t - prevOld, rng.range(0.5, 1.1))
    prevOld = list[k].t
    list[k].t = prevNew + gap
    prevNew = list[k].t
  }
  for (const c of list) {
    const luck = mixRng(state.key, lap + 1, RNG.sc, c.idx + 1)
    let swing = luck.normal((75 - c.e.ops.strategy) * 0.02, SIM.scLotterySd * c.ap.sd * (c.m.stratSd || 1))
    if (luck.chance(SIM.scCaughtOut)) {
      swing += luck.range(4, 10)
      c.notes.push('Caught out by the safety-car timing')
    }
    c.t += swing
    c.strat += swing
  }
  return list.sort((a, b) => a.t - b.t)
}

// A race saved by an earlier build (version 2), which counted the race in
// steps (`seg`, `S` steps of `segLaps` laps: blocks of about five laps before
// W6, single laps after): converted to laps, so it carries on lap by lap.
export const RACE_STATE_VERSION = 3
export const oldRaceState = (st) => !!st && (st.v ?? 0) < RACE_STATE_VERSION
export function upgradeRaceState(st) {
  if (!oldRaceState(st)) return st
  const k = st.segLaps ?? 1
  const toLap = (x) => (x == null || x < 0 ? x ?? -1 : Math.round(x * k))
  st.lap = toLap(st.seg)
  if (k !== 1) st.cond = Array.from({ length: st.laps }, (_, l) => st.cond[Math.min(st.S - 1, Math.floor(l / k))])
  st.scLap = toLap(st.scSeg)
  st.neutralStart = toLap(st.neutralStart)
  if (st.neutral && !st.neutralLeft) st.neutralLeft = st.neutral === 'red' ? 1 : 3
  for (const c of st.cars) {
    c.dnfLap = toLap(c.dnfSeg)
    c.lastStop = toLap(c.lastStop)
    c.plan = (c.plan ?? []).map((p) => ({ lap: toLap(p.seg ?? p.lap), comp: p.comp }))
    for (const t of c.timed ?? []) if ('seg' in t) { t.lap = toLap(t.seg); delete t.seg }
    delete c.dnfSeg
  }
  delete st.seg; delete st.S; delete st.segLaps; delete st.scSeg
  st.v = RACE_STATE_VERSION
  return st
}

// The strategist's advice for a car before the next lap is run.
export function advice(state, c) {
  if (state.done) return null
  return strategistCall(state, c, state.lap, null, state.neutral)
}

// Runs the rest of the race with the strategist making every call.
export function runToEnd(state) {
  for (const c of state.cars) c.controlled = false
  while (!state.done) stepRace(state)
  return state
}

// The classification and breakdown, in the shape the rest of the game uses.
export function raceResult(state) {
  const cars = state.cars
  const track = state.track
  const order = byOrder(state)
  const finishers = order.filter((c) => c.status === 'running')
  for (const c of finishers) {
    // A dry race must use two dry compounds.
    if (!state.wetRace && !c.used.some((t) => TYRES[t].wet) && new Set(c.used).size < 2) {
      c.penalty += SIM.missedCompound
      c.notes.push(`${SIM.missedCompound}-second penalty: only one tyre compound used`)
    }
    c.final = c.t + c.penalty
  }
  finishers.sort((a, b) => a.final - b.final)
  const retired = cars.filter((c) => c.status === 'dnf').sort((a, b) => b.dnfLap - a.dnfLap || a.t - b.t)
  const lead = finishers.length ? finishers[0].final : 0
  const race = []
  finishers.forEach((c, i) => {
    const gap = c.final - lead
    race.push({
      pos: i + 1, id: c.id, teamId: c.e.teamId, status: 'finished', reason: null, grid: c.grid,
      gap, lapsDown: Math.floor(gap / (track.baseLap + 2)), points: POINTS[i] || 0, penalty: c.penalty, stops: c.stops,
    })
  })
  retired.forEach((c, i) => {
    race.push({
      pos: finishers.length + i + 1, id: c.id, teamId: c.e.teamId, status: 'dnf', reason: c.reason, grid: c.grid,
      gap: null, lapsDown: 0, points: 0, penalty: 0, stops: c.stops,
    })
  })
  const posById = Object.fromEntries(race.map((r) => [r.id, r.pos]))
  const detail = {}
  for (const c of cars) {
    detail[c.id] = {
      qualiPos: c.qPos, grid: c.grid, finish: posById[c.id], status: c.status, reason: c.reason,
      paceRank: c.paceRank, traffic: c.traffic, strategy: c.strat, pitExtra: c.pitExtra, pitTime: c.pitTime, setupLoss: c.setupLoss,
      penalty: c.penalty, damage: c.damage, errors: c.errors, passes: c.passes, notes: c.notes,
      stints: c.stints, stops: c.stops, wing: c.wing, idealWing: c.idealWing,
    }
  }
  const events = state.events.slice().sort((a, b) => a.lap - b.lap)
  return {
    trackId: state.trackId,
    weather: { quali: state.qualiWet ? 'wet' : 'dry', qualiType: state.qs?.weather ?? (state.qualiWet ? 'wet' : 'dry'), race: state.raceWeather },
    quali: state.quali, race, events, detail,
    stats: { safetyCars: state.safetyCars + state.vscs, vsc: state.vscs, redFlags: state.reds ?? 0, retirements: retired.length, starters: cars.length, chaos: state.chaos },
  }
}
