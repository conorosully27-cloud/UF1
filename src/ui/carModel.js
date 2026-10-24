// The 3D car on the Car tab (VISUALS.md, V3 and V4): a low-poly car built
// from simple shapes in code, in the team's colours. Each part belongs to the
// rating it stands for (carParts.js), so the parts of a rating can show where
// its upgrades are: a ghost in outline in design, filling in as it is built, a
// glow when new, grey when it gave nothing.
//
// Units are roughly metres: the nose points along +x, y is up, z is across.

import * as THREE from 'three'

const CARBON = '#24272d'
const DARK = '#0c0d10'
const STEEL = '#454b55'
const TYRE = '#151518'
const RIM = '#9aa0a8'
const GOLD = new THREE.Color('#ffc23a')
const WHITE = new THREE.Color('#ffffff')
const BLACK = new THREE.Color('#000000')
const GREY = new THREE.Color('#6b6f76')

// A box tapering from width w0 and height h0 at x0 to w1, h1 at x1, its
// centre line going from height y0 to y1.
function taper(x0, x1, w0, h0, w1, h1, y0, y1) {
  const g = new THREE.BoxGeometry(1, 1, 1)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const [x, w, h, y] = p.getX(i) > 0 ? [x1, w1, h1, y1] : [x0, w0, h0, y0]
    p.setXYZ(i, x, y + p.getY(i) * h, p.getZ(i) * w)
  }
  g.computeVertexNormals()
  return g
}

// A rod between two points, for suspension arms.
function rod(a, b, r = 0.018) {
  const from = new THREE.Vector3(...a)
  const to = new THREE.Vector3(...b)
  const g = new THREE.CylinderGeometry(r, r, from.distanceTo(to), 5)
  g.translate(0, from.distanceTo(to) / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()))
  g.translate(...a)
  return g
}

const box = (sx, sy, sz, x, y, z, rz = 0) => {
  const g = new THREE.BoxGeometry(sx, sy, sz)
  if (rz) g.rotateZ(rz)
  g.translate(x, y, z)
  return g
}

