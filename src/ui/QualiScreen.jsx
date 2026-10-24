// Saturday: qualifying, played against the session clock.

import React, { useEffect, useRef, useState } from 'react'
import { qualiDrop, QUALI_MINUTES } from '../engine/weekend.js'
import { runQualifying, setQualiPlan, setTow, qualiOutlook, startSession, finishSession, setLateRun, doneWatching, incidentDue } from '../engine/live.js'
import { carCode, teamColor, lapTime } from './format.js'
import { COND, Seg, Help, DriverTag, TowerFace, myCars, dc, Head, Incident } from './weekendParts.jsx'

const PLAN_OPTS = [[2, 'Two runs'], [1, 'One late run']]

const PUSH_OPTS = [['normal', 'Normal'], ['big', 'Big-risk']]

function SessionTower({ game, ses }) {
  const st = game.weekend.state
  const name = (id) => game.drivers[id]?.name ?? id
  const best = ses.rows[0].time
  const cut = ses.rows.length - ses.drop
  return (
    <ol className="tower">
      {ses.rows.map((r) => {
        const c = st.cars[r.idx]
        const note = r.laps.some((l) => l.crash) ? 'crash' : r.laps.some((l) => l.flagged) && r.time === null ? 'flagged' : r.error ? 'mistake' : ''
        return (
          <React.Fragment key={r.id}>
            <li className={`trow${c.e.isPlayer ? ' me' : ''}${r.out ? ' out' : ''}`} style={c.e.isPlayer ? dc(game, c) : undefined}>
              <span className="p">{r.pos}</span><span className="bar" style={{ background: c.e.isPlayer ? 'var(--dc)' : teamColor(game, c.e.teamId) }} /><TowerFace game={game} id={r.id} teamId={c.e.teamId} />
              <span className="code">{carCode(name(r.id))}</span><span className="team">{c.e.teamName}{note ? ` · ${note}` : ''}</span>
              <span className="g">{r.time === null ? 'No time' : r.pos === 1 ? lapTime(st.track.baseLap + r.time) : `+${(r.time - best).toFixed(3)}`}</span><span /><span />
            </li>
            {r.pos === cut && ses.drop > 0 && <li className="cutoff" />}
          </React.Fragment>
        )
      })}
    </ol>
  )
}

// A session plays out against its clock: about this many seconds for a whole session.
const SESSION_PLAY = 16

// The session clock: runs from where it is up to `to`, then stops. `key` starts it afresh.
function useSessionClock(key, from, to, len) {
  const [clock, setClock] = useState({ key, tau: from })
  const tau = clock.key === key ? clock.tau : from
  useEffect(() => {
    if (clock.key !== key) setClock({ key, tau: from })
  }, [key, from, clock.key])
  useEffect(() => {
    if (tau >= to) return undefined
    let raf
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      setClock((c) => (c.key !== key ? c : { key, tau: Math.min(to, c.tau + (dt * len) / SESSION_PLAY) }))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key, to, len, tau >= to])
  return [tau, (t) => setClock({ key, tau: t })]
}

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

// The tower as the session stands at `tau` seconds: each car's best lap so far.
function LiveSessionTower({ game, st, rows, tau, drop }) {
  const name = (id) => game.drivers[id]?.name ?? id
  const list = rows.map((r) => {
    const done = r.laps.filter((l) => l.at <= tau)
    const times = done.filter((l) => l.time !== null).map((l) => l.time)
    const note = done.some((l) => l.crash) ? 'crash' : done.some((l) => l.flagged) && !times.length ? 'flagged' : done.some((l) => l.error) ? 'mistake' : ''
    return { r, c: st.cars[r.idx], time: times.length ? Math.min(...times) : null, note, fresh: done.some((l) => l.time !== null && tau - l.at < 30) }
  }).sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9) || a.c.qBase - b.c.qBase)
  const best = list[0]?.time
  const cut = list.length - drop
  return (
    <ol className="tower">
      {list.map((x, i) => (
        <React.Fragment key={x.r.id}>
          <li className={`trow${x.c.e.isPlayer ? ' me' : ''}${x.fresh ? ' fresh' : ''}${drop && i >= cut && x.time !== null ? ' danger' : ''}`} style={x.c.e.isPlayer ? dc(game, x.c) : undefined}>
            <span className="p">{i + 1}</span><span className="bar" style={{ background: x.c.e.isPlayer ? 'var(--dc)' : teamColor(game, x.c.e.teamId) }} /><TowerFace game={game} id={x.r.id} teamId={x.c.e.teamId} />
            <span className="code">{carCode(name(x.r.id))}</span><span className="team">{x.c.e.teamName}{x.note ? ` · ${x.note}` : ''}</span>
            <span className="g">{x.time === null ? <span className="muted">{x.r.note === 'damaged' ? 'No car' : '—'}</span> : i === 0 ? lapTime(st.track.baseLap + x.time) : `+${(x.time - best).toFixed(3)}`}</span><span /><span />
          </li>
          {drop > 0 && i === cut - 1 && <li className="cutoff" />}
        </React.Fragment>
      ))}
    </ol>
  )
}

