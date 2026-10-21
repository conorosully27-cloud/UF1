import React, { useCallback, useEffect, useRef, useState } from 'react'
import { PLAYER } from '../engine/game.js'
import { TYRES, ORDERS, planRest, lapAt, tyreLife, wearRate, qualiDrop, QUALI_MINUTES } from '../engine/weekend.js'
import {
  setWing, runQualifying, setStartTyre, setOrders, startRace, answerCall, followStrategist, nextLap, playToMoment, setAutoCalls,
  finishWeekend, boxCar, objectivesNow, setQualiPlan, setTow, qualiOutlook, startSession, finishSession, setLateRun, doneWatching,
  beginPractice, toQualifying, playsPractice, playsQualifying, runPractice, incidentDue, resolveIncident,
} from '../engine/live.js'
import { DecisionPanel } from './M3Ui.jsx'
import { seatDriverId, setBalance, setRunKind, BALANCE_LABELS, SETUP } from '../engine/practice.js'
import { TRACK_BY_ID } from '../engine/data/tracks.js'
import { TrackLine } from './Weekend.jsx'
import { TrackMap, usePlayback, frameSnapshot, gridSnapshot, stateSnapshot } from './RaceMap.jsx'
import { carCode, teamColor, driverColor, ordinal, gap, lapTime } from './format.js'
import { useMoments } from './Moments.jsx'
import { lightsMoment, scMoment, redFlagMoment, outMoment, flagMoment, resultMoments, qualiMoments, podiumRunMoment, rainMoment, clashMoment, doubleOutMoment } from './raceMoments.js'

const SLICKS = ['S', 'M', 'H']
const WING_LABELS = ['Low drag', 'Low', 'Medium', 'High', 'High downforce']
const CALL_KINDS = { red: 'red flag', sc: 'safety car', vsc: 'virtual safety car', plan: 'pit window', cliff: 'tyres', rain: 'weather', drying: 'weather', damage: 'damage', 'compound rule': 'tyre rules', undercut: 'undercut', teammates: 'team orders' }
const COND = { dry: '☀ Dry', damp: '🌦 Damp', wet: '🌧 Wet' }
const SPEEDS = [1, 2, 4, 8, 16] // at 1x a lap takes LAP_SECONDS (5 s)
const LIGHTS_OUT_MS = 2600 // when the start lights go out (see .lights in styles.css)

export function Tyre({ comp, age, lg }) {
  return <span className={`tyre${lg ? ' lg' : ''}`} title={TYRES[comp].name}><i className={`ty-${comp}`}>{comp}</i>{age !== undefined && <small>{age}</small>}</span>
}

function Seg({ options, value, onPick, disabled }) {
  return (
    <div className="seg">
      {options.map(([k, label]) => <button key={String(k)} className={value === k ? 'on' : ''} disabled={disabled} onClick={() => onPick(k)}>{label}</button>)}
    </div>
  )
}

// A short explanation, folded away until asked for.
function Help({ title = 'How this works', children }) {
  return <details className="help"><summary>{title}</summary><div>{children}</div></details>
}

// One of your drivers, in their own colour.
export function DriverTag({ game, id, slot, name, code }) {
  const col = driverColor(game, id, slot)
  const full = name ?? game.drivers[id]?.name ?? id
  return <span className="dtag" style={{ '--dc': col }}><i />{code ? carCode(full) : full}</span>
}

const myCars = (st) => st.cars.filter((c) => c.e.isPlayer)
const stintAge = (st, c) => lapAt(st, st.seg) - c.stints[c.stints.length - 1].lap
const surname = (name) => name.split(' ').slice(-1)[0]
const dc = (game, c) => ({ '--dc': driverColor(game, c.id, c.e.slot) })

