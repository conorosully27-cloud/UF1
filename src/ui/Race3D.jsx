import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildCircuit, miniCar, labelSprite, makeRain, disposeAll } from './raceScene.js'
import { placements, wrap } from './racePlace.js'
import { getProfile } from './speedProfile.js'
import { teamColor, driverColor, secondColor, onColor, carCode, ordinal } from './format.js'
import { Tyre } from './weekendParts.jsx'

// The race in 3D (RACE_WEEKEND.md, W8), loaded only when chosen. Every car is
// placed from the same snapshot as the 2D map (RaceMap.jsx), so the playback,
// the gaps and the order are the same; the cameras and the broadcast graphics
// are what is new. Tap a car to follow it.

export const CAMS = [['director', 'Director'], ['tv', 'TV'], ['chase', 'Chase'], ['onboard', 'Onboard'], ['heli', 'Heli']]
const DIRECTOR_CUTS = [['tv', 7], ['chase', 6], ['tv', 6], ['heli', 5], ['onboard', 5]]

export default function Race3D({ game, st, snap, full }) {
  const box = useRef(null)
  const live = useRef({})
  const [cam, setCam] = useState('director')
  const [follow, setFollow] = useState(null)
  const firstMine = snap.order.find((r) => r.c.e.isPlayer)?.c.id ?? snap.order[0]?.c.id
  const followId = follow && (snap.order.some((r) => r.c.id === follow) || snap.gone.some((r) => r.c.id === follow)) ? follow : firstMine
  live.current = { snap, cam, followId, setFollow }
  const cond = st.cond[Math.min(Math.max(0, snap.lap - 1), st.laps - 1)] ?? 'dry'
  const wet = cond !== 'dry'
  const key = `${st.track.id}|${wet}`

  useEffect(() => {
    const el = box.current
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const circuit = buildCircuit(st.track.id, { wet })
    scene.add(circuit.group, ...circuit.lights)
    scene.background = circuit.background
    scene.fog = circuit.fog
    const camera = new THREE.PerspectiveCamera(50, 1, 0.2, circuit.extent * 6)

    // A car for every driver, a tag over yours, the leader's and the one followed.
    const cars = new Map()
    for (const c of st.cars) {
      const col = c.e.isPlayer ? driverColor(game, c.id, c.e.slot) : teamColor(game, c.e.teamId)
      const car = miniCar(col, c.e.isPlayer ? '#ffffff' : secondColor(col))
      car.userData = { id: c.id, lat: 0, ready: false }
      car.traverse((o) => { o.userData.carId = c.id })
      const tag = labelSprite(carCode(c.e.name), col, onColor(col))
      tag.position.y = 1.15
      tag.visible = false
      car.add(tag)
      car.userData.tag = tag
      car.visible = false
      scene.add(car)
      cars.set(c.id, car)
    }
    const sc = miniCar('#c9ced6', '#ff9a1a', { safety: true })
    sc.visible = false
    scene.add(sc)
    const rain = wet ? makeRain() : null
    if (rain) scene.add(rain.mesh)

    // Cameras.
    const look = new THREE.Vector3(circuit.centre[0], 0, circuit.centre[1])
    const desired = new THREE.Vector3()
    const want = new THREE.Vector3()
    let tvSpot = null
    const heading = new THREE.Vector3(1, 0, 0)
    let heliAngle = 0
    let director = { i: 0, t: 0 }
    let lastMode = null
    camera.position.set(circuit.centre[0] + circuit.extent * 0.6, circuit.extent * 0.5, circuit.centre[1] + circuit.extent * 0.6)

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const sizes = new ResizeObserver(resize)
    sizes.observe(el)
    let onScreen = true
    const seen = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting })
    seen.observe(el)

    // A tap on a car follows it.
    const ray = new THREE.Raycaster()
    let down = null
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const r = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObjects([...cars.values()].filter((c) => c.visible), true).find((h) => h.object.userData.carId && !h.object.isSprite)
      if (hit) live.current.setFollow(hit.object.userData.carId)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    let last = performance.now()
    renderer.setAnimationLoop((now) => {
      if (!onScreen || document.hidden) { last = now; return }
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const { snap: s, cam: mode, followId: fid } = live.current
      const { list, where } = placements(s, circuit)

      // Cars.
      for (const car of cars.values()) car.visible = false
      let target = null
      const leaderId = s.order[0]?.c.id
      for (const p of list) {
        const car = cars.get(p.r.c.id)
        if (!car) continue
        const u = car.userData
        u.lat += (p.lat - u.lat) * Math.min(1, dt * 4)
        if (!u.ready) { u.lat = p.lat; u.ready = true }
        const at = p.pit ? circuit.lane(p.r.laneF) : circuit.at(p.f, p.gone ? p.lat * (circuit.inSide > 0 ? -1 : 1) : u.lat)
        car.position.set(at.x, at.y, at.z)
        car.rotation.set(0, Math.atan2(-at.tz, at.tx) + (p.gone ? 0.6 : 0), 0)
        car.visible = true
        u.tag.visible = p.r.c.e.isPlayer || p.r.c.id === leaderId || p.r.c.id === fid
        // Onboard, the camera sits in the followed car: hide it.
        if (lastMode === 'onboard' && p.r.c.id === fid) car.visible = false
        if (p.r.c.id === fid) target = { at, p }
      }
      if (s.under === 'sc' && s.order.length) {
        const a = circuit.at(where(s.leaderD) + 0.025)
        sc.position.set(a.x, a.y, a.z)
        sc.rotation.set(0, Math.atan2(-a.tz, a.tx), 0)
        sc.userData.bar.material.color.set(Math.floor(now / 250) % 2 ? '#ff9a1a' : '#ffd36a')
        sc.visible = true
      } else sc.visible = false

      // Cameras. The director cuts between the others on the car being followed.
      let m = mode
      if (mode === 'director') {
        director.t += dt
        if (director.t > DIRECTOR_CUTS[director.i][1]) { director = { i: (director.i + 1) % DIRECTOR_CUTS.length, t: 0 } }
        m = DIRECTOR_CUTS[director.i][0]
      }
      const cut = m !== lastMode
      lastMode = m
      if (m === 'heli' || !target) {
        heliAngle += dt * 0.06
        const R = circuit.extent * 0.75
        desired.set(circuit.centre[0] + Math.cos(heliAngle) * R, circuit.extent * 0.55, circuit.centre[1] + Math.sin(heliAngle) * R)
        want.set(circuit.centre[0], 0, circuit.centre[1])
        camera.position.lerp(desired, cut ? 1 : 1 - Math.exp(-dt * 1.5))
        look.lerp(want, cut ? 1 : 1 - Math.exp(-dt * 1.5))
        camera.fov = 42
      } else {
        const { at } = target
        // The cars cover a lap in a few seconds, so the cameras hold on to the
        // car itself and only the direction they look along is smoothed.
        want.set(at.tx, 0, at.tz)
        if (cut) heading.copy(want)
        else heading.lerp(want, 1 - Math.exp(-dt * 6)).normalize()
        if (m === 'chase') {
          camera.position.set(at.x - heading.x * 7, at.y + 2.6, at.z - heading.z * 7)
          look.set(at.x + heading.x * 4, at.y + 0.6, at.z + heading.z * 4)
          camera.fov = 55
        } else if (m === 'onboard') {
          camera.position.set(at.x, at.y + 0.75, at.z)
          look.set(at.x + heading.x * 12, at.y + 0.55, at.z + heading.z * 12)
          camera.fov = 72
        } else {
          // TV: the nearest trackside camera, held until another is much closer.
          const d2 = (q) => (q.x - at.x) ** 2 + (q.z - at.z) ** 2
          const best = circuit.tvSpots.reduce((a, b) => (d2(b) < d2(a) ? b : a))
          if (cut || !tvSpot || d2(best) < d2(tvSpot) * 0.45) tvSpot = best
          camera.position.set(tvSpot.x, tvSpot.y, tvSpot.z)
          look.set(at.x, at.y + 0.4, at.z)
          const dist = Math.sqrt(d2(tvSpot))
          camera.fov = Math.max(5, Math.min(48, (2 * Math.atan(5.5 / dist) * 180) / Math.PI))
        }
      }
      camera.updateProjectionMatrix()
      camera.lookAt(look)
      // Tags keep their size on screen whatever the lens.
      const lens = Math.tan((camera.fov * Math.PI) / 360) / Math.tan((25 * Math.PI) / 180)
      for (const car of cars.values()) if (car.userData.tag.visible) car.userData.tag.scale.set(0.06 * lens, 0.0225 * lens, 1)
      rain?.tick(dt, camera.position)
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      sizes.disconnect()
      seen.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      scene.background?.dispose()
      disposeAll(scene)
      renderer.dispose()
      renderer.domElement.remove()
    }
    // The scene is rebuilt only for a new circuit or a change in the weather;
    // the cars and cameras follow the live props through `live`.
  }, [key])

  // The broadcast graphics: the lap, the flag, the car being followed and, full screen, the order.
  const rows = snap.order
  const fi = rows.findIndex((r) => r.c.id === followId)
  const fr = rows[fi] ?? snap.gone.find((r) => r.c.id === followId)
  const fc = fr?.c
  const col = fc ? (fc.e.isPlayer ? driverColor(game, fc.id, fc.e.slot) : teamColor(game, fc.e.teamId)) : '#888'
  const ahead = fi > 0 ? rows[fi - 1] : null
  // The followed car's speed where it is on the lap; a crawl behind the safety car.
  const profile = getProfile(st.track.id)
  const slow = snap.under === 'sc' ? 0.42 : snap.under === 'vsc' ? 0.55 : 1
  const { where } = placements({ ...snap, order: [], gone: [] }, { profile })
  const kmh = !fr || fi < 0 || !snap.timed || !profile ? null : fr.pit ? 80 : Math.round(profile.speedAt(wrap(where(fr.d))) * slow)
  return (
    <div className={`r3d${full ? ' full' : ''}`}>
      <div ref={box} className="r3d-canvas" />
      <div className="r3d-top">
        <span className="r3d-live">LIVE</span>
        <span className="r3d-lap">{snap.lap ? `LAP ${Math.min(snap.lap, st.laps)} / ${st.laps}` : 'GRID'}</span>
        {snap.under && <span className={`r3d-flag ${snap.under}`}>{snap.under === 'sc' ? 'SAFETY CAR' : snap.under === 'vsc' ? 'VIRTUAL SAFETY CAR' : 'RED FLAG'}</span>}
        {wet && <span className="r3d-flag wet">{cond === 'wet' ? 'HEAVY RAIN' : 'RAIN'}</span>}
      </div>
      {full && (
        <ol className="r3d-tower">
          {rows.slice(0, 10).concat(rows.slice(10).filter((r) => r.c.e.isPlayer)).map((r) => {
            const pos = rows.indexOf(r) + 1
            return (
              <li key={r.c.id} className={`${r.c.e.isPlayer ? 'me' : ''}${r.c.id === followId ? ' on' : ''}`} onClick={() => setFollow(r.c.id)}>
                <b>{pos}</b><i style={{ background: r.c.e.isPlayer ? driverColor(game, r.c.id, r.c.e.slot) : teamColor(game, r.c.e.teamId) }} />
                <span>{carCode(r.c.e.name)}</span><em>{pos === 1 ? 'Leader' : r.pit ? 'PIT' : `+${Math.max(0, r.gap ?? 0).toFixed(1)}`}</em>
              </li>
            )
          })}
        </ol>
      )}
      {fc && (
        <div className="r3d-card" style={{ '--dc': col }}>
          <b className="pos">{fi >= 0 ? fi + 1 : '–'}</b>
          <span className="name"><small>{fc.e.teamName}</small>{fc.e.name}</span>
          <span className="gap">{fi === 0 ? 'Leader' : fi > 0 ? `${ordinal(fi + 1)} · +${Math.max(0, fr.gap - (ahead?.gap ?? 0)).toFixed(1)} to ${carCode(ahead.c.e.name)}` : 'Out'}</span>
          {fi >= 0 && <span className="tyre"><Tyre comp={fr.tyre} /></span>}
          {kmh != null && <span className="kmh"><b>{kmh}</b> km/h</span>}
        </div>
      )}
      <div className="r3d-cams">
        {CAMS.map(([id, label]) => <button key={id} className={cam === id ? 'on' : ''} onClick={() => setCam(id)}>{label}</button>)}
      </div>
    </div>
  )
}
