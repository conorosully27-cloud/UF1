// Race weekend simulation: qualifying and race for the whole field, with no
// live control. The race runs in short segments of a few laps so that track
// position, overtaking difficulty and safety cars shape the result.
//
// This file is the single interface the rest of the game uses for a weekend.
// A lap-by-lap model with live race control can replace it later.

import { POINTS } from './data/tracks.js'

export const SIM = {
  secPerPoint: 0.05, // one weighted car rating point, seconds per lap
  secPerPace: 0.02, // one driver Pace point, seconds per lap
  wetPerPoint: 0.03, // one driver Wet point, seconds per lap in the rain
  teamFormSd: 0.13, // weekend-to-weekend car variation, shared by both cars
  dayFormSd: 0.03, // race-day driver variation
  lapNoise: 0.16, // lap-to-lap variation
  qualiSdBase: 0.04, qualiSdCons: 0.003, // qualifying lap variation, and how much Consistency narrows it
  tyreCarePerPoint: 0.006,
  gridGap: 0.4, // seconds between grid slots after lap one
  startSd: 0.3,
  strategySd: 1.0,
  scLotterySd: 1.0,
  scCaughtOut: 0.08, // share of cars that lose out badly to safety-car timing
  incidentChance: 0.045, // per car per race: puncture, debris or damage
  rivalGridPenalty: 0.03, // per rival car per race: new power unit parts
  scDebris: 0.25, // share of a track's safety-car figure not tied to an incident
  scAfterCrash: 0.45, scAfterFailure: 0.15, scAfterContact: 0.45, scAfterLap1: 0.5,
  scAverage: 0.39, // average of the tracks' safety-car figures
  wetCrashMult: 3.2, // crash risk multiplier on a wet track
  pileUp: 0.15, // share of first-lap incidents that involve five cars
}

const APPROACH = {
  conservative: { sd: 0.6, err: 0.8, mean: 0 },
  balanced: { sd: 1.0, err: 1.0, mean: 0 },
  aggressive: { sd: 1.7, err: 1.3, mean: 0.5 },
}

const MECH_REASONS = ['power unit', 'gearbox', 'hydraulics', 'brakes', 'suspension', 'electrics', 'cooling']

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

export function carScore(car, w) {
  return w.aero * car.aero + w.chassis * car.chassis + w.power * car.power
}

export function mechFailureChance(reliability) {
  return clamp(0.02 + (92 - reliability) * 0.0032, 0.012, 0.3)
}

export function crashChance(consistency) {
  return 0.010 + (100 - consistency) * 0.0014
}

// A wet-leaning setup helps in the rain and costs time in the dry.
function wetSetupEffect(mods, wet) {
  if (!mods.wetSetup) return 0
  return wet ? -0.25 : 0.2
}

function lapOf(seg, segLaps, laps, rng) {
  return clamp(Math.round((seg + rng.next()) * segLaps) + 1, 1, laps)
}

