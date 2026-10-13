import React, { createContext, useContext, useEffect, useMemo } from 'react'

// Moments: the big things that happen on a race weekend, shown over the
// screen. Big ones fill the screen and wait for a tap; banners sweep across
// and clear themselves. They queue, so two at once play one after the other.

export const MomentContext = createContext({ show: () => {}, active: null })
export const useMoments = () => useContext(MomentContext)

const BANNER_MS = { lights: 4300, default: 2700 }
const PLACE = { 1: 'gold', 2: 'silver', 3: 'bronze' }

function Lights() {
  return (
    <div className="lights">
      {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ '--i': i }}><i /><i /></span>)}
    </div>
  )
}

function Drivers({ list }) {
  if (!list?.length) return null
  return (
    <div className="m-drivers">
      {list.map((d) => <span key={d.name} className="m-driver" style={{ '--dc': d.color }}><i />{d.name}{d.text ? <b>{d.text}</b> : null}</span>)}
    </div>
  )
}

function Banner({ m }) {
  return (
    <div className={`moment-banner m-${m.kind}`} role="status" aria-live="polite" style={{ '--dur': `${BANNER_MS[m.kind] ?? BANNER_MS.default}ms`, '--dc': m.color }}>
      <div className="m-dim" />
      <div className="m-strip">
        {m.kind === 'lights' ? <><Lights /><div className="m-title m-go">Lights out</div></> : (
          <div className="m-inner">
            {m.kicker && <div className="m-kicker">{m.kicker}</div>}
            <div className="m-title">{m.title}</div>
            {m.sub && <div className="m-sub">{m.sub}</div>}
            <Drivers list={m.drivers} />
          </div>
        )}
      </div>
    </div>
  )
}

function Confetti({ colors }) {
  const bits = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    left: (i * 37) % 100, delay: ((i * 53) % 100) / 60, dur: 2.4 + ((i * 29) % 10) / 6, rot: (i * 47) % 360, color: colors[i % colors.length], w: 6 + (i % 3) * 3,
  })), [colors])
  return <div className="confetti" aria-hidden="true">{bits.map((b, i) => <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: b.color, width: b.w, transform: `rotate(${b.rot}deg)` }} />)}</div>
}

function Big({ m, onDone }) {
  return (
    <div className={`moment-big m-${m.kind}`} role="dialog" aria-modal="true" aria-label={m.title} onClick={onDone}>
      {m.confetti?.length !== 0 && <Confetti colors={m.confetti ?? ['#ffd23f', '#ffffff', m.color ?? '#ff5a36']} />}
      <div className="m-card" onClick={(e) => e.stopPropagation()}>
        {m.ribbon && <div className="m-ribbon">{m.ribbon}</div>}
        {m.kicker && <div className="m-kicker">{m.kicker}</div>}
        {m.place && <div className={`m-place ${PLACE[m.place] ?? ''}`}>P{m.place}</div>}
        <div className="m-title">{m.title}</div>
        {m.sub && <div className="m-sub">{m.sub}</div>}
        <Drivers list={m.drivers} />
        <button className="primary" autoFocus onClick={onDone}>Continue</button>
      </div>
    </div>
  )
}

export function MomentLayer({ queue, onDone }) {
  const m = queue[0]
  useEffect(() => {
    if (!m || m.size === 'big') return undefined
    const t = setTimeout(onDone, BANNER_MS[m.kind] ?? BANNER_MS.default)
    return () => clearTimeout(t)
  }, [m, onDone])
  useEffect(() => {
    if (m?.size !== 'big') return undefined
    const key = (e) => { if (e.key === 'Escape' || e.key === 'Enter') onDone() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [m, onDone])
  if (!m) return null
  return m.size === 'big' ? <Big key={m.key} m={m} onDone={onDone} /> : <Banner key={m.key} m={m} />
}
