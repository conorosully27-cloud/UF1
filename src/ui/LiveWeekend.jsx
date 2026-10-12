import React from 'react'
import { PLAYER } from '../engine/game.js'
import { TYRES, ORDERS, planRest, lapAt, tyreLife, wearRate } from '../engine/weekend.js'
import {
  setWing, runQualifying, setStartTyre, setOrders, startRace, answerCall, followStrategist, nextBlock, playToCall, handOver,
  finishWeekend, boxCar, objectivesNow, quickFinish,
} from '../engine/live.js'
import { TRACK_BY_ID } from '../engine/data/tracks.js'
import { TrackLine } from './Weekend.jsx'
import { carCode, teamColor, ordinal, gap } from './format.js'

const SLICKS = ['S', 'M', 'H']
const WING_LABELS = ['Low drag', 'Low', 'Medium', 'High', 'High downforce']
const CALL_KINDS = { sc: 'safety car', vsc: 'virtual safety car', plan: 'pit window', cliff: 'tyres', rain: 'weather', drying: 'weather', damage: 'damage', 'compound rule': 'tyre rules', undercut: 'undercut', teammates: 'team orders' }
const COND = { dry: '☀ Dry', damp: '🌦 Damp', wet: '🌧 Wet' }

export function Tyre({ comp, age, lg }) {
  return <span className={`tyre${lg ? ' lg' : ''}`} title={TYRES[comp].name}><i className={`ty-${comp}`}>{comp}</i>{age !== undefined && <small>{age}</small>}</span>
}

function Seg({ options, value, onPick, disabled }) {
  return (
    <div className="seg">
      {options.map(([k, label]) => <button key={k} className={value === k ? 'on' : ''} disabled={disabled} onClick={() => onPick(k)}>{label}</button>)}
    </div>
  )
}

const myCars = (st) => st.cars.filter((c) => c.e.isPlayer)
const stintAge = (st, c) => lapAt(st, st.seg) - c.stints[c.stints.length - 1].lap
const surname = (name) => name.split(' ').slice(-1)[0]

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

// ---- Thursday: the briefing ----

function Briefing({ game, act }) {
  const w = game.weekend
  const track = TRACK_BY_ID[game.calendar[game.round]]
  const f = w.forecast
  const strat = game.org.keyStaff.chiefStrategist.rating
  const ids = game.teams[PLAYER].drivers
  const wear = track.wear >= 1.15 ? 'high' : track.wear <= 0.8 ? 'low' : 'average'
  return (
    <div>
      <div className="race-head">
        <div className="line"><span className="gp">{track.name}</span><span className="chip">Round {game.round + 1} of {game.calendar.length}</span><span className="lap">Briefing</span></div>
      </div>
      <p><TrackLine track={track} /></p>
      <div className="cols">
        <div className="panel">
          <div className="kicker">Forecast</div>
          <div className="tiles">
            <div className="tile"><div className="kicker">Qualifying</div><div className="big">{f.quali}%</div><span className="muted">chance of rain</span></div>
            <div className="tile"><div className="kicker">Race</div><div className="big">{f.race}%</div><span className="muted">chance of rain</span></div>
          </div>
          {f.hint && <p>{f.hint}.</p>}
          <p className="muted">Your Chief Strategist (rated {strat}) {f.sure ? 'reads the radar well' : strat >= 55 ? 'gives a fair idea' : 'is guessing a little'}. Rain wants more wing.</p>
        </div>
        <div className="panel">
          <div className="kicker">The track</div>
          <div className="tiles">
            <div className="tile"><div className="kicker">Pit lane</div><div className="big">{track.pitLoss} s</div><span className="muted">a stop costs</span></div>
            <div className="tile"><div className="kicker">Tyre wear</div><div className="big" style={{ textTransform: 'capitalize' }}>{wear}</div><span className="muted">{track.laps} laps</span></div>
          </div>
          <p className="muted">Under a safety car a stop costs about half as much; under a virtual safety car, about 60%.</p>
        </div>
        <div className="panel">
          <div className="kicker">Weekend objectives</div>
          <ul className="plain">{w.objectives.map((o, i) => <li key={i}>{o.text}</li>)}</ul>
          <p className="muted">Each one met lifts the owner's confidence and the sponsors' mood a little.</p>
        </div>
      </div>
      <div className="panel">
        <div className="kicker">Wing level</div>
        <p className="muted">Low drag is quicker on the straights and helps to pass and defend; high downforce suits twisty tracks and the wet. It is locked once qualifying starts.</p>
        <div className="cols">
          {ids.map((id, slot) => {
            const a = w.wingAdvice[slot]
            return (
              <div key={id}>
                <p><b>{game.drivers[id].name}</b></p>
                <Seg options={WING_LABELS.map((l, i) => [i + 1, `${i + 1}`])} value={w.wing[slot]} onPick={(v) => act((g) => setWing(g, slot, v))} />
                <p className="muted">{WING_LABELS[w.wing[slot] - 1]}. The race engineer suggests <b>{a.level}</b>{a.sure ? '' : ' (a best guess)'}.</p>
              </div>
            )
          })}
        </div>
      </div>
      <div className="controls">
        <button className="primary" onClick={() => act((g) => runQualifying(g))}>Run qualifying</button>
        <button className="ghost" onClick={() => act((g) => quickFinish(g))}>Hand to the strategist</button>
      </div>
    </div>
  )
}

