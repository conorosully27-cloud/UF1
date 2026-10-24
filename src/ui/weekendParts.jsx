// Pieces shared by the race-weekend screens: the tyre badge, segmented
// controls, help, driver tags, faces on the timing tower, the heading with the weekend objectives, and
// the incident panel.

import React, { useEffect, useRef } from 'react'
import { TYRES } from '../engine/weekend.js'
import { objectivesNow, incidentDue, resolveIncident } from '../engine/live.js'
import { DecisionPanel } from './M3Ui.jsx'
import { carCode, driverColor, teamColor } from './format.js'
import Face from './Face.jsx'

export const SLICKS = ['S', 'M', 'H']

export const WING_LABELS = ['Low drag', 'Low', 'Medium', 'High', 'High downforce']

export const CALL_KINDS = { red: 'red flag', sc: 'safety car', vsc: 'virtual safety car', plan: 'pit window', cliff: 'tyres', rain: 'weather', drying: 'weather', damage: 'damage', 'compound rule': 'tyre rules', undercut: 'undercut', teammates: 'team orders' }

export const COND = { dry: '☀ Dry', damp: '🌦 Damp', wet: '🌧 Wet' }

export const SPEEDS = [1, 2, 4, 8, 16] // at 1x a lap takes LAP_SECONDS (5 s)

export const LIGHTS_OUT_MS = 2600 // when the start lights go out (see .lights in styles.css)

export function Tyre({ comp, age, lg }) {
  return <span className={`tyre${lg ? ' lg' : ''}`} title={TYRES[comp].name}><i className={`ty-${comp}`}>{comp}</i>{age !== undefined && <small>{age}</small>}</span>
}

export function Seg({ options, value, onPick, disabled }) {
  return (
    <div className="seg">
      {options.map(([k, label]) => <button key={String(k)} className={value === k ? 'on' : ''} disabled={disabled} onClick={() => onPick(k)}>{label}</button>)}
    </div>
  )
}

// A short explanation, folded away until asked for.
export function Help({ title = 'How this works', children }) {
  return <details className="help"><summary>{title}</summary><div>{children}</div></details>
}

// One of your drivers, in their own colour.
export function DriverTag({ game, id, slot, name, code }) {
  const col = driverColor(game, id, slot)
  const full = name ?? game.drivers[id]?.name ?? id
  return <span className="dtag" style={{ '--dc': col }}><i />{code ? carCode(full) : full}</span>
}

// A small head on the timing tower, in the team's colours.
export function TowerFace({ game, id, teamId }) {
  return <span className="hd"><Face driver={game.drivers[id] ?? { id }} color={teamColor(game, teamId)} size={20} /></span>
}

export const myCars = (st) => st.cars.filter((c) => c.e.isPlayer)

export const stintAge = (st, c) => st.lap - c.stints[c.stints.length - 1].lap

export const dc = (game, c) => ({ '--dc': driverColor(game, c.id, c.e.slot) })

export function Objectives({ game }) {
  const list = objectivesNow(game)
  return (
    <div className="chips">
      {list.map((o, i) => (
        <span key={i} className={`chip ${o.now === true ? 'ok' : o.now === false ? 'no' : ''}`}>
          {o.now === true ? '✓ ' : o.now === false ? '✗ ' : '◎ '}{o.text}
        </span>
      ))}
    </div>
  )
}

export function Head({ title, chip, right, game, children }) {
  return (
    <div className="race-head">
      <div className="line"><span className="gp">{title}</span>{chip && <span className="chip">{chip}</span>}<span className="lap">{right}</span></div>
      {game && <div style={{ marginTop: 8 }}><Objectives game={game} /></div>}
      {children}
    </div>
  )
}

const DAY_TEXT = ['Thursday', 'Friday practice', 'Saturday morning', 'Sunday morning']

// A race-weekend incident on the day it happens; the weekend waits for an answer.
export function Incident({ game, act }) {
  const w = game.weekend
  const inc = w.incident
  const due = !!incidentDue(game)
  const ref = useRef(null)
  useEffect(() => { if (due) ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }, [due])
  if (!inc || !(due || inc.shownIn === w.phase)) return null
  return (
    <div ref={ref}><DecisionPanel game={game} act={act} dec={inc} heading={`Incident · ${DAY_TEXT[inc.day]}`} className="incident"
      onChoose={(k) => act((g) => { g.weekend.incident.shownIn = g.weekend.phase; resolveIncident(g, k) })} /></div>
  )
}
