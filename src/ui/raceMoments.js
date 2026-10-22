// Which moments a race weekend produces, and what they say.

import { PLAYER } from '../engine/game.js'
import { TRACK_BY_ID } from '../engine/data/tracks.js'
import { driverColor, secondColor, teamColor } from './format.js'
import { surname, ordinal as ordinalText } from '../engine/util.js'

const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]

export const lightsMoment = (round) => ({ key: `lights-${round}`, size: 'medium', kind: 'lights' })

export const scMoment = (lap) => ({
  key: `sc-${lap}`, size: 'medium', kind: 'sc', kicker: lap ? `Lap ${lap}` : null, title: 'Safety car', sub: 'The field bunches up. A stop now costs about half as much.',
})

const WHY = { crash: 'Crashed out', collision: 'Out in a collision' }
export const outMoment = (game, c) => ({
  key: `out-${c.id}`, size: 'medium', kind: 'out', color: driverColor(game, c.id, c.e.slot), kicker: 'Retirement',
  title: `${surname(c.e.name)} is out`, sub: WHY[c.reason] ?? `Mechanical failure: ${c.reason}`,
})

// At the flag: where your cars crossed the line, before any penalties.
export function flagMoment(game, st) {
  const order = st.order.map((i) => st.cars[i])
  const mine = st.cars.filter((c) => c.e.isPlayer)
  return {
    key: 'flag', size: 'medium', kind: 'flag', title: 'Chequered flag', kicker: st.track.name,
    drivers: mine.map((c) => ({ name: surname(c.e.name), color: driverColor(game, c.id, c.e.slot), text: c.status === 'running' ? `P${order.indexOf(c) + 1}` : 'DNF' })),
  }
}

// After the classification: the race result, a clean sweep of the
// objectives, and at the last round the championship.
// `live`: the weekend was played on the pit wall, where qualifying's moments
// were shown as they happened. After a quick sim they are shown here instead.
export function resultMoments(game, res, { live = false } = {}) {
  const out = []
  if (!live) out.push(...quickQualiMoments(game, res))
  out.push(...raceResultMoments(game, res))
  if (res.objectives?.length && res.objectives.every((o) => o.met)) {
    out.push({ key: 'sweep', size: 'medium', kind: 'sweep', kicker: 'Weekend objectives', title: 'Clean sweep', sub: res.objectives.map((o) => o.text).join(' · ') })
  }
  out.push(...seasonEndMoments(game, res))
  return out
}

function quickQualiMoments(game, res) {
  const firsts = new Set(res.firsts ?? [])
  const track = TRACK_BY_ID[res.trackId]
  const team = teamColor(game, PLAYER)
  const confetti = [team, secondColor(team), '#ffffff']
  const mine = res.quali.filter((q) => q.teamId === PLAYER)
  const who = (q) => ({ name: surname(game.drivers[q.id]?.name ?? q.id), color: driverColor(game, q.id), text: `P${q.pos}` })
  const kicker = `${track.name} · qualifying`
  const pole = mine.find((q) => q.pos === 1)
  if (pole) return [{ key: 'pole', size: 'big', kind: 'pole', place: 1, ribbon: firsts.has('pole') ? 'First ever pole' : null, kicker, title: 'Pole position', sub: 'Fastest of all in qualifying.', drivers: [who(pole)], confetti }]
  if (firsts.has('q3')) return [{ key: 'q3', size: 'big', kind: 'q3first', ribbon: 'First time in Q3', kicker, title: 'Into Q3', sub: 'The top-ten shoot-out for pole.', drivers: mine.filter((q) => q.pos <= 10).map(who), confetti }]
  if (firsts.has('q2')) return [{ key: 'q2first', size: 'big', kind: 'q2first', ribbon: 'First time into Q2', kicker, title: 'Through to Q2', sub: 'Out of the drop zone for the first time.', drivers: mine.filter((q) => q.pos <= 17).map(who), confetti }]
  return []
}

