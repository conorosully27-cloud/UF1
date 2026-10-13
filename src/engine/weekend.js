// Race weekend simulation: qualifying, then a race that runs in blocks of a
// few laps. The race is a state machine: it can be stepped one block at a
// time with orders for the player's cars, saved part-way through, or run to
// the end with the strategist making every call (Quick mode, the bots and
// the pre-season projection all do that).
//
// Random numbers in the race come from streams keyed by block and car, so a
// choice for one car does not change another car's luck, and the same
// choices on the same save give the same race.
//
// This file is the single interface the rest of the game uses for a weekend.

import { POINTS } from './data/tracks.js'
import { streamRng, hashString, mixRng } from './rng.js'

export const SIM = {
  secPerPoint: 0.05, // one weighted car rating point, seconds per lap
  secPerPace: 0.02, // one driver Pace point, seconds per lap
  wetPerPoint: 0.03, // one driver Wet point, seconds per lap in the rain
  teamFormSd: 0.13, // weekend-to-weekend car variation, shared by both cars
  dayFormSd: 0.03, // race-day driver variation
  lapNoise: 0.16, // lap-to-lap variation
  qualiSdBase: 0.05, qualiSdCons: 0.003, // qualifying lap variation, and how much Consistency narrows it
  gridGap: 0.4, // seconds between grid slots after lap one
  startSd: 0.3,
  strategySd: 0.6, // the strategy luck the tyre model does not cover
  scLotterySd: 0.5,
  scCaughtOut: 0.05, // share of cars that lose out badly to safety-car timing
  incidentChance: 0.045, // per car per race: puncture, debris or damage
  rivalGridPenalty: 0.03, // per rival car per race: new power unit parts
  scDebris: 0.25, // share of a track's safety-car figure not tied to an incident
  scAfterCrash: 0.5, scAfterFailure: 0.18, scAfterContact: 0.5, scAfterLap1: 0.55,
  scAverage: 0.39, // average of the tracks' safety-car figures
  vscShare: 0.35, // share of neutralisations that are a virtual safety car
  wetCrashMult: 3.2, // crash risk multiplier on a wet track
  pileUp: 0.15, // share of first-lap incidents that involve five cars
  chaosSd: 0.75, // race-to-race spread in crashes and contact: most races calm, the odd one carnage
  wetChaos: 1.4, // extra chaos in a wet or mixed race
  crashScale: 0.86, // keeps the average retirement rate where it was once the spread is wider
  wingCost: 0.04, // seconds a lap per level², away from the ideal wing
  cliff: 0.5, // extra seconds a lap, each lap, past a tyre's life
  missedCompound: 20, // seconds added if a dry race ends on one compound
  trafficPerStop: 8, // seconds of track position a stop costs at the hardest track to pass on, for planning
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
export const NEUTRAL_PIT = { sc: 0.5, vsc: 0.6 }

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

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
// Labels for the race's random streams.
const RNG = { pit: 1, call: 2, car: 3, resolve: 4, neutral: 5, sc: 6, sclap: 7, start: 8, plan: 9 }
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
function wetSetupEffect(mods, wet) {
  if (!mods.wetSetup) return 0
  return wet ? -0.25 : 0.2
}

// ---- Tyres ----

// Laps of wear per lap driven: the car's Tyre Care, the driver's Racecraft,
// the track surface and the pace order.
export function wearRate(state, c) {
  const care = clamp(1 + (75 - c.e.car.tyreCare) * 0.012, 0.6, 1.6)
  const craft = 1 + (80 - c.e.driver.racecraft) * 0.004
  return care * craft * state.track.wear * ORDERS.pace[c.orders.pace].wear
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

// The best way to finish the race from block `from` on tyre `comp` with
// `age` laps of wear: no more stops, one or two. In the dry two compounds must
// be used. Stops are tried near where the tyres' lives divide the race.
// Answers are cached: wear rates are rounded so cars with similar tyre wear share them.
const PLAN_CACHE = new Map()
export function planRest(state, c, from, comp, age, usedTwo) {
  const rate = Math.round(wearRate(state, c) * 50) / 50
  const a = Math.round(age * 2) / 2
  // A stop also costs track position, which matters more where passing is hard.
  const loss = state.track.pitLoss + state.track.overtaking * SIM.trafficPerStop
  const key = `${state.S}|${state.segLaps}|${loss}|${state.wetRace ? 1 : 0}|${from}|${comp}|${a}|${usedTwo ? 1 : 0}|${rate}`
  let hit = PLAN_CACHE.get(key)
  if (!hit) {
    if (PLAN_CACHE.size > 50000) PLAN_CACHE.clear()
    hit = computePlan(state.S, state.segLaps, loss, state.wetRace, from, comp, a, usedTwo, rate)
    PLAN_CACHE.set(key, hit)
  }
  return { cost: hit.cost, stops: hit.stops.map((x) => ({ ...x })) }
}

function computePlan(S, L, loss, wetRace, from, comp, age, two, rate) {
  const lapsLeft = (S - from) * L
  let bestCost = Infinity
  let bestStops = []
  if (two || wetRace) { bestCost = stintTime(comp, lapsLeft, rate, age) }
  const lifeA = Math.max(1, TYRES[comp].life - age)
  const first = (k) => stintTime(comp, (k - from) * L, rate, age)
  for (const c2 of SLICKS) {
    if (!two && c2 === comp && !wetRace) continue
    const k0 = from + Math.round(((lifeA / (lifeA + TYRES[c2].life)) * lapsLeft) / L)
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      if (k <= from || k >= S) continue
      const cost = first(k) + loss + stintTime(c2, (S - k) * L, rate)
      if (cost < bestCost) { bestCost = cost; bestStops = [{ seg: k, comp: c2 }] }
    }
  }
  for (const c2 of SLICKS) for (const c3 of SLICKS) {
    if (!two && !wetRace && c2 === comp && c3 === comp) continue
    const total = lifeA + TYRES[c2].life + TYRES[c3].life
    const k1c = from + Math.round(((lifeA / total) * lapsLeft) / L)
    const k2c = from + Math.round((((lifeA + TYRES[c2].life) / total) * lapsLeft) / L)
    for (let k1 = k1c - 1; k1 <= k1c + 1; k1++) {
      if (k1 <= from) continue
      const head = first(k1) + loss
      if (head >= bestCost) continue
      for (let k2 = k2c - 1; k2 <= k2c + 1; k2++) {
        if (k2 <= k1 || k2 >= S) continue
        const cost = head + stintTime(c2, (k2 - k1) * L, rate) + loss + stintTime(c3, (S - k2) * L, rate)
        if (cost < bestCost) { bestCost = cost; bestStops = [{ seg: k1, comp: c2 }, { seg: k2, comp: c3 }] }
      }
    }
  }
  return { cost: bestCost, stops: bestStops }
}

const usedTwo = (c) => new Set(c.used.filter((t) => SLICKS.includes(t))).size >= 2 || c.used.some((t) => TYRES[t].wet)
const hasTwo = (c) => (c.two ??= usedTwo(c))

// Seconds saved by stopping now under a safety car or virtual safety car,
// against carrying on with the current tyres and plan.
export function neutralGain(state, c, seg, neutral) {
  const stay = planRest(state, c, seg, c.tyre, c.wear, hasTwo(c)).cost
  const box = bestStop(state, c, seg)
  if (box.cost === undefined) return { seconds: 0, comp: box.comp }
  return { seconds: stay - (box.cost + (state.track.pitLoss + state.track.overtaking * SIM.trafficPerStop) * NEUTRAL_PIT[neutral]), comp: box.comp }
}

// The best tyre to fit if the car stops at block `seg`, and the plan after it.
export function bestStop(state, c, seg) {
  if (state.cond[seg] === 'wet') return { comp: 'W', plan: [] }
  if (state.cond[seg] === 'damp') return { comp: 'I', plan: [] }
  let best = null
  for (const comp of SLICKS) {
    const two = usedTwo({ used: [...c.used, comp] })
    const p = planRest(state, c, seg, comp, 0, two)
    if (!best || p.cost < best.cost) best = { comp, plan: p.stops, cost: p.cost }
  }
  return best
}

// ---- Weekend set-up and qualifying ----

// Qualifying (RACE_WEEKEND.md 4.3): three knockout sessions. In each one a
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
function qualiConditions(rng, wet) {
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
    const setupLoss = Math.abs(rng.normal()) * 0.1 * (1.6 - setupSkill / 100)
    const ap = APPROACH[e.approach] || APPROACH.balanced
    if (!e.isPlayer && rng.chance(P.rivalGridPenalty)) {
      m.gridDrop = (m.gridDrop || 0) + 10
      events.push({ lap: 0, type: 'penalty', ids: [e.id], text: `${e.name} takes new power unit parts: 10-place grid penalty` })
    }
    return {
      id: e.id, idx, e, m, ap, wing, idealWing: ideal, carDelta, setupLoss,
      qBase: carDelta + (100 - e.driver.pace) * P.secPerPace + setupLoss + (m.qualiPace || 0), sets: QUALI.sets, qOut: false,
      status: 'running', t: 0, dt: 0, traffic: 0, penalty: 0, damage: 0, pitExtra: 0, pitTime: 0, strat: 0,
      errors: 0, passes: 0, dnfSeg: -1, reason: null, notes: [],
      tyre: 'M', wear: 0, used: [], stints: [], stops: 0, lastStop: -9, plan: [], wingDamage: 0, forced: null,
      orders: { ...DEFAULT_ORDERS, ...(e.orders || {}) }, controlled: !!e.controlled,
    }
  })
  const qc = qualiConditions(rng, qualiWet)

  // ---- The race's weather and luck ----
  const laps = track.laps
  const S = Math.max(8, Math.round(laps / 5))
  const segLaps = laps / S
  // Track conditions block by block: dry, damp (intermediates) or wet (full wets).
  const cond = new Array(S).fill('dry')
  if (raceWeather === 'wet') {
    const until = rng.int(Math.floor(S / 2), S)
    for (let s = 0; s < S; s++) cond[s] = s < until ? 'wet' : 'damp'
  } else if (raceWeather === 'mixed') {
    const len = rng.int(Math.floor(S / 3), Math.floor((2 * S) / 3))
    const start = rng.chance(0.5) ? 0 : S - len
    for (let s = start; s < start + len; s++) cond[s] = 'damp'
    if (len >= 4 && rng.chance(0.3)) cond[start + Math.floor(len / 2)] = 'wet'
  }
  const wetShare = cond.filter((x) => x !== 'dry').length / S
  for (const c of cars) {
    const dr = c.e.driver
    c.pace = c.carDelta + (100 - (0.6 * dr.pace + 0.4 * dr.racecraft)) * P.secPerPace + c.setupLoss + (c.m.racePace || 0) + rng.normal(0, P.dayFormSd)
    c.pMech = mechFailureChance(c.e.car.reliability) * (c.m.mechMult || 1) + (c.m.dnfAdd || 0)
    c.pCrash = crashChance(dr.consistency) * c.ap.err * (c.m.errMult || 1)
  }
  const dayPace = (c) => c.pace + wetShare * ((100 - c.e.driver.wet) * P.wetPerPoint + wetSetupEffect(c.m, true))
  cars.slice().sort((a, b) => dayPace(a) - dayPace(b)).forEach((c, i) => { c.paceRank = i + 1 })

  const state = {
    v: 2, trackId: track.id,
    track: { id: track.id, name: track.name, laps, baseLap: track.baseLap, w: track.w, overtaking: track.overtaking, sc: track.sc, lap1: track.lap1, pitLoss: track.pitLoss ?? 21, wear: track.wear ?? 1 },
    laps, S, segLaps, seg: 0, started: false, done: false,
    key: Math.floor(rng.next() * 4294967296), cond, wetRace: raceWeather === 'wet', qualiWet, raceWeather,
    scSeg: rng.chance(track.sc * P.scDebris) ? rng.int(1, S - 2) : -1,
    // Most races are calm; the odd one is carnage.
    // Rain makes it more likely still.
    chaos: clamp(Math.exp(rng.normal(0, P.chaosSd) - (P.chaosSd * P.chaosSd) / 2), 0.25, 4) * (raceWeather === 'dry' ? 1 : P.wetChaos),
    neutral: null, neutralNow: null, safetyCars: 0, vscs: 0, teamHold: {},
    cars, order: [], events, quali: null,
    qs: { key: Math.floor(rng.next() * 4294967296), session: 0, done: false, weather: qc.weather, slots: qc.slots, change: qc.change ?? null, left: cars.map((c) => c.idx), sessions: [] },
  }
  if (!opts.liveQuali) for (let s = 0; s < 3; s++) runQualiSession(state)
  return state
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