export function QualiScreen({ game, act }) {
  const w = game.weekend
  const st = w.state
  const qs = st.qs
  const cur = qs.current
  const replay = w.qReplay != null ? qs.sessions[w.qReplay] : null
  const mode = replay ? 'late' : cur ? 'call' : 'plan'
  const s = replay ? replay.s : cur ? cur.s : qs.session
  const len = QUALI_MINUTES[Math.min(s, 2)] * 60
  const call = replay?.call ?? cur?.call ?? Math.round(len * 0.6)
  // The first runs play from the start when the session has just begun here; otherwise the clock waits at the call.
  const started = useRef(null)
  const [tau, setTau] = useSessionClock(`${mode}-${s}`, mode === 'late' ? call : mode === 'call' && started.current === s ? 0 : call, mode === 'late' ? len : call, len)
  const o = mode === 'plan' ? qualiOutlook(game) : null
  const last = qs.sessions[qs.sessions.length - 1]
  const ids = Object.keys(w.qChoices)
  const mine = myCars(st)
  const slot = qs.slots[Math.min(s, 2) * 2 + (tau >= call && mode !== 'plan' ? 1 : 0)]
  const flagOut = replay?.flagAt != null && tau >= replay.flagAt
  const ended = mode === 'late' && tau >= len
  const rows = mode === 'late' ? replay.rows : cur?.rows ?? []
  const drop = mode === 'late' ? replay.drop : qualiDrop(qs.left.length, s)
  const start = () => { started.current = qs.session; act((g) => startSession(g)) }
  // With none of your cars left to decide for, the session runs straight on.
  const nothingToCall = mode === 'call' && !Object.keys(w.lateChoices ?? {}).length
  useEffect(() => {
    if (nothingToCall && tau >= call) act((g) => finishSession(g, { watch: true }))
  }, [nothingToCall, tau >= call])
  return (
    <div>
      <Head title={st.track.name} chip={COND[slot]} right={mode === 'plan' ? `Q${s + 1}` : ended ? `Q${s + 1} · FINISHED` : `Q${s + 1} · ${mmss(len - tau)}`} game={game}>
        {mode !== 'plan' && !ended && flagOut && <div className={`banner ${replay.flag === 'red' ? 'red' : ''}`}>{replay.flag === 'red' ? '■ Red flag' : '⚠ Yellow flag'}</div>}
      </Head>
      <Incident game={game} act={act} />
      <div className="race-grid">
        <section className="panel flush">
          {mode === 'plan' ? <>
            <h3>{last ? `Q${last.s + 1} result${last.flag ? ` · ${last.flag} flag` : ''}` : 'Qualifying'}</h3>
            {last ? <SessionTower game={game} ses={last} /> : <p className="muted" style={{ padding: '0 12px 10px' }}>Q1: all {o.n} cars, the slowest {o.drop} are out. Q2: the next {qualiDrop(o.n - o.drop, 1)} go. Q3: the top ten fight for pole.</p>}
          </> : <>
            <h3>{ended ? `Q${s + 1} result${replay.flag ? ` · ${replay.flag} flag` : ''}` : `Q${s + 1} · live timing`}</h3>
            {ended ? <SessionTower game={game} ses={replay} /> : <LiveSessionTower game={game} st={st} rows={rows} tau={tau} drop={drop} />}
          </>}
        </section>
        <div className="race-side">
          {mode === 'plan' && o && <PlanPanel game={game} act={act} o={o} ids={ids} mine={mine} s={s} />}
          {mode === 'call' && tau < call && (
            <section className="panel"><div className="kicker">Q{s + 1} · first runs</div><p className="small">The cars doing two runs set their banker laps. The rest wait for the end of the session, when the track is quickest.</p></section>
          )}
          {mode === 'call' && tau >= call && <FinalRuns game={game} act={act} cur={cur} s={s} />}
          {mode === 'late' && !ended && (
            <section className="panel"><div className="kicker">Q{s + 1} · final runs</div><p className="small">{flagOut ? (replay.flag === 'red' ? 'A crash brings out the red flag: anyone still on a lap loses it.' : 'A yellow flag: laps through it do not count.') : 'Everyone is out for the final runs. The track is at its quickest.'}</p></section>
          )}
          {w.qRadio?.length > 0 && (mode === 'plan' || ended) && (
            <section className="panel flush"><h3>Team radio</h3>
              <ul className="feed">{[...w.qRadio].reverse().map((x, i) => {
                const c = st.cars.find((k) => k.id === x.id)
                return <li key={i} className="mine" style={c ? dc(game, c) : undefined}><span className="l">Q{x.session}</span>{x.text}</li>
              })}</ul>
            </section>
          )}
        </div>
      </div>
      <fieldset className="controls" disabled={!!incidentDue(game)}>
        {mode === 'plan' && (ids.length ? <>
          <button className="primary" onClick={start}>▶ Start Q{s + 1}</button>
          <button className="ghost" onClick={() => act((g) => runQualifying(g))}>Strategist runs qualifying</button>
        </> : <>
          <button className="primary" onClick={start}>▶ Watch Q{s + 1}</button>
          <button className="ghost" onClick={() => act((g) => runQualifying(g))}>Skip to the grid</button>
        </>)}
        {mode === 'call' && (tau < call
          ? <button onClick={() => setTau(call)}>⏭ To the final runs</button>
          : <button className="primary" onClick={() => act((g) => finishSession(g, { watch: true }))}>Send them out</button>)}
        {mode === 'late' && (ended
          ? <button className="primary" onClick={() => act((g) => doneWatching(g))}>{qs.done ? 'To the grid' : `On to Q${s + 2}`}</button>
          : <button onClick={() => setTau(len)}>⏭ To the flag</button>)}
      </fieldset>
    </div>
  )
}

