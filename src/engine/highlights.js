// Small wins for a team at the back (RACE_WEEKEND.md section 6): weekend
// objectives, driver ratings, the rival head-to-head and the gap to the front
// over time. They give a backmarker something to fight for every Sunday.

import { PLAYER, clamp, effectiveCar, currentTrack, ordinal, getStandings } from './core.js'
import { carScore } from './weekend.js'

const teamName = (game, id) => game.teams[id]?.name ?? id

// Teams ranked by car pace at this round's track.
function paceOrder(game) {
  const track = currentTrack(game)
  return Object.values(game.teams)
    .map((t) => ({ id: t.id, s: carScore(effectiveCar(game, t.id), track.w) }))
    .sort((a, b) => b.s - a.s)
}

// Three goals for the weekend, set from where the car stands at this track.
export function weekendObjectives(game) {
  const rows = paceOrder(game)
  const r = rows.findIndex((x) => x.id === PLAYER)
  const gap = (i) => (rows[i] ? (rows[i].s - rows[r].s) * 0.05 : null)
  const out = []
  const above = rows[r - 1]
  const below = rows[r + 1]
  // A fight with the team just ahead on pace, or the one just behind.
  if (above && gap(r - 1) < 0.15) out.push({ kind: 'beatBoth', team: above.id })
  else if (above && gap(r - 1) < 0.5) out.push({ kind: 'beatOne', team: above.id })
  else if (below) out.push({ kind: 'beatBoth', team: below.id })
  else if (above) out.push({ kind: 'beatOne', team: above.id })
  // A result: the best car finishing a little better than the car's pace suggests.
  const expected = Math.min(24, 2 * r + 2)
  out.push({ kind: 'position', value: clamp(expected - 2, 1, 22) })
  // Qualifying against the team just ahead, or both cars to the flag for a front-runner.
  if (above) out.push({ kind: 'qualiAhead', team: above.id })
  else out.push({ kind: 'bothFinish' })
  return out.map((o) => ({ ...o, text: objectiveText(game, o), met: null }))
}

export function objectiveText(game, o) {
  if (o.kind === 'beatOne') return `Finish ahead of a ${teamName(game, o.team)} car`
  if (o.kind === 'beatBoth') return `Finish ahead of both ${teamName(game, o.team)} cars`
  if (o.kind === 'position') return o.value <= 10 ? `Score points (P${o.value} or better)` : `A car in ${ordinal(o.value)} or better`
  if (o.kind === 'qualiAhead') return `Qualify ahead of a ${teamName(game, o.team)} car`
  return 'Both cars to the flag'
}

export function objectiveStatus(o, result) {
  const mine = result.race.filter((r) => r.teamId === PLAYER)
  const best = Math.min(...mine.map((r) => (r.status === 'finished' ? r.pos : 99)))
  const theirs = result.race.filter((r) => r.teamId === o.team).map((r) => (r.status === 'finished' ? r.pos : 99))
  if (o.kind === 'beatOne') return best < Math.max(...theirs)
  if (o.kind === 'beatBoth') return best < Math.min(...theirs)
  if (o.kind === 'position') return best <= o.value
  if (o.kind === 'qualiAhead') {
    const q = result.quali
    const me = Math.min(...q.filter((x) => x.teamId === PLAYER).map((x) => x.pos))
    return me < Math.max(...q.filter((x) => x.teamId === o.team).map((x) => x.pos))
  }
  return mine.length === 2 && mine.every((r) => r.status === 'finished')
}

// After the race: each objective met adds a little owner confidence and
// sponsor satisfaction (a good season of them is worth about one season
// target), and the season's tally is kept.
export const OBJECTIVE_REWARD = { confidence: 0.3, satisfaction: 0.5 }
export function settleObjectives(game, objectives, result) {
  let met = 0
  for (const o of objectives) {
    o.met = objectiveStatus(o, result)
    if (o.met) met++
  }
  game.confidence = clamp(game.confidence + met * OBJECTIVE_REWARD.confidence, 0, 100)
  for (const d of game.sponsors.deals) d.satisfaction = clamp(d.satisfaction + met * OBJECTIVE_REWARD.satisfaction, 0, 100)
  const t = (game.objectiveTally ??= { season: game.season, met: 0, total: 0 })
  if (t.season !== game.season) Object.assign(t, { season: game.season, met: 0, total: 0 })
  t.met += met
  t.total += objectives.length
  if (met) game.news.push(`Weekend objectives: ${met} of ${objectives.length} met (${objectives.filter((o) => o.met).map((o) => o.text.toLowerCase()).join('; ')})`)
  return met
}

// A rating out of 10 for each of the player's drives: the result against the
// car's pace on the day, less for errors. A breakdown is not the driver's fault.
export function driverRatings(game, result) {
  const out = {}
  for (const r of result.race.filter((x) => x.teamId === PLAYER)) {
    const d = result.detail[r.id]
    let score
    let note
    if (r.status === 'dnf' && r.reason !== 'crash') { score = null; note = `Retired (${r.reason}): not rated` }
    else if (r.status === 'dnf') { score = 3; note = 'Crashed out' }
    else {
      score = clamp(6.5 + 0.3 * (d.paceRank - r.pos) - 0.8 * d.errors + Math.min(1, d.passes * 0.15), 1, 10)
      note = `${ordinal(r.pos)} in the ${ordinal(d.paceRank)}-fastest car on the day`
    }
    out[r.id] = { score: score === null ? null : Math.round(score * 10) / 10, note }
  }
  return out
}

// The team just ahead in last season's championship (or just behind, for the
// champions), and how the season's head-to-head stands.
export function rivalTracker(game) {
  const order = game.lastStandings
  const me = order.indexOf(PLAYER)
  const rival = order[me - 1] ?? order[me + 1]
  if (!rival) return null
  let races = 0; let quali = 0; let n = 0
  for (const res of game.results) {
    n++
    const best = (rows, id) => Math.min(...rows.filter((x) => x.teamId === id).map((x) => (x.status === 'dnf' ? 99 : x.pos)))
    if (best(res.race, PLAYER) < best(res.race, rival)) races++
    if (best(res.quali, PLAYER) < best(res.quali, rival)) quali++
  }
  const st = getStandings(game).constructors
  const pts = (id) => st.find((c) => c.id === id)?.points ?? 0
  return { rival, name: teamName(game, rival), races, quali, n, points: pts(PLAYER), rivalPoints: pts(rival), prizeGain: game.lastStandings.indexOf(rival) + 1 }
}

// The car's gap to the fastest car, round by round, for the progress chart.
export function recordPace(game, gap, rivalGap) {
  const h = (game.paceHistory ??= [])
  h.push({ season: game.season, round: game.round, gap, rivalGap })
  if (h.length > 160) h.splice(0, h.length - 160)
}