function Objectives({ game }) {
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

function Head({ title, chip, right, game, children }) {
  return (
    <div className="race-head">
      <div className="line"><span className="gp">{title}</span>{chip && <span className="chip">{chip}</span>}<span className="lap">{right}</span></div>
      {game && <div style={{ marginTop: 8 }}><Objectives game={game} /></div>}
      {children}
    </div>
  )
}

// ---- Incidents ----

const DAY_TEXT = ['Thursday', 'Friday practice', 'Saturday morning', 'Sunday morning']

// A race-weekend incident on the day it happens; the weekend waits for an answer.
function Incident({ game, act }) {
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

// ---- Thursday: the briefing ----

function Briefing({ game, act }) {
  const w = game.weekend
  const track = TRACK_BY_ID[game.calendar[game.round]]
  const f = w.forecast
  const strat = game.org.keyStaff.chiefStrategist.rating
  const practice = playsPractice(game)
  const quali = playsQualifying(game)
  const wear = track.wear >= 1.15 ? 'High' : track.wear <= 0.8 ? 'Low' : 'Average'
  return (
    <div>
      <Head title={track.name} chip={`Round ${game.round + 1} of ${game.calendar.length}`} right="Briefing" />
      <Incident game={game} act={act} />
      <p><TrackLine track={track} /></p>
      <div className="tiles">
        {f.practice != null && <div className="tile"><div className="kicker">Rain · practice</div><div className="big">{f.practice}%</div></div>}
        <div className="tile"><div className="kicker">Rain · qualifying</div><div className="big">{f.quali}%</div></div>
        <div className="tile"><div className="kicker">Rain · race</div><div className="big">{f.race}%</div></div>
        <div className="tile"><div className="kicker">Pit stop costs</div><div className="big">{track.pitLoss} s</div></div>
        <div className="tile"><div className="kicker">Tyre wear</div><div className="big">{wear}</div></div>
      </div>
      {(f.hint || f.qualiHint) && <p>{[f.qualiHint, f.hint].filter(Boolean).join('. ')}.</p>}
      <p className="muted small">Forecast from your Chief Strategist ({strat}): {f.sure ? 'reliable' : strat >= 55 ? 'a fair idea' : 'a guess'}.</p>
      <div className="panel">
        <div className="kicker">Objectives</div>
        <ul className="plain">{w.objectives.map((o, i) => <li key={i}>{o.text}</li>)}</ul>
      </div>
      {!practice && <p className="muted small">The engineers set the cars up: practice is off in the settings.</p>}
      <fieldset className="controls" disabled={!!incidentDue(game)}>
        {practice ? <>
          <button className="primary" onClick={() => act((g) => beginPractice(g))}>To practice</button>
          <button className="ghost" onClick={() => act((g) => toQualifying(g))}>Engineers run practice</button>
        </> : <button className="primary" onClick={() => act((g) => toQualifying(g))}>{quali ? 'To qualifying' : 'To the grid'}</button>}
        {quali && <button className="ghost" onClick={() => act((g) => toQualifying(g, { skipQuali: true }))}>Straight to the grid</button>}
      </fieldset>
    </div>
  )
}

// ---- Friday: practice ----

const BALANCE_OPTS = BALANCE_LABELS.map((l, i) => [i - 2, l])

function Practice({ game, act }) {
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

// ---- Saturday: qualifying ----

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
              <span className="p">{r.pos}</span><span className="bar" style={{ background: c.e.isPlayer ? 'var(--dc)' : teamColor(game, c.e.teamId) }} />
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
            <span className="p">{i + 1}</span><span className="bar" style={{ background: x.c.e.isPlayer ? 'var(--dc)' : teamColor(game, x.c.e.teamId) }} />
            <span className="code">{carCode(name(x.r.id))}</span><span className="team">{x.c.e.teamName}{x.note ? ` · ${x.note}` : ''}</span>
            <span className="g">{x.time === null ? <span className="muted">{x.r.note === 'damaged' ? 'No car' : '—'}</span> : i === 0 ? lapTime(st.track.baseLap + x.time) : `+${(x.time - best).toFixed(3)}`}</span><span /><span />
          </li>
          {drop > 0 && i === cut - 1 && <li className="cutoff" />}
        </React.Fragment>
      ))}
    </ol>
  )
}

