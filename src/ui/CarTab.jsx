import React, { useState } from 'react'
import { PLAYER, effectiveCar } from '../engine/core.js'
import {
  SIZES, APPROACHES, AREAS, capacity, expectedGain, projectCost, startProject, cancelProject, chassisCap, diminishing,
  tighteningPlan, rollWidth, TIGHTENING,
} from '../engine/development.js'
import { money, pct } from './format.js'
import CarView from './CarView.jsx'

const describe = (p) => `${SIZES[p.size].label} ${AREAS[p.area].label}, ${APPROACHES[p.approach].label.toLowerCase()}${p.rush ? ', rushed' : ''}`

export default function CarTab({ game, act }) {
  const [area, setArea] = useState('aero')
  const [size, setSize] = useState('minor')
  const [approach, setApproach] = useState('standard')
  const [rush, setRush] = useState(false)
  const car = game.teams[PLAYER].car
  const eff = effectiveCar(game, PLAYER)
  const cap = capacity(game)
  const dev = game.dev
  const exp = expectedGain(game, area, size, approach)
  const cost = projectCost(game, size, rush)
  const pool = AREAS[area].pool
  const spec = { area, size, approach, rush }
  const sameSpec = (a) => !!a && a.area === area && a.size === size && a.approach === approach && !!a.rush === rush
  const share = dev.nextYearShare
  const hard = tighteningPlan(game)

  return (
    <div>
      <h2>Car</h2>
      <CarView game={game} />
      <table>
        <thead><tr><th>Rating</th><th className="n">Now</th><th className="n">As raced</th><th className="n">Gain per unit of work</th><th>Winter loss</th></tr></thead>
        <tbody>
          {Object.entries(AREAS).map(([id, a]) => (
            <tr key={id}>
              <td>{a.label}</td><td className="n">{car[id].toFixed(1)}</td><td className="n">{eff[id].toFixed(1)}</td>
              <td className="n">{pct(diminishing(car[id]))}</td>
              <td>{id === 'aero' || id === 'chassis' ? (game.tighteningKnown ? pct(id === hard ? TIGHTENING.hard : TIGHTENING.soft) : `${pct(TIGHTENING.soft)} or ${pct(TIGHTENING.hard)}, announced after round 8`) : pct(TIGHTENING[id])}</td>
            </tr>
          ))}
          <tr><td>Power</td><td className="n">{eff.power}</td><td className="n">{eff.power}</td><td className="n">—</td><td>From the supplier</td></tr>
        </tbody>
      </table>
      <p className="muted">
        "As raced" includes the power unit's reliability and any part still in its first race.
        {game.partsPackage && <> Chassis is limited to {chassisCap(game).toFixed(0)} while you use the bought-in parts package.</>}
      </p>

      <h2>Capacity</h2>
      <p>
        Aero <b>{cap.aero.toFixed(2)}</b> units a round (testing allowance {pct(game.atr[PLAYER])}) · Mechanical <b>{cap.mech.toFixed(2)}</b> · Factory can build <b>{cap.build.toFixed(2)}</b>.
        Ten units make one rating point at 100% gain.
      </p>
      <p>
        <label>Share of design work banked for next year's car: <b>{share}%</b>{' '}
          <input type="range" min="0" max="100" step="10" value={share} onChange={(e) => act((g) => { g.dev.nextYearShare = Number(e.target.value) })} />
        </label>
      </p>
      <p className="muted">
        Banked so far: {dev.banked.aero.toFixed(1)} aero units, {dev.banked.mech.toFixed(1)} mechanical units (60% to Chassis, 20% each to Tyre Care and Reliability).
        Banked work costs nothing to build and is added after the winter's rule change. Designers with nothing queued bank their work too.
      </p>

      <h2>Start an upgrade</h2>
      <div className="panel">
        <label>Area <select value={area} onChange={(e) => setArea(e.target.value)}>{Object.entries(AREAS).map(([id, a]) => <option key={id} value={id}>{a.label}</option>)}</select></label>
        <label>Size <select value={size} onChange={(e) => setSize(e.target.value)}>{Object.entries(SIZES).map(([id, s]) => <option key={id} value={id}>{s.label} ({s.units} units)</option>)}</select></label>
        <label>Approach <select value={approach} onChange={(e) => setApproach(e.target.value)}>{Object.entries(APPROACHES).map(([id, a]) => <option key={id} value={id}>{a.label}</option>)}</select></label>
        <label><input type="checkbox" checked={rush} onChange={(e) => setRush(e.target.checked)} /> Rush the build (+50% cost)</label>
        <p>
          Expected gain <b>+{exp.expected.toFixed(2)}</b>, likely between +{exp.low.toFixed(2)} and +{exp.high.toFixed(2)}
          {exp.dud > 0 && <>, with a {pct(exp.dud)} chance of no gain</>} · cost <b>{money(cost, 2)}</b> ·
          design takes about {Math.ceil(SIZES[size].units / Math.max(0.01, cap[pool] * (1 - share / 100)))} rounds at the current share.
          Outcome range ±{pct(rollWidth(game, pool) * APPROACHES[approach].width)}.
        </p>
        <button className="primary" onClick={() => act((g) => { startProject(g, spec) })}>Start</button>
        <label className="gap">
          <input type="checkbox" checked={sameSpec(dev.repeat[pool])} onChange={(e) => act((g) => { g.dev.repeat[pool] = e.target.checked ? spec : null })} />
          {' '}Keep starting this whenever the {pool === 'aero' ? 'aero' : 'mechanical'} designers run out of work
        </label>
        {dev.repeat[pool] && !sameSpec(dev.repeat[pool]) && <p className="muted">Currently repeating: {describe(dev.repeat[pool])}</p>}
      </div>

      <div className="row">
        {['aero', 'mech'].map((p) => (
          <div key={p}>
            <h3>{p === 'aero' ? 'Aero' : 'Mechanical'} design queue</h3>
            {dev.queues[p].length === 0 ? <p className="muted">Empty{dev.repeat[p] ? `: will repeat ${describe(dev.repeat[p])}` : ''}</p> : (
              <table><tbody>
                {dev.queues[p].map((q) => (
                  <tr key={q.id}><td>{describe(q)}</td><td className="n">{q.done.toFixed(1)} / {q.units}</td>
                    <td><button onClick={() => act((g) => cancelProject(g, q.id))}>Cancel</button></td></tr>
                ))}
              </tbody></table>
            )}
          </div>
        ))}
        <div>
          <h3>Being built</h3>
          {dev.builds.length === 0 ? <p className="muted">Nothing in the factory</p> : (
            <table><tbody>{dev.builds.map((q) => <tr key={q.id}><td>{describe(q)}</td><td className="n">{q.buildDone.toFixed(1)} / {q.units}</td></tr>)}</tbody></table>
          )}
        </div>
      </div>

      <h3>Upgrades fitted</h3>
      {dev.log.length === 0 ? <p className="muted">None yet.</p> : (
        <table>
          <thead><tr><th>Season</th><th>Round</th><th>Upgrade</th><th className="n">Gain</th></tr></thead>
          <tbody>
            {dev.log.slice(-12).reverse().map((l, i) => (
              <tr key={i}><td>{l.season}</td><td>{l.round + 1}</td><td>{SIZES[l.size].label} {AREAS[l.area].label}, {APPROACHES[l.approach].label.toLowerCase()}</td>
                <td className={`n ${l.dud ? 'bad' : ''}`}>{l.dud ? 'No gain' : `+${l.gain.toFixed(2)}`}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
