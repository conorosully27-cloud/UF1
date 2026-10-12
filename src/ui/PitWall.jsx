import React, { useState } from 'react'
import { PLAYER } from '../engine/game.js'
import { rivalTracker } from '../engine/highlights.js'
import { TRACK_BY_ID } from '../engine/data/tracks.js'
import { teamColor, ordinal } from './format.js'

// The season so far, round by round: best finish, or what is still to come.
export function CalendarStrip({ game }) {
  return (
    <div className="chips" style={{ margin: '8px 0' }}>
      {game.calendar.map((id, i) => {
        const res = game.results.find((r) => r.round === i)
        const best = res ? Math.min(...res.race.filter((r) => r.teamId === PLAYER).map((r) => (r.status === 'dnf' ? 99 : r.pos))) : null
        const next = i === game.round && game.phase === 'season'
        return (
          <span key={id} className={`chip${best && best <= 10 ? ' ok' : ''}`} style={next ? { borderColor: 'var(--accent)', color: 'var(--text)' } : undefined} title={TRACK_BY_ID[id].name}>
            {TRACK_BY_ID[id].name} {res ? <b>{best === 99 ? 'DNF' : `P${best}`}</b> : next ? '◀ next' : ''}
          </span>
        )
      })}
    </div>
  )
}

// The head-to-head with the team just ahead in last year's championship.
export function RivalCard({ game }) {
  const r = rivalTracker(game)
  if (!r) return null
  const n = r.n
  const side = (label, mine, theirs) => (
    <>
      <span className="l big">{mine}</span><span className="muted">{label}</span><span className="big">{theirs}</span>
    </>
  )
  return (
    <div className="panel">
      <div className="kicker">Your rival this season</div>
      <h2 style={{ margin: '2px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 4, height: 18, borderRadius: 2, background: teamColor(game, r.rival) }} />{r.name}
      </h2>
      {n === 0 ? <p className="muted">They finished just ahead of you last year. Beat them this season.</p> : (
        <div className="h2h">
          <span className="l muted">{game.teams[PLAYER].name}</span><span /><span className="muted">{r.name}</span>
          {side('races', r.races, n - r.races)}
          {side('qualifying', r.quali, n - r.quali)}
          {side('points', r.points, r.rivalPoints)}
        </div>
      )}
      <p className="muted" style={{ marginTop: 8 }}>Races and qualifying count the better of your two cars against theirs. Beat them in the championship to finish {ordinal(r.prizeGain)} or higher.</p>
    </div>
  )
}

// The car's gap to the fastest car, round by round: are we catching up?
export function GapChart({ game }) {
  const [hover, setHover] = useState(null)
  const h = (game.paceHistory ?? []).slice(-32)
  if (h.length < 2) {
    return (
      <div className="panel">
        <div className="kicker">Gap to the fastest car</div>
        <p className="muted">The chart fills in as the season goes. Every upgrade you fit should pull the line up.</p>
      </div>
    )
  }
  const W = 360; const H = 150; const L = 34; const R = 10; const T = 10; const B = 22
  const vals = h.flatMap((x) => [x.gap, x.rivalGap]).filter((v) => v != null)
  const max = Math.max(0.5, Math.ceil(Math.max(...vals) * 2) / 2)
  const x = (i) => L + (i * (W - L - R)) / (h.length - 1)
  const y = (v) => T + (v / max) * (H - T - B)
  const line = (key) => h.map((p, i) => (p[key] == null ? null : `${x(i)},${y(p[key])}`)).filter(Boolean).join(' ')
  const ticks = []
  for (let v = 0; v <= max + 1e-9; v += max > 2 ? 1 : 0.5) ticks.push(v)
  const rival = game.lastStandings[game.lastStandings.indexOf(PLAYER) - 1]
  const me = 'var(--accent)'
  const them = rival ? teamColor(game, rival) : 'var(--muted)'
  const seasons = h.map((p, i) => (i > 0 && p.season !== h[i - 1].season ? i : null)).filter((i) => i !== null)
  const pick = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    setHover(Math.max(0, Math.min(h.length - 1, Math.round(((px - L) / (W - L - R)) * (h.length - 1)))))
  }
  const hp = hover != null ? h[hover] : null
  return (
    <div className="panel">
      <div className="kicker">Gap to the fastest car</div>
      <div className="legend" style={{ margin: '6px 0' }}>
        <span style={{ '--c': me }}>{game.teams[PLAYER].name}</span>
        {rival && <span style={{ '--c': them }}>Team ahead last year ({game.teams[rival].name})</span>}
      </div>
      <div style={{ position: 'relative' }}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} onMouseMove={pick} onMouseLeave={() => setHover(null)} onTouchStart={(e) => pick(e.touches[0] ? { currentTarget: e.currentTarget, clientX: e.touches[0].clientX } : e)} role="img" aria-label="Seconds a lap behind the fastest car, round by round">
          {ticks.map((v) => <g key={v}><line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{v.toFixed(1)}</text></g>)}
          {seasons.map((i) => <g key={i}><line x1={x(i) - 0.5} x2={x(i) - 0.5} y1={T} y2={H - B} stroke="var(--line)" strokeDasharray="3 3" /><text x={x(i) + 3} y={H - 6}>S{h[i].season}</text></g>)}
          <text x={L} y={H - 6}>S{h[0].season} R{h[0].round}</text>
          {rival && <polyline points={line('rivalGap')} fill="none" stroke={them} strokeWidth="2" strokeLinejoin="round" opacity="0.8" />}
          <polyline points={line('gap')} fill="none" stroke={me} strokeWidth="2" strokeLinejoin="round" />
          <circle cx={x(h.length - 1)} cy={y(h[h.length - 1].gap)} r="4" fill={me} stroke="var(--panel)" strokeWidth="2" />
          {hp && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth="1" />}
          {hp && <circle cx={x(hover)} cy={y(hp.gap)} r="4" fill={me} stroke="var(--panel)" strokeWidth="2" />}
          {hp && hp.rivalGap != null && <circle cx={x(hover)} cy={y(hp.rivalGap)} r="4" fill={them} stroke="var(--panel)" strokeWidth="2" />}
        </svg>
        {hp && (
          <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}>
            Season {hp.season}, round {hp.round}: <b>{hp.gap.toFixed(2)} s</b>{hp.rivalGap != null ? ` · rival ${hp.rivalGap.toFixed(2)} s` : ''}
          </div>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Seconds a lap behind the fastest car on an average track. Lower is better.</p>
    </div>
  )
}