// ---- Saturday and the grid ----

function planText(st, c, comp) {
  const p = planRest(st, c, 0, comp, 0, false)
  if (!p.stops.length) return { text: 'no stop', cost: p.cost }
  return { text: [comp, ...p.stops.map((s) => s.comp)].join(' → ') + ` · stop${p.stops.length > 1 ? 's' : ''} lap ${p.stops.map((s) => lapAt(st, s.seg)).join(' and ')}`, cost: p.cost }
}

function GridScreen({ game, act }) {
  const w = game.weekend
  const st = w.state
  const name = (id) => game.drivers[id]?.name ?? id
  const wetStart = st.cond[0] !== 'dry'
  return (
    <div>
      <div className="race-head">
        <div className="line"><span className="gp">{st.track.name}</span><span className="chip">Qualifying {st.qualiWet ? 'wet' : 'dry'}</span><span className="lap">On the grid</span></div>
        <div style={{ marginTop: 8 }}><Objectives game={game} /></div>
      </div>
      <div className="race-grid">
        <section className="panel flush">
          <h3>Qualifying</h3>
          <ol className="tower">
            {st.quali.map((q) => (
              <React.Fragment key={q.id}>
                <li className={`trow${q.teamId === PLAYER ? ' me' : ''}`}>
                  <span className="p">{q.pos}</span><span className="bar" style={{ background: teamColor(game, q.teamId) }} />
                  <span className="code">{carCode(name(q.id))}</span><span className="team">{game.teams[q.teamId].name}{q.error ? ' · mistake' : ''}</span>
                  <span className="g">{q.pos === 1 ? 'Pole' : gap(q.gap)}</span><span className="stops">{q.grid !== q.pos ? `grid ${q.grid}` : ''}</span><span />
                </li>
                {q.pos === 10 && <li className="cutoff" />}
              </React.Fragment>
            ))}
          </ol>
        </section>
        <div className="race-side">
          <section className="panel">
            <div className="kicker">Race start · {COND[st.cond[0]]}</div>
            <div className="cars" style={{ marginTop: 8 }}>
              {myCars(st).map((c) => {
                const comps = wetStart ? ['I', 'W'] : SLICKS
                const plans = Object.fromEntries(comps.map((k) => [k, wetStart ? null : planText(st, c, k)]))
                const best = wetStart ? 0 : Math.min(...comps.map((k) => plans[k].cost))
                return (
                  <div className="car" key={c.id}>
                    <div className="head"><span className="pos">P{c.grid}</span><span className="name">{c.e.name}</span><span className="meta">qualified {ordinal(c.qPos)}</span></div>
                    <div className="ctl"><span>Tyres</span><Seg options={comps.map((k) => [k, TYRES[k].name])} value={c.tyre} onPick={(k) => act((g) => setStartTyre(g, c.id, k))} /></div>
                    {!wetStart && <div className="meta">Plan: {plans[c.tyre].text}{plans[c.tyre].cost - best > 0.5 ? ` · about ${(plans[c.tyre].cost - best).toFixed(0)} s slower than the best start tyre` : ' · the quickest plan'}</div>}
                    <div className="ctl"><span>Lap one</span><Seg options={Object.entries(ORDERS.lap1).map(([k, o]) => [k, o.label])} value={c.orders.lap1} onPick={(k) => act((g) => setOrders(g, c.id, { lap1: k }))} /></div>
                  </div>
                )
              })}
            </div>
            <p className="muted">Attack on lap one gains places on average but risks the first-corner incidents. A dry race must use two dry compounds.</p>
          </section>
        </div>
      </div>
      <div className="controls">
        <button className="primary" onClick={() => act((g) => startRace(g))}>Lights out</button>
        <button className="ghost" onClick={() => act((g) => quickFinish(g))}>Hand to the strategist</button>
      </div>
    </div>
  )
}

