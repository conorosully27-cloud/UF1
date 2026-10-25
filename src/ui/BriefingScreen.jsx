// Thursday: the briefing.

import React from 'react'
import { beginPractice, toQualifying, playsPractice, playsQualifying, incidentDue } from '../engine/live.js'
import { TRACK_BY_ID } from '../engine/data/tracks.js'
import { TrackLine } from './Weekend.jsx'
import TrackOutline from './TrackOutline.jsx'
import { SPEED_RANGE } from './speedProfile.js'
import { Tyre, Objectives, Head, Incident } from './weekendParts.jsx'

export function Briefing({ game, act }) {
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
      <div className="brief-track">
        <TrackOutline id={track.id} size={150} speed title={`${track.name}, coloured by speed`} />
        <div>
          <p><TrackLine track={track} /></p>
          <p className="muted small"><span className="speed-key" /> Slow corners to fast straights ({SPEED_RANGE[0]} to {SPEED_RANGE[1]} km/h)</p>
        </div>
      </div>
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
