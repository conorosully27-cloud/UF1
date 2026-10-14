import React, { useState } from 'react'
import { describeDecision, resolveDecision } from '../engine/decisions.js'
import { LEVELS, CATEGORIES, targetProgress } from '../engine/targets.js'
import { ROLES } from '../engine/org.js'
import { ROUNDS } from '../engine/core.js'

const fmt = (t, value) => {
  if (t.id === 'cash' || t.id === 'sponsor') return `£${value.toFixed(1)}m`
  if (t.id === 'rating') return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
  if (t.id === 'pos' || t.id === 'best') return value >= 24 && t.id === 'best' ? '—' : `${value}`
  return `${value}`
}

// The round's decision, or (with `dec`, `heading` and `onChoose`) an incident during a live weekend.
export function DecisionPanel({ game, act, dec = game.decision, heading = "This round's decision", onChoose, className = '' }) {
  const d = describeDecision(game, dec)
  if (!d) return null
  const choose = onChoose ?? ((key) => act((g) => { resolveDecision(g, key) }))
  const precision = d.staffRating >= 80 ? 'exact odds' : d.staffRating >= 60 ? 'odds to the nearest 10%' : 'a rough guess at the odds'
  const option = (key) => {
    const o = d[key]
    const chosen = d.resolved && d.choice === key
    return (
      <div className="panel" style={{ flex: '1 1 320px', borderColor: chosen ? 'var(--good)' : undefined, borderWidth: chosen ? 2 : 1 }}>
        <b>{key.toUpperCase()}: {o.label}</b>
        <p>{o.text}</p>
        {!d.resolved && <button className="primary" onClick={() => choose(key)}>Choose {key.toUpperCase()}</button>}
        {chosen && <p className="good">Chosen</p>}
      </div>
    )
  }
  return (
    <div className={`panel ${className}`}>
      <h2 style={{ marginTop: 0 }}>{heading}: {d.title}</h2>
      <p className="muted">{d.type}</p>
      <p>{d.text}</p>
      <div className="row">{option('a')}{option('b')}</div>
      <p className="muted">What decides it: {d.factors}. Your {ROLES[d.staff]} (rated {d.staffRating}) gives {precision}.</p>
      {d.resolved && d.outcome.filter(Boolean).map((line, i) => <p key={i}><b>Result:</b> {line}</p>)}
    </div>
  )
}

