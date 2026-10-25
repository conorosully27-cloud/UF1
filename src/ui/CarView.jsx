import React, { Suspense, lazy, useMemo, useState } from 'react'
import { PLAYER } from '../engine/core.js'
import { rivalTracker } from '../engine/highlights.js'
import { partStates, CAR_AREAS, STATE_TEXT, carLook, compareCars } from './carParts.js'
import { teamColor, secondColor, onColor, pct } from './format.js'
import { livery } from './livery.js'
import { Seg } from './weekendParts.jsx'

// The car at the top of the Car tab (VISUALS.md, V3 to V5 and the car's third
// stage): the 3D car where the browser can draw it, a flat drawing where it
// cannot (and while the 3D code loads), then each rating with where its
// upgrades are. Tap a part, or a rating, for the detail. Set views, and a
// rival's car alongside to compare.

const CAR_VIEWS = [['three', '¾'], ['side', 'Side'], ['front', 'Front'], ['top', 'Top']]

const Car3D = lazy(() => import('./Car3D.jsx'))

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

// The car from above, for browsers without 3D. The same parts, the same states.
const FLAT = [
  ['aero', 'rect', { x: 64, y: 24, width: 134, height: 72, rx: 10 }, '#24272d'],
  ['tyreCare', 'path', { d: 'M233 60 L233 18 M233 60 L233 102 M86 60 L86 16 M86 60 L86 104' }, null],
  ['aero', 'rect', { x: 262, y: 16, width: 22, height: 88, rx: 3 }, '#24272d'],
  ['aero', 'rect', { x: 28, y: 30, width: 18, height: 60, rx: 3 }, 'team'],
  ['chassis', 'rect', { x: 100, y: 28, width: 58, height: 20, rx: 7 }, 'team'],
  ['chassis', 'rect', { x: 100, y: 72, width: 58, height: 20, rx: 7 }, 'team'],
  ['chassis', 'path', { d: 'M58 52 L140 43 L205 50 L270 56 L270 64 L205 70 L140 77 L58 68 Z' }, 'team'],
  ['reliability', 'rect', { x: 155, y: 30, width: 5, height: 16 }, '#0c0d10'],
  ['reliability', 'rect', { x: 155, y: 74, width: 5, height: 16 }, '#0c0d10'],
  ['power', 'rect', { x: 126, y: 54, width: 16, height: 12, rx: 3 }, 'team'],
  [null, 'circle', { cx: 176, cy: 60, r: 6 }, 'accent'],
]
const WHEELS = [[220, 2], [220, 102], [70, 0], [70, 102]]

function CarFlat({ color, accent, states, selected, onSelect }) {
  const fill = (f) => (f === 'team' ? color : f === 'accent' ? accent : f)
  return (
    <svg className="carflat" viewBox="0 0 300 120" role="img" aria-label="The car from above">
      <defs><filter id="carglow"><feGaussianBlur stdDeviation="2.5" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
      {WHEELS.map(([x, y], i) => <rect key={i} x={x} y={y} width={i < 2 ? 26 : 32} height={16 + (i < 2 ? 0 : 2)} rx="4" fill="#151518" onClick={() => onSelect('tyreCare')} />)}
      {FLAT.map(([area, Tag, attrs, base], i) => {
        const s = area ? states[area]?.state : null
        const line = !base
        const style = {
          fill: line ? 'none' : s === 'design' ? 'none' : s === 'dud' ? '#6b6f76' : fill(base),
          stroke: s === 'new' ? '#ffc23a' : s === 'design' ? accent : area && area === selected ? '#fff' : line ? '#454b55' : 'none',
          strokeWidth: line ? 2.5 : s === 'new' || area === selected || s === 'design' ? 2 : 0,
          strokeDasharray: s === 'design' ? '4 3' : undefined,
          opacity: s === 'build' ? 0.3 + 0.6 * (states[area].progress ?? 0) : 1,
          filter: s === 'new' ? 'url(#carglow)' : undefined,
          cursor: area ? 'pointer' : undefined,
        }
        return <Tag key={i} {...attrs} style={style} onClick={area ? () => onSelect(area) : undefined} />
      })}
    </svg>
  )
}

