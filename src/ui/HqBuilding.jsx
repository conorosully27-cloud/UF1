import React from 'react'
import { FACILITIES } from '../engine/org.js'

// The team's HQ as a building (VISUALS.md, V5): one block for each facility,
// growing with its level. A facility not yet built is a dashed outline; one
// being built has scaffolding and a crane. Windows are lit in the team colour.

const GROUND = 186
const WALL = 'var(--panel-2)'
const EDGE = 'var(--muted)'
const SHORT = { designOffice: 'Design', cfd: 'CFD', windTunnel: 'Tunnel', factory: 'Factory', simulator: 'Simulator', raceOps: 'Race ops', commercial: 'Commercial', academy: 'Academy' }

// Rows of lit windows inside a block.
function Windows({ x, y, w, h, cols, rows, lit = 'var(--accent)' }) {
  const out = []
  const cw = w / cols
  const rh = h / rows
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(<rect key={`${r}-${c}`} x={x + c * cw + cw * 0.22} y={y + r * rh + rh * 0.25} width={cw * 0.56} height={rh * 0.45} rx="1" fill={lit} opacity={(r + c) % 3 ? 0.75 : 0.4} />)
  return <>{out}</>
}

// Each facility's block at its level, drawn from its left edge x.
const DRAW = {
  academy: (x, l) => (
    <>
      <rect x={x} y={GROUND - 30} width={44} height={30} fill={WALL} stroke={EDGE} />
      <path d={`M${x - 3} ${GROUND - 30} L${x + 22} ${GROUND - 44} L${x + 47} ${GROUND - 30} Z`} fill={EDGE} />
      <Windows x={x + 4} y={GROUND - 26} w={36} h={14} cols={3} rows={1} />
      <line x1={x + 54} x2={x + 54} y1={GROUND} y2={GROUND - 30 - l * 4} stroke={EDGE} strokeWidth="1.5" />
      <path d={`M${x + 54} ${GROUND - 30 - l * 4} l12 4 l-12 4 Z`} fill="var(--accent)" />
    </>
  ),
  commercial: (x, l) => {
    const h = 34 + l * 16
    return (
      <>
        <rect x={x} y={GROUND - h} width={46} height={h} fill={WALL} stroke={EDGE} />
        <Windows x={x + 3} y={GROUND - h + 3} w={40} h={h - 6} cols={3} rows={Math.max(2, Math.round(h / 12))} lit="var(--ink-2)" />
      </>
    )
  },
  designOffice: (x, l) => {
    const h = 40 + l * 14
    return (
      <>
        <rect x={x} y={GROUND - h} width={92} height={h} fill={WALL} stroke={EDGE} />
        <rect x={x - 4} y={GROUND - h - 6} width={100} height={6} fill={EDGE} />
        <rect x={x + 30} y={GROUND - h - 20} width={32} height={12} rx="2" fill="var(--accent)" />
        <Windows x={x + 4} y={GROUND - h + 4} w={84} h={h - 22} cols={6} rows={Math.max(1, l + 1)} />
        <rect x={x + 38} y={GROUND - 16} width={16} height={16} fill={EDGE} />
      </>
    )
  },
  cfd: (x, l) => (
    <>
      <rect x={x} y={GROUND - 44} width={46} height={44} fill={WALL} stroke={EDGE} />
      {Array.from({ length: 5 }, (_, i) => (
        <g key={i}>
          <rect x={x + 5 + i * 8} y={GROUND - 38} width={5} height={34} fill={EDGE} opacity="0.5" />
          {Array.from({ length: Math.min(4, l) }, (_, j) => <circle key={j} cx={x + 7.5 + i * 8} cy={GROUND - 33 + j * 8} r="1.6" fill={(i + j) % 2 ? 'var(--good)' : 'var(--accent)'} />)}
        </g>
      ))}
    </>
  ),
  windTunnel: (x, l) => {
    const len = 52 + l * 12
    return (
      <>
        <rect x={x} y={GROUND - 30} width={len} height={30} rx="14" fill={WALL} stroke={EDGE} />
        <circle cx={x + len - 15} cy={GROUND - 15} r="10" fill="none" stroke={EDGE} />
        <path d={`M${x + len - 15} ${GROUND - 24} v18 M${x + len - 24} ${GROUND - 15} h18`} stroke={EDGE} />
        <Windows x={x + 8} y={GROUND - 24} w={len - 36} h={10} cols={Math.max(2, l + 2)} rows={1} />
      </>
    )
  },
  simulator: (x, l) => {
    const r = 18 + l * 3
    return (
      <>
        <rect x={x} y={GROUND - 12} width={2 * r + 8} height={12} fill={WALL} stroke={EDGE} />
        <path d={`M${x + 4} ${GROUND - 12} A${r} ${r} 0 0 1 ${x + 4 + 2 * r} ${GROUND - 12} Z`} fill={WALL} stroke={EDGE} />
        <path d={`M${x + 4 + r * 0.4} ${GROUND - 12 - r * 0.55} A${r * 0.8} ${r * 0.8} 0 0 1 ${x + 4 + r * 1.2} ${GROUND - 12 - r * 0.9}`} fill="none" stroke="var(--accent)" strokeWidth="2.5" opacity="0.8" />
      </>
    )
  },
  factory: (x, l) => {
    const teeth = 2 + l
    const w = teeth * 16
    let roof = `M${x} ${GROUND - 34}`
    for (let i = 0; i < teeth; i++) roof += ` l0 -12 l16 12`
    return (
      <>
        <rect x={x} y={GROUND - 34} width={w} height={34} fill={WALL} stroke={EDGE} />
        <path d={`${roof} Z`} fill={WALL} stroke={EDGE} />
        {Array.from({ length: teeth }, (_, i) => <rect key={i} x={x + i * 16 + 1} y={GROUND - 45} width={2.5} height={10} fill="var(--accent)" opacity="0.7" />)}
        <rect x={x + w / 2 - 10} y={GROUND - 22} width={20} height={22} fill={EDGE} opacity="0.6" />
      </>
    )
  },
  raceOps: (x, l) => {
    const trucks = 1 + Math.ceil(l / 2)
    return (
      <>
        <rect x={x} y={GROUND - 30} width={50} height={30} fill={WALL} stroke={EDGE} />
        <rect x={x + 8} y={GROUND - 22} width={34} height={22} fill={EDGE} opacity="0.5" />
        {Array.from({ length: trucks }, (_, i) => (
          <g key={i}>
            <rect x={x + 56 + i * 30} y={GROUND - 16} width={20} height={12} fill="var(--accent)" />
            <rect x={x + 76 + i * 30} y={GROUND - 12} width={7} height={8} fill={EDGE} />
            <circle cx={x + 61 + i * 30} cy={GROUND - 3} r="2.5" fill={EDGE} /><circle cx={x + 79 + i * 30} cy={GROUND - 3} r="2.5" fill={EDGE} />
          </g>
        ))}
      </>
    )
  },
}
const WIDTH = { academy: 70, commercial: 52, designOffice: 100, cfd: 52, windTunnel: 118, simulator: 64, factory: 116, raceOps: 150 }
const ORDER = ['academy', 'commercial', 'designOffice', 'cfd', 'windTunnel', 'simulator', 'factory', 'raceOps']