export function DecisionLog({ game }) {
  const log = game.decisionLog.slice().reverse()
  return (
    <div>
      <h2>Decisions</h2>
      {log.length === 0 ? <p className="muted">No decisions yet. One comes up before every race.</p> : (
        <div className="scroll">
          <table>
            <thead><tr><th>Season</th><th>Round</th><th>Type</th><th>Decision</th><th>Choice</th><th>What happened</th></tr></thead>
            <tbody>
              {log.map((l, i) => (
                <tr key={i}>
                  <td>{l.season}</td><td>{l.round + 1}</td><td>{l.type}</td><td>{l.title}</td><td>{l.choice.toUpperCase()}: {l.label}</td>
                  <td style={{ whiteSpace: 'normal' }}>{l.outcome.filter(Boolean).join('. ') || 'As described'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Pre-season: choose one objective from each category and a level for each.
export function TargetPicker({ game, onStart, onBack }) {
  const offer = game.targets.offer
  const [picks, setPicks] = useState({})
  const cats = Object.keys(CATEGORIES)
  const ready = cats.every((c) => picks[c])
  const key = (o) => `${o.id}:${o.area ?? ''}`
  const start = () => onStart(cats.map((c) => { const o = offer.find((x) => key(x) === picks[c].key); return { id: o.id, area: o.area, level: picks[c].level } }))
  return (
    <div>
      <h2>Season targets</h2>
      <p>Pick one objective in each category and how ambitious to be. A reward is paid only at the level you choose; reaching a lower mark pays nothing. Every missed target costs 5 owner confidence (currently {game.confidence.toFixed(0)}); meeting all three adds 3 reputation.</p>
      <p className="muted">The marks come from 150 quick simulations of your season under average management. Results targets are set so that average team reaches Safe about four times in five, Standard about half the time and Stretch about one time in five. Cash, sponsor, development and facility targets are set against what an average manager would do, so they depend mostly on your choices.</p>
      {cats.map((c) => (
        <div className="panel" key={c}>
          <h3 style={{ marginTop: 0 }}>{CATEGORIES[c].label}</h3>
          <table>
            <thead><tr><th>Objective</th>{Object.entries(LEVELS).map(([id, l]) => <th key={id}>{l.label} ({l.mult}×)</th>)}</tr></thead>
            <tbody>
              {offer.filter((o) => o.category === c).map((o) => (
                <tr key={key(o)}>
                  <td>{o.name}</td>
                  {Object.keys(LEVELS).map((lvl) => {
                    const on = picks[c]?.key === key(o) && picks[c]?.level === lvl
                    return <td key={lvl}><button className={on ? 'primary' : ''} onClick={() => setPicks((prev) => ({ ...prev, [c]: { key: key(o), level: lvl } }))}>{o.levels[lvl]}</button></td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Reward if met: {Object.entries(LEVELS).map(([id, l]) => `${l.label}: ${CATEGORIES[c].reward(l.mult)}, +${l.confidence} owner confidence`).join(' · ')}</p>
        </div>
      ))}
      <button onClick={onBack}>Back to pre-season</button>{' '}
      <button className="primary" disabled={!ready} onClick={start}>Start the season</button>
    </div>
  )
}

export function TargetReport({ report }) {
  if (!report) return null
  return (
    <>
      <h3>Season targets{report.sweep ? ': all three met, +3 reputation' : ''}</h3>
      <table>
        <thead><tr><th>Target</th><th>Level</th><th>Mark</th><th>Result</th><th className="n">Owner confidence</th><th>Reward</th></tr></thead>
        <tbody>
          {report.report.map((r, i) => (
            <tr key={i}><td>{r.name}</td><td>{r.level}</td><td>{r.mark}</td><td className={r.met ? 'good' : 'bad'}>{r.met ? 'Met' : 'Missed'}</td>
              <td className="n">{r.confidence > 0 ? '+' : ''}{r.confidence}</td><td>{r.reward || '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function TargetsTab({ game }) {
  const progress = targetProgress(game)
  return (
    <div>
      <h2>Season targets</h2>
      <p>Owner confidence <b>{game.confidence.toFixed(0)}</b> of 100. If it reaches zero an investor steps in, as with running out of cash.</p>
      {progress.length === 0 ? <p className="muted">Targets are set in pre-season, just before the first race.</p> : (
        <table>
          <thead><tr><th>Category</th><th>Target</th><th>Level</th><th>Mark</th><th>So far</th><th>Status</th></tr></thead>
          <tbody>
            {progress.map((t, i) => (
              <tr key={i}>
                <td>{CATEGORIES[t.category].label}</td><td>{t.name}</td><td>{LEVELS[t.level].label}</td><td>{t.levels[t.level]}</td><td>{fmt(t, t.value)}</td>
                <td className={t.met ? 'good' : ''}>{t.met ? 'On the mark' : `Not yet (${ROUNDS - game.round} rounds left)`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(game.bonus.capacity > 0 || game.bonus.sponsor > 0) && (
        <p>Active this season: {game.bonus.capacity > 0 && <>+{(game.bonus.capacity * 100).toFixed(0)}% engineering capacity </>}{game.bonus.sponsor > 0 && <>sponsor offers worth {(game.bonus.sponsor * 100).toFixed(1)}% more</>}</p>
      )}
      {game.targets.history.slice().reverse().map((h) => (
        <div key={h.season}><h3>Season {h.season}</h3><TargetReport report={h} /></div>
      ))}
    </div>
  )
}
