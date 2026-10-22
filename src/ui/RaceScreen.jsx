// Sunday: the race.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { TYRES, ORDERS, tyreLife, wearRate } from '../engine/weekend.js'
import { setOrders, answerCall, followStrategist, nextLap, playToMoment, setAutoCalls, finishWeekend, boxCar } from '../engine/live.js'
import { TrackMap, usePlayback, frameSnapshot, gridSnapshot, stateSnapshot } from './RaceMap.jsx'
import { carCode, teamColor, gap } from './format.js'
import { useMoments } from './Moments.jsx'
import { lightsMoment, scMoment, redFlagMoment, outMoment, flagMoment, resultMoments, podiumRunMoment, rainMoment, clashMoment, doubleOutMoment } from './raceMoments.js'
import { SLICKS, CALL_KINDS, COND, SPEEDS, LIGHTS_OUT_MS, Tyre, Seg, Help, DriverTag, myCars, stintAge, dc, Head } from './weekendParts.jsx'

// The timing tower. While a lap plays back the order and gaps come from the
// playback; otherwise from the race as it stands.
function Tower({ game, st, snap, lastOrder }) {
  const rows = snap ? snap.order : st.order.map((i) => ({ c: st.cars[i], gap: null, tyre: st.cars[i].tyre }))
  const out = st.cars.filter((c) => c.status !== 'running' && !(snap && snap.order.some((r) => r.c === c))).sort((a, b) => b.dnfLap - a.dnfLap)
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
  const cnd = st.cond[Math.min(st.lap, st.laps - 1)]
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

export function RaceScreen({ game, act }) {
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
  const lap = playingBack ? snap.lap : w.phase === 'flag' ? st.laps : st.lap
  const cnd = st.cond[Math.min(playingBack ? pb.frame.lap : st.lap, st.laps - 1)]
  const neutral = playingBack ? pb.frame.under : st.neutral
  const rowsById = snap ? Object.fromEntries(snap.order.map((r, i) => [r.c.id, { ...r, pos: i + 1 }])) : {}
  const waiting = pb.caughtUp && open.length > 0
  const skip = () => { act((g) => playToMoment(g)); pb.jump() }

  // Moments, as the playback reaches them: the safety car, rain, one of your
  // cars out (or both), team-mates colliding, a podium place, the flag. Only
  // changes while the screen is open count, so leaving and coming back does
  // not replay them; podium places once a car a race.
  const mine = myCars(st)
  const outNow = mine.filter((c) => (playingBack ? (c.status !== 'running' && c.dnfLap < pb.frame.lap && !pb.frame.out.includes(c.idx)) || snap.gone.some((r) => r.c === c) : c.status !== 'running')).map((c) => c.id)
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
