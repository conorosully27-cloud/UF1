import React, { useEffect, useMemo, useRef, useState } from 'react'
import { TRACK_MAPS, MAP_BOX } from './data/trackMaps.js'
import { teamColor, driverColor, carCode } from './format.js'

// The race is simulated in blocks of a few laps. Between the ends of a block
// each car moves at its own average pace for that block, so the playback shows
// the gaps opening and closing, the order changing and the field bunching up
// behind a safety car, on the real outline of the circuit.

export const LAP_SECONDS = 1.1 // seconds of playback per lap at 1x
const lapAtSeg = (st, seg) => Math.round(seg * st.segLaps)

// Where every car is, `p` (0 to 1) of the way through the block in `frame`.
// Returns the running order with each car's distance in laps, its gap to the
// leader in seconds, and whether it is stopping or retiring in this block.
export function frameSnapshot(st, frame, p) {
  const base = st.track.baseLap
  const L0 = lapAtSeg(st, frame.seg)
  const L1 = lapAtSeg(st, frame.seg + 1)
  const span = L1 - L0
  const out = new Set(frame.out)
  // On the first block the cars leave from their grid slots, not all from the line.
  const T0 = frame.t0.map((t, i) => L0 * base + t + (frame.seg === 0 ? (st.cars[i].grid - 1) * 0.3 : 0))
  const T1 = frame.t1.map((t) => L1 * base + t)
  // Cars running when the block began: still running, retiring in it, or retiring later on.
  const runningAtStart = st.cars.filter((c) => c.status === 'running' || out.has(c.idx) || c.dnfSeg > frame.seg)
  const live = runningAtStart.filter((c) => !out.has(c.idx))
  const tau0 = Math.min(...runningAtStart.map((c) => T0[c.idx]))
  const leaderEnd = Math.min(...live.map((c) => T1[c.idx]))
  const tau = tau0 + p * (leaderEnd - tau0)
  const leadPace = (leaderEnd - tau0) / span
  const rows = []
  for (const c of runningAtStart) {
    const i = c.idx
    let d
    let pace
    if (out.has(i)) {
      // A car that retires in this block runs to the middle of it and stops there.
      pace = leadPace
      d = L0 + (Math.min(tau, tau0 + 0.5 * (leaderEnd - tau0)) - T0[i]) / pace
    } else {
      pace = (T1[i] - T0[i]) / span
      d = L0 + (tau - T0[i]) / pace
    }
    rows.push({ c, d, pace, out: out.has(i) && p >= 0.5, retiring: out.has(i), pit: frame.stops1[i] > frame.stops0[i] && p < 0.35, tyre: frame.stops1[i] > frame.stops0[i] && p < 0.2 ? frame.tyre0?.[i] ?? c.tyre : c.tyre })
  }
  const running = rows.filter((r) => !r.out).sort((a, b) => b.d - a.d)
  const lead = running[0]
  for (const r of running) r.gap = (lead.d - r.d) * r.pace
  return { order: running, gone: rows.filter((r) => r.out), leaderD: lead?.d ?? L0, lap: Math.min(st.laps, Math.max(1, Math.floor((lead?.d ?? L0) + 1))), under: frame.under }
}

// The race as it stands at the end of the last block run.
export function stateSnapshot(st) {
  const order = st.order.map((i) => st.cars[i])
  const L = st.done ? st.laps : lapAtSeg(st, st.seg)
  const lead = order[0]
  const base = st.track.baseLap
  return {
    order: order.map((c) => ({ c, d: L - (c.t - lead.t) / base, gap: c.t - lead.t, pace: base, tyre: c.tyre })),
    gone: [], leaderD: L, lap: Math.max(1, L), under: null,
  }
}

// Before the start: the cars on the grid, two by two behind the line.
export function gridSnapshot(st) {
  const order = st.order.map((i) => st.cars[i])
  return { order: order.map((c, i) => ({ c, d: -0.004 - i * 0.0035, gap: 0, pace: st.track.baseLap, tyre: c.tyre })), gone: [], leaderD: 0, lap: 0, under: null }
}

