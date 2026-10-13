import React from 'react'
import { TRACK_BY_ID } from '../engine/data/tracks.js'
import { PLAYER } from '../engine/game.js'
import { lapTime, gap, raceGap, ordinal } from './format.js'

export function TrackLine({ track }) {
  const w = track.w
  const ot = track.overtaking >= 0.75 ? 'very hard' : track.overtaking >= 0.5 ? 'hard' : track.overtaking >= 0.35 ? 'average' : 'easy'
  return (
    <span className="muted">
      {track.type} track · Aero {Math.round(w.aero * 100)}% / Chassis {Math.round(w.chassis * 100)}% / Power {Math.round(w.power * 100)}% ·
      overtaking {ot} · {track.laps} laps
    </span>
  )
}

function PlayerBreakdown({ game, result }) {
  const mine = result.race.filter((r) => r.teamId === PLAYER)
  return (
    <div className="panel">
      <h3>Your cars</h3>
      {mine.map((r) => {
        const d = result.detail[r.id]
        const name = game.drivers[r.id].name
        return (
          <div key={r.id} style={{ marginBottom: 8 }}>
            <b>{name}</b>: qualified {ordinal(d.qualiPos)}, started {ordinal(d.grid)},{' '}
            {r.status === 'dnf' ? <span className="bad">retired ({r.reason})</span> : <>finished <b>{ordinal(r.pos)}</b></>}
            {r.points > 0 && <span className="good"> · {r.points} points</span>}
            <ul className="plain muted">
              <li>Race pace on the day: {ordinal(d.paceRank)} fastest of {result.race.length}</li>
              <li>Time lost in traffic: {d.traffic.toFixed(1)} s · strategy and safety-car timing: {d.strategy >= 0 ? 'lost' : 'gained'} {Math.abs(d.strategy).toFixed(1)} s · pit stops: {d.pitExtra.toFixed(1)} s over a perfect stop</li>
              <li>Setup cost {d.setupLoss.toFixed(2)} s a lap · on-track passes made: {d.passes}</li>
              {d.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export default function WeekendReport({ game, result }) {
  const track = TRACK_BY_ID[result.trackId]
  const nameOf = (id) => game.drivers[id]?.name ?? id
  const teamOf = (id) => game.teams[id]?.name ?? id
  // Routine stops by other teams are left out; yours, slow stops and everything else stay.
  const mine = (e) => e.ids.some((id) => result.race.find((r) => r.id === id)?.teamId === PLAYER)
  const events = result.events.filter((e) => e.type !== 'pit' || mine(e) || e.text.startsWith('Slow'))
  return (
    <div>
      <h2>Round {result.round + 1}: {track.name}</h2>
      <p><TrackLine track={track} /></p>
      <p>Qualifying: <b>{{ drying: 'drying track', rain: 'rain arrived' }[result.weather.qualiType] ?? result.weather.quali}</b> · Race: <b>{result.weather.race}</b> · Safety cars: <b>{result.stats.safetyCars}</b> · Retirements: <b>{result.stats.retirements}</b></p>
      <PlayerBreakdown game={game} result={result} />
      <div className="row">
        <div className="scroll">
          <h3>Race</h3>
          <table>
            <thead><tr><th className="n">Pos</th><th>Driver</th><th>Team</th><th className="n">Grid</th><th>Result</th><th className="n">Pts</th></tr></thead>
            <tbody>
              {result.race.map((r) => (
                <tr key={r.id} className={r.teamId === PLAYER ? 'me' : ''}>
                  <td className="n">{r.pos}</td><td>{nameOf(r.id)}</td><td>{teamOf(r.teamId)}</td><td className="n">{r.grid}</td>
                  <td>{raceGap(r)}{r.penalty > 0 ? ` (incl. ${r.penalty} s penalty)` : ''}</td><td className="n">{r.points || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="scroll">
          <h3>Qualifying</h3>
          <table>
            <thead><tr><th className="n">Pos</th><th>Driver</th><th>Team</th><th>Out in</th><th className="n">Time</th><th className="n">Gap</th><th className="n">Grid</th></tr></thead>
            <tbody>
              {result.quali.map((q) => (
                <tr key={q.id} className={q.teamId === PLAYER ? 'me' : ''}>
                  <td className="n">{q.pos}</td><td>{nameOf(q.id)}{q.error ? ' *' : ''}</td><td>{teamOf(q.teamId)}</td><td>{q.session && q.session < 3 ? `Q${q.session}` : ''}</td>
                  <td className="n">{lapTime(q.time)}</td><td className="n">{q.session && q.session < 3 ? '' : gap(q.gap)}</td><td className="n">{q.grid}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">* a mistake on a lap. Gaps are to pole in Q3; cars out in Q1 and Q2 show their best time there.</p>
        </div>
      </div>
      <h3>Key events</h3>
      {events.length === 0 ? <p className="muted">A quiet race.</p> : (
        <ul className="plain">
          {events.map((e, i) => <li key={i}><span className="muted">{e.lap === 0 ? 'Pre-race' : `Lap ${e.lap}`}:</span> {e.text}</li>)}
        </ul>
      )}
    </div>
  )
}