// ---- Sunday ----

function Tower({ game, st, lastOrder }) {
  const order = st.order.map((i) => st.cars[i])
  const out = st.cars.filter((c) => c.status !== 'running').sort((a, b) => b.dnfSeg - a.dnfSeg)
  const leader = order[0]
  const prev = (c) => (lastOrder ? lastOrder.indexOf(c.idx) : -1)
  return (
    <ol className="tower">
      {order.map((c, i) => {
        const was = prev(c)
        const moved = was >= 0 ? was - i : 0
        return (
          <React.Fragment key={c.id}>
            <li className={`trow${c.e.isPlayer ? ' me' : ''}`}>
              <span className="p">{i + 1}</span><span className="bar" style={{ background: teamColor(game, c.e.teamId) }} />
              <span className="code">{carCode(c.e.name)}{moved > 0 && <span className="up">▲{moved}</span>}{moved < 0 && <span className="down">▼{-moved}</span>}</span>
              <span className="team">{c.e.teamName}</span>
              <span className="g">{i === 0 ? 'Leader' : `+${(c.t - leader.t).toFixed(1)}`}</span>
              <Tyre comp={c.tyre} age={stintAge(st, c)} /><span className="stops">{c.stops}</span>
            </li>
            {i === 9 && order.length > 10 && <li className="cutoff" />}
          </React.Fragment>
        )
      })}
      {out.map((c) => (
        <li key={c.id} className={`trow out${c.e.isPlayer ? ' me' : ''}`}>
          <span className="p">—</span><span className="bar" style={{ background: teamColor(game, c.e.teamId) }} />
          <span className="code">{carCode(c.e.name)}</span><span className="team">{c.reason}</span><span className="g">DNF</span><span /><span />
        </li>
      ))}
    </ol>
  )
}

