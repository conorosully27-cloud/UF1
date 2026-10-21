// A speed profile for each circuit (RACE_WEEKEND.md, W7): slow in tight
// corners, flat out on the straights, braking into corners and accelerating
// out of them. Worked out once from the map outline, so cars on the map can
// follow it: a car a given share of the way through its lap in time is drawn
// where that share of the lap takes it, and gaps stretch on the straights and
// close up in the corners while the timing tower still shows them in seconds.
//
// The model is a simple lap-time simulation in metres and seconds: the outline
// is scaled to the circuit's real length, resampled evenly and smoothed; each
// point's corner radius gives a cornering speed from the grip (which grows with
// speed, as downforce does); then a pass forwards limits the speed by how hard
// the car can accelerate, and a pass backwards by how hard it can brake.

import { TRACK_MAPS } from './data/trackMaps.js'

// Real lap lengths in metres.
const LENGTH = {
  melbourne: 5278, suzuka: 5807, miami: 5412, monaco: 3337, montreal: 4361, barcelona: 4657, spielberg: 4318, silverstone: 5891,
  spa: 7004, budapest: 4381, monza: 5793, baku: 6003, singapore: 4940, austin: 5513, saopaulo: 4309, abudhabi: 5281,
}

export const CAR = {
  samples: 720, // points round the lap
  smooth: 4, // passes of a three-point average over the resampled outline
  span: 3, // samples either side used to measure a corner's radius
  // Tuned so the simulated laps come within about 3% of real lap times on average.
  grip: 22, // lateral grip with no downforce, m/s²
  downforce: 0.0055, // extra lateral grip per (m/s)², so about 6g at 300 km/h
  top: 94, // top speed, m/s (about 340 km/h)
  push: 17, // acceleration from low speed, m/s², falling to nothing at top speed
  brake: 34, // braking with no downforce, m/s²
  brakeDown: 0.006, // extra braking per (m/s)²
}

const PROFILES = new Map()

function resample(pts, n) {
  const m = pts.length
  const cum = [0]
  for (let i = 1; i <= m; i++) cum.push(cum[i - 1] + Math.hypot(pts[i % m][0] - pts[i - 1][0], pts[i % m][1] - pts[i - 1][1]))
  const total = cum[m]
  const out = []
  let j = 0
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total
    while (cum[j + 1] < target) j++
    const t = (target - cum[j]) / ((cum[j + 1] - cum[j]) || 1)
    const a = pts[j % m]
    const b = pts[(j + 1) % m]
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return { out, total }
}

// Radius of the circle through three points (Infinity on a straight).
function radius(a, b, c) {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1])
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1])
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1])
  const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  return cross < 1e-9 ? Infinity : (ab * bc * ca) / (2 * cross)
}

export function buildProfile(trackId) {
  const pts = TRACK_MAPS[trackId]
  if (!pts) return null
  const C = CAR
  const n = C.samples
  let { out: p, total } = resample(pts, n)
  for (let pass = 0; pass < C.smooth; pass++) p = p.map((_, i) => { const a = p[(i - 1 + n) % n]; const b = p[i]; const c = p[(i + 1) % n]; return [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4] })
  const scale = (LENGTH[trackId] ?? 5000) / total // metres per map unit
  const ds = (LENGTH[trackId] ?? 5000) / n
  // The fastest each point can be taken: the corner's radius against the grip.
  const v = p.map((_, i) => {
    const r = radius(p[(i - C.span + n) % n], p[i], p[(i + C.span) % n]) * scale
    if (!Number.isFinite(r) || C.downforce * r >= 1) return C.top
    return Math.min(C.top, Math.sqrt((C.grip * r) / (1 - C.downforce * r)))
  })
  // Accelerating out of corners, then braking into them; twice round, as the lap is a loop.
  for (let lap = 0; lap < 2; lap++) {
    for (let k = 0; k < n; k++) {
      const i = k
      const j = (k + 1) % n
      const acc = C.push * (1 - (v[i] / C.top) ** 2)
      v[j] = Math.min(v[j], Math.sqrt(v[i] ** 2 + 2 * acc * ds))
    }
    for (let k = n - 1; k >= 0; k--) {
      const i = k
      const j = (k + 1) % n
      const dec = C.brake + C.brakeDown * v[j] ** 2
      v[i] = Math.min(v[i], Math.sqrt(v[j] ** 2 + 2 * dec * ds))
    }
  }
  // Time from the line to each point, as a share of the lap.
  const t = [0]
  for (let i = 0; i < n; i++) t.push(t[i] + (2 * ds) / (v[i] + v[(i + 1) % n]))
  const lap = t[n]
  const tau = t.map((x) => x / lap)
  // From a share of the lap in time to a share of the distance, and back.
  const warp = (f) => {
    const w = Math.floor(f)
    const x = f - w
    let lo = 0
    let hi = n
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tau[mid] <= x) lo = mid; else hi = mid }
    const k = (x - tau[lo]) / ((tau[lo + 1] - tau[lo]) || 1)
    return w + (lo + k) / n
  }
  const unwarp = (f) => {
    const w = Math.floor(f)
    const x = (f - w) * n
    const i = Math.min(n - 1, Math.floor(x))
    return w + tau[i] + (tau[i + 1] - tau[i]) * (x - i)
  }
  const speedAt = (f) => v[Math.floor((((f % 1) + 1) % 1) * n) % n] * 3.6
  return { warp, unwarp, speedAt, lap, top: Math.max(...v) * 3.6, slowest: Math.min(...v) * 3.6, points: p }
}

export function getProfile(trackId) {
  if (!PROFILES.has(trackId)) PROFILES.set(trackId, buildProfile(trackId))
  return PROFILES.get(trackId)
}
