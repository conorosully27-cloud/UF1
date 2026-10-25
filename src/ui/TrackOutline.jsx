import React, { useMemo } from 'react'
import { TRACK_MAPS } from './data/trackMaps.js'
import { speedPieces } from './speedProfile.js'

// A circuit's outline (VISUALS.md, V5), from the same outlines as the live
// track map: small on the calendar, larger and tinted by speed on the briefing.
export default function TrackOutline({ id, size = 18, speed = false, title }) {
  const pts = TRACK_MAPS[id]
  const box = useMemo(() => {
    if (!pts) return null
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const pad = speed ? 8 : 14
    return `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + 2 * pad} ${Math.max(...ys) - Math.min(...ys) + 2 * pad}`
  }, [pts, speed])
  const pieces = useMemo(() => (speed ? speedPieces(id) : []), [id, speed])
  if (!pts) return null
  const d = `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z`
  return (
    <svg className="outline" width={size} height={size} viewBox={box} role="img" aria-label={title ?? 'Circuit'} preserveAspectRatio="xMidYMid meet">
      {speed
        ? <>
          <path d={d} fill="none" stroke="var(--line)" strokeWidth="12" strokeLinejoin="round" />
          {pieces.map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth="5" strokeLinecap="round" />)}
        </>
        : <path d={d} fill="none" stroke="currentColor" strokeWidth={size < 30 ? 22 : 8} strokeLinejoin="round" />}
    </svg>
  )
}
