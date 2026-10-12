import React from 'react'
import { ordinal } from './format.js'
import { START_YEAR } from '../engine/game.js'

export default function HonoursTab({ game }) {
  const h = game.honours
  const first = (key, label) => {
    const f = h.firsts[key]
    return <tr><td>{label}</td><td>{f ? `${f.year}, ${f.track} (${f.driver})` : '—'}</td></tr>
  }
  return (
    <div>
      <h2>Honours board</h2>
      <div className="row">
        <table>
          <tbody>
            <tr><td>Seasons</td><td className="n">{game.history.length}</td></tr>
            <tr><td>Race starts</td><td className="n">{h.starts}</td></tr>
            <tr><td>Points</td><td className="n">{h.points}</td></tr>
            <tr><td>Points finishes</td><td className="n">{h.pointsFinishes}</td></tr>
            <tr><td>Podiums</td><td className="n">{h.podiums}</td></tr>
            <tr><td>Wins</td><td className="n">{h.wins}</td></tr>
            <tr><td>Pole positions</td><td className="n">{h.poles}</td></tr>
            <tr><td>Races with both cars classified</td><td className="n">{h.doubleFinishes}</td></tr>
            <tr><td>Best race finish</td><td className="n">{h.bestFinish ? ordinal(h.bestFinish) : '—'}</td></tr>
            <tr><td>Best championship position</td><td className="n">{h.bestPos ? ordinal(h.bestPos) : '—'}</td></tr>
          </tbody>
        </table>
        <table>
          <thead><tr><th>First</th><th>When</th></tr></thead>
          <tbody>
            {first('point', 'Point')}
            {first('podium', 'Podium')}
            {first('pole', 'Pole position')}
            {first('win', 'Win')}
          </tbody>
        </table>
        <table>
          <tbody>
            <tr><td>Constructors' titles</td><td>{h.titles.constructors.length ? h.titles.constructors.join(', ') : '—'}</td></tr>
            <tr><td>Drivers' titles</td><td>{h.titles.drivers.length ? h.titles.drivers.map((t) => `${t.year} ${t.name}`).join(', ') : '—'}</td></tr>
            <tr><td>Longest run of races in the points</td><td className="n">{h.streaks.scoringBest}</td></tr>
            <tr><td>Current run</td><td className="n">{h.streaks.scoring}</td></tr>
            <tr><td>Most titles in a row</td><td className="n">{h.streaks.titlesBest}</td></tr>
          </tbody>
        </table>
      </div>

      {game.history.length > 0 && (
        <>
          <h2>Season by season</h2>
          <table>
            <thead><tr><th>Year</th><th className="n">Position</th><th className="n">Points</th><th className="n">Wins</th><th className="n">Podiums</th><th>Champions</th><th>Drivers' champion</th></tr></thead>
            <tbody>
              {game.history.map((s) => (
                <tr key={s.season} className={s.playerPos === 1 ? 'me' : ''}>
                  <td>{s.year}</td><td className="n">{ordinal(s.playerPos)}</td><td className="n">{s.playerPoints}</td><td className="n">{s.playerWins}</td><td className="n">{s.playerPodiums}</td>
                  <td>{s.constructors[0].name}</td><td>{s.drivers[0].name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {game.retired?.length > 0 && (
        <>
          <h2>Retirements</h2>
          <p className="muted">Starts, wins and titles count from {START_YEAR}, when this save began.</p>
          <table>
            <thead><tr><th>Driver</th><th className="n">Last season</th><th className="n">Age</th><th className="n">Starts</th><th className="n">Wins</th><th className="n">Titles</th></tr></thead>
            <tbody>
              {game.retired.slice().reverse().slice(0, 30).map((r, i) => (
                <tr key={i}><td>{r.name}</td><td className="n">{r.year}</td><td className="n">{r.age}</td><td className="n">{r.starts}</td><td className="n">{r.wins}</td><td className="n">{r.titles || ''}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
