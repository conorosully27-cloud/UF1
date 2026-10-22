// Friday: practice.

import React from 'react'
import { setWing, toQualifying, playsQualifying, runPractice, incidentDue } from '../engine/live.js'
import { seatDriverId, setBalance, setRunKind, BALANCE_LABELS, SETUP } from '../engine/practice.js'
import { TRACK_BY_ID } from '../engine/data/tracks.js'
import { driverColor, lapTime } from './format.js'
import { WING_LABELS, COND, Seg, Help, DriverTag, dc, Head, Incident } from './weekendParts.jsx'

const BALANCE_OPTS = BALANCE_LABELS.map((l, i) => [i - 2, l])

export function Practice({ game, act }) {
  const w = game.weekend
  const track = TRACK_BY_ID[game.calendar[game.round]]
  const p = w.practice
  const ids = [0, 1].map((slot) => seatDriverId(game, slot))
  const left = Math.max(...p.cars.map((c) => c.left))
  const quali = playsQualifying(game)
  // The track for the next run, as the cars go out: rain is visible from the garage.
  const next = left > 0 && w.friday ? w.friday[SETUP.runs - left] : null
  return (
    <div>
      <Head title={track.name} chip={next ? COND[next] : `Round ${game.round + 1} of ${game.calendar.length}`} right="Practice" />
      <Incident game={game} act={act} />
      <div className="cols">
        {ids.map((id, slot) => {
          const c = p.cars[slot]
          const a = w.wingAdvice[slot]
          const best = c.runs.filter((r) => r.kind === 'setup' && r.time != null).reduce((m, r) => Math.min(m, r.time), Infinity)
          return (
            <section key={id} className="panel practice-car" style={{ '--dc': driverColor(game, id, slot) }}>
              <div className="line"><DriverTag game={game} id={id} slot={slot} /><span className="muted small">{c.left} of {SETUP.runs} runs left</span></div>
              <div className="ctl">
                <span>Wing</span><Seg options={WING_LABELS.map((l, i) => [i + 1, `${i + 1}`])} value={w.wing[slot]} onPick={(v) => act((g) => setWing(g, slot, v))} />
                <span>Balance</span><Seg options={BALANCE_OPTS} value={c.balance} onPick={(v) => act((g) => setBalance(g, slot, v))} />
                <span>Next run</span><Seg options={[['setup', 'Setup run'], ['long', 'Long run']]} value={c.kind} disabled={!c.left} onPick={(v) => act((g) => setRunKind(g, slot, v))} />
              </div>
              <div className="meta">Engineers' wing: {a.level}{a.sure ? '' : ' (a guess)'}{c.longRun ? ' · long run done: less tyre wear on Sunday' : ''}</div>
              {c.runs.length > 0 && (
                <ol className="runs">
                  {c.runs.slice().reverse().map((r) => (
                    <li key={r.n}>
                      <div className="rhead"><b>Run {r.n}</b><span className="muted">{r.kind === 'long' ? 'Long run' : `Wing ${r.wing} · ${BALANCE_LABELS[r.balance + 2]}`}{r.wet ? ' · wet' : ''}</span><span className={`t${r.kind === 'setup' && r.time === best ? ' best' : ''}`}>{r.crash ? 'Crashed' : r.kind === 'long' ? `avg ${lapTime(r.time)}` : lapTime(r.time)}</span></div>
                      {r.notes.map((n, i) => <div key={i} className="quote">"{n}"</div>)}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )
        })}
      </div>
      <Help>Set the wing and balance, send the cars out and listen to the drivers: their feedback (and the lap time) says which way to go. Low drag is quicker on the straights; high downforce suits twisty tracks, and rain wants more wing. A driver with good Feedback, strong race engineers and a better simulator read the car more clearly. A long run teaches the driver how the tyres go off: a little less wear in the race. A wet run says little about the dry setup. The setup is locked once qualifying starts.</Help>
      <fieldset className="controls" disabled={!!incidentDue(game)}>
        {left > 0 && <button className="primary" onClick={() => act((g) => runPractice(g))}>Send the cars out</button>}
        <button className={left > 0 ? '' : 'primary'} onClick={() => act((g) => toQualifying(g))}>{quali ? 'To qualifying' : 'To the grid'}</button>
        {quali && <button className="ghost" onClick={() => act((g) => toQualifying(g, { skipQuali: true }))}>Skip qualifying</button>}
      </fieldset>
    </div>
  )
}
