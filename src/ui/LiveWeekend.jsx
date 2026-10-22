// The race weekend run live: the screen for each phase, and the debrief.

import React, { useEffect, useRef } from 'react'
import { PLAYER } from '../engine/game.js'
import { carCode, driverColor, ordinal } from './format.js'
import { useMoments } from './Moments.jsx'
import { qualiMoments } from './raceMoments.js'
import { surname } from '../engine/util.js'
import { Briefing } from './BriefingScreen.jsx'
import { GridScreen } from './GridScreen.jsx'
import { Practice } from './PracticeScreen.jsx'
import { QualiScreen } from './QualiScreen.jsx'
import { RaceScreen } from './RaceScreen.jsx'
import { DriverTag, dc } from './weekendParts.jsx'

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
