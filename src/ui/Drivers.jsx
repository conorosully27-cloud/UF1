import React, { useState } from 'react'
import { PLAYER, overall } from '../engine/game.js'
import {
  offerContract, offerInterest, marketDemand, canApproach, advanceMarket, answerApproach, releaseDriver, releaseCost,
  rivalOffers, releaseFee, MARKET_STAGES, APPROACHES_PER_WINTER, SIGNS_AT, STAGE_DISCOUNT,
} from '../engine/people.js'
import { backingBase } from '../engine/contracts.js'
import { money } from './format.js'

const trend = (d) => {
  const x = overall(d) - d.lastOverall
  return x === 0 ? '—' : `${x > 0 ? '+' : ''}${x}`
}

function Attrs({ d }) {
  return <><td className="n">{d.pace}</td><td className="n">{d.racecraft}</td><td className="n">{d.consistency}</td><td className="n">{d.wet}</td><td className="n">{d.feedback}</td><td className="n">{d.marketability}</td></>
}

// Backing estimate. The Commercial Director's rating sets how wide the range is.
function backingRange(game, d) {
  const base = backingBase(d)
  if (base < 0.05) return 'None'
  const w = Math.max(0.1, 0.45 - game.org.keyStaff.commercialDirector.rating / 250)
  return `${money(base * (1 - w))}–${money(base * (1 + w))}`
}

function OfferForm({ game, d, act, onDone }) {
  const mine = d.teamId === PLAYER
  const [role, setRole] = useState(mine ? d.contract.role : 'race')
  const demand = marketDemand(game, d, role)
  const [salary, setSalary] = useState(() => Number(demand.toFixed(2)))
  const [years, setYears] = useState(d.loanFrom ? 1 : d.prefYears)
  const [numberOne, setNumberOne] = useState(false)
  const [releaseClause, setReleaseClause] = useState(false)
  const [msg, setMsg] = useState('')
  const offer = { role, salary: Number(salary) || 0, years: Number(years), numberOne, releaseClause }
  const est = offerInterest(game, d, offer, false)
  const lo = est.estimate - 10
  const hi = est.estimate + 10
  const verdict = lo >= SIGNS_AT ? 'will sign' : hi < SIGNS_AT ? 'will refuse' : 'might sign'
  return (
    <div className="panel">
      <b>Offer to {d.name}</b>{d.loanFrom ? <span className="muted"> · one-season loan from {game.teams[d.loanFrom]?.name}</span> : null}
      <p>
        <label>Role <select value={role} onChange={(e) => setRole(e.target.value)}><option value="race">Race seat</option><option value="reserve">Reserve</option></select></label>
        <label>Salary £<input type="number" step="0.05" min="0" style={{ width: 80 }} value={salary} onChange={(e) => setSalary(e.target.value)} />m a year</label>
        <span className="muted gap">Demand {money(demand, 2)}</span>
      </p>
      <p>
        <label>Length <select value={years} disabled={!!d.loanFrom} onChange={(e) => setYears(e.target.value)}>{[1, 2, 3].map((y) => <option key={y} value={y}>{y} season{y > 1 ? 's' : ''}</option>)}</select></label>
        <label><input type="checkbox" checked={numberOne} disabled={role !== 'race'} onChange={(e) => setNumberOne(e.target.checked)} /> Number-one status</label>
        <label><input type="checkbox" checked={releaseClause} onChange={(e) => setReleaseClause(e.target.checked)} /> Release clause (a rival can buy them for {money(releaseFee({ salary: offer.salary }), 1)})</label>
      </p>
      <p>
        Estimated interest <b>{Math.round(lo)}–{Math.round(hi)}</b> (60 signs): <b className={verdict === 'will sign' ? 'good' : verdict === 'will refuse' ? 'bad' : ''}>{verdict}</b>.
        <span className="muted gap">{est.parts.map((p) => `${p.label} ${p.value > 0 && p.label !== 'Base' ? '+' : ''}${Math.round(p.value)}`).join(' · ')} · personal factor hidden (±10)</span>
      </p>
      <button className="primary" onClick={() => {
        const r = act((g) => offerContract(g, d.id, offer))
        if (r?.accepted) onDone()
        else if (r) setMsg(`${d.name} turned the offer down (interest ${Math.round(r.interest)}). ${r.triesLeft} approach${r.triesLeft === 1 ? '' : 'es'} left this winter.`)
      }}>Make the offer</button>{' '}
      <button onClick={onDone}>Cancel</button>
      {msg && <p className="bad">{msg}</p>}
    </div>
  )
}