// Cumulative distances along a circuit outline, for placing cars by lap fraction.
function useOutline(trackId) {
  return useMemo(() => {
    const pts = TRACK_MAPS[trackId]
    if (!pts) return null
    const cum = [0]
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i % pts.length]
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]))
    }
    const total = cum[cum.length - 1]
    const at = (frac) => {
      const target = (((frac % 1) + 1) % 1) * total
      let lo = 0
      let hi = cum.length - 1
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= target) lo = mid; else hi = mid }
      const a = pts[lo]
      const b = pts[(lo + 1) % pts.length]
      const k = (target - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1)
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
    }
    const d = `M${pts.map((p) => p.join(',')).join('L')}Z`
    // A short line across the track at the start.
    const [x0, y0] = pts[0]
    const [x1, y1] = pts[1]
    const len = Math.hypot(x1 - x0, y1 - y0) || 1
    const nx = -(y1 - y0) / len
    const ny = (x1 - x0) / len
    return { at, d, start: [x0 + nx * 9, y0 + ny * 9, x0 - nx * 9, y0 - ny * 9] }
  }, [trackId])
}

export function TrackMap({ game, st, snap }) {
  const outline = useOutline(st.track.id)
  if (!outline) return null
  const dots = snap.order.slice().reverse()
  const scD = snap.under === 'sc' ? snap.leaderD + 0.025 : null
  return (
    <svg className="trackmap" viewBox={`0 0 ${MAP_BOX.w} ${MAP_BOX.h}`} role="img" aria-label={`${st.track.name}: where every car is on the track`}>
      <path d={outline.d} className="tm-track" />
      <path d={outline.d} className="tm-line" />
      <line x1={outline.start[0]} y1={outline.start[1]} x2={outline.start[2]} y2={outline.start[3]} className="tm-start" />
      {snap.gone.map((r) => { const [x, y] = outline.at(r.d); return <text key={r.c.id} x={x} y={y + 4} className="tm-out" textAnchor="middle">✕</text> })}
      {scD !== null && (() => { const [x, y] = outline.at(scD); return <g><rect x={x - 11} y={y - 7} width="22" height="14" rx="3" className="tm-sc" /><text x={x} y={y + 4} textAnchor="middle" className="tm-sctext">SC</text></g> })()}
      {dots.map((r) => {
        const [x, y] = outline.at(r.d)
        const mine = r.c.e.isPlayer
        if (!mine) return <circle key={r.c.id} cx={x} cy={y} r={4.2} fill={teamColor(game, r.c.e.teamId)} className="tm-car" />
        return null
      })}
      {dots.filter((r) => r.c.e.isPlayer).map((r) => {
        const [x, y] = outline.at(r.d)
        const col = driverColor(game, r.c.id, r.c.e.slot)
        return (
          <g key={r.c.id}>
            <circle cx={x} cy={y} r={7} fill={col} className="tm-mine" />
            <text x={x} y={r.c.e.slot === 1 ? y + 19 : y - 11} textAnchor="middle" className="tm-label" style={{ fill: col }}>{carCode(r.c.e.name)}{r.pit ? ' PIT' : ''}</text>
          </g>
        )
      })}
      {snap.order[0] && (() => { const [x, y] = outline.at(snap.order[0].d); return snap.order[0].c.e.isPlayer ? null : <text x={x} y={y - 9} textAnchor="middle" className="tm-lead">P1</text> })()}
    </svg>
  )
}

// Playback of the race. `view.seg` is the block being shown and `view.p` how
// far through it; once it catches up with the race the screen shows the race
// as it stands. While playing, the next block is simulated as soon as the
// playback catches up, unless the pit wall has a call waiting.
export function usePlayback(game, act, step) {
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

  // Caught up and playing: run the next block, or stop at the flag.
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
