// Season targets (design section 5.12): three objectives a season, one from
// each category, each at a chosen level of ambition. The marks come from a
// pre-season projection of the team's year under average management.

import { PLAYER, ROUNDS, clamp, seasonMetrics, ordinal } from './core.js'
import { acceptOffer, freeSlots } from './sponsors.js'
import { chassisCap } from './development.js'
import { earn } from './economy.js'

export const LEVELS = {
  safe: { label: 'Safe', mult: 1, confidence: 3, reputation: 1, odds: 'about four times in five' },
  standard: { label: 'Standard', mult: 2.5, confidence: 5, reputation: 3, odds: 'about half the time' },
  stretch: { label: 'Stretch', mult: 6, confidence: 8, reputation: 6, odds: 'about one time in five' },
}
export const MISS_CONFIDENCE = -5
export const CLEAN_SWEEP_REPUTATION = 3
export const CATEGORIES = {
  sporting: { label: 'Sporting', reward: (m) => `an owner bonus of ${(2 * m).toFixed(0)}% of this season's income and +${m === 1 ? 1 : m === 2.5 ? 3 : 6} reputation` },
  commercial: { label: 'Commercial', reward: (m) => `sponsor offers worth ${(3 * m).toFixed(1)}% more next season` },
  technical: { label: 'Technical', reward: (m) => `+${(2 * m).toFixed(0)}% engineering capacity next season` },
}

// The stand-in for "average management": keeps the designers busy, banks a
// little for next year from mid-season, fills empty sponsor slots, and
// neither builds nor hires.
export function averageManager(g) {
  for (const o of g.sponsors.offers.slice().sort((a, b) => b.value - a.value)) {
    if (freeSlots(g, o.tier) > 0) { try { acceptOffer(g, o.id, 'balanced') } catch { /* demand not met */ } }
  }
  const car = g.teams[PLAYER].car
  const turn = g.round % 4
  const mech = turn === 3 ? 'tyreCare' : turn === 1 ? 'reliability' : car.chassis < chassisCap(g) - 1 ? 'chassis' : 'reliability'
  g.dev.repeat.aero = { area: 'aero', size: 'minor', approach: 'standard', rush: false }
  g.dev.repeat.mech = { area: mech, size: 'minor', approach: 'standard', rush: false }
  g.dev.nextYearShare = g.phase === 'season' && g.round >= 8 ? 30 : 0
}

const sorted = (runs, pick) => runs.map(pick).sort((a, b) => a - b)
const at = (arr, q) => arr[clamp(Math.round(q * (arr.length - 1)), 0, arr.length - 1)]

// The figures sponsors use to pitch their targets.
export function outlookFrom(game, runs) {
  const three = (pick) => { const a = sorted(runs, pick); return { low: at(a, 0.2), mid: at(a, 0.5), high: at(a, 0.8) } }
  const lowIsGood = (pick) => { const a = sorted(runs, pick); return { good: at(a, 0.2), mid: at(a, 0.5), poor: at(a, 0.8) } }
  const me = game.lastStandings.indexOf(PLAYER)
  const rival = game.lastStandings[me - 1] ?? game.lastStandings[me + 1] ?? null
  const beat = {}
  for (const id of game.lastStandings) if (id !== PLAYER) beat[id] = runs.filter((m) => m.pos < m.order[id]).length / runs.length
  return {
    pos: lowIsGood((m) => m.pos), best: lowIsGood((m) => m.best), points: three((m) => m.points), classified: three((m) => m.classified),
    rival, ahead: rival ? three((m) => m.ahead[rival] || 0) : null, beat,
  }
}

// Three rising marks set so the projected team reaches them in about 80%,
// 50% and 20% of runs. Returns null if the results are too bunched to make
// three honest levels.
function quantileMarks(runs, pick, { lowerBetter = false, floor = null } = {}) {
  const vals = runs.map((m) => (lowerBetter ? -pick(m) : pick(m)))
  const distinct = [...new Set(vals)].sort((a, b) => a - b)
  if (distinct.length < 2) return null
  const reached = (t) => vals.filter((v) => v >= t).length / vals.length
  const nearest = (odds) => distinct.reduce((best, t) => (Math.abs(reached(t) - odds) < Math.abs(reached(best) - odds) ? t : best), distinct[0])
  const safe = nearest(0.8)
  const standard = Math.max(nearest(0.5), safe + 1)
  const stretch = Math.max(nearest(0.2), standard + 1)
  if (floor !== null && safe < floor) return null
  // Forcing the levels apart must not push them out of reach.
  if (reached(standard) < 0.15 || reached(stretch) < 0.03) return null
  return lowerBetter ? { safe: -safe, standard: -standard, stretch: -stretch } : { safe, standard, stretch }
}