function seasonEndMoments(game, res) {
  const end = res.seasonEnd
  if (!end) return []
  const team = teamColor(game, PLAYER)
  const titles = game.honours?.titles?.constructors?.length ?? 0
  const out = []
  if (end.pos === 1) {
    out.push({ key: 'champions', size: 'big', kind: 'champions', place: 1, kicker: `${game.teams[PLAYER].name} · constructors' champions`, title: 'World Champions', sub: titles === 0 ? 'The first title in the team\'s history.' : `Title number ${titles + 1}.`, confetti: [team, secondColor(team), '#ffd23f', '#ffffff'] })
  } else if (end.rival?.beaten) {
    out.push({ key: 'rival', size: 'medium', kind: 'rival', kicker: 'Final standings', title: `Ahead of ${end.rival.name}`, sub: `${ordinalText(end.pos)} in the championship: last year's rival beaten.` })
  }
  if (end.review) out.push(reviewMoment(end.review))
  return out
}

const FIRST_TEXT = { point: 'first points', podium: 'first podium', win: 'first win', pole: 'first pole', q2: 'first time in Q2', q3: 'first time in Q3' }

// The season review: the year in numbers, last of all.
function reviewMoment(r) {
  const move = !r.lastPos || r.lastPos === r.pos ? `The same as last year.` : r.pos < r.lastPos ? `Up from ${ordinalText(r.lastPos)} last year.` : `Down from ${ordinalText(r.lastPos)} last year.`
  const stats = [['Points', r.points], ['Best finish', r.best ? `P${r.best}` : '–'], ['Podiums', r.podiums], ['Wins', r.wins]]
  if (r.poles) stats.push(['Poles', r.poles])
  stats.push(['In the points', r.scoring], ['Retirements', r.dnfs])
  const lines = []
  if (r.objectives) lines.push(`Weekend objectives met: ${r.objectives.met} of ${r.objectives.total}`)
  if (r.firsts.length) lines.push(`Career firsts: ${r.firsts.map((k) => FIRST_TEXT[k] ?? k).join(', ')}`)
  lines.push(`Owner confidence: ${r.confidence} of 100`)
  return { key: `review-${r.year}`, size: 'big', kind: 'review', kicker: `${r.year} season review`, title: `${ordinalText(r.pos)} place`, sub: move, stats: stats.map(([label, value]) => ({ label, value })), lines, confetti: [] }
}

function raceResultMoments(game, res) {
  const track = TRACK_BY_ID[res.trackId]
  const mine = res.race.filter((r) => r.teamId === PLAYER && r.status === 'finished').sort((a, b) => a.pos - b.pos)
  if (!mine.length) return []
  const firsts = new Set(res.firsts ?? [])
  const name = (r) => surname(game.drivers[r.id]?.name ?? r.id)
  const color = (r) => driverColor(game, r.id)
  const team = teamColor(game, PLAYER)
  const confetti = [team, secondColor(team), '#ffd23f', '#ffffff']
  const best = mine[0]
  const base = { kicker: `${track.name} · round ${res.round + 1}`, confetti }
  if (mine.length > 1 && mine[0].pos === 1 && mine[1].pos === 2) {
    return [{ ...base, key: 'result', size: 'big', kind: 'onetwo', place: 1, title: 'One-two!', sub: 'Both cars at the front.', drivers: mine.slice(0, 2).map((r) => ({ name: name(r), color: color(r), text: `P${r.pos}` })) }]
  }
  if (best.pos === 1) return [{ ...base, key: 'result', size: 'big', kind: 'win', place: 1, ribbon: firsts.has('win') ? 'First ever win' : null, title: 'Victory', sub: `From P${best.grid} on the grid.`, drivers: [{ name: name(best), color: color(best) }] }]
  if (best.pos <= 3) {
    return [{ ...base, key: 'result', size: 'big', kind: 'podium', place: best.pos, ribbon: firsts.has('podium') ? 'First ever podium' : null, title: 'Podium', sub: `P${best.pos} from P${best.grid} on the grid.`, drivers: mine.filter((r) => r.pos <= 3).map((r) => ({ name: name(r), color: color(r), text: `P${r.pos}` })) }]
  }
  const scorers = mine.filter((r) => r.pos <= 10)
  if (scorers.length) {
    const pts = scorers.reduce((s, r) => s + POINTS[r.pos - 1], 0)
    const drivers = scorers.map((r) => ({ name: name(r), color: color(r), text: `P${r.pos}` }))
    // The first point of all is worth a proper celebration.
    if (firsts.has('point')) return [{ ...base, key: 'result', size: 'big', kind: 'firstpoints', place: best.pos, ribbon: 'First ever points', title: `${pts} point${pts === 1 ? '' : 's'}`, sub: 'The team is on the board.', drivers }]
    return [{ ...base, key: 'result', size: 'medium', kind: 'points', title: `${pts} point${pts === 1 ? '' : 's'}`, drivers }]
  }
  return []
}

