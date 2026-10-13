// Friday practice (RACE_WEEKEND.md 4.2): two dials for each car, a few runs,
// and the driver's word on how the car feels. Kept deliberately simple.
//
// - Wing level, 1 (low drag) to 5 (high downforce), as in the race engine.
// - Balance, -2 (oversteer) to +2 (understeer). Each car has a hidden ideal
//   for this track and driver; every step away costs SETUP.balanceCost² a lap.
// The engineers start from their own guess, as good as the team's setup work.
// Practice that is skipped keeps the engineers' setup.

import { clamp, currentTrack, effectiveCar, teamOps, PLAYER } from './core.js'
import { idealWing, wingLoss, carScore, SIM } from './weekend.js'
import { streamRng } from './rng.js'

export const SETUP = {
  runs: 3, // runs for each car
  balanceCost: 0.1, // seconds a lap per balance step², away from the ideal
  longRunWear: 0.95, // tyre wear in the race after a long run
}
export const BALANCE_LABELS = ['Oversteer', 'Loose', 'Neutral', 'Stable', 'Understeer']

export const balanceLoss = (balance, ideal) => SETUP.balanceCost * (balance - ideal) ** 2

function driverOf(game, slot) {
  return game.drivers[game.teams[PLAYER].drivers[slot]]
}

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
  for (const [slot, p] of w.practice.cars.entries()) {
    if (p.left <= 0) continue
    const n = SETUP.runs - p.left
    const rng = streamRng(game.seed, 'practice', game.season, game.round, slot, n)
    const d = driverOf(game, slot)
    const wing = w.wing[slot]
    const loss = wingLoss(wing, ideal) + balanceLoss(p.balance, idealBalance(game, slot))
    const lap = track.baseLap + (100 - carScore(car, track.w)) * SIM.secPerPoint + (100 - d.pace) * SIM.secPerPace + loss + rng.normal(0, 0.04)
    const sd = readSd(game, slot)
    const run = { n: n + 1, kind: p.kind, wing, balance: p.balance }
    if (p.kind === 'long') {
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