// Before a session: each car's plan, and the tow.
function PlanPanel({ game, act, o, ids, mine, s }) {
  const w = game.weekend
  const st = w.state
  return (
    <section className="panel">
      <div className="kicker">Q{s + 1} · {o.n} cars{o.drop ? ` · slowest ${o.drop} out` : ' · shoot-out for pole'}</div>
      <p className="small">Now <b>{COND[o.early]}</b> · late in the session: <b>{o.late}</b></p>
      <div className="cars">
        {mine.map((c) => {
          const ch = w.qChoices[c.id]
          const info = o.cars[c.id]
          if (!ch) {
            return (
              <div className="car out" key={c.id} style={dc(game, c)}>
                <div className="head"><DriverTag game={game} id={c.id} slot={c.e.slot} /><span className="meta">{c.qCrash ? 'car damaged' : `out in Q${c.qOut}`}</span></div>
              </div>
            )
          }
          const followed = ch.runs === info.advice.runs && ch.push === info.advice.push
          return (
            <div className="car" key={c.id} style={dc(game, c)}>
              <div className="head"><DriverTag game={game} id={c.id} slot={c.e.slot} /><span className="meta">{info.sets} new Soft{info.sets === 1 ? '' : 's'}</span></div>
              <div className="meta">{info.outlook}</div>
              <div className="ctl">
                <span>Runs</span><Seg options={PLAN_OPTS} value={ch.runs} onPick={(v) => act((g) => setQualiPlan(g, c.id, { runs: v }))} />
                <span>Lap</span><Seg options={PUSH_OPTS} value={ch.push} onPick={(v) => act((g) => setQualiPlan(g, c.id, { push: v }))} />
              </div>
              <div className="meta">{followed ? '✓ Strategist\'s plan' : `Strategist: ${info.advice.runs === 1 ? 'one late run' : 'two runs'}, ${info.advice.push === 'big' ? 'big-risk' : 'normal'} lap`} · {info.why}</div>
              {info.sets < ch.runs && <div className="meta warn">Short of new tyres: a run on a used set (about 0.3 s slower).</div>}
            </div>
          )
        })}
      </div>
      {ids.length === 2 && (
        <div className="ctl tow">
          <span>Tow</span>
          <Seg options={[[null, 'None'], ...ids.map((id) => [id, `${carCode(st.cars.find((c) => c.id === id).e.name)} gets it`])]} value={w.tow?.taker ?? null} onPick={(v) => act((g) => setTow(g, v))} />
        </div>
      )}
      <Help>Two runs bank a lap early in case of a late flag or rain, and with the first lap on the board you can still decide to stay in and save a set of Softs. One late run saves a set and catches the quickest track, but a flag can leave you without a time. You have four new sets for the whole of qualifying. A big-risk lap is about 0.12 s quicker and three times likelier to go wrong. A tow is worth about {o.towGain.toFixed(2)} s here to the car behind and costs the other about 0.04 s.</Help>
    </section>
  )
}

