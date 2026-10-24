import React, { useEffect, useState } from 'react'
import Face from './Face.jsx'
import { faceTraits, MOODS, SHAPES, SKIN, HAIR, STYLES, FACIAL } from './faces.js'
import { RACE_DRIVERS, POOL_DRIVERS } from '../engine/data/drivers.js'
import { TEAMS } from '../engine/data/teams.js'

// Every face in the game, and each trait one at a time (VISUALS.md, V1).
// Opened with ?faces on the game's address, for checking the look.

const teamColor = (id) => TEAMS.find((t) => t.id === id)?.color ?? '#8b93a3'
const GENERATED = Array.from({ length: 12 }, (_, i) => ({ id: `gen-${i + 1}`, name: `Generated ${i + 1}`, age: 17 + ((i * 7) % 15) }))
const SAMPLE = { id: 'sample', name: 'Sample', age: 27 }

function Card({ driver, color, label, sub, ...rest }) {
  return (
    <div className="face-card">
      <Face driver={driver} color={color} size={96} {...rest} />
      <div>{label ?? driver.name}</div>
      {sub && <div className="muted">{sub}</div>}
    </div>
  )
}

function Row({ title, note, children }) {
  return (
    <>
      <h2>{title}</h2>
      {note && <p className="muted">{note}</p>}
      <div className="faces-grid">{children}</div>
    </>
  )
}

export default function FaceGallery() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('uf1-theme') || 'dark' } catch { return 'dark' } })
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const base = faceTraits(SAMPLE)
  const color = '#ff5a36'
  return (
    <div className="app">
      <div className="top">
        <h1>Faces</h1>
        <span className="menu"><button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button> <a href="./">Back to the game</a></span>
      </div>
      <Row title="Race drivers" note="Placeholder looks, rolled from each driver's id, until the real ones are set from photos in src/ui/data/looks.js.">
        {RACE_DRIVERS.map((d) => <Card key={d.id} driver={d} color={teamColor(d.team)} sub={`${d.age}`} />)}
      </Row>
      <Row title="Free agents and juniors">
        {POOL_DRIVERS.map((d) => <Card key={d.id} driver={d} sub={`${d.age}`} />)}
      </Row>
      <Row title="Generated drivers">
        {GENERATED.map((d) => <Card key={d.id} driver={d} color={color} sub={`${d.age}`} />)}
      </Row>
      <Row title="Moods" note="Contract talks will show how keen a driver is; the debrief, how they feel about the race.">
        {MOODS.map(([m, label]) => <Card key={m} driver={SAMPLE} color={color} mood={m} label={label} />)}
      </Row>
      <Row title="Ageing" note="Hair greys from an age each driver rolls; some hairlines recede, and lines come in the late thirties.">
        {[20, 30, 36, 41, 46].map((a) => <Card key={a} driver={SAMPLE} color={color} traits={{ ...base, greyAge: 33, recedeAge: 36 }} age={a} label={`Age ${a}`} />)}
      </Row>
      <Row title="Hair styles">
        {STYLES.map((s) => <Card key={s} driver={SAMPLE} color={color} traits={{ ...base, style: s, recedeAge: null }} label={s} />)}
      </Row>
      <Row title="Face shapes">
        {Object.keys(SHAPES).map((s) => <Card key={s} driver={SAMPLE} color={color} traits={{ ...base, shape: s }} label={s} />)}
      </Row>
      <Row title="Skin tones">
        {SKIN.map((_, i) => <Card key={i} driver={SAMPLE} color={color} traits={{ ...base, skin: i }} label={`${i}`} />)}
      </Row>
      <Row title="Hair colours">
        {Object.keys(HAIR).map((h) => <Card key={h} driver={SAMPLE} color={color} traits={{ ...base, hair: h }} label={h} />)}
      </Row>
      <Row title="Facial hair and glasses" note="Rolled faces have none: they are set per driver in looks.js.">
        {FACIAL.map((f) => <Card key={f} driver={SAMPLE} color={color} traits={{ ...base, facial: f }} label={f} />)}
        <Card driver={SAMPLE} color={color} traits={{ ...base, glasses: true }} label="glasses" />
      </Row>
    </div>
  )
}