// After a qualifying session: into Q3, the front row, pole.
// `firsts` is the honours board's record of career firsts before this session.
export function qualiMoments(game, st, ses) {
  const mineRows = ses.rows.filter((r) => st.cars[r.idx].e.isPlayer)
  const who = (r) => ({ name: surname(st.cars[r.idx].e.name), color: driverColor(game, r.id, st.cars[r.idx].e.slot), text: r.time === null ? 'no time' : `P${r.pos}` })
  const kicker = `${st.track.name} · Q${ses.s + 1}`
  const firsts = game.honours?.firsts ?? {}
  const team = teamColor(game, PLAYER)
  const confetti = [team, secondColor(team), '#ffffff']
  const out = []
  for (const r of mineRows) {
    const c = st.cars[r.idx]
    const col = driverColor(game, r.id, c.e.slot)
    if (r.laps.some((l) => l.crash)) out.push({ key: `qcrash-${ses.s}-${r.id}`, size: 'medium', kind: 'out', color: col, kicker, title: `${surname(c.e.name)} crashes`, sub: r.time === null ? 'No time set: out of qualifying.' : 'The car is damaged for the next session.' })
    else if (r.time === null) out.push({ key: `notime-${ses.s}-${r.id}`, size: 'medium', kind: 'out', color: col, kicker, title: `No time for ${surname(c.e.name)}`, sub: r.laps.some((l) => l.flagged) ? 'The flag came out on the final lap.' : 'No lap on the board.' })
  }
  const through = mineRows.filter((r) => !r.out)
  if (ses.s === 0 && through.length && !firsts.q2) {
    out.push({ key: 'q2first', size: 'big', kind: 'q2first', place: null, ribbon: 'First time into Q2', kicker, title: 'Through to Q2', sub: 'Out of the drop zone for the first time.', drivers: through.map(who), confetti })
  }
  if (ses.s === 1 && through.length) {
    if (!firsts.q3) out.push({ key: 'q3', size: 'big', kind: 'q3first', ribbon: 'First time in Q3', kicker, title: 'Into Q3', sub: 'The top-ten shoot-out for pole.', drivers: through.map(who), confetti })
    else out.push({ key: 'q3', size: 'medium', kind: 'q3', kicker, title: 'Into Q3', sub: 'The top-ten shoot-out for pole.', drivers: through.map(who) })
  }
  if (ses.s === 2) {
    const pole = mineRows.find((r) => r.pos === 1)
    if (pole) out.push({ key: 'pole', size: 'big', kind: 'pole', place: 1, ribbon: firsts.pole ? null : 'First ever pole', kicker, title: 'Pole position', sub: 'Fastest of all in qualifying.', drivers: [who(pole)], confetti })
    else {
      const second = mineRows.find((r) => r.pos === 2)
      if (second) out.push({ key: 'frontrow', size: 'medium', kind: 'frontrow', kicker, title: 'Front row', sub: 'Second on the grid.', drivers: [who(second)] })
    }
  }
  return out
}

// ---- During the race ----

