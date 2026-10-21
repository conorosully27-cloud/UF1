// Friday practice (RACE_WEEKEND.md 4.2): two dials for each car, a few runs,
// and the driver's word on how the car feels. Kept deliberately simple.
//
// - Wing level, 1 (low drag) to 5 (high downforce), as in the race engine.
// - Balance, -2 (oversteer) to +2 (understeer). Each car has a hidden ideal
//   for this track and driver; every step away costs SETUP.balanceCost² a lap.
// The engineers start from their own guess, as good as the team's setup work.
// Practice that is skipped keeps the engineers' setup.
// Friday can be wet: a wet run says little about the dry setup, and a long
// run in the wet teaches nothing about the race tyres. A practice crash (the
// weekend's incident) ends that car's Friday.

import { clamp, currentTrack, effectiveCar, teamOps, PLAYER } from './core.js'
import { idealWing, wingLoss, carScore, SIM } from './weekend.js'
import { streamRng } from './rng.js'

export const SETUP = {
  runs: 3, // runs for each car
  balanceCost: 0.1, // seconds a lap per balance step², away from the ideal
  longRunWear: 0.95, // tyre wear in the race after a long run
  fridayRain: 0.7, // chance of rain on Friday, against the track's chance in the race
  wetLap: 8, // seconds a lap slower on a wet track
  wetRead: 1.2, // extra error, in balance steps, in what a wet run says about the dry setup
}
export const BALANCE_LABELS = ['Oversteer', 'Loose', 'Neutral', 'Stable', 'Understeer']

export const balanceLoss = (balance, ideal) => SETUP.balanceCost * (balance - ideal) ** 2

// Who is in the car this weekend: the reserve when standing in for an unwell driver.
export function seatDriverId(game, slot) {
  return game.substitute === slot && game.reserve ? game.reserve : game.teams[PLAYER].drivers[slot]
}
const driverOf = (game, slot) => game.drivers[seatDriverId(game, slot)]

// How well the team sets a car up: the setup work (race engineers and
// simulator) and the driver's Feedback, as in the race engine.
function setupSkill(game, slot) {
  return clamp(0.6 * teamOps(game, PLAYER).setup + 0.4 * driverOf(game, slot).feedback, 0, 100)
}

// The balance this car wants here: hidden from the player.
export function idealBalance(game, slot) {
  return streamRng(game.seed, 'balance', game.season, game.round, slot).int(-2, 2)
}

// The engineers' starting balance: off by a step or two when setup work is weak.
export function engineersBalance(game, slot) {
  const sd = 1.05 * (1.6 - setupSkill(game, slot) / 100)
  const err = streamRng(game.seed, 'balanceAdvice', game.season, game.round, slot).normal(0, sd)
  return clamp(Math.round(idealBalance(game, slot) + err), -2, 2)
}

// What a car's setup costs a lap, for the race engine: the balance only, as
// the race engine already charges for the wing.
export function setupLossFor(game, slot, balance) {
  return balanceLoss(balance, idealBalance(game, slot))
}

// Friday's conditions, run by run: dry, all wet, or rain for the first or
// the last run. Keyed to the round, so it is the same whatever is decided.
export function fridayWeather(game) {
  const track = currentTrack(game)
  const rain = game.weatherOverride ?? track.rain
  const rng = streamRng(game.seed, 'friday', game.season, game.round)
  const dry = Array(SETUP.runs).fill('dry')
  if (!rng.chance(rain * SETUP.fridayRain)) return dry
  const kind = rng.pick(['wet', 'early', 'late'])
  return dry.map((x, i) => (kind === 'wet' || (kind === 'early' && i === 0) || (kind === 'late' && i === SETUP.runs - 1) ? 'wet' : 'dry'))
}

export function startPractice(w, game) {
  w.practice = {
    cars: [0, 1].map((slot) => ({ balance: w.balance[slot], kind: 'setup', runs: [], left: SETUP.runs, longRun: false })),
  }
}