function QualiScreen({ game, act }) {
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

// ---- The grid ----

function planText(st, c, comp) {
  const p = planRest(st, c, 0, comp, 0, false)
  if (!p.stops.length) return { text: 'no stop', cost: p.cost }
  return { text: [comp, ...p.stops.map((s) => s.comp)].join(' → ') + ` · stop${p.stops.length > 1 ? 's' : ''} lap ${p.stops.map((s) => lapAt(st, s.seg)).join(' and ')}`, cost: p.cost }
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

function GridScreen({ game, act }) {
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

// ---- Sunday ----

// The timing tower. While a lap plays back the order and gaps come from the
// playback; otherwise from the race as it stands.
function Tower({ game, st, snap, lastOrder }) {
  const rows = snap ? snap.order : st.order.map((i) => ({ c: st.cars[i], gap: null, tyre: st.cars[i].tyre }))
  const out = st.cars.filter((c) => c.status !== 'running' && !(snap && snap.order.some((r) => r.c === c))).sort((a, b) => b.dnfSeg - a.dnfSeg)
  const leader = rows[0]?.c
  return (
    <ol className="tower">
      {rows.map((r, i) => {
        const c = r.c
        const was = lastOrder ? lastOrder.indexOf(c.idx) : -1
        const moved = was >= 0 ? was - i : 0
        const secs = r.gap != null ? Math.max(0, r.gap) : c.t - leader.t
        // A car the leader has lapped shows laps, not seconds.
        const down = Math.floor(r.d != null ? rows[0].d - r.d : secs / st.track.baseLap)
        const g = i === 0 ? 'Leader' : down >= 1 ? `+${down} lap${down > 1 ? 's' : ''}` : `+${secs.toFixed(1)}`
        return (
          <React.Fragment key={c.id}>
            <li className={`trow${c.e.isPlayer ? ' me' : ''}${r.retiring ? ' out' : ''}`} style={c.e.isPlayer ? dc(game, c) : undefined}>
              <span className="p">{i + 1}</span><span className="bar" style={{ background: c.e.isPlayer ? 'var(--dc)' : teamColor(game, c.e.teamId) }} />
              <span className="code">{carCode(c.e.name)}{moved > 0 && <span className="up">▲{moved}</span>}{moved < 0 && <span className="down">▼{-moved}</span>}</span>
              <span className="team">{r.pit ? 'In the pits' : c.e.teamName}</span>
              <span className="g">{g}</span>
              <Tyre comp={r.tyre} age={snap ? undefined : stintAge(st, c)} /><span className="stops">{c.stops}</span>
            </li>
            {i === 9 && rows.length > 10 && <li className="cutoff" />}
          </React.Fragment>
        )
      })}
      {out.map((c) => (
        <li key={c.id} className={`trow out${c.e.isPlayer ? ' me' : ''}`} style={c.e.isPlayer ? dc(game, c) : undefined}>
          <span className="p">—</span><span className="bar" style={{ background: c.e.isPlayer ? 'var(--dc)' : teamColor(game, c.e.teamId) }} />
          <span className="code">{carCode(c.e.name)}</span><span className="team">{c.reason}</span><span className="g">DNF</span><span /><span />
        </li>
      ))}
    </ol>
  )
}

function CallCard({ game, act, call, answered }) {
  const st = game.weekend.state
  const c = st.cars.find((k) => k.id === call.carId)
  const strat = game.org.keyStaff.chiefStrategist.rating
  return (
    <section className="call" style={c ? dc(game, c) : undefined}>
      <div className="callhead">
        <span className="kicker">{CALL_KINDS[call.kind] ?? call.kind}</span>
        {c && <DriverTag game={game} id={c.id} slot={c.e.slot} />}
        <span className="muted small" title="How precise your Chief Strategist's estimates are">Strategist {strat} · {call.precision === 'sharp' ? 'sharp' : call.precision === 'rough' ? '±1 place' : 'a feel'}</span>
      </div>
      <h2>{call.title}</h2>
      <p>{call.text.replace(`${c?.e.name}: `, '')}</p>
      <div className="opts">
        {call.options.map((o) => (
          <button key={o.key} className={`opt${o.key === call.recommend ? ' rec' : ''}`} disabled={answered !== undefined} onClick={() => act((g) => answerCall(g, call.id, o.key))}>
            {o.key === call.recommend && <span className="tag">Strategist's pick</span>}
            <span>{answered === o.key ? '✓ ' : ''}{o.label}</span>
            <small>{/^(about P|P\d)/.test(call.estimateText[o.key]) ? `Finishing ${call.estimateText[o.key]}` : call.estimateText[o.key][0].toUpperCase() + call.estimateText[o.key].slice(1)}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

function CarCard({ game, act, st, c, w, row }) {
  const pos = row ? row.pos : st.order.indexOf(c.idx) + 1
  const running = c.status === 'running' || (row && !row.out)
  const life = tyreLife(c)
  const rate = wearRate(st, c)
  const lapsToCliff = Math.round((TYRES[c.tyre].life - c.wear) / rate)
  const cnd = st.cond[Math.min(st.seg, st.S - 1)]
  const comps = cnd === 'dry' ? SLICKS : ['I', 'W']
  const box = w.boxes?.[c.id]
  const last = [...w.radio].reverse().find((r) => r.id === c.id)
  const set = (k, v) => act((g) => setOrders(g, c.id, { [k]: v }))
  return (
    <div className={`car${running ? '' : ' out'}`} style={dc(game, c)}>
      <div className="head">
        <span className="pos">{running ? `P${pos}` : 'OUT'}</span><DriverTag game={game} id={c.id} slot={c.e.slot} />
        <span className="meta">{running ? <><Tyre comp={c.tyre} /> {stintAge(st, c)} laps · {c.stops} stop{c.stops === 1 ? '' : 's'}</> : c.reason}</span>
      </div>
      {running && <>
        <div className="wear"><div style={{ width: `${Math.min(100, life * 100)}%` }} /></div>
        <div className="meta">Tyres {Math.round(life * 100)}% worn · {lapsToCliff > 0 ? `cliff in ~${lapsToCliff} laps` : 'past the cliff'}{c.wingDamage > 0 ? ` · wing damage ${c.wingDamage.toFixed(1)} s/lap` : ''}</div>
        <div className="ctl">
          <span>Pace</span><Seg options={Object.entries(ORDERS.pace).map(([k, o]) => [k, k === 'save' ? 'Save' : o.label])} value={c.orders.pace} onPick={(k) => set('pace', k)} />
          <span>Racing</span><Seg options={Object.entries(ORDERS.stance).map(([k, o]) => [k, k === 'hold' ? 'Hold' : o.label])} value={c.orders.stance} onPick={(k) => set('stance', k)} />
          <span>Engine</span><Seg options={Object.entries(ORDERS.engine).map(([k, o]) => [k, o.label])} value={c.orders.engine} onPick={(k) => set('engine', k)} />
          <span>Box</span>
          <div className="seg">
            {comps.map((k) => <button key={k} className={box === k ? 'on' : ''} onClick={() => act((g) => boxCar(g, c.id, box === k ? null : k))}>{TYRES[k].name}</button>)}
          </div>
        </div>
        {box && <div className="meta warn">Boxing for {TYRES[box].name}s next. Tap again to cancel.</div>}
      </>}
      {last && <div className="radio">{last.text}</div>}
    </div>
  )
}

function Feed({ game, st, w, upto }) {
  const mine = new Set(myCars(st).map((c) => c.id))
  const items = []
  const otherStops = {}
  const events = st.events.slice(0, upto?.events ?? st.events.length).filter((e) => !upto || e.lap <= upto.lap || st.events.indexOf(e) < upto.before)
  for (const e of events) {
    if (e.type === 'quali') continue
    if (e.type === 'pit' && !e.ids.some((id) => mine.has(id)) && !e.text.startsWith('Slow')) {
      (otherStops[e.lap] ??= []).push(carCode(game.drivers[e.ids[0]]?.name ?? e.ids[0]))
      continue
    }
    const tag = e.type === 'sc' || e.type === 'vsc' ? ['sc', e.type.toUpperCase()] : e.type === 'red' ? ['red', 'RED'] : e.type === 'dnf' ? ['out', 'OUT'] : e.type === 'weather' ? ['wx', 'WX'] : e.type === 'pit' ? ['pit', 'PIT'] : null
    const c = e.ids.map((id) => st.cars.find((k) => k.id === id)).find((k) => k?.e.isPlayer)
    items.push({ lap: e.lap, tag, text: e.text, c })
  }
  for (const [lap, codes] of Object.entries(otherStops)) items.push({ lap: +lap, tag: ['pit', 'PIT'], text: codes.join(', ') })
  for (const r of w.radio) if (!upto || r.lap <= upto.lap) items.push({ lap: r.lap, tag: ['r', 'RADIO'], text: r.text, c: st.cars.find((k) => k.id === r.id) })
  items.sort((a, b) => b.lap - a.lap)
  return (
    <ul className="feed">
      {items.slice(0, 40).map((x, i) => <li key={i} className={x.c ? 'mine' : ''} style={x.c ? dc(game, x.c) : undefined}><span className="l">{x.lap ? `L${x.lap}` : 'Start'}</span>{x.tag && <span className={`tag ${x.tag[0]}`}>{x.tag[1]}</span>}{x.text}</li>)}
      {!items.length && <li className="muted">Lights out and away we go.</li>}
    </ul>
  )
}

function RaceScreen({ game, act }) {
  const w = game.weekend
  const st = w.state
  const step = useCallback((g) => nextLap(g), [])
  const moments = useMoments()
  // The race waits for the start lights, and goes when they go out.
  const [holding, setHolding] = useState(false)
  const pb = usePlayback(game, act, step, holding)
  const open = w.calls.filter((c) => !(c.id in w.answered))
  const flag = w.phase === 'flag' && pb.caughtUp
  // The picture on screen: a lap being played back, or the race as it stands.
  const snap = pb.frame ? frameSnapshot(st, pb.frame, pb.p) : st.started ? stateSnapshot(st) : gridSnapshot(st)
  const playingBack = !!pb.frame
  const lap = playingBack ? snap.lap : w.phase === 'flag' ? st.laps : lapAt(st, st.seg)
  const cnd = st.cond[Math.min(playingBack ? pb.frame.seg : st.seg, st.S - 1)]
  const neutral = playingBack ? pb.frame.under : st.neutral
  const rowsById = snap ? Object.fromEntries(snap.order.map((r, i) => [r.c.id, { ...r, pos: i + 1 }])) : {}
  const waiting = pb.caughtUp && open.length > 0
  const skip = () => { act((g) => playToMoment(g)); pb.jump() }

  // Moments, as the playback reaches them: the safety car, rain, one of your
  // cars out (or both), team-mates colliding, a podium place, the flag. Only
  // changes while the screen is open count, so leaving and coming back does
  // not replay them; podium places once a car a race.
  const mine = myCars(st)
  const outNow = mine.filter((c) => (playingBack ? (c.status !== 'running' && c.dnfSeg < pb.frame.seg && !pb.frame.out.includes(c.idx)) || snap.gone.some((r) => r.c === c) : c.status !== 'running')).map((c) => c.id)
  const order = (snap?.order ?? []).map((r) => r.c)
  const revealed = playingBack ? st.events.slice(0, pb.frame.events1).filter((e, i) => i < pb.frame.events0 || e.lap <= snap.lap).length : st.events.length
  const facts = {
    sc: neutral === 'sc', red: neutral === 'red', out: outNow, flag, cond: cnd, events: revealed, started: st.started,
    top3: st.started ? order.slice(0, 3).filter((c) => c.e.isPlayer).map((c) => c.id) : [],
  }
  const seen = useRef(null)
  const once = useRef(new Set())
  useEffect(() => {
    const prev = seen.current
    seen.current = facts
    if (!prev) return
    const first = (key) => { if (once.current.has(key)) return false; once.current.add(key); return true }
    if (facts.sc && !prev.sc) moments.show(scMoment(lap))
    if (facts.red && !prev.red) moments.show(redFlagMoment(st.events.find((e) => e.type === 'red')?.lap ?? lap))
    if (facts.cond !== 'dry' && prev.cond === 'dry' && facts.started) moments.show(rainMoment(facts.cond, lap))
    for (const id of facts.out) if (!prev.out.includes(id)) moments.show(outMoment(game, st.cars.find((c) => c.id === id)))
    if (facts.out.length === 2 && prev.out.length < 2) moments.show(doubleOutMoment(game, mine))
    for (const e of st.events.slice(prev.events, facts.events)) {
      if (['incident', 'dnf'].includes(e.type) && e.ids.length > 1 && e.ids.every((id) => mine.some((c) => c.id === id))) moments.show(clashMoment(game, mine, e.lap))
    }
    for (const id of facts.top3) {
      if (!prev.top3.includes(id) && first(`top3-${id}`)) moments.show(podiumRunMoment(game, st.cars.find((c) => c.id === id), order.findIndex((c) => c.id === id) + 1, lap))
    }
    if (facts.flag && !prev.flag) moments.show(flagMoment(game, st))
  })
  const play = () => {
    if (!pb.playing && !st.started && !holding) {
      moments.show(lightsMoment(game.round))
      setHolding(true)
      setTimeout(() => setHolding(false), LIGHTS_OUT_MS)
    }
    pb.setPlaying(!pb.playing)
  }
  const finish = () => {
    const res = act((g) => finishWeekend(g))
    if (res) for (const m of resultMoments(game, res, { live: true })) moments.show(m)
  }
  return (
    <div>
      <Head title={st.track.name} chip={COND[cnd]} right={flag ? 'FINISH' : lap ? `LAP ${lap}/${st.laps}` : 'START'} game={game}>
        {!flag && neutral && <div className={`banner ${neutral === 'red' ? 'red' : ''}`}>{neutral === 'red' ? '■ Red flag' : `⚠ ${neutral === 'sc' ? 'Safety car' : 'Virtual safety car'}`}</div>}
        {flag && <div className="banner flag">Chequered flag</div>}
      </Head>
      <div className="race-grid">
        <section className="panel flush tower-panel"><h3>Timing</h3><Tower game={game} st={st} snap={playingBack ? snap : null} lastOrder={playingBack ? null : w.lastOrder} /></section>
        <div className="race-side">
          <section className="panel mappanel">
            <TrackMap game={game} st={st} snap={snap} />
          </section>
          {pb.caughtUp && w.calls.map((call) => <CallCard key={call.id} game={game} act={act} call={call} answered={w.answered[call.id]} />)}
          {waiting && open.length > 1 && <button onClick={() => act((g) => followStrategist(g))}>Do what the strategist says on all of these</button>}
          <section className="panel">
            <div className="cars">{myCars(st).map((c) => <CarCard key={c.id} game={game} act={act} st={st} c={c} w={w} row={playingBack ? rowsById[c.id] : null} />)}</div>
            <Help title="What the orders do">Push is quicker but wears the tyres and the driver; Save is slower and makes the tyres last. Attack and Defend raise the risk of contact; Hold keeps out of trouble. High engine mode adds power and failure risk. Box calls a stop at the next chance.</Help>
          </section>
          <section className="panel flush"><h3>Race feed</h3><Feed game={game} st={st} w={w} upto={playingBack ? { lap: snap.lap, before: pb.frame.events0, events: pb.frame.events1 } : null} /></section>
        </div>
      </div>
      <div className="controls">
        {flag ? (
          <button className="primary" onClick={finish}>To the debrief</button>
        ) : <>
          <button className={`primary playbtn`} disabled={waiting} onClick={play}>{pb.playing ? '❚❚ Pause' : '▶ Play'}</button>
          <button className="speed" onClick={() => pb.setSpeed(SPEEDS[(SPEEDS.indexOf(pb.speed) + 1) % SPEEDS.length])} title="Playback speed">{pb.speed}×</button>
          <button disabled={waiting || w.phase !== 'race'} onClick={skip} title="Jump to the next call, safety car, change in the weather or trouble for your cars">⏭ Key moment</button>
          <button className={w.autoCalls ? 'on' : 'ghost'} aria-pressed={!!w.autoCalls} onClick={() => act((g) => setAutoCalls(g, !w.autoCalls))} title="The strategist makes the pit-wall calls while the race plays on">{w.autoCalls ? '✓ Strategist on the calls' : 'Strategist'}</button>
        </>}
      </div>
      {waiting && <p className="waiting">The pit wall needs a decision.</p>}
    </div>
  )
}

export default function LiveWeekend({ game, act }) {
  const w = game.weekend
  // Qualifying moments as each session ends (Q3, the front row, pole).
  const moments = useMoments()
  // A session being watched counts once it has played out.
  const sessions = (w.state?.qs?.sessions.length ?? 0) - (w.qReplay != null ? 1 : 0)
  const seenSessions = useRef(sessions)
  useEffect(() => {
    if (sessions > seenSessions.current) {
      for (let s = seenSessions.current; s < sessions; s++) for (const m of qualiMoments(game, w.state, w.state.qs.sessions[s])) moments.show(m)
    }
    seenSessions.current = sessions
  }, [sessions, game, w.state, moments])
  if (w.phase === 'briefing') return <Briefing game={game} act={act} />
  if (w.phase === 'practice') return <Practice game={game} act={act} />
  if (w.phase === 'quali' || w.qReplay != null) return <QualiScreen game={game} act={act} />
  if (w.phase === 'grid') return <GridScreen game={game} act={act} />
  return <RaceScreen game={game} act={act} />
}

// ---- After the flag ----

export function Debrief({ game, result }) {
  const d = game.lastDebrief
  const fresh = d && d.season === game.season && d.round === result.round
  const mine = result.race.filter((r) => r.teamId === PLAYER)
  const name = (id) => game.drivers[id]?.name ?? id
  const money = game.finance.lastRound
  const values = fresh ? d.values : []
  const net = values.reduce((s, v) => s + v.places, 0)
  return (
    <div className="panel">
      <div className="kicker">Debrief · round {result.round + 1}</div>
      <div className="tiles">
        {mine.map((r) => {
          const rating = result.ratings?.[r.id]
          const pace = result.detail[r.id]?.paceRank
          return (
            <div className="tile dtile" key={r.id} style={{ '--dc': driverColor(game, r.id) }}>
              <DriverTag game={game} id={r.id} name={surname(name(r.id))} />
              <div className="big">{r.status === 'dnf' ? 'DNF' : `P${r.pos}`}{rating?.score != null && <span className="rating">{rating.score}</span>}</div>
              <span className="muted small">from P{r.grid}{pace ? ` · ${ordinal(pace)}-fastest car` : ''}{r.points ? ` · ${r.points} pts` : ''}</span>
            </div>
          )
        })}
        {money && <div className="tile"><div className="kicker">Money</div><div className={`big ${money.net < 0 ? 'bad' : ''}`}>{money.net < 0 ? '−' : '+'}£{Math.abs(money.net).toFixed(1)}m</div></div>}
      </div>
      {result.objectives?.length > 0 && (
        <div className="chips" style={{ margin: '8px 0' }}>
          {result.objectives.map((o, i) => <span key={i} className={`chip ${o.met ? 'ok' : 'no'}`}>{o.met ? '✓' : '✗'} {o.text}</span>)}
        </div>
      )}
      {fresh && !d.handedOver && values.length > 0 && (
        <div className="calls">
          {values.map((v, i) => (
            <div key={i} className="callrow" style={{ '--dc': driverColor(game, v.carId) }}>
              <span className={`delta ${v.places > 0 ? 'good' : v.places < 0 ? 'bad' : 'muted'}`}>{v.places > 0 ? `+${v.places}` : v.places}</span>
              <span><DriverTag game={game} id={v.carId} code /> {v.title} <span className="muted">· you: {v.choice} · strategist: {v.recommend}{v.retired ? ' · a retirement in one version: luck as much as the call' : ''}</span></span>
            </div>
          ))}
          {values.length > 1 && <div className="muted small">Your own calls: <b className={net > 0 ? 'good' : net < 0 ? 'bad' : ''}>{net > 0 ? '+' : ''}{net} places</b> against the strategist's.</div>}
        </div>
      )}
      {fresh && !d.handedOver && values.length === 0 && <p className="muted small">You went with the strategist on every call.</p>}
      {fresh && !d.handedOver && d.strategistOnly && (
        <p className="muted small">The strategist alone, same luck: {Object.entries(d.strategistOnly).map(([id, p]) => `${carCode(name(id))} ${p ? `P${p}` : 'out'}`).join(', ')}.</p>
      )}
    </div>
  )
}
