import React, { useEffect, useRef, useState } from 'react'
import { TRACK_MAPS, MAP_BOX } from './data/trackMaps.js'
import { teamColor, driverColor, carCode } from './format.js'
import { getProfile } from './speedProfile.js'

// The race is simulated lap by lap. Through each lap every car moves at its
// own average pace for that lap in time, and is drawn where that share of
// its lap puts it on the circuit's speed profile (speedProfile.js): quick on
// the straights, slow in the corners. The playback shows
// the gaps opening and closing, the order changing and the field bunching up
// behind a safety car, on the real outline of the circuit.

export const LAP_SECONDS = 5 // seconds of playback per lap at 1x
const lapAtSeg = (st, seg) => Math.round(seg * st.segLaps)

// Where every car is, `p` (0 to 1) of the way through the lap in `frame`.
// Returns the running order with each car's distance in laps, its gap to the
// leader in seconds, and whether it is stopping or retiring on this lap.
export function frameSnapshot(st, frame, p) {
  const base = st.track.baseLap
  const L0 = lapAtSeg(st, frame.seg)
  const L1 = lapAtSeg(st, frame.seg + 1)
  const span = L1 - L0
  const out = new Set(frame.out)
  // On the first lap the cars leave from their grid slots, not all from the line.
  const T0 = frame.t0.map((t, i) => L0 * base + t + (frame.seg === 0 ? (st.cars[i].grid - 1) * 0.3 : 0))
  const T1 = frame.t1.map((t) => L1 * base + t)
  // Cars running when the lap began: still running, retiring on it, or retiring later on.
  const runningAtStart = st.cars.filter((c) => c.status === 'running' || out.has(c.idx) || c.dnfSeg > frame.seg)
  const live = runningAtStart.filter((c) => !out.has(c.idx))
  const tau0 = Math.min(...runningAtStart.map((c) => T0[c.idx]))
  const leaderEnd = Math.min(...live.map((c) => T1[c.idx]))
  const tau = tau0 + p * (leaderEnd - tau0)
  const leadPace = (leaderEnd - tau0) / span
  const rows = []
  const laneExit = getOutline(st.track.id)?.laneExit ?? 0.03
  // The pit exit as a share of the lap in time, so a car rejoins where it left the lane.
  const exitT = getProfile(st.track.id)?.unwarp(laneExit) ?? laneExit
  // The time a stop costs, spent crawling down the pit lane: about half under a safety car.
  const pitLoss = st.track.pitLoss * (frame.under === 'sc' ? 0.5 : frame.under === 'vsc' ? 0.6 : 1)
  for (const c of runningAtStart) {
    const i = c.idx
    const stopping = frame.stops1[i] > frame.stops0[i]
    let d
    let pace
    let inPit = false
    let laneF = null
    if (out.has(i)) {
      // A car that retires on this lap runs to the middle of it and stops there.
      pace = leadPace
      d = L0 + (Math.min(tau, tau0 + 0.5 * (leaderEnd - tau0)) - T0[i]) / pace
    } else if (stopping) {
      // Stops come at the start of a lap: down the pit lane from the line
      // to its exit, slowly, then back up to racing speed.
      pace = Math.max(base * 0.8, (T1[i] - T0[i] - pitLoss) / span)
      const lane = exitT * pace + pitLoss
      const dt = tau - T0[i]
      if (dt <= 0) d = L0 + dt / pace
      else if (dt < lane) { d = L0 + (exitT * dt) / lane; inPit = true; laneF = (laneExit * dt) / lane }
      else d = L0 + exitT + (dt - lane) / pace
    } else {
      pace = (T1[i] - T0[i]) / span
      d = L0 + (tau - T0[i]) / pace
    }
    rows.push({ c, d, pace, out: out.has(i) && p >= 0.5, retiring: out.has(i), pit: inPit, laneF, tyre: stopping && (inPit ? laneF < laneExit * 0.5 : d < L0) ? frame.tyre0?.[i] ?? c.tyre : c.tyre })
  }
  const running = rows.filter((r) => !r.out).sort((a, b) => b.d - a.d)
  const lead = running[0]
  for (const r of running) r.gap = (lead.d - r.d) * r.pace
  return { order: running, gone: rows.filter((r) => r.out), leaderD: lead?.d ?? L0, lap: Math.min(st.laps, Math.max(1, Math.floor((lead?.d ?? L0) + 1))), under: frame.under, timed: true }
}