// How clearly the driver and engineers read the car: about 0.15 steps of error at
// best, over half a step for a weak pairing.
const readSd = (game, slot) => (100 - (0.5 * driverOf(game, slot).feedback + 0.5 * teamOps(game, PLAYER).setup)) / 100

function wingWords(d) {
  if (d > 1.2) return 'A sitting duck on the straights: far too much wing.'
  if (d > 0.5) return 'A bit slow on the straights. Maybe less wing.'
  if (d < -1.2) return 'No grip in the fast corners at all. It needs a lot more wing.'
  if (d < -0.5) return 'Sliding a bit in the fast corners. A touch more wing.'
  return 'The wing feels about right.'
}
function balanceWords(d) {
  if (d > 1.2) return 'Massive understeer: the front just will not turn in.'
  if (d > 0.5) return 'A touch of understeer in the slow corners.'
  if (d < -1.2) return 'The rear is snapping round everywhere.'
  if (d < -0.5) return 'The rear is a bit loose on entry.'
  return 'The balance is good.'
}

// One run for each car with runs left, on the dials as set. A setup run
// brings back a lap time and the driver's feedback; a long run teaches the
// driver how the tyres go off (a little less wear in the race).
export function practiceRun(game) {
  const w = game.weekend
  const track = currentTrack(game)
  const car = effectiveCar(game, PLAYER)
  const ideal = idealWing(track, car)
  const inc = w.incident
  for (const [slot, p] of w.practice.cars.entries()) {
    if (p.left <= 0) continue
    const n = SETUP.runs - p.left
    const wet = (w.friday?.[n] ?? 'dry') === 'wet'
    // The practice crash the weekend's incident is about: that car's Friday ends in the barrier.
    if (inc?.id === 'practice-crash' && !inc.resolved && inc.params.slot === slot && n === 0) {
      p.runs.push({ n: 1, kind: p.kind, wing: w.wing[slot], balance: p.balance, wet, time: null, crash: true, notes: ['Into the barrier on the out-lap. Our Friday is over.'] })
      p.left = 0
      continue
    }
    const rng = streamRng(game.seed, 'practice', game.season, game.round, slot, n)
    const d = driverOf(game, slot)
    const wing = w.wing[slot]
    const loss = wingLoss(wing, ideal) + balanceLoss(p.balance, idealBalance(game, slot))
    const lap = track.baseLap + (100 - carScore(car, track.w)) * SIM.secPerPoint + (100 - d.pace) * SIM.secPerPace + loss + rng.normal(0, 0.04)
    const sd = readSd(game, slot)
    const run = { n: n + 1, kind: p.kind, wing, balance: p.balance, wet }
    if (wet) {
      const time = lap + SETUP.wetLap + Math.abs(rng.normal(0, 0.6))
      if (p.kind === 'long') {
        run.time = time + 1.4
        run.notes = ['Long run on a wet track: it tells us nothing about the race tyres.']
      } else {
        run.time = time
        const blur = sd + SETUP.wetRead
        run.notes = ['Wet track: hard to read the dry setup from this.', balanceWords(p.balance - idealBalance(game, slot) + rng.normal(0, blur))]
      }
    } else if (p.kind === 'long') {
      p.longRun = true
      run.time = lap + 1.4 + Math.abs(rng.normal(0, 0.1))
      run.notes = ['Long run done: I know how these tyres go off now.']
    } else {
      run.time = lap
      run.notes = [wingWords(wing - ideal + rng.normal(0, sd)), balanceWords(p.balance - idealBalance(game, slot) + rng.normal(0, sd))]
    }
    p.runs.push(run)
    p.left--
  }
}

export function setBalance(game, slot, value) {
  const p = game.weekend?.practice?.cars[slot]
  if (!p || game.weekend.phase !== 'practice') throw new Error('Balance is set in practice')
  p.balance = clamp(Math.round(value), -2, 2)
  game.weekend.balance[slot] = p.balance
}

export function setRunKind(game, slot, kind) {
  const p = game.weekend?.practice?.cars[slot]
  if (!p || game.weekend.phase !== 'practice') throw new Error('Not in practice')
  if (kind === 'setup' || kind === 'long') p.kind = kind
}
