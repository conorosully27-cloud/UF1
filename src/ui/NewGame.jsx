import React, { useMemo, useState } from 'react'
import { POOL_DRIVERS, overall } from '../engine/data/drivers.js'
import { SUPPLIERS } from '../engine/data/suppliers.js'
import { signingTerms } from '../engine/contracts.js'
import { START_REPUTATION } from '../engine/game.js'
import { PLAYER_COLORS } from '../engine/data/teams.js'
import { money } from './format.js'

export default function NewGame({ onStart }) {
  const [seed] = useState(() => (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0)
  const [teamName, setTeamName] = useState('')
  const [supplier, setSupplier] = useState('ferrari')
  const [difficulty, setDifficulty] = useState('normal')
  const [d1, setD1] = useState('')
  const [d2, setD2] = useState('')
  const [reserve, setReserve] = useState('')
  const [color, setColor] = useState(PLAYER_COLORS[0])
  const [involvement, setInvolvement] = useState('live')

  const pool = useMemo(() => POOL_DRIVERS
    .map((d) => ({ d, ovr: overall(d), terms: signingTerms(d, START_REPUTATION, seed, 1) }))
    .sort((a, b) => b.ovr - a.ovr), [seed])
  const suppliers = Object.values(SUPPLIERS)
  const ready = teamName.trim() && d1 && d2 && d1 !== d2 && reserve !== d1 && reserve !== d2
  const pick = (value, set, allowNone) => (
    <select value={value} onChange={(e) => set(e.target.value)}>
      <option value="">{allowNone ? 'None' : 'Choose…'}</option>
      {pool.filter((p) => p.terms.possible).map((p) => <option key={p.d.id} value={p.d.id}>{p.d.name} ({p.ovr})</option>)}
    </select>
  )

  return (
    <div className="app">
      <div className="top"><h1>Ultimate F1 Manager</h1><span className="stat">New team for the 2027 season</span></div>
      <div className="panel">
        <p><label>Team name <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Your team" /></label></p>
        <p>Team colour</p>
        <div className="swatches">
          {PLAYER_COLORS.map((c) => <button key={c} aria-label={`Team colour ${c}`} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => { setColor(c); document.documentElement.style.setProperty('--accent', c) }} />)}
        </div>
        <p>
          <label>Power unit{' '}
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id} disabled={s.minReputation > START_REPUTATION}>
                  {s.name}: Power {s.power - 1}, Reliability {s.reliability}, {money(s.price, 0)} a season{s.minReputation > START_REPUTATION ? ` (needs reputation ${s.minReputation})` : ''}
                </option>
              ))}
            </select>
          </label>
        </p>
        <p>
          <label>Difficulty{' '}
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option>
            </select>
          </label>
        </p>
        <p>
          <label>Race weekends{' '}
            <select value={involvement} onChange={(e) => setInvolvement(e.target.value)}>
              <option value="live">On the pit wall: make the calls during the race</option>
              <option value="quick">Quick sim: one click a weekend</option>
            </select>
          </label>
        </p>
        <p><label>Race driver 1 {pick(d1, setD1)}</label><label>Race driver 2 {pick(d2, setD2)}</label><label>Reserve (optional, a fifth of the salary) {pick(reserve, setReserve, true)}</label></p>
        <button className="primary" disabled={!ready} onClick={() => onStart({ seed, teamName: teamName.trim(), color, involvement, supplier, driverIds: [d1, d2], reserveId: reserve || null, difficulty })}>Start</button>
      </div>
      <h2>Available drivers</h2>
      <p className="muted">Interest of 60 signs at the asking salary. Below that the driver wants more money. Backing is an estimate until signed. Loan drivers come for one season at a reduced salary.</p>
      <div className="scroll">
        <table>
          <thead><tr><th>Driver</th><th className="n">Age</th><th className="n">Overall</th><th className="n">Pace</th><th className="n">Racecraft</th><th className="n">Consistency</th><th className="n">Wet</th><th className="n">Feedback</th><th className="n">Market.</th><th className="n">Interest</th><th className="n">Salary to sign</th><th>Backing</th><th>Route</th></tr></thead>
          <tbody>
            {pool.map(({ d, ovr, terms }) => (
              <tr key={d.id} className={[d1, d2, reserve].includes(d.id) ? 'me' : ''}>
                <td>{d.name}</td><td className="n">{d.age}</td><td className="n">{ovr}</td><td className="n">{d.pace}</td><td className="n">{d.racecraft}</td>
                <td className="n">{d.consistency}</td><td className="n">{d.wet}</td><td className="n">{d.feedback}</td><td className="n">{d.marketability}</td>
                <td className="n">{terms.interest}</td>
                <td className="n">{terms.possible ? money(terms.salary, 2) : '—'}</td>
                <td>{terms.backingHigh < 0.05 ? 'None' : `${money(terms.backingLow)}–${money(terms.backingHigh)}`}</td>
                <td>{!terms.possible ? 'Will not sign yet' : terms.loan ? `Loan from ${d.loanFrom}` : terms.premium > 1 ? `Wants ${Math.round((terms.premium - 1) * 100)}% over demand` : 'Signs at asking terms'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
