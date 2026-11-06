import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { TrackMap } from './RaceMap.jsx'
import { hasWebGL } from './webgl.js'

// The race on screen (RACE_WEEKEND.md, W8): the 2D map, or the race in 3D
// with broadcast cameras, remembered between weekends. The 3D view can fill
// the screen; `controls` (play, speed) then sit over it.

const Race3D = lazy(() => import('./Race3D.jsx'))

// If the 3D view fails to draw, the 2D map takes its place rather than the
// error taking the whole screen.
class Fallback extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.map : this.props.children }
}
const KEY = 'uf1-race-view'

export default function RaceView({ game, st, snap, controls = null }) {
  const webgl = useMemo(hasWebGL, [])
  const [mode, setModeState] = useState(() => { try { return localStorage.getItem(KEY) || '2d' } catch { return '2d' } })
  const setMode = (m) => { setModeState(m); try { localStorage.setItem(KEY, m) } catch { /* no storage: just this page */ } }
  const [full, setFull] = useState(false)
  const three = webgl && mode === '3d'
  useEffect(() => {
    if (!full) return undefined
    const key = (e) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', key)
    document.body.classList.add('noscroll')
    return () => { window.removeEventListener('keydown', key); document.body.classList.remove('noscroll') }
  }, [full])
  const map = <TrackMap game={game} st={st} snap={snap} />
  return (
    <div className={`raceview${three && full ? ' full' : ''}`}>
      {webgl && (
        <div className="rv-bar">
          <div className="seg">
            <button className={mode === '2d' ? 'on' : ''} onClick={() => { setMode('2d'); setFull(false) }}>Map</button>
            <button className={mode === '3d' ? 'on' : ''} onClick={() => setMode('3d')}>3D</button>
          </div>
          {three && <button className="rv-full" onClick={() => setFull(!full)} aria-pressed={full} title={full ? 'Back to the pit wall (Esc)' : 'Full screen'}>{full ? '✕ Close' : '⤢ Full screen'}</button>}
        </div>
      )}
      {three ? <Fallback map={map}><Suspense fallback={map}><Race3D game={game} st={st} snap={snap} full={full} /></Suspense></Fallback> : map}
      {three && full && controls && <div className="rv-controls">{controls}</div>}
    </div>
  )
}