export function Approaches({ game, act }) {
  if (!game.approaches?.length) return null
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Approaches from rivals</h3>
      <p className="muted">Answer these before setting targets. Unanswered bids for drivers are turned down; unanswered offers to staff are not matched, so they leave.</p>
      {game.approaches.map((a) => (
        <p key={a.id}>
          {a.text}.{' '}
          {a.kind === 'driver'
            ? <><button onClick={() => act((g) => answerApproach(g, a.id, true))}>Accept {money(a.fee)}</button>{' '}<button onClick={() => act((g) => answerApproach(g, a.id, false))}>Refuse</button></>
            : <><button onClick={() => act((g) => answerApproach(g, a.id, true))}>Match</button>{' '}<button onClick={() => act((g) => answerApproach(g, a.id, false))}>Let them go</button></>}
        </p>
      ))}
    </div>
  )
}

export function MarketStatus({ game, act }) {
  const m = game.market
  if (game.phase !== 'preseason') return null
  if (m.closed) return <p className="muted">The driver market has closed for this winter. Unsigned drivers can still be approached until the targets are set.</p>
  return (
    <p>
      Driver market: <b>stage {m.stage} of {MARKET_STAGES}</b>. Rivals sign drivers between stages, and unsigned drivers cut their demands by about {Math.round((1 - STAGE_DISCOUNT) * 100)}% at each stage.{' '}
      <button onClick={() => act((g) => advanceMarket(g))}>{m.stage < MARKET_STAGES ? `Go to stage ${m.stage + 1}` : 'Close the market'}</button>
    </p>
  )
}

