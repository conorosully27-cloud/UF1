import React, { useId } from 'react'
import { faceTraits, faceParts } from './faces.js'

// A driver's face, head and shoulders in their team's colour (faces.js).
// `mood` runs from -1 (angry) to 1 (delighted); `age` and `traits` default to
// the driver's own.
export default function Face({ driver, color = '#8b93a3', mood = 0, size = 64, age, traits, title }) {
  const clip = useId()
  const t = traits ?? faceTraits(driver)
  const parts = faceParts(t, { age: age ?? driver?.age ?? 25, mood, suit: color })
  return (
    <svg className="face" width={size} height={size} viewBox="10 10 80 80" role="img" aria-label={title ?? driver?.name ?? 'Driver'}>
      <defs><clipPath id={clip}><rect x="10" y="10" width="80" height="80" rx="14" /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="10" y="10" width="80" height="80" fill="var(--panel-2)" />
        {parts.map((q, i) => (q.e
          ? <ellipse key={i} cx={q.e[0]} cy={q.e[1]} rx={q.e[2]} ry={q.e[3]} fill={q.fill} opacity={q.o} />
          : <path key={i} d={q.d} fill={q.fill} stroke={q.stroke} strokeWidth={q.w} opacity={q.o} strokeLinecap="round" strokeLinejoin="round" />))}
      </g>
    </svg>
  )
}