// The car: `group` to add to a scene, `meshes` that show a rating's state,
// and `pickable`, the meshes a tap can land on.
export function buildCar({ color, accent }) {
  const group = new THREE.Group()
  const meshes = []
  const add = (geometry, base, area, pick = area) => {
    const material = new THREE.MeshStandardMaterial({ color: base, roughness: 0.5, metalness: 0.15, flatShading: true })
    const m = new THREE.Mesh(geometry, material)
    m.userData = { area, pick, base: new THREE.Color(base) }
    group.add(m)
    if (area) {
      // The part's outline, shown while it is on the drawing board or being built.
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.9 }))
      edges.visible = false
      m.add(edges)
      m.userData.edges = edges
      meshes.push(m)
    }
    return m
  }
  const sides = [-1, 1]

  // Chassis: nose, monocoque, sidepods, engine cover.
  add(taper(1.6, 3.0, 0.42, 0.34, 0.16, 0.13, 0.42, 0.25), color, 'chassis')
  add(taper(-0.3, 1.6, 0.82, 0.56, 0.44, 0.36, 0.47, 0.44), color, 'chassis')
  add(box(0.7, 0.03, 0.4, 0.62, 0.74, 0), DARK, 'chassis')
  for (const s of sides) {
    const pod = taper(-1.35, 0.78, 0.4, 0.3, 0.5, 0.44, 0.33, 0.42)
    pod.translate(0, 0, s * 0.6)
    add(pod, color, 'chassis')
  }
  add(taper(-2.08, -0.3, 0.24, 0.26, 0.6, 0.62, 0.43, 0.66), color, 'chassis')
  add(taper(-2.0, -0.55, 0.02, 0.1, 0.02, 0.4, 0.78, 0.98), color, 'chassis')
  add(box(0.5, 0.05, 0.8, 0.05, 0.5, 0), accent, 'chassis')

  // Aero: floor, diffuser, front and rear wings.
  add(taper(-1.95, 1.55, 1.55, 0.04, 0.9, 0.04, 0.09, 0.09), CARBON, 'aero')
  add(taper(-2.5, -1.95, 1.05, 0.32, 1.3, 0.04, 0.25, 0.09), CARBON, 'aero')
  add(box(0.44, 0.03, 1.9, 2.86, 0.1, 0), CARBON, 'aero')
  add(box(0.3, 0.025, 1.7, 2.74, 0.18, 0, -0.3), color, 'aero')
  add(box(0.22, 0.02, 1.6, 2.62, 0.26, 0, -0.55), accent, 'aero')
  for (const s of sides) add(box(0.52, 0.24, 0.025, 2.78, 0.18, s * 0.95), CARBON, 'aero')
  add(box(0.32, 0.035, 1.02, -2.56, 0.9, 0, -0.22), CARBON, 'aero')
  add(box(0.22, 0.03, 1.02, -2.5, 1.02, 0, -0.55), color, 'aero')
  for (const s of sides) add(box(0.58, 0.44, 0.03, -2.55, 0.84, s * 0.52), color, 'aero')
  add(box(0.2, 0.03, 0.9, -2.42, 0.46, 0, -0.2), CARBON, 'aero')
  add(box(0.1, 0.4, 0.03, -2.42, 0.66, 0), CARBON, 'aero')

  // Reliability: the cooling inlets, louvres and outlet.
  for (const s of sides) {
    add(box(0.05, 0.26, 0.38, 0.79, 0.44, s * 0.6), DARK, 'reliability')
    for (let i = 0; i < 4; i++) add(box(0.06, 0.02, 0.3, -0.2 - i * 0.16, 0.6 - i * 0.012, s * 0.56), DARK, 'reliability')
  }
  add(box(0.05, 0.18, 0.24, -2.1, 0.45, 0), DARK, 'reliability')

  // Power: the airbox over the driver's head, and the exhaust.
  add(taper(-0.5, 0.02, 0.22, 0.24, 0.28, 0.3, 0.88, 0.92), color, 'power')
  add(box(0.03, 0.2, 0.16, 0.04, 0.93, 0), DARK, 'power')
  const ex = new THREE.CylinderGeometry(0.05, 0.06, 0.22, 8)
  ex.rotateZ(Math.PI / 2)
  ex.translate(-2.12, 0.38, 0)
  add(ex, '#8a8f98', 'power')

  // Tyre Care: the suspension, from the body to each wheel.
  for (const s of sides) {
    for (const [x, inner, w] of [[1.95, 0.2, 0.62], [-1.65, 0.28, 0.6]]) {
      const z = s * w
      const zi = s * inner
      add(rod([x - 0.25, 0.5, zi], [x, 0.46, z]), STEEL, 'tyreCare')
      add(rod([x + 0.25, 0.48, zi], [x, 0.46, z]), STEEL, 'tyreCare')
      add(rod([x - 0.3, 0.24, zi], [x, 0.24, z]), STEEL, 'tyreCare')
      add(rod([x + 0.3, 0.24, zi], [x, 0.24, z]), STEEL, 'tyreCare')
      add(rod([x, 0.27, s * (w - 0.04)], [x - 0.08, 0.6, zi]), STEEL, 'tyreCare')
    }
  }

  // Wheels, which a tap takes to Tyre Care; and the driver and the halo.
  for (const s of sides) {
    for (const [x, width] of [[1.95, 0.34], [-1.65, 0.42]]) {
      const z = s * (0.62 + width / 2 + 0.02)
      const tyre = new THREE.CylinderGeometry(0.36, 0.36, width, 20)
      tyre.rotateX(Math.PI / 2)
      tyre.translate(x, 0.36, z)
      add(tyre, TYRE, null, 'tyreCare')
      const rim = new THREE.CylinderGeometry(0.22, 0.22, width + 0.01, 14)
      rim.rotateX(Math.PI / 2)
      rim.translate(x, 0.36, z)
      add(rim, RIM, null, 'tyreCare')
      const band = new THREE.TorusGeometry(0.29, 0.012, 4, 24)
      band.translate(x, 0.36, z + s * (width / 2 + 0.006))
      add(band, '#ffd200', null, 'tyreCare')
    }
  }
  const helmet = new THREE.SphereGeometry(0.13, 12, 8)
  helmet.translate(0.42, 0.8, 0)
  add(helmet, accent, null, null)
  const halo = new THREE.TorusGeometry(0.34, 0.025, 5, 16, Math.PI)
  halo.rotateX(-Math.PI / 2)
  halo.rotateY(Math.PI / 2)
  halo.translate(0.62, 0.86, 0)
  add(halo, CARBON, null, null)
  add(rod([1.02, 0.86, 0], [1.2, 0.6, 0], 0.025), CARBON, null, null)

  // A soft shadow under the car.
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.002
  group.add(shadow)

  group.position.x = -0.15
  return { group, meshes, pickable: group.children.filter((m) => m.userData.pick) }
}

// Shows each rating's state on its parts (carParts.js); `t` in seconds
// makes a new part pulse. The selected rating's parts are lit.
export function styleCar(car, states, selected, t) {
  for (const m of car.meshes) {
    const { area, base } = m.userData
    const s = states[area] ?? {}
    const mat = m.material
    const state = s.state
    // In design: a faint ghost in outline. In the factory: filling in as it is built.
    m.userData.edges.visible = state === 'design' || state === 'build'
    mat.transparent = state === 'design' || state === 'build'
    mat.opacity = state === 'design' ? 0.12 : state === 'build' ? 0.25 + 0.65 * (s.progress ?? 0) : 1
    mat.depthWrite = !mat.transparent
    mat.color.copy(state === 'dud' ? GREY : base)
    if (state === 'new') mat.emissive.copy(GOLD).multiplyScalar(0.22 + 0.16 * Math.sin(t * 3))
    else if (area === selected) mat.emissive.copy(WHITE).multiplyScalar(0.22)
    else mat.emissive.copy(BLACK)
  }
}

export function disposeCar(car) {
  car.group.traverse((o) => {
    o.geometry?.dispose()
    o.material?.map?.dispose()
    o.material?.dispose()
  })
}
