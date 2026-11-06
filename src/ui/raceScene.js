// The race in 3D (RACE_WEEKEND.md, W8): the circuit built from the same
// outline and speed profile as the 2D map, with kerbs in the corners, run-off,
// the pit lane and garages, a grandstand, trees, Suzuka's bridge, and a car in
// its team's colours for every driver. Street circuits (Monaco, Singapore,
// Baku) stand among city blocks rather than trees. Day, night (Singapore, Abu
// Dhabi) and rain each light it differently. Race3D.jsx moves the cars and the cameras.
//
// Units are the map's (MAP_BOX, about 4 m each), with the track and the cars
// drawn about twice as wide as life so they read from the air. The map's x is
// x here, its y is z, and y is up.

import * as THREE from 'three'
import { getOutline } from './RaceMap.jsx'
import { getProfile } from './speedProfile.js'
import { makeRng, hashString } from '../engine/rng.js'
import { TRACK_W } from './racePlace.js'

const NIGHT = new Set(['singapore', 'abudhabi'])
const STREET = new Set(['monaco', 'singapore', 'baku'])
const CORNER_KMH = 195 // slower than this, and the track has kerbs

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...extra })

// A strip along a run of samples, between two offsets from the centre line,
// each sample { x, z, nx, nz, h }. `colorAt(i)` colours each quad, if given.
function ribbon(samples, inner, outer, lift, closed, colorAt) {
  const pos = []
  const col = []
  const n = samples.length
  const last = closed ? n : n - 1
  const c = new THREE.Color()
  for (let i = 0; i < last; i++) {
    const a = samples[i]
    const b = samples[(i + 1) % n]
    const q = [
      [a.x + a.nx * inner, a.h + lift, a.z + a.nz * inner], [a.x + a.nx * outer, a.h + lift, a.z + a.nz * outer],
      [b.x + b.nx * inner, b.h + lift, b.z + b.nz * inner], [b.x + b.nx * outer, b.h + lift, b.z + b.nz * outer],
    ]
    for (const k of [0, 2, 1, 1, 2, 3]) pos.push(...q[k])
    if (colorAt) {
      c.set(colorAt(i))
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  if (colorAt) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

// A vertical gradient for the sky behind everything.
function skyTexture(top, bottom) {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// A name tag that always faces the camera and keeps its size on screen.
export function labelSprite(text, bg, ink) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 48
  const ctx = c.getContext('2d')
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(4, 6, 120, 36, 10)
  ctx.fill()
  ctx.fillStyle = ink
  ctx.font = '800 26px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 64, 25)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, transparent: true }))
  s.scale.set(0.06, 0.0225, 1)
  s.renderOrder = 10
  return s
}

// ---- The circuit ----

export function buildCircuit(trackId, { wet = false } = {}) {
  const outline = getOutline(trackId)
  const profile = getProfile(trackId)
  const night = NIGHT.has(trackId)
  const group = new THREE.Group()
  const rng = makeRng(hashString(`race3d|${trackId}`))
  const pts = profile.points
  const n = pts.length
  const wrap = (f) => ((f % 1) + 1) % 1

  // Suzuka's crossing: the later part of the lap rises over the earlier.
  const over = outline.bridge?.over
  const height = (f) => {
    if (over == null) return 0
    const d = Math.abs(((wrap(f) - over + 1.5) % 1) - 0.5)
    return d < 0.06 ? 2.4 * (1 + Math.cos((Math.PI * d) / 0.06)) / 2 : 0
  }
  const sample = (f) => {
    const x = wrap(f) * n
    const i = Math.floor(x) % n
    const k = x - Math.floor(x)
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const p = pts[(i + 2) % n]
    const q = pts[(i - 1 + n) % n]
    const tx = p[0] - q[0]
    const tz = p[1] - q[1]
    const len = Math.hypot(tx, tz) || 1
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, h: height(f), tx: tx / len, tz: tz / len, nx: -tz / len, nz: tx / len }
  }
  const samples = Array.from({ length: n }, (_, i) => sample(i / n))
  const speed = (i) => profile.speedAt(i / n)

  // Which side of the track the infield is: the pit lane and garages go there.
  const cx = pts.reduce((s, p) => s + p[0], 0) / n
  const cz = pts.reduce((s, p) => s + p[1], 0) / n
  const s0 = samples[0]
  const inSide = (cx - s0.x) * s0.nx + (cz - s0.z) * s0.nz > 0 ? 1 : -1

  // Ground, run-off, the track, its edge lines and kerbs.
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
  const extent = Math.max(box.x1 - box.x0, box.z1 - box.z0)
  const grass = night ? '#24402a' : wet ? '#3d6340' : '#4f8a45'
  // Mown stripes across the grass.
  const mow = document.createElement('canvas')
  mow.width = 2
  mow.height = 2
  const mctx = mow.getContext('2d')
  mctx.fillStyle = grass
  mctx.fillRect(0, 0, 2, 2)
  mctx.fillStyle = 'rgba(255,255,255,0.06)'
  mctx.fillRect(0, 0, 1, 2)
  const mowTex = new THREE.CanvasTexture(mow)
  mowTex.colorSpace = THREE.SRGBColorSpace
  mowTex.wrapS = mowTex.wrapT = THREE.RepeatWrapping
  mowTex.magFilter = THREE.NearestFilter
  mowTex.repeat.set(extent / 4, 1)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(extent * 4, extent * 4), mat('#ffffff', { map: mowTex }))
  ground.rotation.x = -Math.PI / 2
  ground.position.set(cx, -0.05, cz)
  group.add(ground)
  const two = { side: THREE.DoubleSide }
  group.add(new THREE.Mesh(ribbon(samples, -TRACK_W / 2 - 3, TRACK_W / 2 + 3, -0.02, true), mat(night ? '#3b3f47' : '#8a8f96', two)))
  const asphalt = wet ? mat('#25282e', { roughness: 0.25, metalness: 0.35, ...two }) : mat(night ? '#2c2f35' : '#3a3d43', { roughness: 0.9, ...two })
  group.add(new THREE.Mesh(ribbon(samples, -TRACK_W / 2, TRACK_W / 2, 0, true), asphalt))
  const white = mat('#f2f2f2', { roughness: 0.6, ...two })
  for (const s of [-1, 1]) group.add(new THREE.Mesh(ribbon(samples, s * (TRACK_W / 2 - 0.22), s * (TRACK_W / 2 - 0.08), 0.008, true), white))
  const kerbRuns = []
  for (let i = 0; i < n; i++) if (speed(i) < CORNER_KMH) kerbRuns.push(i)
  if (kerbRuns.length) {
    const kerbSamples = []
    const colours = []
    for (const i of kerbRuns) {
      kerbSamples.push(samples[i], samples[(i + 1) % n])
      colours.push(i % 2 ? '#d8202a' : '#f4f4f4')
    }
    // Pairs of samples, one quad each.
    const quads = (inner, outer) => {
      const pos = []
      const col = []
      const c = new THREE.Color()
      for (let k = 0; k < kerbSamples.length; k += 2) {
        const a = kerbSamples[k]
        const b = kerbSamples[k + 1]
        const q = [[a.x + a.nx * inner, a.h + 0.02, a.z + a.nz * inner], [a.x + a.nx * outer, a.h + 0.05, a.z + a.nz * outer], [b.x + b.nx * inner, b.h + 0.02, b.z + b.nz * inner], [b.x + b.nx * outer, b.h + 0.05, b.z + b.nz * outer]]
        for (const j of [0, 2, 1, 1, 2, 3]) pos.push(...q[j])
        c.set(colours[k / 2])
        for (let j = 0; j < 6; j++) col.push(c.r, c.g, c.b)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      g.computeVertexNormals()
      return g
    }
    const kerbMat = mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide })
    group.add(new THREE.Mesh(quads(TRACK_W / 2, TRACK_W / 2 + 0.7), kerbMat))
    group.add(new THREE.Mesh(quads(-TRACK_W / 2, -TRACK_W / 2 - 0.7), kerbMat))
  }

  // The start line, chequered across the track.
  const cheq = document.createElement('canvas')
  cheq.width = 64
  cheq.height = 8
  const cctx = cheq.getContext('2d')
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { cctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; cctx.fillRect(i * 4, j * 4, 4, 4) }
  const cheqTex = new THREE.CanvasTexture(cheq)
  cheqTex.magFilter = THREE.NearestFilter
  const line = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W, 0.6), new THREE.MeshBasicMaterial({ map: cheqTex }))
  line.rotation.x = -Math.PI / 2
  line.rotation.z = Math.atan2(s0.tx, s0.tz) + Math.PI / 2
  line.position.set(s0.x, 0.02, s0.z)
  group.add(line)

  // The pit lane, on the infield side of the main straight, and the garages beside it.
  const lanePts = []
  for (let f = -0.09; f <= outline.laneExit + 0.004; f += 0.0015) {
    const [lx, lz] = outline.lanePoint(f)
    const [tx, tz] = outline.at(f)
    if (Math.hypot(lx - tx, lz - tz) > 0.8) lanePts.push([lx, lz])
  }
  const laneSamples = lanePts.map((p, i) => {
    const a = lanePts[Math.max(0, i - 1)]
    const b = lanePts[Math.min(lanePts.length - 1, i + 1)]
    const tx = b[0] - a[0]
    const tz = b[1] - a[1]
    const len = Math.hypot(tx, tz) || 1
    return { x: p[0], z: p[1], h: 0, nx: -tz / len, nz: tx / len }
  })
  if (laneSamples.length > 2) group.add(new THREE.Mesh(ribbon(laneSamples, -1.3, 1.3, 0.004, false), mat(night ? '#33363c' : '#4b4e55', two)))
  const mid = sample(-0.012)
  const sideX = mid.nx * inSide
  const sideZ = mid.nz * inSide
  const garageLen = Math.min(70, Math.max(30, lanePts.length * 0.45))
  const pitBox = new THREE.Group()
  const building = new THREE.Mesh(new THREE.BoxGeometry(garageLen, 3.4, 5), mat(night ? '#c7ccd4' : '#e3e6ea'))
  building.position.y = 1.7
  pitBox.add(building)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(garageLen + 1, 0.4, 6), mat('#2a2e36'))
  roof.position.y = 3.6
  pitBox.add(roof)
  const doorCols = ['#27f4d2', '#ff8000', '#e8002d', '#3671c6', '#6692ff', '#ff87bc', '#b6babd', '#c8a27a', '#1868db', '#229971', '#d4af37', '#ff5a36']
  doorCols.forEach((dc, i) => {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(garageLen / 13, 2.2), new THREE.MeshStandardMaterial({ color: dc, emissive: dc, emissiveIntensity: night ? 0.5 : 0.15 }))
    door.position.set(-garageLen / 2 + (garageLen / 12) * (i + 0.5), 1.2, -2.51)
    door.rotation.y = Math.PI
    pitBox.add(door, door.clone().translateZ(-5.02).rotateY(Math.PI))
  })
  const laneMid = lanePts[Math.floor(lanePts.length / 2)] ?? [mid.x, mid.z]
  pitBox.position.set(laneMid[0] + sideX * 4.6, mid.h, laneMid[1] + sideZ * 4.6)
  pitBox.rotation.y = Math.atan2(-mid.tz, mid.tx)
  // The garage doors (on the building's -z face) look back across the lane.
  if (Math.sin(pitBox.rotation.y) * sideX + Math.cos(pitBox.rotation.y) * sideZ < 0) pitBox.rotation.y += Math.PI
  group.add(pitBox)

  // The grandstand, across the straight from the pits, full of colour.
  const stand = new THREE.Group()
  const standLen = Math.min(60, garageLen)
  for (let row = 0; row < 4; row++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(standLen, 0.7, 1.6), mat(night ? '#3a4150' : '#b9bfc8'))
    step.position.set(0, 0.35 + row * 0.7, row * 1.6)
    stand.add(step)
  }
  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), new THREE.MeshStandardMaterial({ roughness: 1 }), 4 * 70)
  const m4 = new THREE.Matrix4()
  const shirt = new THREE.Color()
  let k = 0
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 70; i++) {
      m4.makeTranslation(-standLen / 2 + 0.6 + (i / 70) * (standLen - 1.2) + rng.range(-0.15, 0.15), 0.95 + row * 0.7, row * 1.6 + rng.range(-0.3, 0.3))
      crowd.setMatrixAt(k, m4)
      crowd.setColorAt(k, shirt.setHSL(rng.next(), 0.7, rng.range(0.4, 0.65)))
      k++
    }
  }
  stand.add(crowd)
  const standRoof = new THREE.Mesh(new THREE.BoxGeometry(standLen, 0.3, 7), mat('#2a2e36'))
  standRoof.position.set(0, 4.2, 2.4)
  stand.add(standRoof)
  stand.position.set(mid.x - sideX * (TRACK_W / 2 + 4.5), mid.h, mid.z - sideZ * (TRACK_W / 2 + 4.5))
  stand.rotation.y = Math.atan2(-mid.tz, mid.tx)
  // Rows rise away from the track.
  const awayX = -sideX
  const awayZ = -sideZ
  const localZ = [Math.sin(stand.rotation.y), Math.cos(stand.rotation.y)]
  if (localZ[0] * awayX + localZ[1] * awayZ < 0) stand.rotation.y += Math.PI
  group.add(stand)

  // Trees, kept clear of the track, the pit lane, the buildings and the TV cameras.
  const near = []
  for (let i = 0; i < n; i += 4) near.push([samples[i].x, samples[i].z])
  for (const p of lanePts) near.push(p)
  // Fixed trackside cameras for the TV view, on whichever side of the track
  // keeps them well clear of every other part of it.
  const tvSpots = Array.from({ length: 36 }, (_, i) => {
    const f = i / 36 + 0.012
    const s = sample(f)
    const room = (x, z) => Math.min(...near.map(([px, pz]) => Math.hypot(px - x, pz - z)))
    let best = null
    for (const side of [1, -1]) {
      for (const d of [14, 18, 24]) {
        const x = s.x + s.nx * side * (TRACK_W / 2 + d)
        const z = s.z + s.nz * side * (TRACK_W / 2 + d)
        const r = room(x, z)
        if (!best || r > best.r + 2) best = { f, x, z, y: s.h + 4 + d * 0.15, r }
        if (r >= d - 1) break
      }
    }
    return best
  })
  const clear = (x, z) => near.every(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 > 100) &&
    tvSpots.every((q) => (q.x - x) ** 2 + (q.z - z) ** 2 > 144) &&
    Math.hypot(x - pitBox.position.x, z - pitBox.position.z) > garageLen * 0.65 && Math.hypot(x - stand.position.x, z - stand.position.z) > standLen * 0.65
  if (STREET.has(trackId)) {
    // City blocks: boxes of every height, windows lit after dark.
    const blocks = []
    for (let tries = 0; tries < 4000 && blocks.length < 260; tries++) {
      const x = box.x0 - 30 + rng.next() * (box.x1 - box.x0 + 60)
      const z = box.z0 - 30 + rng.next() * (box.z1 - box.z0 + 60)
      const w = rng.range(4, 9)
      if (near.every(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 > (w * 0.75 + 4) ** 2) && clear(x, z) &&
        tvSpots.every((q) => Math.hypot(q.x - x, q.z - z) > w + 14)) blocks.push([x, z, w, rng.range(4, night ? 26 : 18), rng.next()])
    }
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), blocks.length)
    const tint = new THREE.Color()
    blocks.forEach(([x, z, w, h, c], i) => {
      m4.makeScale(w, h, w * 0.8).setPosition(x, h / 2, z)
      city.setMatrixAt(i, m4)
      city.setColorAt(i, night ? tint.setHSL(0.62, 0.25, 0.12 + c * 0.1) : tint.setHSL(0.08 + c * 0.05, 0.12, 0.62 + c * 0.2))
    })
    group.add(city)
    if (night) {
      // A scatter of lit windows on the blocks' sides.
      const lit = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ color: '#ffd98a', side: THREE.DoubleSide }), blocks.length * 6)
      let li = 0
      for (const [x, z, w, h] of blocks) {
        for (let k = 0; k < 6; k++) {
          const face = rng.int(0, 3)
          const ox = face === 0 ? w / 2 + 0.02 : face === 1 ? -w / 2 - 0.02 : rng.range(-w / 2 + 0.5, w / 2 - 0.5)
          const oz = face === 2 ? w * 0.4 + 0.02 : face === 3 ? -w * 0.4 - 0.02 : rng.range(-w * 0.4 + 0.5, w * 0.4 - 0.5)
          m4.makeRotationY(face < 2 ? Math.PI / 2 : 0).setPosition(x + ox, rng.range(1.5, h - 1), z + oz)
          lit.setMatrixAt(li++, m4)
        }
      }
      group.add(lit)
    }
  }
  const trees = []
  for (let tries = 0; tries < 3000 && trees.length < (STREET.has(trackId) ? 60 : 220); tries++) {
    const x = box.x0 - 40 + rng.next() * (box.x1 - box.x0 + 80)
    const z = box.z0 - 40 + rng.next() * (box.z1 - box.z0 + 80)
    if (clear(x, z)) trees.push([x, z, rng.range(0.8, 1.5)])
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.3, 1.6, 5), mat('#5b4330'), trees.length)
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 4.2, 7), mat(night ? '#1d3a24' : '#2f6b34'), trees.length)
  trees.forEach(([x, z, sc], i) => {
    m4.makeScale(sc, sc, sc).setPosition(x, 0.8 * sc, z)
    trunk.setMatrixAt(i, m4)
    m4.makeScale(sc, sc, sc).setPosition(x, 3.4 * sc, z)
    crown.setMatrixAt(i, m4)
  })
  group.add(trunk, crown)

  // Under floodlights at night: poles along the track, lamps glowing.
  if (night) {
    const poles = []
    for (let f = 0; f < 1; f += 0.025) {
      const s = sample(f)
      const out = -inSide
      poles.push([s.x + s.nx * out * (TRACK_W / 2 + 5), s.z + s.nz * out * (TRACK_W / 2 + 5)])
    }
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.15, 9, 5), mat('#555b66'), poles.length)
    const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.5, 0.6), new THREE.MeshBasicMaterial({ color: '#fff6d8' }), poles.length)
    poles.forEach(([x, z], i) => {
      m4.makeTranslation(x, 4.5, z)
      pole.setMatrixAt(i, m4)
      m4.makeTranslation(x, 9.1, z)
      lamp.setMatrixAt(i, m4)
    })
    group.add(pole, lamp)
  }

  // Suzuka's bridge: the deck's sides and two supports.
  if (over != null) {
    for (const df of [-0.012, 0.012]) {
      const s = sample(over + df)
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, s.h, TRACK_W + 1), mat('#9aa0a8'))
      leg.position.set(s.x, s.h / 2 - 0.05, s.z)
      leg.rotation.y = Math.atan2(-s.tz, s.tx)
      group.add(leg)
    }
  }

  // Light and sky.
  const sky = night ? ['#03050c', '#1c2440'] : wet ? ['#5c6570', '#a5adb6'] : ['#3d86d6', '#cfe5f4']
  const background = skyTexture(...sky)
  const fog = new THREE.Fog(sky[1], extent * (wet ? 0.5 : 1.1), extent * (wet ? 1.8 : 3.2))
  const sun = new THREE.DirectionalLight(night ? '#fff1d0' : '#ffffff', night ? 1.4 : wet ? 0.9 : 2.2)
  sun.position.set(cx + extent * 0.4, extent * 0.8, cz + extent * 0.3)
  sun.target.position.set(cx, 0, cz)
  const lights = [new THREE.HemisphereLight(night ? '#9fb3ff' : '#ffffff', night ? '#20283a' : '#55703f', night ? 1.25 : wet ? 1.5 : 1.7), sun]
  group.add(lights[1].target)

  // Where a car is, `f` of the way round by distance, `lat` across the track;
  // and where it is in the pit lane, `f` as the 2D map counts it.
  const at = (f, lat = 0) => {
    const s = sample(f)
    return { x: s.x + s.nx * lat, z: s.z + s.nz * lat, y: s.h, tx: s.tx, tz: s.tz }
  }
  const lane = (f) => {
    const [x, z] = outline.lanePoint(f)
    const [x2, z2] = outline.lanePoint(f + 0.002)
    const len = Math.hypot(x2 - x, z2 - z) || 1
    return { x, z, y: 0, tx: (x2 - x) / len, tz: (z2 - z) / len }
  }

  return {
    group, lights, background, fog, at, lane, extent, centre: [cx, cz], night, profile, inSide, tvSpots,
  }
}

