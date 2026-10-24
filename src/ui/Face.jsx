import React, { memo, useId } from 'react'
import { faceTraits, faceParts } from './faces.js'

// A driver's face, head and shoulders in their team's colour (faces.js).
// `mood` runs from -1 (angry) to 1 (delighted); `age` and `traits` default to
// the driver's own. Small faces (32 px and under, as on the timing tower) are
// cropped to the head.
function Face({ driver, color = '#8b93a3', mood = 0, size = 64, age, traits, title }) {
  const clip = useId()
  const t = traits ?? faceTraits(driver)
  const parts = faceParts(t, { age: age ?? driver?.age ?? 25, mood, suit: color })
  const [x, y, w] = size <= 32 ? [22, 12, 56] : [10, 10, 80]
  return (
    <svg className="face" width={size} height={size} viewBox={`${x} ${y} ${w} ${w}`} role="img" aria-label={title ?? driver?.name ?? 'Driver'}>
      <defs><clipPath id={clip}><rect x={x} y={y} width={w} height={w} rx={w * 0.18} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect x={x} y={y} width={w} height={w} fill="var(--panel-2)" />
        {parts.map((q, i) => (q.e
          ? <ellipse key={i} cx={q.e[0]} cy={q.e[1]} rx={q.e[2]} ry={q.e[3]} fill={q.fill} opacity={q.o} />
          : <path key={i} d={q.d} fill={q.fill} stroke={q.stroke} strokeWidth={q.w} opacity={q.o} strokeLinecap="round" strokeLinejoin="round" />))}
      </g>
    </svg>
  )
}

// A face is redrawn only when what it shows changes: the timing tower
// re-renders many times a lap.
const same = (a, b) => a.driver?.id === b.driver?.id && a.driver?.age === b.driver?.age && a.color === b.color && a.mood === b.mood &&
  a.size === b.size && a.age === b.age && a.traits === b.traits && a.title === b.title
export default memo(Face, same)

// A face beside a name, for tables and lists.
export function FaceName({ driver, color, size = 28, mood = 0, children }) {
  return <span className="facename"><Face driver={driver} color={color} size={size} mood={mood} />{children ?? driver.name}</span>
}