function CallCard({ game, act, call, answered }) {
  const w = game.weekend
  const strat = game.org.keyStaff.chiefStrategist.rating
  return (
    <section className="call">
      <div className="kicker">Pit wall · {CALL_KINDS[call.kind] ?? call.kind}</div>
      <h2>{call.title}</h2>
      <p>{call.text}</p>
      <div className="opts">
        {call.options.map((o) => (
          <button key={o.key} className={`opt${o.key === call.recommend ? ' rec' : ''}`} disabled={answered !== undefined} onClick={() => act((g) => answerCall(g, call.id, o.key))}>
            {o.key === call.recommend && <span className="tag">Strategist's pick</span>}
            <span>{answered === o.key ? '✓ ' : ''}{o.label}</span>
            <small>{/^(about P|P\d)/.test(call.estimateText[o.key]) ? `Finishing ${call.estimateText[o.key]}` : call.estimateText[o.key][0].toUpperCase() + call.estimateText[o.key].slice(1)}</small>
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Estimates from your Chief Strategist (rated {strat}): {call.precision === 'sharp' ? 'sharp' : call.precision === 'rough' ? 'within a place or so' : 'a feel for it, no more'}. {w.state.track.name} overtaking is {w.state.track.overtaking >= 0.75 ? 'very hard' : w.state.track.overtaking >= 0.5 ? 'hard' : 'possible'}.</p>
    </section>
  )
}

function CarCard({ game, act, st, c, w }) {
  const pos = st.order.indexOf(c.idx) + 1
  const running = c.status === 'running'
  const life = tyreLife(c)
  const rate = wearRate(st, c)
  const lapsToCliff = Math.round((TYRES[c.tyre].life - c.wear) / rate)
  const cnd = st.cond[Math.min(st.seg, st.S - 1)]
  const comps = cnd === 'dry' ? SLICKS : ['I', 'W']
  const box = w.boxes?.[c.id]
  const last = [...w.radio].reverse().find((r) => r.id === c.id)
  const set = (k, v) => act((g) => setOrders(g, c.id, { [k]: v }))
  return (
    <div className={`car${running ? '' : ' out'}`}>
      <div className="head">
        <span className="pos">{running ? `P${pos}` : 'OUT'}</span><span className="name">{c.e.name}</span>
        <span className="meta">{running ? <><Tyre comp={c.tyre} /> {stintAge(st, c)} laps · {c.stops} stop{c.stops === 1 ? '' : 's'}</> : c.reason}</span>
      </div>
      {running && <>
        <div className="wear"><div style={{ width: `${Math.min(100, life * 100)}%` }} /></div>
        <div className="meta">Tyre wear {Math.round(life * 100)}% · {lapsToCliff > 0 ? `cliff in about ${lapsToCliff} laps` : 'past the cliff: losing time every lap'}{c.wingDamage > 0 ? ` · wing damage (${c.wingDamage.toFixed(1)} s a lap)` : ''}</div>
        <div className="ctl">
          <span>Pace</span><Seg options={Object.entries(ORDERS.pace).map(([k, o]) => [k, o.label])} value={c.orders.pace} onPick={(k) => set('pace', k)} />
          <span>Racing</span><Seg options={Object.entries(ORDERS.stance).map(([k, o]) => [k, k === 'hold' ? 'Hold' : o.label])} value={c.orders.stance} onPick={(k) => set('stance', k)} />
          <span>Engine</span><Seg options={Object.entries(ORDERS.engine).map(([k, o]) => [k, o.label])} value={c.orders.engine} onPick={(k) => set('engine', k)} />
          <span>Box</span>
          <div className="seg">
            {comps.map((k) => <button key={k} className={box === k ? 'on' : ''} onClick={() => act((g) => boxCar(g, c.id, box === k ? null : k))}>{TYRES[k].name}</button>)}
          </div>
        </div>
        {box && <div className="meta warn">Boxing for {TYRES[box].name}s in the next block. Tap again to cancel.</div>}
      </>}
      {last && <div className="radio">{last.text}</div>}
    </div>
  )
}

function Feed({ game, st, w }) {
  const mine = new Set(myCars(st).map((c) => c.id))
  const items = []
  const otherStops = {}
  for (const e of st.events) {
    if (e.type === 'pit' && !e.ids.some((id) => mine.has(id)) && !e.text.startsWith('Slow')) {
      (otherStops[e.lap] ??= []).push(carCode(game.drivers[e.ids[0]]?.name ?? e.ids[0]))
      continue
    }
    const tag = e.type === 'sc' || e.type === 'vsc' ? ['sc', e.type.toUpperCase()] : e.type === 'dnf' ? ['out', 'OUT'] : e.type === 'weather' ? ['wx', 'WX'] : e.type === 'pit' ? ['pit', 'PIT'] : null
    items.push({ lap: e.lap, tag, text: e.text })
  }
  for (const [lap, codes] of Object.entries(otherStops)) items.push({ lap: +lap, tag: ['pit', 'PIT'], text: codes.join(', ') })
  for (const r of w.radio) items.push({ lap: r.lap, tag: ['r', 'RADIO'], text: r.text })
  items.sort((a, b) => b.lap - a.lap)
  return (
    <ul className="feed">
      {items.slice(0, 40).map((x, i) => <li key={i}><span className="l">{x.lap ? `L${x.lap}` : 'Start'}</span>{x.tag && <span className={`tag ${x.tag[0]}`}>{x.tag[1]}</span>}{x.text}</li>)}
      {!items.length && <li className="muted">Lights out and away we go.</li>}
    </ul>
  )
}

function RaceScreen({ game, act }) {
  const w = game.weekend
  const st = w.state
  const open = w.calls.filter((c) => !(c.id in w.answered))
  const flag = w.phase === 'flag'
  const lap = flag ? st.laps : lapAt(st, st.seg)
  const nextLaps = flag ? 0 : lapAt(st, st.seg + 1) - lap
  const cnd = st.cond[Math.min(st.seg, st.S - 1)]
  return (
    <div>
      <div className="race-head">
        <div className="line"><span className="gp">{st.track.name}</span><span className="chip">{COND[cnd]}</span><span className="lap">{flag ? 'FINISH' : `LAP ${lap}/${st.laps}`}</span></div>
        <div style={{ marginTop: 8 }}><Objectives game={game} /></div>
        {!flag && st.neutral && <div className="banner">⚠ {st.neutral === 'sc' ? 'Safety car' : 'Virtual safety car'} · lap {lap}</div>}
        {flag && <div className="banner flag">Chequered flag</div>}
      </div>
      <div className="race-grid">
        <section className="panel flush"><h3>Timing</h3><Tower game={game} st={st} lastOrder={w.lastOrder} /></section>
        <div className="race-side">
          {w.calls.map((call) => <CallCard key={call.id} game={game} act={act} call={call} answered={w.answered[call.id]} />)}
          {open.length > 1 && <button onClick={() => act((g) => followStrategist(g))}>Do what the strategist says on all of these</button>}
          <section className="panel">
            <div className="kicker">Your cars</div>
            <div className="cars" style={{ marginTop: 8 }}>{myCars(st).map((c) => <CarCard key={c.id} game={game} act={act} st={st} c={c} w={w} />)}</div>
            <p className="muted" style={{ fontSize: 12 }}>Push: quicker, more wear and more mistakes. Save tyres: slower, the tyres last. Attack and Defend raise the risk of contact; Hold keeps out of trouble. High engine mode adds power and failure risk.</p>
          </section>
          <section className="panel flush"><h3>Race feed</h3><Feed game={game} st={st} w={w} /></section>
        </div>
      </div>
      <div className="controls">
        {flag ? (
          <button className="primary" onClick={() => act((g) => finishWeekend(g))}>To the debrief</button>
        ) : <>
          <button className={open.length ? '' : 'primary'} disabled={open.length > 0} onClick={() => act((g) => nextBlock(g))}>▶ Next {nextLaps} laps</button>
          <button disabled={open.length > 0} onClick={() => act((g) => playToCall(g))}>⏩ To the next call</button>
          <button className="ghost" onClick={() => act((g) => handOver(g))}>Hand to strategist</button>
        </>}
      </div>
      {open.length > 0 && <p className="muted" style={{ textAlign: 'center' }}>Answer the pit wall to carry on.</p>}
    </div>
  )
}

export default function LiveWeekend({ game, act }) {
  const w = game.weekend
  if (w.phase === 'briefing') return <Briefing game={game} act={act} />
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
          return (
            <div className="tile" key={r.id}>
              <div className="kicker">{surname(name(r.id))}</div>
              <div className="big">{r.status === 'dnf' ? 'DNF' : `P${r.pos}`}</div>
              <span className="muted">from P{r.grid}{r.points ? ` · ${r.points} pts` : ''}{rating?.score != null ? ` · rated ${rating.score}` : ''}</span>
            </div>
          )
        })}
        {money && <div className="tile"><div className="kicker">The weekend's money</div><div className={`big ${money.net < 0 ? 'bad' : ''}`}>{money.net < 0 ? '−' : '+'}£{Math.abs(money.net).toFixed(1)}m</div><span className="muted">income less running costs</span></div>}
      </div>
      {result.objectives?.length > 0 && (
        <div className="chips" style={{ margin: '8px 0' }}>
          {result.objectives.map((o, i) => <span key={i} className={`chip ${o.met ? 'ok' : 'no'}`}>{o.met ? '✓' : '✗'} {o.text}</span>)}
        </div>
      )}
      {result.ratings && <ul className="plain muted">{Object.entries(result.ratings).map(([id, r]) => <li key={id}>{name(id)}: {r.score == null ? '' : `${r.score}/10 · `}{r.note}</li>)}</ul>}
      {fresh && !d.handedOver && (
        <>
          <h3>Your calls</h3>
          {values.length === 0 ? <p className="muted">You went with the strategist on every call.</p> : (
            <ul className="plain">
              {values.map((v, i) => (
                <li key={i}>{surname(name(v.carId))}, {v.title}: you chose <b>{v.choice}</b>, the strategist said {v.recommend}.{' '}
                  <span className={v.places > 0 ? 'good' : v.places < 0 ? 'bad' : 'muted'}>{v.places > 0 ? `${v.places} place${v.places > 1 ? 's' : ''} gained` : v.places < 0 ? `${-v.places} place${v.places < -1 ? 's' : ''} lost` : 'no difference'}</span></li>
              ))}
            </ul>
          )}
          {values.length > 1 && <p>Overall your own calls were worth <b className={net > 0 ? 'good' : net < 0 ? 'bad' : ''}>{net > 0 ? '+' : ''}{net} places</b>.</p>}
          {d.strategistOnly && (
            <p className="muted">With the strategist on the pit wall all race: {Object.entries(d.strategistOnly).map(([id, p]) => `${surname(name(id))} ${p ? `P${p}` : 'out'}`).join(', ')}. The same luck, replayed.</p>
          )}
        </>
      )}
      {fresh && d.handedOver && <p className="muted">The strategist ran the race.</p>}
    </div>
  )
}