// ---- The cars ----

const GEO = {}
function geo() {
  if (GEO.body) return GEO
  GEO.body = new THREE.BoxGeometry(1.3, 0.22, 0.36).translate(-0.1, 0.2, 0)
  GEO.nose = new THREE.BoxGeometry(0.75, 0.12, 0.15).translate(0.88, 0.16, 0)
  GEO.pods = new THREE.BoxGeometry(0.62, 0.17, 0.74).translate(-0.18, 0.16, 0)
  GEO.cover = new THREE.BoxGeometry(0.55, 0.2, 0.2).translate(-0.35, 0.36, 0)
  GEO.fwing = new THREE.BoxGeometry(0.2, 0.035, 0.82).translate(1.17, 0.06, 0)
  GEO.rwing = new THREE.BoxGeometry(0.18, 0.05, 0.62).translate(-0.95, 0.47, 0)
  GEO.plate = new THREE.BoxGeometry(0.26, 0.26, 0.03)
  GEO.helmet = new THREE.SphereGeometry(0.075, 8, 6).translate(0.18, 0.37, 0)
  GEO.wheel = new THREE.CylinderGeometry(0.16, 0.16, 0.15, 10).rotateX(Math.PI / 2)
  GEO.shadow = new THREE.PlaneGeometry(2.4, 1.0).rotateX(-Math.PI / 2).translate(0, 0.015, 0)
  GEO.bar = new THREE.BoxGeometry(0.16, 0.06, 0.5).translate(0.05, 0.47, 0)
  return GEO
}
const MATS = new Map()
const paint = (color) => {
  if (!MATS.has(color)) MATS.set(color, mat(color, { roughness: 0.45, metalness: 0.25 }))
  return MATS.get(color)
}
let shadowMat = null