// Halfway through a session: go out again, or stay in and save a set.
function FinalRuns({ game, act, cur, s }) {
  const w = game.weekend
  const st = w.state
  const ids = Object.keys(w.lateChoices ?? {})
  const withTime = cur.rows.filter((r) => r.laps.some((l) => l.time !== null)).sort((a, b) => Math.min(...a.laps.map((l) => l.time ?? 1e9)) - Math.min(...b.laps.map((l) => l.time ?? 1e9)))
  return (
    <section className="panel">
      <div className="kicker">Q{s + 1} · final runs</div>
      <p className="small">{withTime.length} of {cur.rows.length} cars have a time on the board; the rest go out at the end.</p>
      <div className="cars">
        {myCars(st).filter((c) => cur.rows.some((r) => r.id === c.id)).map((c) => {
          const row = cur.rows.find((r) => r.id === c.id)
          const ch = w.lateChoices?.[c.id]
          const lap = row.laps.find((l) => l.run === 0)
          const pos = withTime.indexOf(row) + 1
          if (!ch) return <div className="car out" key={c.id} style={dc(game, c)}><div className="head"><DriverTag game={game} id={c.id} slot={c.e.slot} /><span className="meta">{lap?.crash ? 'in the wall' : 'car damaged'}</span></div></div>
          const banked = lap && lap.time !== null
          return (
            <div className="car" key={c.id} style={dc(game, c)}>
              <div className="head"><DriverTag game={game} id={c.id} slot={c.e.slot} /><span className="meta">{c.sets} new Soft{c.sets === 1 ? '' : 's'} left</span></div>
              <div className="meta">{banked ? `First lap ${lapTime(st.track.baseLap + lap.time)}${lap.error ? ' (with a mistake)' : ''} · P${pos} of those with a time` : lap ? 'No time from the first run' : 'Waiting for one run at the end'}</div>
              <div className="ctl">
                <span>Final run</span><Seg options={[[true, 'Go again'], [false, 'Stay in']]} value={ch.go} disabled={!banked} onPick={(v) => act((g) => setLateRun(g, c.id, { go: v }))} />
                <span>Lap</span><Seg options={PUSH_OPTS} value={ch.push} disabled={!ch.go} onPick={(v) => act((g) => setLateRun(g, c.id, { push: v }))} />
              </div>
              <div className="meta">Strategist: {ch.why}</div>
            </div>
          )
        })}
      </div>
      {!ids.length && <p className="muted small">None of your cars is still running.</p>}
    </section>
  )
}