const round = (x, step) => Math.round(x / step) * step
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function scaled(base, factors, step, min) {
  const [a, b, c] = factors.map((f) => Math.max(min, round(base * f, step)))
  return { safe: a, standard: Math.max(b, a + step), stretch: Math.max(c, Math.max(b, a + step) + step) }
}

// Six objectives suited to where the team stands: two per category.
export function buildOffer(game, runs, yearIncome) {
  const o = outlookFrom(game, runs)
  const rivalName = o.rival ? game.teams[o.rival].name : ''
  const sporting = []
  const add = (list, id, marks, extra = {}) => { if (marks) list.push({ id, marks, ...extra }) }
  add(sporting, 'wins', quantileMarks(runs, (m) => m.wins, { floor: 1 }))
  add(sporting, 'podiums', quantileMarks(runs, (m) => m.podiums, { floor: 1 }))
  add(sporting, 'pos', quantileMarks(runs, (m) => m.pos, { lowerBetter: true }), { lowerBetter: true })
  add(sporting, 'points', quantileMarks(runs, (m) => m.points, { floor: 1 }))
  if (o.rival) add(sporting, 'ahead', quantileMarks(runs, (m) => m.ahead[o.rival] || 0), { rival: o.rival })
  add(sporting, 'best', quantileMarks(runs, (m) => m.best, { lowerBetter: true }), { lowerBetter: true })
  if (sporting.length < 2) {
    // Results too predictable for honest percentiles: fall back to a ladder around the usual best finish.
    const mid = at(sorted(runs, (m) => m.best), 0.5)
    if (!sporting.some((s) => s.id === 'best')) sporting.push({ id: 'best', lowerBetter: true, marks: { safe: Math.min(24, mid + 1), standard: Math.max(1, mid), stretch: Math.max(1, mid - 2) } })
    if (sporting.length < 2) sporting.push({ id: 'points', marks: { safe: 1, standard: 3, stretch: 8 } })
  }

  // Cash is judged against what an average manager, who neither builds nor hires, would be left with.
  const idleCash = at(sorted(runs, (m) => m.cash), 0.5)
  const commercial = [
    { id: 'cash', marks: idleCash >= 4 ? scaled(idleCash, [0.35, 0.7, 1.05], 0.5, 1) : scaled(yearIncome, [0.03, 0.08, 0.2], 0.5, 1) },
    { id: 'sponsor', marks: scaled(Math.max(1, at(sorted(runs, (m) => m.sponsor), 0.5)), [0.9, 1.15, 1.5], 0.1, 0.5) },
  ]

  const technical = [{ id: 'rating', area: 'aero', marks: scaled(Math.max(0.5, at(sorted(runs, (m) => m.rating.aero), 0.5)), [0.8, 1.15, 1.6], 0.1, 0.5) }]
  const room = Object.values(game.org.facilities).reduce((s, f) => s + (5 - f.level), 0)
  const classified = quantileMarks(runs, (m) => m.classified)
  if (classified) for (const k of Object.keys(classified)) classified[k] = Math.min(ROUNDS, classified[k])
  const facilities = room >= 4 && game.finance.austerity <= 0 ? { id: 'facilities', marks: { safe: 1, standard: 2, stretch: 3 } } : null
  const second = game.season % 2 === 1 ? [facilities, classified && { id: 'classified', marks: classified }] : [classified && { id: 'classified', marks: classified }, facilities]
  technical.push(second.find(Boolean) ?? { id: 'rating', area: 'chassis', marks: scaled(Math.max(0.5, at(sorted(runs, (m) => m.rating.chassis), 0.5)), [0.8, 1.15, 1.6], 0.1, 0.5) })

  const label = (x) => {
    const v = (lvl) => x.marks[lvl]
    const each = (fn) => ({ safe: fn(v('safe')), standard: fn(v('standard')), stretch: fn(v('stretch')) })
    switch (x.id) {
      case 'wins': return { name: 'Race wins', levels: each((n) => plural(n, 'win')) }
      case 'podiums': return { name: 'Podium finishes', levels: each((n) => plural(n, 'podium')) }
      case 'pos': return { name: "Constructors' Championship position", levels: each((n) => `${ordinal(n)} or better`) }
      case 'points': return { name: 'Points scored', levels: each((n) => plural(n, 'point')) }
      case 'ahead': return { name: `Races with a car ahead of a ${rivalName} car`, levels: each((n) => plural(n, 'race')) }
      case 'best': return { name: 'Best race finish', levels: each((n) => `${ordinal(n)} or better`) }
      case 'cash': return { name: 'Cash at season end, net of bank debt', levels: each((n) => `£${n.toFixed(1)}m`) }
      case 'sponsor': return { name: 'Sponsor fees earned this season', levels: each((n) => `£${n.toFixed(1)}m`) }
      case 'rating': return { name: `${x.area === 'aero' ? 'Aero' : 'Chassis'} rating gained during the season`, levels: each((n) => `+${n.toFixed(1)}`) }
      case 'classified': return { name: 'Races with both cars classified', levels: each((n) => plural(n, 'race')) }
      default: return { name: 'Facility levels completed', levels: each((n) => plural(n, 'level')) }
    }
  }
  const finish = (list, category) => list.slice(0, 2).map((x) => ({ ...x, category, ...label(x) }))
  return [...finish(sporting, 'sporting'), ...finish(commercial, 'commercial'), ...finish(technical, 'technical')]
}