// Runs the next session. `choices` gives the player's cars a plan
// ({ runs, push }) and `tow` names { giver, taker }; everyone else's pit wall
// decides for itself, reading the weather as well as its strategy rating allows.
export function runQualiSession(state, choices = {}) {
  const qs = state.qs
  const s = qs.session
  if (qs.done) return state
  const Q = QUALI
  const R = (label, c, n = 0) => mixRng(qs.key, s + 1, label, c ? c.idx + 1 : 0, n)
  const field = qs.left.map((i) => state.cars[i])
  const drop = qualiDrop(field.length, s)
  const tow = choices.tow && field.some((c) => c.id === choices.tow.giver && !c.qCrash) ? choices.tow : null
  const powerScale = state.track.w.power / 0.25
  const plans = {}
  for (const c of field) {
    if (c.qCrash) continue
    const mine = c.controlled && choices[c.id]
    plans[c.id] = mine ? { runs: choices[c.id].runs === 1 ? 1 : 2, push: choices[c.id].push === 'big' ? 'big' : 'normal' }
      : qualiPlan(state, c, R(QRNG.read, c).chance(0.45 + c.e.ops.strategy / 180))
  }
  // A yellow or red flag in the closing minutes: only some cars finish their last lap.
  let flag = R(QRNG.flag).chance(Q.lateFlag)
  const rows = []
  // `n` picks the lap's own rolls: 0 and 1 for the two runs, 2 for a lap after a restart.
  const lap = (c, run, n = run) => {
    const plan = plans[c.id]
    const rng = R(QRNG.run, c, n)
    const cnd = qs.slots[s * 2 + run]
    const dr = c.e.driver
    const wet = cnd !== 'dry'
    let t = qualiPace(state, c, cnd) - s * Q.evolution - (run === 1 ? Q.lateGain : 0)
    const used = c.sets <= 0
    if (used) t += Q.usedTyre
    else c.sets--
    if (plan.push === 'big') t -= Q.bigPush
    if (tow?.taker === c.id) t -= Q.towGain * powerScale
    if (tow?.giver === c.id) t += Q.towCost
    const sd = (SIM.qualiSdBase + (100 - dr.consistency) * SIM.qualiSdCons) * (wet ? 1.8 : 1)
    t += rng.normal(0, sd)
    const pErr = (0.01 + (100 - dr.consistency) * 0.0012) * (wet ? 2 : 1) * (plan.push === 'big' ? Q.bigErr : 1) * Q.errScale
    if (rng.chance(pErr)) {
      if (rng.chance(Q.crashShare)) return { run, cond: cnd, used, crash: true, time: null }
      t += rng.range(0.6, 2.0)
      return { run, cond: cnd, used, error: true, time: t }
    }
    return { run, cond: cnd, used, time: t }
  }
  for (const c of field) {
    const row = { id: c.id, idx: c.idx, laps: [], time: null, runs: 0, push: 'normal' }
    rows.push(row)
    if (c.qCrash) { row.note = 'damaged'; continue }
    const plan = plans[c.id]
    row.runs = plan.runs
    row.push = plan.push
    if (plan.runs === 2) {
      const l = lap(c, 0)
      row.laps.push(l)
      if (l.crash) { c.qCrash = true; continue }
    }
    const l = lap(c, 1)
    row.laps.push(l)
    if (l.crash) { c.qCrash = true; flag = true }
  }
  if (flag) {
    for (const row of rows) {
      const l = row.laps.find((x) => x.run === 1)
      const rng = R(QRNG.beat, state.cars[row.idx])
      if (!l || l.crash || rng.chance(Q.beatFlag)) continue
      l.flagged = true
      l.time = null
      // With no lap on the board, a restart may leave time for one more go.
      if (!row.laps.some((x) => x.time !== null) && rng.chance(Q.restart)) {
        const again = lap(state.cars[row.idx], 1, 2)
        again.restart = true
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
  qs.sessions.push({ s, rows, drop, flag: event, slots: [qs.slots[s * 2], qs.slots[s * 2 + 1]], tow })
  qs.left = rows.filter((r) => !r.out).map((r) => r.idx)
  for (const r of rows) if (r.out) state.cars[r.idx].qOut = s + 1
  qs.session++
  if (qs.session >= 3) gridUp(state)
  return state
}

// After Q3: the classification, grid penalties, and every car's start tyre and plan.
function gridUp(state) {
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
export const lapAt = (state, seg) => Math.round(seg * state.segLaps)

// ---- Strategist ----

// What the strategist would do with this car at the start of block `seg`:
// { comp, reason } to box, or null to stay out. `rng` decides timing for a
// rival pit wall; without it the answer is the strategist's advice.
export function strategistCall(state, c, seg, rng = null, neutral = state.neutralNow) {
  if (c.status !== 'running') return null
  const S = state.S
  const left = S - seg
  const cnd = state.cond[seg]
  const T = TYRES[c.tyre]
  const strategy = c.e.ops.strategy
  const timely = (p) => (rng ? rng.chance(p) : true)
  if (c.forced) return { comp: bestStop(state, c, seg).comp, reason: c.forced }
  if (cnd !== 'dry' && !T.wet) {
    if (timely(0.45 + strategy / 180)) return { comp: cnd === 'wet' ? 'W' : 'I', reason: 'rain' }
    return null
  }
  if (cnd === 'damp' && c.tyre === 'W' && left >= 2 && timely(0.4 + strategy / 200)) return { comp: 'I', reason: 'drying' }
  if (cnd === 'wet' && c.tyre === 'I' && left >= 2 && timely(0.4 + strategy / 200)) return { comp: 'W', reason: 'rain' }
  if (cnd === 'dry' && T.wet) {
    if (left >= 1 && timely(0.45 + strategy / 180)) return { comp: bestStop(state, c, seg).comp, reason: 'drying' }
    return null
  }
  const ratio = tyreLife(c)
  const two = hasTwo(c)
  if (left <= 1) return !two && !state.wetRace && cnd === 'dry' ? { comp: SLICKS.find((x) => !c.used.includes(x)), reason: 'compound rule' } : null
  const planned = c.plan.find((p) => p.seg === seg)
  if (neutral && left >= 2 && seg > c.lastStop) {
    // Box only if the cheaper stop beats the plan the car is on: fresh tyres
    // or few laps left mean staying out.
    const gain = neutralGain(state, c, seg, neutral)
    if (gain.seconds > 1 && timely(0.65 + strategy / 300)) return { comp: gain.comp, reason: neutral, gain: gain.seconds }
  }
  if (planned) {
    // A weaker pit wall is sometimes a lap or two late.
    if (rng && strategy < 85 && rng.chance((85 - strategy) / 150)) { planned.seg++; return null }
    return { comp: bestStop(state, c, seg).comp, reason: 'plan' }
  }
  if (ratio > 1.05 && left >= 2) return { comp: bestStop(state, c, seg).comp, reason: 'cliff' }
  if (c.wingDamage >= 0.3 && left >= 2) return { comp: bestStop(state, c, seg).comp, reason: 'damage' }
  return null
}

function pit(state, c, comp, seg, rng, reason) {
  const neutral = state.neutralNow
  const loss = state.track.pitLoss * (neutral ? NEUTRAL_PIT[neutral] : 1)
  let extra = Math.abs(rng.normal()) * (0.25 + (100 - c.e.ops.pit) * 0.012) + (c.m.pitTime || 0)
  if (rng.chance(0.01 + (100 - c.e.ops.pit) * 0.0012)) {
    const botch = rng.range(4, 14)
    extra += botch
    c.notes.push(`Slow pit stop cost ${botch.toFixed(1)} s`)
    state.events.push({ lap: lapAt(state, seg) + 1, type: 'pit', ids: [c.id], text: `Slow stop for ${c.e.name}` })
  }
  if (c.wingDamage > 0) { extra += 6; c.notes.push('New front wing fitted'); c.wingDamage = 0 }
  c.dt += loss + extra
  c.pitExtra += extra
  c.pitTime += loss + extra
  c.tyre = comp
  c.wear = 0
  c.used.push(comp)
  c.stints.push({ comp, lap: lapAt(state, seg) })
  c.stops++
  c.lastStop = seg
  c.pitNow = true
  c.forced = null
  const two = c.two = usedTwo(c)
  c.plan = TYRES[comp].wet || state.cond[seg] !== 'dry' ? [] : planRest(state, c, seg, comp, 0, two).stops.filter((p) => p.seg > seg)
  const why = { plan: '', rain: ' for the rain', drying: ' as the track dries', sc: ' under the safety car', vsc: ' under the virtual safety car', cliff: ': tyres gone', damage: ' with damage', puncture: ' with a puncture', 'compound rule': ' to use a second compound' }[reason] ?? ''
  state.events.push({ lap: lapAt(state, seg) + 1, type: 'pit', ids: [c.id], text: `${c.e.name} pits${why}: ${TYRES[comp].name}s` })
}

// ---- The race ----

function retire(state, c, seg, reason, text, rng) {
  c.status = 'dnf'
  c.dnfSeg = seg
  c.reason = reason
  state.events.push({ lap: seg < 0 ? 1 : lapOf(state, seg, rng), type: 'dnf', ids: [c.id], text })
}

function lapOf(state, seg, rng) {
  return clamp(Math.round((seg + rng.next()) * state.segLaps) + 1, 1, state.laps)
}

function start(state) {
  const P = SIM
  const rng = mixRng(state.key, RNG.start)
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
        retire(state, c, -1, 'collision', `${c.e.name} is out in a first-lap collision`, rng)
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

// Runs one block. `orders` maps a controlled car's id to
// { box: compound or null, pace, stance, engine }; standing orders persist.
// Cars that are not controlled get the strategist's calls.
export function stepRace(state, orders = {}) {
  if (state.done) return state
  const P = SIM
  const s = state.seg
  const S = state.S
  const segLaps = state.segLaps
  const track = state.track
  const R = (label, c) => mixRng(state.key, s + 1, RNG[label], c ? carIndex(state, c) + 1 : 0)
  for (const [id, o] of Object.entries(orders)) {
    const c = state.cars.find((x) => x.id === id)
    if (!c) continue
    for (const k of ['pace', 'stance', 'engine', 'lap1']) if (o[k] && ORDERS[k][o[k]]) c.orders[k] = o[k]
  }
  if (!state.started) start(state)
  state.neutralNow = state.neutral
  state.neutral = null
  const cnd = state.cond[s]
  const wetSeg = cnd !== 'dry'
  const scF = track.sc / P.scAverage
  let sc = s === state.scSeg || !!state.pendingSc
  state.pendingSc = false
  const sMid = Math.floor(S / 2)

  // Pit calls first: the stop happens in this block.
  for (const c of byOrder(state)) {
    c.pitNow = false
    if (c.status !== 'running') continue
    const rng = R('pit', c)
    let call = null
    if (c.controlled) {
      const o = orders[c.id]
      if (c.forced) call = { comp: bestStop(state, c, s).comp, reason: c.forced }
      else if (o?.box && TYRES[o.box]) call = { comp: o.box, reason: 'call' }
    } else call = strategistCall(state, c, s, R('call', c))
    if (call) pit(state, c, call.comp, s, rng, call.reason)
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
    const wingNow = wetSeg ? wingLoss(c.wing, idealWing(track, c.e.car, true)) - wingLoss(c.wing, c.idealWing) : 0
    const lapPace = c.pace + tyreDelta(c, cnd, segLaps, rate) + pace.pace + (stance.pace || 0) - engine.power * track.w.power * P.secPerPoint +
      c.wingDamage + wingNow + (wetSeg ? (100 - dr.wet) * P.wetPerPoint * (cnd === 'wet' ? 1 : 0.6) : 0) + wetSetupEffect(c.m, wetSeg)
    let dt = segLaps * lapPace + rng.normal(0, P.lapNoise * Math.sqrt(segLaps) * (wetSeg ? 2.2 : 1))
    c.wear += segLaps * rate
    const pMech = c.pMech * engine.mech
    if (rng.chance(pMech / S)) {
      const why = rng.pick(MECH_REASONS)
      retire(state, c, s, why, `${c.e.name} retires: ${why}`, rng)
      if (rng.chance(P.scAfterFailure * scF)) sc = true
      continue
    }
    // Slicks on a wet track, and a wet track itself, multiply the risk of a crash.
    const mismatch = !TYRES[c.tyre].wet && wetSeg ? (cnd === 'wet' ? 4 : 2) : 1
    const pc = (c.pCrash / S) * (wetSeg ? P.wetCrashMult : 1) * mismatch * pace.err * state.chaos * P.crashScale
    if (rng.chance(pc)) {
      c.damage += rng.range(0.4, 1.2)
      retire(state, c, s, 'crash', `${c.e.name} crashes out`, rng)
      if (rng.chance(P.scAfterCrash * scF)) sc = true
      continue
    }
    if (rng.chance(pc * 2)) {
      const loss = rng.range(3, 10)
      dt += loss
      c.errors++
      c.notes.push(`Driver error cost ${loss.toFixed(1)} s`)
      state.events.push({ lap: lapOf(state, s, rng), type: 'error', ids: [c.id], text: `${c.e.name} runs wide and loses time` })
    }
    if (rng.chance((P.incidentChance / S) * Math.sqrt(state.chaos))) {
      // A puncture or debris damage: the car limps to the pits for new tyres next block.
      const loss = rng.range(8, 16)
      dt += loss
      c.damage += rng.range(0.05, 0.3)
      c.forced = 'puncture'
      c.notes.push(`Puncture cost ${loss.toFixed(0)} s and a stop`)
      state.events.push({ lap: lapOf(state, s, rng), type: 'incident', ids: [c.id], text: `${c.e.name} picks up a puncture and limps to the pits` })
    }
    if (s === sMid) {
      const sd = P.strategySd * c.ap.sd * (c.m.stratSd || 1) * (wetSeg ? 1.8 : 1)
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
  if (s > 0 && state.cond[s] !== state.cond[s - 1]) {
    const text = state.cond[s] === 'dry' ? 'The track is drying: time for slicks' : state.cond[s - 1] === 'dry' ? 'Rain is falling' : state.cond[s] === 'wet' ? 'The rain gets heavier' : 'The rain eases'
    state.events.push({ lap: lapAt(state, s) + 1, type: 'weather', ids: [], text })
  }
  order = resolve(state, order.filter((c) => c.status === 'running'), wetSeg, s)
  if (sc && order.length > 1 && s < S - 1 && state.safetyCars + state.vscs < 3) {
    if (R('neutral').chance(P.vscShare)) {
      state.vscs++
      state.neutral = 'vsc'
      state.events.push({ lap: lapOf(state, s, R('sclap')), type: 'vsc', ids: [], text: 'Virtual safety car' })
    } else {
      order = safetyCar(state, order, s, R('sc'))
      state.neutral = 'sc'
    }
  }
  state.order = order.map((c) => state.cars.indexOf(c))
  state.seg++
  if (state.seg >= S) state.done = true
  return state
}

function resolve(state, list, wetSeg, curSeg) {
  const rng = mixRng(state.key, curSeg + 1, RNG.resolve)
  const segLaps = state.segLaps
  const res = []
  const requeue = []
  const D = state.track.overtaking
  const thr = 0.1 + Math.pow(D, 1.5) * 1.2
  const scale = 0.08 + D * 0.14
  const lapNow = () => lapOf(state, curSeg, rng)
  for (const c of list) {
    if (c.status !== 'running') continue
    let idx = res.length
    let placed = true
    while (idx > 0) {
      const a = res[idx - 1]
      if (c.t >= a.t) break
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
      const delta = (a.lastDt - c.lastDt) / segLaps
      if (delta < 1.5) {
        const pContact = (0.005 + (200 - c.e.driver.consistency - a.e.driver.consistency) * 0.0003) * (wetSeg ? 1.5 : 1) * c.ap.err *
          cs.contact * as.contact * Math.sqrt(state.chaos)
        if (rng.chance(pContact)) {
          const r = rng.next()
          const lap = lapNow()
          if (rng.chance(0.5)) {
            const pen = rng.chance(0.75) ? 5 : 10
            c.penalty += pen
            c.notes.push(`${pen}-second penalty for causing a collision`)
            state.events.push({ lap, type: 'penalty', ids: [c.id], text: `${c.e.name} gets a ${pen}-second penalty for contact with ${a.e.name}` })
          }
          if (r < 0.35) {
            c.t += rng.range(1, 2)
            a.t += rng.range(1, 2)
            state.events.push({ lap, type: 'incident', ids: [c.id, a.id], text: `${c.e.name} and ${a.e.name} touch; both continue` })
          } else if (r < 0.65) {
            const victim = rng.chance(0.5) ? c : a
            victim.damage += rng.range(0.15, 0.5)
            victim.wingDamage = Math.max(victim.wingDamage, rng.range(0.15, 0.6))
            victim.notes.push('Front wing damaged in contact')
            state.events.push({ lap, type: 'incident', ids: [c.id, a.id], text: `${c.e.name} and ${a.e.name} collide; ${victim.e.name} damages the front wing` })
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
              retire(state, v, curSeg, 'collision', `${v.e.name} is out after contact`, rng)
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
      // In a pit phase the order is settled on time: the undercut and overcut.
      p = delta > 2 || c.pitNow || a.pitNow ? 1 : clamp(p, 0.02, 0.98)
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

function safetyCar(state, list, seg, rng) {
  state.safetyCars++
  state.events.push({ lap: lapOf(state, seg, rng), type: 'sc', ids: [], text: 'Safety car: the field bunches up' })
  let prevOld = list[0].t
  let prevNew = list[0].t
  for (let k = 1; k < list.length; k++) {
    const gap = Math.min(list[k].t - prevOld, rng.range(0.5, 1.1))
    prevOld = list[k].t
    list[k].t = prevNew + gap
    prevNew = list[k].t
  }
  for (const c of list) {
    let swing = rng.normal((75 - c.e.ops.strategy) * 0.02, SIM.scLotterySd * c.ap.sd * (c.m.stratSd || 1))
    if (rng.chance(SIM.scCaughtOut)) {
      swing += rng.range(4, 10)
      c.notes.push('Caught out by the safety-car timing')
    }
    c.t += swing
    c.strat += swing
  }
  return list.sort((a, b) => a.t - b.t)
}

// The strategist's advice for a car before the next block is run.
export function advice(state, c) {
  if (state.done) return null
  return strategistCall(state, c, state.seg, null, state.neutral)
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
  const retired = cars.filter((c) => c.status === 'dnf').sort((a, b) => b.dnfSeg - a.dnfSeg || a.t - b.t)
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
    stats: { safetyCars: state.safetyCars + state.vscs, vsc: state.vscs, retirements: retired.length, starters: cars.length, chaos: state.chaos },
  }
}

// The whole weekend with the strategist making every call.
export function simulateWeekend(track, entries, rng) {
  const state = createRace(track, entries, rng)
  runToEnd(state)
  return raceResult(state)
}

export const raceKey = (...k) => hashString(k.join('|'))
