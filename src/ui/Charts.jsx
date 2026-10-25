import React, { useEffect, useRef, useState } from 'react'
import { PLAYER, ROUNDS, getStandings } from '../engine/core.js'
import { perRound, OVERDRAFT } from '../engine/economy.js'
import { rivalTracker } from '../engine/highlights.js'
import { teamColor, money, ordinal } from './format.js'

// The season's charts (VISUALS.md, V5): the championship round by round, and
// cash through the season with the forecast to its end. Both follow the gap
// chart on the pit wall: thin lines, a crosshair and tooltip on hover or touch.
// They are drawn at the width they have, so the text stays the same size from
// a phone to a wide screen.

const H = 190
const L = 38
const R = 12
const T = 10
const B = 22

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(360)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// Which point the pointer is over, from 0 to n - 1.
function usePick(n, x0, x1, W) {
  const [hover, setHover] = useState(null)
  const pick = (e) => {
    const p = e.touches?.[0] ?? e
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((p.clientX - box.left) / box.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - x0) / (x1 - x0)) * (n - 1)))))
  }
  return [hover, { onMouseMove: pick, onTouchStart: pick, onTouchMove: pick, onMouseLeave: () => setHover(null) }]
}

const niceStep = (max) => [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => max / s <= 5) ?? 1000

// Points for every team, round by round: yours and your rival's stand out,
// the rest of the field in grey.
export function ChampionshipChart({ game }) {
  const [ref, W] = useWidth()
  const rounds = game.results.length
  const tables = Array.from({ length: rounds + 1 }, (_, k) => getStandings(game, game.results.slice(0, k)).constructors)
  const [hover, events] = usePick(rounds + 1, L, (W - L - R) * (rounds / ROUNDS) + L, W)
  if (rounds < 1) return null
  const rival = rivalTracker(game)?.rival
  const ids = Object.keys(game.teams)
  const pts = (k, id) => tables[k].find((c) => c.id === id).points
  const max = Math.max(10, ...ids.map((id) => pts(rounds, id)))
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const x = (k) => L + (k * (W - L - R)) / ROUNDS
  const y = (v) => H - B - (v / top) * (H - T - B)
  const line = (id) => tables.map((_, k) => `${x(k).toFixed(1)},${y(pts(k, id)).toFixed(1)}`).join(' ')
  const me = 'var(--accent)'
  const them = rival ? teamColor(game, rival) : null
  const ticks = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  const pos = (k, id) => tables[k].findIndex((c) => c.id === id) + 1
  const lead = hover != null ? tables[hover][0] : null
  return (
    <div className="panel">
      <div className="kicker">Constructors' championship, round by round</div>
      <div className="legend" style={{ margin: '6px 0' }}>
        <span style={{ '--c': me }}>{game.teams[PLAYER].name}</span>
        {rival && <span style={{ '--c': them }}>{game.teams[rival].name} (your rival)</span>}
        <span style={{ '--c': 'var(--line)' }}>The rest</span>
      </div>
      <div ref={ref} style={{ position: 'relative' }}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} {...events} role="img" aria-label="Constructors' championship points after each round">
          {ticks.map((v) => <g key={v}><line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
          <text x={L} y={H - 6}>Start</text>
          <text x={W - R} y={H - 6} textAnchor="end">Round {ROUNDS}</text>
          {ids.filter((id) => id !== PLAYER && id !== rival).map((id) => <polyline key={id} points={line(id)} fill="none" stroke="var(--line)" strokeWidth="1.5" strokeLinejoin="round" />)}
          {rival && <polyline points={line(rival)} fill="none" stroke={them} strokeWidth="2" strokeLinejoin="round" />}
          <polyline points={line(PLAYER)} fill="none" stroke={me} strokeWidth="2" strokeLinejoin="round" />
          <circle cx={x(rounds)} cy={y(pts(rounds, PLAYER))} r="4" fill={me} stroke="var(--panel)" strokeWidth="2" />
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth="1" />}
          {hover != null && rival && <circle cx={x(hover)} cy={y(pts(hover, rival))} r="4" fill={them} stroke="var(--panel)" strokeWidth="2" />}
          {hover != null && <circle cx={x(hover)} cy={y(pts(hover, PLAYER))} r="4" fill={me} stroke="var(--panel)" strokeWidth="2" />}
        </svg>
        {hover != null && (
          <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}>
            {hover === 0 ? 'Start of the season' : `After round ${hover}`}: you <b>{pts(hover, PLAYER)}</b> ({ordinal(pos(hover, PLAYER))})
            {rival && <> · {game.teams[rival].name} {pts(hover, rival)}</>}
            {hover > 0 && lead.id !== PLAYER && <> · leader {lead.name} {lead.points}</>}
          </div>
        )}
      </div>
    </div>
  )
}