// The race as it stands at the end of the last lap run.
export function stateSnapshot(st) {
  const order = st.order.map((i) => st.cars[i])
  const L = st.done ? st.laps : lapAtSeg(st, st.seg)
  const lead = order[0]
  const base = st.track.baseLap
  return {
    order: order.map((c) => ({ c, d: L - (c.t - lead.t) / base, gap: c.t - lead.t, pace: base, tyre: c.tyre })),
    gone: [], leaderD: L, lap: Math.max(1, L), under: null, timed: true,
  }
}

// Before the start: the cars on the grid, two by two behind the line.
export function gridSnapshot(st) {
  const order = st.order.map((i) => st.cars[i])
  return { order: order.map((c, i) => ({ c, d: -0.004 - i * 0.0035, gap: 0, pace: st.track.baseLap, tyre: c.tyre })), gone: [], leaderD: 0, lap: 0, under: null }
}

// ---- Circuit geometry ----

const OUTLINES = new Map()
const PIT_OFFSET = 15 // how far the pit lane sits from the track, in map units
const BRIDGE_SPAN = 0.025 // laps either side of a crossing drawn as the bridge, or hidden under it

function segIntersect(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0])
  if (Math.abs(d) < 1e-9) return null
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d
  return t > 0 && t < 1 && u > 0 && u < 1 ? [t, u] : null
}

// Everything the map needs to know about a circuit, worked out once:
// placing a point by lap fraction, the pit lane alongside the main straight,
// and any place where the track crosses itself (Suzuka's bridge).
export function getOutline(trackId) {
  if (OUTLINES.has(trackId)) return OUTLINES.get(trackId)
  const pts = TRACK_MAPS[trackId]
  if (!pts) return null
  const n = pts.length
  const cum = [0]
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i % n][0] - pts[i - 1][0], pts[i % n][1] - pts[i - 1][1]))
  const total = cum[n]
  const wrap = (f) => ((f % 1) + 1) % 1
  const locate = (frac) => {
    const target = wrap(frac) * total
    let lo = 0
    let hi = n
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= target) lo = mid; else hi = mid }
    return [lo, (target - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1)]
  }
  const at = (frac) => {
    const [i, k] = locate(frac)
    const a = pts[i]
    const b = pts[(i + 1) % n]
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
  }
  const dir = (frac) => {
    const [i] = locate(frac)
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  }
  const pathOf = (list, closed) => `M${list.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}${closed ? 'Z' : ''}`

  // The pit lane: alongside the main straight on the inside of the circuit,
  // from where the straight begins to where it ends (at most 7% of a lap
  // before the line and 6% after it), joining and leaving the track smoothly.
  const cx = pts.reduce((sum, p) => sum + p[0], 0) / n
  const cy = pts.reduce((sum, p) => sum + p[1], 0) / n
  const d0 = dir(0)
  let side = [-d0[1], d0[0]]
  if ((cx - pts[0][0]) * side[0] + (cy - pts[0][1]) * side[1] < 0) side = [-side[0], -side[1]]
  const straight = (f) => { const d = dir(f); return d[0] * d0[0] + d[1] * d0[1] > Math.cos((22 * Math.PI) / 180) }
  let entry = 0
  while (entry > -0.07 && straight(entry - 0.004)) entry -= 0.004
  let exit = 0
  while (exit < 0.06 && straight(exit + 0.004)) exit += 0.004
  entry = Math.min(entry, -0.012)
  exit = Math.max(exit, 0.016)
  const ramp = (f) => {
    const span = exit - entry
    const x = (f - entry) / span
    const e = Math.min(1, Math.min(x, 1 - x) / 0.22)
    return e * e * (3 - 2 * e)
  }
  const lanePoint = (f) => {
    const [x, y] = at(f)
    const d = dir(f)
    let nrm = [-d[1], d[0]]
    if (nrm[0] * side[0] + nrm[1] * side[1] < 0) nrm = [-nrm[0], -nrm[1]]
    const o = PIT_OFFSET * ramp(f)
    return [x + nrm[0] * o, y + nrm[1] * o]
  }
  const lane = []
  for (let k = 0; k <= 40; k++) lane.push(lanePoint(entry + ((exit - entry) * k) / 40))

  // Where the track crosses itself, the later part of the lap is the bridge
  // (true of Suzuka, the one figure-of-eight on the calendar).
  let bridge = null
  for (let i = 0; i < n && !bridge; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const hit = segIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])
      if (!hit) continue
      const under = (cum[i] + hit[0] * (cum[i + 1] - cum[i])) / total
      const over = (cum[j] + hit[1] * (cum[j + 1] - cum[j])) / total
      const deck = []
      for (let k = 0; k <= 12; k++) deck.push(at(over - BRIDGE_SPAN + (2 * BRIDGE_SPAN * k) / 12))
      bridge = { under, over, d: pathOf(deck, false) }
      break
    }
  }

  const [x0, y0] = pts[0]
  const out = {
    at, lanePoint, laneExit: exit, bridge, d: pathOf(pts, true), lane: pathOf(lane, false),
    laneLabel: (() => { const m = lanePoint((entry + exit) / 2); const [tx, ty] = at((entry + exit) / 2); return [m[0] + (m[0] - tx) * 0.55, m[1] + (m[1] - ty) * 0.55] })(),
    start: [x0 + side[0] * 5, y0 + side[1] * 5, x0 - side[0] * 5, y0 - side[1] * 5],
    // Whether a car this far round the lap is out of sight under the bridge.
    underBridge: (frac) => !!bridge && Math.abs(((wrap(frac) - bridge.under + 1.5) % 1) - 0.5) < BRIDGE_SPAN * 0.7,
  }
  OUTLINES.set(trackId, out)
  return out
}