export default function HqBuilding({ game }) {
  const fac = game.org.facilities
  let x = 10
  const slots = ORDER.map((id) => {
    const s = { id, x, w: WIDTH[id] }
    x += WIDTH[id] + 10
    return s
  })
  const width = x
  return (
    <div className="hq-scroll">
      <svg className="hq" viewBox={`0 50 ${width} 180`} role="img" aria-label={`Headquarters: ${ORDER.map((id) => `${FACILITIES[id].name} level ${fac[id].level}`).join(', ')}`}>
        <rect x="0" y={GROUND} width={width} height="2" fill={EDGE} opacity="0.6" />
        {slots.map(({ id, x: sx, w }) => {
          const f = fac[id]
          const shown = Math.max(f.level, f.building ? f.level + 1 : 0)
          return (
            <g key={id}>
              <title>{FACILITIES[id].name}: level {f.level}{f.building ? `, building level ${f.level + 1} (${f.building.roundsLeft} rounds left)` : ''}</title>
              {/* Not built yet: an outline of what level 1 would be. */}
              <g opacity={f.level === 0 && !f.building ? 0.35 : 1} strokeDasharray={f.level === 0 && !f.building ? '4 3' : undefined}>
                {DRAW[id](sx, Math.max(1, shown) - (f.level === 0 && !f.building ? 1 : 0))}
              </g>
              {f.building && (
                <g stroke="var(--warn)" strokeWidth="1.2" fill="none">
                  <path d={`M${sx + 4} ${GROUND} V${GROUND - 60} M${sx + w - 20} ${GROUND} V${GROUND - 60} M${sx + 4} ${GROUND - 20} H${sx + w - 20} M${sx + 4} ${GROUND - 40} H${sx + w - 20}`} strokeDasharray="3 2" />
                  <path d={`M${sx + w - 14} ${GROUND} V${GROUND - 92} M${sx + w - 40} ${GROUND - 88} H${sx + w + 4} M${sx + w - 34} ${GROUND - 88} V${GROUND - 70}`} />
                </g>
              )}
              <text x={sx + w / 2 - 5} y={GROUND + 20} textAnchor="middle" className="hq-label">{SHORT[id]}</text>
              {Array.from({ length: 5 }, (_, i) => <circle key={i} cx={sx + w / 2 - 5 + (i - 2) * 9} cy={GROUND + 32} r="3" fill={i < f.level ? 'var(--accent)' : 'none'} stroke={i < f.level ? 'none' : 'var(--line)'} />)}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
