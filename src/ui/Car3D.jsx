import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildCar, styleCar, disposeCar } from './carModel.js'

// The 3D car (carModel.js), loaded only with the Car tab. Drag to turn it,
// pinch or scroll to zoom, tap a part to pick its rating, or pick a set view.
// From three-quarters it turns slowly on its own until touched, and again a
// few seconds after; it only draws while on screen. A rival's car can stand
// alongside, in its own colours and detail.

// Where the camera sits for each set view (CAR_VIEWS in CarView.jsx), from
// the point it looks at.
const VIEWS = { three: [4.5, 1.85, 5.1], side: [0, 0.55, 7], front: [7, 0.75, 0], top: [0.01, 8, 0.01] }
const RIVAL_Z = -2.9

export default function Car3D({ color, accent, ink, look, rival, states, selected, onSelect, view = 'three' }) {
  const box = useRef(null)
  const live = useRef({})
  live.current = { states, selected, onSelect }
  const api = useRef(null)
  const key = JSON.stringify({ color, accent, ink, look, rival })

  useEffect(() => {
    const el = box.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a3f48', 1.7))
    const sun = new THREE.DirectionalLight('#ffffff', 2.3)
    sun.position.set(4, 8, 5)
    scene.add(sun)
    const rim = new THREE.DirectionalLight('#ffffff', 0.8)
    rim.position.set(-5, 3, -4)
    scene.add(rim)
    const car = buildCar({ color, accent, ink, ...look })
    scene.add(car.group)
    const other = rival ? buildCar(rival) : null
    if (other) {
      other.group.position.z = RIVAL_Z
      scene.add(other.group)
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    const target = new THREE.Vector3(0, 0.35, other ? RIVAL_Z / 2 : 0)
    controls.target.copy(target)
    Object.assign(controls, { enablePan: false, enableDamping: true, minDistance: 3.5, maxDistance: other ? 16 : 11, maxPolarAngle: Math.PI * 0.48, autoRotateSpeed: 1.2 })
    let idle = null
    let current = view
    const start = () => { controls.autoRotate = false; clearTimeout(idle); move = null }
    const end = () => { if (current === 'three') idle = setTimeout(() => { controls.autoRotate = true }, 5000) }
    controls.addEventListener('start', start)
    controls.addEventListener('end', end)

    // A set view: the camera glides there, and turns on its own only from three-quarters.
    let move = null
    // With a rival alongside, the side view looks down a little so both cars show.
    const spot = (v) => new THREE.Vector3(...(other && v === 'side' ? [0, 2.6, 6.4] : VIEWS[v])).multiplyScalar(other ? 1.45 : 1).add(target)
    api.current = {
      setView: (v) => {
        current = v
        clearTimeout(idle)
        controls.autoRotate = false
        move = { from: camera.position.clone(), to: spot(v), t0: performance.now(), v }
      },
    }
    camera.position.copy(spot(view))
    controls.autoRotate = view === 'three'

    // A tap (not a drag) picks the part under it, or clears the pick.
    const ray = new THREE.Raycaster()
    let down = null
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const r = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObjects(car.pickable, false)[0]
      live.current.onSelect?.(hit ? hit.object.userData.pick : null)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      // Narrow screens stand back a little, so the whole car fits.
      camera.zoom = Math.min(1, (w / h) / 1.6)
      camera.updateProjectionMatrix()
    }
    resize()
    const sizes = new ResizeObserver(resize)
    sizes.observe(el)
    let onScreen = true
    const seen = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting })
    seen.observe(el)

    renderer.setAnimationLoop((ms) => {
      if (!onScreen || document.hidden) return
      if (move) {
        const k = Math.min(1, (performance.now() - move.t0) / 700)
        camera.position.lerpVectors(move.from, move.to, 1 - (1 - k) ** 3)
        if (k >= 1) {
          controls.autoRotate = move.v === 'three'
          move = null
        }
      }
      controls.update()
      styleCar(car, live.current.states, live.current.selected, ms / 1000)
      renderer.render(scene, camera)
    })
    return () => {
      renderer.setAnimationLoop(null)
      clearTimeout(idle)
      api.current = null
      sizes.disconnect()
      seen.disconnect()
      controls.removeEventListener('start', start)
      controls.removeEventListener('end', end)
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      disposeCar(car)
      if (other) disposeCar(other)
      renderer.dispose()
      renderer.domElement.remove()
    }
    // The scene is rebuilt only when the cars change; `view` is followed below.
  }, [key])

  useEffect(() => { api.current?.setView(view) }, [view])

  return <div ref={box} className="car3d" />
}