export function TrackMap({ game, st, snap }) {
  const outline = getOutline(st.track.id)
  if (!outline) return null
  // From a share of the lap in time to a place on the track. Behind the safety
  // car or under the VSC the field crawls, so the profile counts for less.
  const profile = getProfile(st.track.id)
  const k = snap.under === 'sc' || snap.under === 'vsc' ? 0.3 : 1
  const where = (d) => (snap.timed && profile ? d + (profile.warp(d) - d) * k : d)
  const place = (r) => (r.pit ? outline.lanePoint(r.laneF) : outline.at(where(r.d)))
  const dots = snap.order.slice().reverse()
  // Cars on the lower level of a crossing are drawn first, so the bridge hides them.
  const hidden = (r) => !r.pit && outline.underBridge(where(r.d))
  const scD = snap.under === 'sc' ? where(snap.leaderD) + 0.025 : null
  const rival = (r) => { const [x, y] = place(r); return <circle key={r.c.id} cx={x} cy={y} r={r.pit ? 3.4 : 4.2} fill={teamColor(game, r.c.e.teamId)} className="tm-car" /> }
  const mine = (r) => {
    const [x, y] = place(r)
    const col = driverColor(game, r.c.id, r.c.e.slot)
    return (
      <g key={r.c.id} opacity={hidden(r) ? 0.35 : 1}>
        <circle cx={x} cy={y} r={7} fill={col} className="tm-mine" />
        <text x={x} y={r.c.e.slot === 1 ? y + 19 : y - 11} textAnchor="middle" className="tm-label" style={{ fill: col }}>{carCode(r.c.e.name)}{r.pit ? ' PIT' : ''}</text>
      </g>
    )
  }
  return (
    <svg className="trackmap" viewBox={`0 0 ${MAP_BOX.w} ${MAP_BOX.h}`} role="img" aria-label={`${st.track.name}: where every car is on the track`}>
      <path d={outline.lane} className="tm-lane" />
      <text x={outline.laneLabel[0]} y={outline.laneLabel[1]} className="tm-lanetext" textAnchor="middle" dy="3">PIT</text>
      <path d={outline.d} className="tm-track" />
      <path d={outline.d} className="tm-line" />
      <line x1={outline.start[0]} y1={outline.start[1]} x2={outline.start[2]} y2={outline.start[3]} className="tm-start" />
      {snap.gone.map((r) => { const [x, y] = outline.at(where(r.d)); return <text key={r.c.id} x={x} y={y + 4} className="tm-out" textAnchor="middle">✕</text> })}
      {dots.filter((r) => hidden(r) && !r.c.e.isPlayer).map(rival)}
      {outline.bridge && <g><path d={outline.bridge.d} className="tm-deck-gap" /><path d={outline.bridge.d} className="tm-deck-edge" /><path d={outline.bridge.d} className="tm-deck" /><path d={outline.bridge.d} className="tm-line" /></g>}
      {scD !== null && (() => { const [x, y] = outline.at(scD); return <g><rect x={x - 11} y={y - 7} width="22" height="14" rx="3" className="tm-sc" /><text x={x} y={y + 4} textAnchor="middle" className="tm-sctext">SC</text></g> })()}
      {dots.filter((r) => !hidden(r) && !r.c.e.isPlayer).map(rival)}
      {dots.filter((r) => r.c.e.isPlayer).map(mine)}
      {snap.order[0] && !snap.order[0].c.e.isPlayer && (() => { const [x, y] = place(snap.order[0]); return <text x={x} y={y - 9} textAnchor="middle" className="tm-lead">P1</text> })()}
    </svg>
  )
}

