import React, { useState } from 'react'
import { getStandings, paceTable, PLAYER, overall } from '../engine/game.js'
import { TRACK_BY_ID } from '../engine/data/tracks.js'
import WeekendReport from './Weekend.jsx'
import { ordinal } from './format.js'

export function Standings({ game }) {
  const st = getStandings(game)
  return (
    <div className="row">
      <div className="scroll">
        <h2>Constructors</h2>
        <table>
          <thead><tr><th className="n">Pos</th><th>Team</th><th className="n">Points</th><th className="n">Best</th></tr></thead>
          <tbody>
            {st.constructors.map((c, i) => (
              <tr key={c.id} className={c.id === PLAYER ? 'me' : ''}>
                <td className="n">{i + 1}</td><td>{c.name}</td><td className="n">{c.points}</td><td className="n">{c.best ? ordinal(c.best) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="scroll">
        <h2>Drivers</h2>
        <table>
          <thead><tr><th className="n">Pos</th><th>Driver</th><th>Team</th><th className="n">Points</th><th className="n">Wins</th><th className="n">Podiums</th><th className="n">Best</th></tr></thead>
          <tbody>
            {st.drivers.map((d, i) => (
              <tr key={d.id} className={d.teamId === PLAYER ? 'me' : ''}>
                <td className="n">{i + 1}</td><td>{d.name}</td><td>{game.teams[d.teamId].name}</td><td className="n">{d.points}</td>
                <td className="n">{d.wins || ''}</td><td className="n">{d.podiums || ''}</td><td className="n">{d.best ? ordinal(d.best) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Results({ game }) {
  const [open, setOpen] = useState(null)
  const shown = open !== null ? game.results[open] : null
  return (
    <div>
      <h2>Season results</h2>
      {game.results.length === 0 && <p className="muted">No races run yet this season.</p>}
      <table>
        <thead><tr><th className="n">Rd</th><th>Track</th><th>Weather</th><th>Winner</th><th>Your cars</th><th /></tr></thead>
        <tbody>
          {game.results.map((res, i) => {
            const mine = res.race.filter((r) => r.teamId === PLAYER).map((r) => (r.status === 'dnf' ? 'DNF' : ordinal(r.pos))).join(', ')
            return (
              <tr key={i}>
                <td className="n">{i + 1}</td><td>{TRACK_BY_ID[res.trackId].name}</td><td>{res.weather.race}</td>
                <td>{game.drivers[res.race[0].id].name}</td><td>{mine}</td>
                <td><button onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Hide' : 'View'}</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {shown && <WeekendReport game={game} result={shown} />}
      {game.history.length > 0 && (
        <>
          <h2>Past seasons</h2>
          <table>
            <thead><tr><th>Year</th><th>Champion team</th><th>Champion driver</th><th className="n">Your position</th><th className="n">Your points</th><th className="n">Best finish</th></tr></thead>
            <tbody>
              {game.history.map((h) => (
                <tr key={h.season}>
                  <td>{h.year}</td><td>{h.constructors[0].name}</td><td>{h.drivers[0].name}</td>
                  <td className="n">{ordinal(h.playerPos)}</td><td className="n">{h.playerPoints}</td><td className="n">{h.playerBest ? ordinal(h.playerBest) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

export function Grid({ game }) {
  const pace = paceTable(game)
  const drivers = Object.values(game.drivers).filter((d) => d.teamId).sort((a, b) => overall(b) - overall(a))
  return (
    <div>
      <h2>Cars</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Team</th><th>Power unit</th><th className="n">Aero</th><th className="n">Chassis</th><th className="n">Power</th><th className="n">Reliability</th><th className="n">Tyre Care</th><th className="n">Gap (balanced track)</th></tr></thead>
          <tbody>
            {pace.map((r) => (
              <tr key={r.id} className={r.id === PLAYER ? 'me' : ''}>
                <td>{r.name}</td><td>{game.suppliers[game.teams[r.id].supplier].name}</td>
                <td className="n">{r.car.aero.toFixed(1)}</td><td className="n">{r.car.chassis.toFixed(1)}</td><td className="n">{r.car.power.toFixed(0)}</td>
                <td className="n">{r.car.reliability.toFixed(1)}</td><td className="n">{r.car.tyreCare.toFixed(1)}</td>
                <td className="n">{r.gap === 0 ? '—' : `+${r.gap.toFixed(2)} s`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Reliability shown is the car as raced: the team's own build quality blended with the power unit's. In pre-season some rival seats can be empty until the driver market closes.</p>
      <h2>Drivers</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Driver</th><th>Team</th><th className="n">Age</th><th className="n">Overall</th><th className="n">Pace</th><th className="n">Racecraft</th><th className="n">Consistency</th><th className="n">Wet</th><th className="n">Feedback</th><th className="n">Market.</th><th className="n">Contract</th><th className="n">Starts</th><th className="n">Wins</th><th className="n">Titles</th></tr></thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className={d.teamId === PLAYER ? 'me' : ''}>
                <td>{d.name}{game.reserve === d.id ? ' (reserve)' : ''}</td><td>{game.teams[d.teamId].name}</td><td className="n">{d.age}</td><td className="n">{overall(d)}</td>
                <td className="n">{d.pace}</td><td className="n">{d.racecraft}</td><td className="n">{d.consistency}</td><td className="n">{d.wet}</td><td className="n">{d.feedback}</td><td className="n">{d.marketability}</td>
                <td className="n">{d.contract?.expired ? 'expired' : d.contract ? `${d.contract.years} yr` : '—'}</td><td className="n">{d.career?.starts ?? 0}</td><td className="n">{d.career?.wins || ''}</td><td className="n">{d.career?.titles || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