// Cash after each round so far, then the forecast to the season's end if
// nothing changes (dashed), against zero and the overdraft limit.
export function CashChart({ game, planned = 0 }) {
  const [ref, W] = useWidth()
  const done = game.phase === 'seasonEnd' ? ROUNDS : game.round
  const past = game.results.map((r) => (r.cash ?? null))
  const series = []
  for (let k = 1; k <= done; k++) series.push({ k, cash: past[k - 1], actual: true })
  let cash = game.finance.cash
  series.push({ k: done, cash, actual: true, now: true })
  for (let i = 0; done + i < ROUNDS; i++) {
    cash += perRound(game, i).net - planned
    series.push({ k: done + i + 1, cash, actual: false })
  }
  const pts = series.filter((p) => p.cash != null)
  const byK = new Map()
  for (const p of pts) byK.set(p.k, p)
  const list = [...byK.values()].sort((a, b) => a.k - b.k)
  const [hover, events] = usePick(ROUNDS + 1, L, W - R, W)
  const vals = list.map((p) => p.cash)
  const lo = Math.min(OVERDRAFT, ...vals)
  const hi = Math.max(5, ...vals)
  const step = niceStep(hi - lo)
  const bottom = Math.floor(lo / step) * step
  const top = Math.ceil(hi / step) * step
  const x = (k) => L + (k * (W - L - R)) / ROUNDS
  const y = (v) => H - B - ((v - bottom) / (top - bottom)) * (H - T - B)
  const path = (rows) => rows.map((p) => `${x(p.k).toFixed(1)},${y(p.cash).toFixed(1)}`).join(' ')
  const actual = list.filter((p) => p.actual)
  const ahead = list.filter((p) => !p.actual || p.now)
  const ticks = []
  for (let v = bottom; v <= top + 1e-9; v += step) ticks.push(v)
  const hp = hover != null ? byK.get(hover) : null
  const end = list[list.length - 1]
  return (
    <div className="panel">
      <div className="kicker">Cash through the season</div>
      <div className="legend" style={{ margin: '6px 0' }}>
        <span style={{ '--c': 'var(--accent)' }}>After each round</span>
        <span className="dashed" style={{ '--c': 'var(--accent)' }}>Forecast if nothing changes</span>
      </div>
      <div ref={ref} style={{ position: 'relative' }}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} {...events} role="img" aria-label={`Cash through the season: ${money(game.finance.cash, 1)} now, ${money(end.cash, 1)} forecast at the end`}>
          {ticks.map((v) => <g key={v}><line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth="1" />
          <line x1={L} x2={W - R} y1={y(OVERDRAFT)} y2={y(OVERDRAFT)} stroke="var(--bad)" strokeWidth="1" strokeDasharray="4 3" />
          <text x={W - R} y={y(OVERDRAFT) - 4} textAnchor="end">Overdraft limit</text>
          <text x={L} y={H - 6}>Start</text>
          <text x={W - R} y={H - 6} textAnchor="end">Round {ROUNDS}</text>
          {actual.length > 1 && <polyline points={path(actual)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />}
          {ahead.length > 1 && <polyline points={path(ahead)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />}
          <circle cx={x(done)} cy={y(game.finance.cash)} r="4" fill="var(--accent)" stroke="var(--panel)" strokeWidth="2" />
          {hp && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth="1" />}
          {hp && <circle cx={x(hover)} cy={y(hp.cash)} r="4" fill="var(--accent)" stroke="var(--panel)" strokeWidth="2" />}
        </svg>
        {hp && (
          <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}>
            {hp.now ? 'Now' : hover === 0 ? 'Start of the season' : `${hp.actual ? 'After' : 'Forecast after'} round ${hover}`}: <b>{money(hp.cash, 1)}</b>
          </div>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>£m. The forecast leaves out sponsor bonuses and crash damage.</p>
    </div>
  )
}