function Detail({ p }) {
  return (
    <div className="part-detail">
      <b>{p.label}</b> <span className="muted">· {p.parts}</span>
      {p.area === 'power' ? (
        <p>{p.rating.toFixed(0)} from the {p.supplier} power unit. Power comes with the supply deal (Team, Power unit), not from the factory.</p>
      ) : (
        <>
          <p>
            Rating <b>{p.rating.toFixed(1)}</b>{Math.abs(p.raced - p.rating) > 0.05 && <> · as raced {p.raced.toFixed(1)}</>} ·
            each unit of work adds {pct(p.perUnit)} of a full one.
          </p>
          {p.last && <p className={p.state === 'dud' ? 'bad' : 'good'}>{p.state === 'dud' ? 'The last upgrade fitted gave nothing.' : `New part fitted for the last race: +${p.last.gain.toFixed(2)}.`}</p>}
          {p.queue.length ? (
            <ul className="plain">
              {p.queue.map((q) => (
                <li key={q.id}>
                  {q.label}: {q.stage === 'build' ? 'in the factory' : 'in design'}, {q.done.toFixed(1)} of {q.units} units
                  <span className="bar-track"><span style={{ width: `${Math.min(100, (100 * q.done) / q.units)}%` }} /></span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Nothing in design or in the factory for {p.label}.</p>}
        </>
      )}
    </div>
  )
}

export default function CarView({ game }) {
  const states = partStates(game)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('three')
  const [rivalId, setRivalId] = useState('')
  const color = teamColor(game, PLAYER)
  const accent = livery(game.teams[PLAYER]).accent
  const webgl = useMemo(hasWebGL, [])
  const rival = rivalId && game.teams[rivalId] ? rivalId : null
  const rc = rival ? teamColor(game, rival) : null
  const rivalCar = rival ? { color: rc, accent: secondColor(rc), ink: onColor(rc), ...carLook(game, rival) } : null
  const cmp = rival ? compareCars(game, rival) : null
  const suggested = rivalTracker(game)?.rival
  const teams = Object.values(game.teams).filter((t) => t.id !== PLAYER).sort((a, b) => (a.id === suggested ? -1 : b.id === suggested ? 1 : a.name.localeCompare(b.name)))
  const props = { color, accent, states, selected, onSelect: setSelected }
  const flat = <CarFlat {...props} />
  return (
    <div className="panel carview">
      <div className="car-stage">
        {webgl ? <Suspense fallback={flat}><Car3D {...props} ink={onColor(color)} look={carLook(game, PLAYER)} rival={rivalCar} view={view} /></Suspense> : flat}
        <span className="car-hint muted small">{webgl ? `Drag to turn · tap a part${rival ? ` · ${game.teams[rival].name} behind` : ''}` : 'Tap a part'}</span>
      </div>
      <div className="car-tools">
        {webgl && <Seg value={view} options={CAR_VIEWS} onPick={setView} />}
        <label>Alongside{' '}
          <select value={rivalId} onChange={(e) => setRivalId(e.target.value)}>
            <option value="">No one</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === suggested ? ' (your rival)' : ''}</option>)}
          </select>
        </label>
      </div>
      <div className="car-parts">
        {Object.keys(CAR_AREAS).map((id) => {
          const p = states[id]
          const c = cmp?.[id]
          return (
            <button key={id} className={`part-chip${selected === id ? ' on' : ''}${p.state ? ` s-${p.state}` : ''}`} onClick={() => setSelected(selected === id ? null : id)}>
              <span>{p.label}</span><b>{p.raced.toFixed(1)}</b>
              <small>{p.state ? `${STATE_TEXT[p.state]}${p.state === 'build' || p.state === 'design' ? ` ${pct(p.progress ?? 0)}` : ''}` : '—'}</small>
              {c && <small className={c.gap >= 0 ? 'good' : 'bad'}>{game.teams[rival].name} {c.theirs.toFixed(1)} ({c.gap >= 0 ? '+' : '−'}{Math.abs(c.gap).toFixed(1)})</small>}
            </button>
          )
        })}
      </div>
      {selected && <Detail p={states[selected]} />}
    </div>
  )
}