export const podiumRunMoment = (game, c, pos, lap) => ({
  key: `top3-${c.id}`, size: 'medium', kind: 'top3', kicker: lap ? `Lap ${lap}` : null, title: 'In the podium places',
  drivers: [{ name: surname(c.e.name), color: driverColor(game, c.id, c.e.slot), text: `P${pos}` }],
})
export const rainMoment = (cond, lap) => ({
  key: `rain-${lap}`, size: 'medium', kind: 'rain', kicker: lap ? `Lap ${lap}` : null, title: cond === 'wet' ? 'Heavy rain' : 'Rain is falling', sub: 'Slicks will not last: time to think about intermediates.',
})
export const clashMoment = (game, cars, lap) => ({
  key: `clash-${lap}`, size: 'medium', kind: 'clash', kicker: lap ? `Lap ${lap}` : null, title: 'Team-mates collide',
  drivers: cars.map((c) => ({ name: surname(c.e.name), color: driverColor(game, c.id, c.e.slot) })),
})
export const doubleOutMoment = (game, cars) => ({
  key: 'doubledno', size: 'medium', kind: 'out', color: '#ff4d5e', kicker: 'Both cars out', title: 'Double DNF',
  drivers: cars.map((c) => ({ name: surname(c.e.name), color: driverColor(game, c.id, c.e.slot), text: c.reason })),
})
export const deciderMoment = (d) => ({
  key: 'decider', size: 'medium', kind: 'decider', kicker: 'The final round', title: 'Title decider',
  sub: d.leading ? `${d.gap} points ahead of ${d.name}. Bring it home.` : `${d.gap} points behind ${d.name}. Everything to play for.`,
})

// ---- Off the track ----

export const redMoment = (cash) => ({ key: `red-${Math.round(cash * 100)}`, size: 'medium', kind: 'red', kicker: 'Finance', title: 'In the red', sub: 'No new spending until cash is back above zero.' })
export const crisisMoment = (game) => ({
  key: `crisis-${game.finance.crises}`, size: 'big', kind: 'crisis', kicker: game.teams[PLAYER].name, title: 'Crisis', sub: 'An investor has taken over the debts, for a share of the prize money for good. Staff have been let go and spending is frozen.', confetti: [],
})
export const signedMoment = (game, d, star) => ({
  key: `signed-${d.id}`, size: star ? 'big' : 'medium', kind: star ? 'star' : 'signed', kicker: 'Driver market', title: star ? 'Star signing' : 'Driver signed',
  sub: star ? `One of the best drivers in the sport joins ${game.teams[PLAYER].name}.` : null,
  drivers: [{ name: d.name, color: driverColor(game, d.id) }], confetti: star ? [teamColor(game, PLAYER), '#ffd23f', '#ffffff'] : undefined,
})
export const leftMoment = (game, d) => ({ key: `left-${d.id}`, size: 'medium', kind: 'left', kicker: 'Driver market', title: `${surname(d.name)} is leaving`, sub: d.teamId ? `Signed by ${game.teams[d.teamId]?.name ?? 'a rival'}.` : 'Out of contract.' })
export const sponsorMoment = (deal) => ({ key: `sponsor-${deal.id}`, size: 'medium', kind: 'sponsor', kicker: 'New title sponsor', title: deal.name, sub: `£${deal.fee.toFixed(1)}m a season.` })

// ---- More of the season ----

export const redFlagMoment = (lap) => ({
  key: `redflag-${lap}`, size: 'medium', kind: 'redflag', kicker: lap ? `Lap ${lap}` : null, title: 'Red flag', sub: 'The race is stopped. Every car can change tyres for free.',
})
export const titleFightMoment = (f) => ({
  key: `titlefight-${f.left}`, size: 'medium', kind: 'decider', kicker: `${f.left} rounds to go`, title: 'Title fight on',
  sub: f.gap === 0 ? `Level on points with ${f.name}.` : f.leading ? `${f.gap} points clear of ${f.name}.` : `${f.gap} points behind ${f.name}.`,
})

// The owner's verdict, as confidence crosses a line. `level`: 'low', 'final' or 'high'.
const VERDICT = {
  low: { kind: 'red', title: 'The owner is losing patience', sub: 'Results need to improve.' },
  final: { kind: 'red', title: 'Final warning', sub: 'If confidence reaches zero, an investor steps in.' },
  high: { kind: 'sweep', title: 'The owner is delighted', sub: 'Confidence in you is sky high.' },
}
export const ownerMoment = (level, when) => ({ key: `owner-${level}-${when}`, size: 'medium', kicker: "The owner's verdict", ...VERDICT[level] })
