import React, { useId } from 'react'
import { onColor } from './format.js'
import { BADGE_SHAPES, livery, initials } from './livery.js'

// The team's badge (VISUALS.md, V5): a shape in the team colour with a band
// in the livery's second colour and the team's initials, picked when the team
// is founded and changeable in the settings.

export default function Badge({ team, size = 28, shape, accent }) {
  const clip = useId()
  const l = livery(team)
  const d = BADGE_SHAPES[shape ?? l.badge] ?? BADGE_SHAPES.shield
  const band = accent ?? l.accent
  return (
    <svg className="badge" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${team.name} badge`}>
      <defs><clipPath id={clip}><path d={d} /></clipPath></defs>
      <path d={d} fill={team.color} />
      <g clipPath={`url(#${clip})`}><path d="M-10 70 L70 -10 L86 -10 L6 70 Z M-10 100 L100 -10 L110 0 L0 110 Z" fill={band} opacity="0.95" /></g>
      <path d={d} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="3" />
      <text x="50" y="61" textAnchor="middle" fontSize="34" fontWeight="800" fill={onColor(team.color)} stroke={team.color} strokeWidth="5" paintOrder="stroke" fontFamily="inherit">{initials(team.name)}</text>
    </svg>
  )
}
