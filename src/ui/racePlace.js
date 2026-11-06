// Where each car goes in the race in 3D (Race3D.jsx), from the same snapshot
// as the 2D map (RaceMap.jsx): `f` of the way round the lap by distance on the
// circuit's speed profile, `lat` across the track. Kept apart from the
// drawing so the checks can run it.

export const TRACK_W = 3.6 // the track's width in map units, drawn about twice life size
export const wrap = (f) => ((f % 1) + 1) % 1

// Where every car goes on this frame: on the track `f` of the way round and
// `lat` across it, or in the pit lane, or parked after retiring.
export function placements(snap, circuit) {
  const profile = circuit.profile
  const k = snap.under === 'sc' || snap.under === 'vsc' ? 0.3 : 1
  const where = (d) => (snap.timed && profile ? d + (profile.warp(d) - d) * k : d)
  const out = []
  let prev = null
  let prevLat = 0
  snap.order.forEach((r, i) => {
    let lat = 0
    if (!snap.timed) lat = i % 2 ? -0.95 : 0.95 // two by two on the grid
    else if (prev && prev.d - r.d < 0.0024 && !r.pit) lat = prevLat === 0 ? 1.05 : prevLat > 0 ? -1.05 : 0 // side by side
    out.push({ r, pos: i + 1, f: wrap(where(r.d)), lat, pit: r.pit })
    prev = r
    prevLat = lat
  })
  for (const r of snap.gone) out.push({ r, f: wrap(where(r.d)), lat: TRACK_W / 2 + 2.6, gone: true })
  return { list: out, where }
}