export function simulateWeekend(track, entries, rng) {
  const P = SIM
  const events = []
  const qualiWet = rng.chance(track.rain * 0.8)
  const u = rng.next()
  const raceWeather = u < track.rain * 0.45 ? 'wet' : u < track.rain ? 'mixed' : 'dry'

  const teamForm = {}
  const cars = entries.map((e) => {
    const m = { ...(e.mods || {}) }
    // Teams with weaker setup work swing more from one weekend to the next.
    if (!(e.teamId in teamForm)) teamForm[e.teamId] = rng.normal(0, P.teamFormSd * clamp(1 + (85 - e.ops.setup) * 0.02, 0.8, 1.6))
    const carDelta = (100 - carScore(e.car, track.w)) * P.secPerPoint + teamForm[e.teamId]
    const setupSkill = clamp(0.6 * e.ops.setup + 0.4 * e.driver.feedback + (m.setupSkill || 0), 0, 100)
    const setupLoss = Math.abs(rng.normal()) * 0.1 * (1.6 - setupSkill / 100)
    const ap = APPROACH[e.approach] || APPROACH.balanced
    if (!e.isPlayer && rng.chance(P.rivalGridPenalty)) {
      m.gridDrop = (m.gridDrop || 0) + 10
      events.push({ lap: 0, type: 'penalty', ids: [e.id], text: `${e.name} takes new power unit parts: 10-place grid penalty` })
    }
    return {
      e, m, ap, carDelta, setupLoss,
      status: 'running', t: 0, dt: 0, traffic: 0, penalty: 0, damage: 0, pitExtra: 0, strat: 0,
      errors: 0, passes: 0, dnfSeg: -1, reason: null, notes: [],
    }
  })

  // ---- Qualifying ----
  for (const c of cars) {
    const dr = c.e.driver
    let t = c.carDelta + (100 - dr.pace) * P.secPerPace + c.setupLoss + (c.m.qualiPace || 0)
    let sd = P.qualiSdBase + (100 - dr.consistency) * P.qualiSdCons
    if (qualiWet) {
      t += (100 - dr.wet) * P.wetPerPoint
      sd *= 1.8
    }
    t += wetSetupEffect(c.m, qualiWet) + rng.normal(0, sd)
    const pErr = (0.01 + (100 - dr.consistency) * 0.0012) * (qualiWet ? 2 : 1)
    c.qError = rng.chance(pErr)
    if (c.qError) t += rng.range(0.6, 2.0)
    c.qTime = t
  }
  const qOrder = cars.slice().sort((a, b) => a.qTime - b.qTime)
  qOrder.forEach((c, i) => { c.qPos = i + 1 })
  const gridOrder = cars.slice().sort((a, b) => {
    const ka = a.qPos + (a.m.gridDrop || 0) + (a.m.gridDrop ? 0.5 : 0)
    const kb = b.qPos + (b.m.gridDrop || 0) + (b.m.gridDrop ? 0.5 : 0)
    return ka - kb
  })
  gridOrder.forEach((c, i) => { c.grid = i + 1 })

  // ---- Race set-up ----
  const laps = track.laps
  const S = Math.max(8, Math.round(laps / 5))
  const segLaps = laps / S
  for (const c of cars) {
    const dr = c.e.driver
    c.pace = c.carDelta + (100 - (0.6 * dr.pace + 0.4 * dr.racecraft)) * P.secPerPace + c.setupLoss +
      (80 - c.e.car.tyreCare) * P.tyreCarePerPoint + (c.m.racePace || 0) + rng.normal(0, P.dayFormSd)
    c.pMech = mechFailureChance(c.e.car.reliability) * (c.m.mechMult || 1) + (c.m.dnfAdd || 0)
    c.pCrash = crashChance(dr.consistency) * c.ap.err * (c.m.errMult || 1)
    const stops = (rng.chance(0.6) ? 1 : 2) + (raceWeather === 'dry' ? 0 : 1)
    c.pitSegs = []
    for (let k = 1; k <= stops; k++) c.pitSegs.push(clamp(Math.round((S * k) / (stops + 1)) + rng.int(-1, 1), 1, S - 2))
  }
  const wetShare = raceWeather === 'wet' ? 1 : raceWeather === 'mixed' ? 0.5 : 0
  const dayPace = (c) => c.pace + wetShare * ((100 - c.e.driver.wet) * P.wetPerPoint + wetSetupEffect(c.m, true))
  const paceOrder = cars.slice().sort((a, b) => dayPace(a) - dayPace(b))
  paceOrder.forEach((c, i) => { c.paceRank = i + 1 })

  let wetStart = 0
  let wetEnd = 0
  let crossSeg = -1
  if (raceWeather === 'wet') wetEnd = S
  if (raceWeather === 'mixed') {
    const len = rng.int(Math.floor(S / 3), Math.floor((2 * S) / 3))
    if (rng.chance(0.5)) { wetStart = 0; wetEnd = len; crossSeg = len } else { wetStart = S - len; wetEnd = S; crossSeg = S - len }
  }
  const scF = track.sc / P.scAverage
  const scSeg = rng.chance(track.sc * P.scDebris) ? rng.int(1, S - 2) : -1
  const sMid = Math.floor(S / 2)
  let safetyCars = 0

  const retire = (c, seg, reason, text) => {
    c.status = 'dnf'
    c.dnfSeg = seg
    c.reason = reason
    events.push({ lap: seg < 0 ? 1 : lapOf(seg, segLaps, laps, rng), type: 'dnf', ids: [c.e.id], text })
  }

  // ---- Start and first lap ----
  let order = gridOrder.slice()
  order.forEach((c, i) => {
    c.t = i * P.gridGap + rng.normal(0, P.startSd) - (c.e.driver.racecraft - 85) * 0.02 + (c.m.startTime || 0)
  })
  order.sort((a, b) => a.t - b.t)
  let pendingSc = false
  if (rng.chance(track.lap1)) {
    const k = rng.chance(P.pileUp) ? 5 : rng.chance(0.7) ? 2 : 3
    const anchor = rng.int(3, Math.max(3, order.length - k - 1))
    const involved = order.slice(anchor, anchor + k)
    let anyOut = false
    for (const c of involved) {
      if (rng.chance(0.35)) {
        c.damage += rng.range(0.4, 1.0)
        retire(c, -1, 'collision', `${c.e.name} is out in a first-lap collision`)
        anyOut = true
      } else {
        c.t += rng.range(12, 35)
        c.damage += rng.range(0.15, 0.45)
        c.notes.push('First-lap damage, pitted for repairs')
        events.push({ lap: 1, type: 'incident', ids: [c.e.id], text: `${c.e.name} is damaged in a first-lap incident and pits` })
      }
    }
    if (anyOut && rng.chance(P.scAfterLap1 * scF)) pendingSc = true
  }
  order = order.filter((c) => c.status === 'running').sort((a, b) => a.t - b.t)

  const resolve = (list, wetSeg) => {
    const res = []
    const requeue = []
    const D = track.overtaking
    const thr = 0.1 + Math.pow(D, 1.5) * 1.2
    const scale = 0.08 + D * 0.14
    for (const c of list) {
      if (c.status !== 'running') continue
      let idx = res.length
      let placed = true
      while (idx > 0) {
        const a = res[idx - 1]
        if (c.t >= a.t) break
        const delta = (a.dt - c.dt) / segLaps
        if (delta < 1.5) {
          const pContact = (0.005 + (200 - c.e.driver.consistency - a.e.driver.consistency) * 0.0003) * (wetSeg ? 1.5 : 1) * c.ap.err
          if (rng.chance(pContact)) {
            const r = rng.next()
            const lap = lapOf(curSeg, segLaps, laps, rng)
            if (rng.chance(0.5)) {
              const pen = rng.chance(0.75) ? 5 : 10
              c.penalty += pen
              c.notes.push(`${pen}-second penalty for causing a collision`)
              events.push({ lap, type: 'penalty', ids: [c.e.id], text: `${c.e.name} gets a ${pen}-second penalty for contact with ${a.e.name}` })
            }
            if (r < 0.35) {
              c.t += rng.range(1, 2)
              a.t += rng.range(1, 2)
              events.push({ lap, type: 'incident', ids: [c.e.id, a.e.id], text: `${c.e.name} and ${a.e.name} touch; both continue` })
            } else if (r < 0.65) {
              const victim = rng.chance(0.5) ? c : a
              victim.damage += rng.range(0.15, 0.5)
              victim.notes.push('Damaged in contact, lost time')
              events.push({ lap, type: 'incident', ids: [c.e.id, a.e.id], text: `${c.e.name} and ${a.e.name} collide; ${victim.e.name} is damaged` })
              if (victim === a) {
                res.splice(idx - 1, 1)
                idx--
                a.t += rng.range(8, 25)
                requeue.push(a)
                continue
              }
              c.t += rng.range(8, 25)
              requeue.push(c)
              placed = false
              break
            } else {
              const both = r >= 0.9
              const victim = rng.chance(0.5) ? c : a
              const out = both ? [c, a] : [victim]
              for (const v of out) {
                v.damage += rng.range(0.4, 1.0)
                retire(v, curSeg, 'collision', `${v.e.name} is out after contact`)
              }
              if (rng.chance(P.scAfterContact * scF)) pendingSc = true
              if (out.includes(a)) { res.splice(idx - 1, 1); idx-- }
              if (out.includes(c)) { placed = false; break }
              continue
            }
          }
        }
        let p = 1 / (1 + Math.exp(-(delta - thr) / scale)) + (c.e.driver.racecraft - a.e.driver.racecraft) * 0.004
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

  const safetyCar = (seg, list) => {
    safetyCars++
    events.push({ lap: lapOf(seg, segLaps, laps, rng), type: 'sc', ids: [], text: 'Safety car: the field bunches up' })
    let prevOld = list[0].t
    let prevNew = list[0].t
    for (let k = 1; k < list.length; k++) {
      const gap = Math.min(list[k].t - prevOld, rng.range(0.5, 1.1))
      prevOld = list[k].t
      list[k].t = prevNew + gap
      prevNew = list[k].t
    }
    for (const c of list) {
      let swing = rng.normal((75 - c.e.ops.strategy) * 0.02, P.scLotterySd * c.ap.sd * (c.m.stratSd || 1))
      if (rng.chance(P.scCaughtOut)) {
        swing += rng.range(4, 10)
        c.notes.push('Caught out by the safety-car timing')
      }
      c.t += swing
      c.strat += swing
    }
    return list.sort((a, b) => a.t - b.t)
  }

  // ---- Segments ----
  let curSeg = 0
  for (let s = 0; s < S; s++) {
    curSeg = s
    const wetSeg = s >= wetStart && s < wetEnd
    let sc = s === scSeg || pendingSc
    pendingSc = false
    for (const c of order) {
      const dr = c.e.driver
      const lapPace = c.pace + (wetSeg ? (100 - dr.wet) * P.wetPerPoint : 0) + wetSetupEffect(c.m, wetSeg)
      let dt = segLaps * lapPace + rng.normal(0, P.lapNoise * Math.sqrt(segLaps) * (wetSeg ? 1.6 : 1))
      if (rng.chance(c.pMech / S)) {
        const why = rng.pick(MECH_REASONS)
        retire(c, s, why, `${c.e.name} retires: ${why}`)
        if (rng.chance(P.scAfterFailure * scF)) sc = true
        continue
      }
      const pc = (c.pCrash / S) * (wetSeg ? P.wetCrashMult : 1)
      if (rng.chance(pc)) {
        c.damage += rng.range(0.4, 1.2)
        retire(c, s, 'crash', `${c.e.name} crashes out`)
        if (rng.chance(P.scAfterCrash * scF)) sc = true
        continue
      }
      if (rng.chance(pc * 2)) {
        const loss = rng.range(3, 10)
        dt += loss
        c.errors++
        c.notes.push(`Driver error cost ${loss.toFixed(1)} s`)
        events.push({ lap: lapOf(s, segLaps, laps, rng), type: 'error', ids: [c.e.id], text: `${c.e.name} runs wide and loses time` })
      }
      if (rng.chance(P.incidentChance / S)) {
        const loss = rng.range(15, 30)
        dt += loss
        c.damage += rng.range(0.05, 0.3)
        c.notes.push(`Puncture or damage cost ${loss.toFixed(0)} s`)
        events.push({ lap: lapOf(s, segLaps, laps, rng), type: 'incident', ids: [c.e.id], text: `${c.e.name} picks up a puncture and limps to the pits` })
      }
      c.pitNow = c.pitSegs.includes(s)
      if (c.pitNow) {
        let extra = Math.abs(rng.normal()) * (0.25 + (100 - c.e.ops.pit) * 0.012) + (c.m.pitTime || 0)
        if (rng.chance(0.01 + (100 - c.e.ops.pit) * 0.0012)) {
          const botch = rng.range(4, 14)
          extra += botch
          c.notes.push(`Slow pit stop cost ${botch.toFixed(1)} s`)
          events.push({ lap: lapOf(s, segLaps, laps, rng), type: 'pit', ids: [c.e.id], text: `Slow stop for ${c.e.name}` })
        }
        dt += extra
        c.pitExtra += extra
      }
      if (s === sMid) {
        const sd = P.strategySd * c.ap.sd * (c.m.stratSd || 1) * (raceWeather === 'dry' ? 1 : 1.8)
        // A pit wall committed to an early or late call on rain gains or loses with the weather.
        const rainCall = c.m.rainPlan === 'early' ? (raceWeather === 'dry' ? 2.5 : -2.5) : c.m.rainPlan === 'late' ? (raceWeather === 'dry' ? -0.5 : 1.5) : 0
        const swing = rng.normal((75 - c.e.ops.strategy) * 0.08 + c.ap.mean + (c.m.stratMean || 0) + rainCall, sd)
        dt += swing
        c.strat += swing
      }
      if (s === crossSeg) {
        const swing = rng.normal((75 - c.e.ops.strategy) * 0.1, 5 * c.ap.sd * (c.m.stratSd || 1))
        dt += swing
        c.strat += swing
      }
      c.dt = dt
      c.t += dt
    }
    if (s === crossSeg) {
      events.push({ lap: lapOf(s, segLaps, laps, rng), type: 'weather', ids: [], text: wetStart === 0 ? 'The track dries: crossover to slicks' : 'Rain arrives: crossover to wet tyres' })
    }
    order = resolve(order, wetSeg)
    if (sc && safetyCars < 3 && order.length > 1 && s < S - 1) order = safetyCar(s, order)
  }

  // ---- Classification ----
  const finishers = order.filter((c) => c.status === 'running')
  for (const c of finishers) c.final = c.t + c.penalty
  finishers.sort((a, b) => a.final - b.final)
  const retired = cars.filter((c) => c.status === 'dnf').sort((a, b) => b.dnfSeg - a.dnfSeg || a.t - b.t)
  const lead = finishers.length ? finishers[0].final : 0
  const race = []
  finishers.forEach((c, i) => {
    const gap = c.final - lead
    race.push({
      pos: i + 1, id: c.e.id, teamId: c.e.teamId, status: 'finished', reason: null, grid: c.grid,
      gap, lapsDown: Math.floor(gap / (track.baseLap + 2)), points: POINTS[i] || 0, penalty: c.penalty,
    })
  })
  retired.forEach((c, i) => {
    race.push({
      pos: finishers.length + i + 1, id: c.e.id, teamId: c.e.teamId, status: 'dnf', reason: c.reason, grid: c.grid,
      gap: null, lapsDown: 0, points: 0, penalty: 0,
    })
  })
  const posById = Object.fromEntries(race.map((r) => [r.id, r.pos]))

  const quali = qOrder.map((c) => ({
    pos: c.qPos, id: c.e.id, teamId: c.e.teamId, time: track.baseLap * (qualiWet ? 1.12 : 1) + c.qTime, gap: c.qTime - qOrder[0].qTime,
    error: c.qError, grid: c.grid,
  }))

  const detail = {}
  for (const c of cars) {
    detail[c.e.id] = {
      qualiPos: c.qPos, grid: c.grid, finish: posById[c.e.id], status: c.status, reason: c.reason,
      paceRank: c.paceRank, traffic: c.traffic, strategy: c.strat, pitExtra: c.pitExtra, setupLoss: c.setupLoss,
      penalty: c.penalty, damage: c.damage, errors: c.errors, passes: c.passes, notes: c.notes,
    }
  }
  events.sort((a, b) => a.lap - b.lap)

  return {
    trackId: track.id,
    weather: { quali: qualiWet ? 'wet' : 'dry', race: raceWeather },
    quali, race, events, detail,
    stats: { safetyCars, retirements: retired.length, starters: cars.length },
  }
}