// Playback of the race. `view.seg` is the lap being shown and `view.p` how
// far through it; once it catches up with the race the screen shows the race
// as it stands. While playing, the next lap is simulated as soon as the
// playback catches up, unless the pit wall has a call waiting.
export function usePlayback(game, act, step, hold = false) {
  const w = game.weekend
  const st = w.state
  const [view, setView] = useState({ seg: st.seg, p: 0 })
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const segRef = useRef(st.seg)
  const speedRef = useRef(speed)
  const framesRef = useRef(w.frames)
  segRef.current = st.seg
  speedRef.current = speed
  framesRef.current = w.frames
  const requested = useRef(-1)
  // While a moment such as the start lights is on screen, the clock waits.
  const holdRef = useRef(hold)
  holdRef.current = hold
  const open = w.calls.some((c) => !(c.id in w.answered))
  const seg = Math.min(view.seg, st.seg)
  const caughtUp = seg >= st.seg

  useEffect(() => {
    if (view.seg > st.seg) setView({ seg: st.seg, p: 0 })
  }, [st.seg, view.seg])

  // The animation clock.
  useEffect(() => {
    if (!playing) return undefined
    let raf
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (holdRef.current) { raf = requestAnimationFrame(tick); return }
      setView((v) => {
        if (v.seg >= segRef.current) return v
        const f = framesRef.current?.find((x) => x.seg === v.seg)
        if (!f) return { seg: segRef.current, p: 0 }
        const laps = lapAtSeg(st, f.seg + 1) - lapAtSeg(st, f.seg)
        const p = v.p + (dt * speedRef.current) / (Math.max(1, laps) * LAP_SECONDS)
        return p >= 1 ? { seg: v.seg + 1, p: 0 } : { seg: v.seg, p }
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, st])

  // Caught up and playing: run the next lap, or stop at the flag.
  useEffect(() => {
    if (!playing || !caughtUp) return
    if (w.phase !== 'race') { setPlaying(false); return }
    if (open || requested.current === st.seg) return
    requested.current = st.seg
    act(step)
  }, [playing, caughtUp, open, st.seg, w.phase, act, step])

  const frame = caughtUp ? null : w.frames?.find((x) => x.seg === seg)
  return {
    playing, setPlaying, speed, setSpeed, caughtUp, frame, p: view.p,
    // Jump to the race as it stands: after a skip or a hand-over.
    jump: () => setView({ seg: Number.MAX_SAFE_INTEGER, p: 0 }),
  }
}