export default function DriversTab({ game, act }) {
  const [open, setOpen] = useState(null)
  const [filter, setFilter] = useState('signable')
  const pre = game.phase === 'preseason'
  const team = game.teams[PLAYER]
  const mine = [...team.drivers, ...(game.reserve ? [game.reserve] : [])].map((id) => game.drivers[id])
  const juniors = Object.values(game.drivers).filter((d) => d.academy && !d.teamId)
  const free = Object.values(game.drivers).filter((d) => !d.teamId && !d.academy)
    .filter((d) => filter === 'all' || overall(d) >= 74)
    .sort((a, b) => overall(b) - overall(a))
  const row = (d, extra) => {
    const block = pre ? canApproach(game, d) : 'Drivers can only be signed in pre-season'
    const est = offerInterest(game, d, { role: 'race', salary: marketDemand(game, d), years: d.prefYears }, false).estimate
    return (
      <React.Fragment key={d.id}>
        <tr>
          <td>{d.name}{extra}</td><td className="n">{d.age}</td><td className="n">{overall(d)}</td><td className="n">{trend(d)}</td><Attrs d={d} />
          <td className="n">{d.prefYears}</td><td className="n">{money(marketDemand(game, d), 2)}</td>
          <td className="n">{Math.round(est - 10)}–{Math.round(est + 10)}</td><td className="n">{rivalOffers(game, d) || ''}</td>
          <td>{backingRange(game, d)}</td><td className="n">{APPROACHES_PER_WINTER - (game.market.tries[d.id] || 0)}</td>
          <td>{block ? <span className="muted">{pre ? '—' : ''}</span> : <button onClick={() => setOpen(open === d.id ? null : d.id)}>Offer…</button>}</td>
        </tr>
        {open === d.id && <tr><td colSpan={17}><OfferForm game={game} d={d} act={act} onDone={() => setOpen(null)} /></td></tr>}
      </React.Fragment>
    )
  }
  const head = <tr><th>Driver</th><th className="n">Age</th><th className="n">Overall</th><th className="n">Last year</th><th className="n">Pace</th><th className="n">Racecraft</th><th className="n">Consist.</th><th className="n">Wet</th><th className="n">Feedback</th><th className="n">Market.</th><th className="n">Prefers</th><th className="n">Demand</th><th className="n">Interest at demand</th><th className="n">Rival offers</th><th>Backing</th><th className="n">Approaches left</th><th /></tr>

  return (
    <div>
      <h2>Your drivers</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Driver</th><th>Role</th><th className="n">Age</th><th className="n">Overall</th><th className="n">Last year</th><th className="n">Salary</th><th className="n">Backing</th><th>Contract</th><th>Terms</th><th className="n">Starts</th><th className="n">Points</th><th /></tr></thead>
          <tbody>
            {mine.map((d) => (
              <React.Fragment key={d.id}>
                <tr className={d.contract.expired ? '' : 'me'}>
                  <td>{d.name}</td><td>{d.contract.role === 'reserve' ? 'Reserve' : 'Race'}{d.contract.loan ? `, loan from ${game.teams[d.loanFrom]?.name ?? d.loanFrom}` : ''}</td>
                  <td className="n">{d.age}</td><td className="n">{overall(d)}</td><td className="n">{trend(d)}</td>
                  <td className="n">{money(d.contract.salary, 2)}</td><td className="n">{d.contract.backing ? money(d.contract.backing, 2) : '—'}</td>
                  <td>{d.contract.expired ? <b className="bad">Out of contract</b> : `${d.contract.years} season${d.contract.years > 1 ? 's' : ''} left`}</td>
                  <td>{[d.contract.numberOne && 'Number one', d.contract.releaseClause && `Release clause ${money(releaseFee(d.contract))}`].filter(Boolean).join(', ') || '—'}</td>
                  <td className="n">{d.career.starts}</td><td className="n">{d.career.points}</td>
                  <td>{pre && (
                    <>
                      {d.contract.expired && !canApproach(game, d) && <button onClick={() => setOpen(open === d.id ? null : d.id)}>Re-sign…</button>}{' '}
                      <button onClick={() => { const c = releaseCost(d); if (window.confirm(c > 0 ? `Release ${d.name}? It costs ${money(c, 2)}.` : `Let ${d.name} go?`)) act((g) => releaseDriver(g, d.id)) }}>{d.contract.expired ? 'Let go' : `Release (${money(releaseCost(d), 2)})`}</button>
                    </>
                  )}</td>
                </tr>
                {open === d.id && <tr><td colSpan={12}><OfferForm game={game} d={d} act={act} onDone={() => setOpen(null)} /></td></tr>}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!pre && <p className="muted">Drivers can be signed and released in pre-season, before the season's targets are set.</p>}
      <p className="muted">Ratings change at mid-season and at season end: young drivers grow towards a hidden potential, veterans fade, and results against the team-mate add or take away a point. Releasing a driver costs {Math.round(60)}% of the salary left on the contract.</p>

      <Approaches game={game} act={act} />
      <MarketStatus game={game} act={act} />

      {juniors.length > 0 && (
        <>
          <h2>Your academy</h2>
          <p className="muted">Academy juniors race in the junior series and develop there. They are keen to step up (+20 interest) and ask for less. They leave the academy at 24.</p>
          <div className="scroll"><table><thead>{head}</thead><tbody>{juniors.map((d) => row(d, ' (academy)'))}</tbody></table></div>
        </>
      )}

      <h2>Drivers without a seat</h2>
      <p className="muted">
        Interest is shown before the hidden personal factor (±10); 60 signs. Each driver hears three approaches a winter. A driver who has signed a rival's offer is gone, and each rival chasing a driver costs 10 interest.
        Loan drivers come from a rival's academy for one season at a low salary, and the parent team can recall them.{' '}
        <label><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="signable">Overall 74 and above</option><option value="all">Everyone</option></select></label>
      </p>
      <div className="scroll">
        <table>
          <thead>{head}</thead>
          <tbody>{free.map((d) => row(d, d.loanFrom ? ` (loan, ${game.teams[d.loanFrom]?.name})` : d.seat === 'other' ? ' (other series)' : ''))}</tbody>
        </table>
      </div>
      {game.market.log.length > 0 && (
        <>
          <h3>Market moves this winter</h3>
          <ul className="plain">{game.market.log.slice().reverse().slice(0, 40).map((l, i) => <li key={i}>{l}</li>)}</ul>
        </>
      )}
    </div>
  )
}