// A small car in its team's colours, nose along +x. `accent` for the helmet
// and front wing; `safety` for the safety car's light bar.
export function miniCar(color, accent, { safety = false } = {}) {
  const g = geo()
  const car = new THREE.Group()
  const body = paint(color)
  const carbon = paint('#1f2227')
  for (const [geom, m] of [[g.body, body], [g.nose, body], [g.pods, body], [g.cover, body], [g.fwing, paint(accent)], [g.rwing, body], [g.helmet, paint(accent)]]) car.add(new THREE.Mesh(geom, m))
  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(g.plate, carbon)
    plate.position.set(-0.95, 0.4, s * 0.31)
    car.add(plate)
    for (const x of [0.72, -0.66]) {
      const w = new THREE.Mesh(g.wheel, paint('#141416'))
      w.position.set(x, 0.16, s * 0.4)
      car.add(w)
    }
  }
  if (safety) {
    const bar = new THREE.Mesh(g.bar, new THREE.MeshBasicMaterial({ color: '#ff9a1a' }))
    car.add(bar)
    car.userData.bar = bar
  }
  shadowMat ??= new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false })
  car.add(new THREE.Mesh(g.shadow, shadowMat))
  car.scale.setScalar(1.6)
  return car
}

// Rain: streaks falling in a box that follows the camera.
export function makeRain(count = 1100) {
  const pos = new Float32Array(count * 6)
  const rng = makeRng(7)
  for (let i = 0; i < count; i++) {
    const x = rng.range(-40, 40)
    const y = rng.range(0, 30)
    const z = rng.range(-40, 40)
    pos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#cdd7e3', transparent: true, opacity: 0.55 }))
  lines.frustumCulled = false
  return {
    mesh: lines,
    tick(dt, around) {
      const p = g.attributes.position.array
      for (let i = 0; i < count; i++) {
        let y = p[i * 6 + 1] - dt * 28
        if (y < 0) y += 30
        p[i * 6 + 1] = y
        p[i * 6 + 4] = y - 0.7
      }
      g.attributes.position.needsUpdate = true
      lines.position.set(around.x, around.y - 8, around.z)
    },
  }
}

export function disposeAll(root) {
  root.traverse((o) => {
    o.geometry?.dispose()
    const m = o.material
    for (const x of Array.isArray(m) ? m : m ? [m] : []) {
      x.map?.dispose()
      x.dispose()
    }
  })
  for (const k of Object.keys(GEO)) { GEO[k].dispose(); delete GEO[k] }
  for (const m of MATS.values()) m.dispose()
  MATS.clear()
  shadowMat?.dispose()
  shadowMat = null
}