export function targetValue(objective, metrics) {
  if (objective.id === 'ahead') return metrics.ahead[objective.rival] || 0
  if (objective.id === 'rating') return metrics.rating[objective.area]
  return metrics[objective.id]
}

export const targetMetBy = (objective, level, value) => (objective.lowerBetter ? value <= objective.marks[level] + 1e-9 : value >= objective.marks[level] - 1e-9)

// picks: [{ id, level }], one from each category.
export function chooseTargets(game, picks) {
  const offer = game.targets?.offer
  if (!offer) throw new Error('Set up the season targets first')
  if (!Array.isArray(picks) || picks.length !== 3) throw new Error('Choose three targets')
  const chosen = picks.map((p) => {
    const o = offer.find((x) => x.id === p.id && (p.area === undefined || x.area === p.area))
    if (!o) throw new Error('Unknown target')
    if (!LEVELS[p.level]) throw new Error('Choose a level for each target')
    return { ...o, level: p.level }
  })
  if (new Set(chosen.map((c) => c.category)).size !== 3) throw new Error('Choose one target from each category')
  game.targets.chosen = chosen
}

export function targetProgress(game) {
  if (!game.targets?.chosen) return []
  const metrics = seasonMetrics(game)
  return game.targets.chosen.map((t) => ({ ...t, value: targetValue(t, metrics), met: targetMetBy(t, t.level, targetValue(t, metrics)) }))
}

// Season end. Pays the sporting bonus now and returns next season's bonuses.
export function resolveTargets(game, yearIncome) {
  const progress = targetProgress(game)
  const next = { capacity: 0, sponsor: 0 }
  const report = []
  for (const t of progress) {
    const lvl = LEVELS[t.level]
    let reward = ''
    if (t.met) {
      game.confidence = clamp(game.confidence + lvl.confidence, 0, 100)
      if (t.category === 'sporting') {
        const bonus = 0.02 * lvl.mult * yearIncome
        earn(game, 'bonuses', bonus)
        game.reputation = clamp(game.reputation + lvl.reputation, 0, 100)
        reward = `£${bonus.toFixed(2)}m owner bonus, +${lvl.reputation} reputation`
      } else if (t.category === 'commercial') {
        next.sponsor += 0.03 * lvl.mult
        reward = `sponsor offers worth ${(3 * lvl.mult).toFixed(1)}% more next season`
      } else {
        next.capacity += 0.02 * lvl.mult
        reward = `+${(2 * lvl.mult).toFixed(0)}% engineering capacity next season`
      }
    } else {
      game.confidence = clamp(game.confidence + MISS_CONFIDENCE, 0, 100)
    }
    report.push({ name: t.name, level: lvl.label, mark: t.levels[t.level], value: t.value, met: t.met, reward, confidence: t.met ? lvl.confidence : MISS_CONFIDENCE })
  }
  const sweep = progress.length === 3 && progress.every((t) => t.met)
  if (sweep) game.reputation = clamp(game.reputation + CLEAN_SWEEP_REPUTATION, 0, 100)
  return { report, next, sweep }
}
