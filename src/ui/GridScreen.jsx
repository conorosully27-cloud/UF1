// Sunday morning: the grid.

import React from 'react'
import { PLAYER } from '../engine/game.js'
import { TYRES, ORDERS, planRest } from '../engine/weekend.js'
import { setStartTyre, setOrders, startRace, incidentDue } from '../engine/live.js'
import { TrackMap, gridSnapshot } from './RaceMap.jsx'
import { carCode, teamColor, ordinal, gap, lapTime } from './format.js'
import { SLICKS, COND, Seg, Help, DriverTag, myCars, dc, Head, Incident } from './weekendParts.jsx'

function planText(st, c, comp) {
  const p = planRest(st, c, 0, comp, 0, false)
  if (!p.stops.length) return { text: 'no stop', cost: p.cost }
  return { text: [comp, ...p.stops.map((s) => s.comp)].join(' → ') + ` · stop${p.stops.length > 1 ? 's' : ''} lap ${p.stops.map((s) => s.lap).join(' and ')}`, cost: p.cost }
}

function QualiTower({ game, st }) {
  const name = (id) => game.drivers[id]?.name ?? id
  return (
    <ol className="tower">
      {st.quali.map((q) => {
        const c = st.cars.find((k) => k.id === q.id)
        const me = q.teamId === PLAYER
        return (
          <React.Fragment key={q.id}>
            <li className={`trow${me ? ' me' : ''}`} style={me ? dc(game, c) : undefined}>
              <span className="p">{q.pos}</span><span className="bar" style={{ background: me ? 'var(--dc)' : teamColor(game, q.teamId) }} />
              <span className="code">{carCode(name(q.id))}</span><span className="team">{game.teams[q.teamId].name}{q.session && q.session < 3 ? ` · Q${q.session}` : ''}</span>
              <span className="g">{q.noTime ? 'No time' : q.pos === 1 ? 'Pole' : q.session && q.session < 3 ? <span className="muted">{lapTime(q.time)}</span> : gap(q.gap)}</span><span className="stops">{q.grid !== q.pos ? `→${q.grid}` : ''}</span><span />
            </li>
            {(q.pos === 10 || q.pos === 17) && <li className="cutoff" />}
          </React.Fragment>
        )
      })}
    </ol>
  )
}

export function GridScreen({ game, act }) {
  const w = game.weekend
  const st = w.state
  const wetStart = st.cond[0] !== 'dry'
  return (
    <div>
      <Head title={st.track.name} chip={`Race ${COND[st.cond[0]]}`} right="On the grid" game={game} />
      <Incident game={game} act={act} />
      <div className="race-grid">
        <section className="panel flush"><h3>Qualifying</h3><QualiTower game={game} st={st} /></section>
        <div className="race-side">
          <section className="panel">
            <TrackMap game={game} st={st} snap={gridSnapshot(st)} />
          </section>
          <section className="panel">
            <div className="cars">
              {myCars(st).map((c) => {
                const comps = wetStart ? ['I', 'W'] : SLICKS
                const plans = Object.fromEntries(comps.map((k) => [k, wetStart ? null : planText(st, c, k)]))
                const best = wetStart ? 0 : Math.min(...comps.map((k) => plans[k].cost))
                return (
                  <div className="car" key={c.id} style={dc(game, c)}>
                    <div className="head"><span className="pos">P{c.grid}</span><DriverTag game={game} id={c.id} slot={c.e.slot} /><span className="meta">qualified {ordinal(c.qPos)}</span></div>
                    <div className="ctl">
                      <span>Tyres</span><Seg options={comps.map((k) => [k, TYRES[k].name])} value={c.tyre} onPick={(k) => act((g) => setStartTyre(g, c.id, k))} />
                      <span>Lap one</span><Seg options={Object.entries(ORDERS.lap1).map(([k, o]) => [k, k === 'careful' ? 'Careful' : o.label])} value={c.orders.lap1} onPick={(k) => act((g) => setOrders(g, c.id, { lap1: k }))} />
                    </div>
                    {!wetStart && <div className="meta">{plans[c.tyre].text}{plans[c.tyre].cost - best > 0.5 ? ` · ${(plans[c.tyre].cost - best).toFixed(0)} s slower than the best` : ' · quickest plan'}</div>}
                  </div>
                )
              })}
            </div>
            <Help>Each start tyre leads to a different plan; the strategist's estimate of each is shown. A dry race must use two dry compounds. Attack on lap one gains places on average but risks the first-corner incidents; Careful stays out of trouble.</Help>
          </section>
        </div>
      </div>
      <fieldset className="controls" disabled={!!incidentDue(game)}>
        <button className="primary" onClick={() => act((g) => startRace(g))}>Lights out</button>
      </fieldset>
    </div>
  )
}
