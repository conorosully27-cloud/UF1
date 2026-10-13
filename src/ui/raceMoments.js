// Which moments a race weekend produces, and what they say.

import { PLAYER } from '../engine/game.js'
import { TRACK_BY_ID } from '../engine/data/tracks.js'
import { driverColor, secondColor, teamColor } from './format.js'

const surname = (name) => name.split(' ').slice(-1)[0]
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

// After the classification: a win, a one-two, a podium or points.
export function resultMoments(game, res) {
  const track = TRACK_BY_ID[res.trackId]
  const mine = res.race.filter((r) => r.teamId === PLAYER && r.status === 'finished').sort((a, b) => a.pos - b.pos)
  if (!mine.length) return []
  const name = (r) => surname(game.drivers[r.id]?.name ?? r.id)
  const color = (r) => driverColor(game, r.id)
  const team = teamColor(game, PLAYER)
  const confetti = [team, secondColor(team), '#ffd23f', '#ffffff']
  const best = mine[0]
  const base = { kicker: `${track.name} · round ${res.round + 1}`, confetti }
  if (mine.length > 1 && mine[0].pos === 1 && mine[1].pos === 2) {
    return [{ ...base, key: 'result', size: 'big', kind: 'onetwo', place: 1, title: 'One-two!', sub: 'Both cars at the front.', drivers: mine.slice(0, 2).map((r) => ({ name: name(r), color: color(r), text: `P${r.pos}` })) }]
  }
  if (best.pos === 1) return [{ ...base, key: 'result', size: 'big', kind: 'win', place: 1, title: 'Victory', sub: `From P${best.grid} on the grid.`, drivers: [{ name: name(best), color: color(best) }] }]
  if (best.pos <= 3) {
    return [{ ...base, key: 'result', size: 'big', kind: 'podium', place: best.pos, title: 'Podium', sub: `P${best.pos} from P${best.grid} on the grid.`, drivers: mine.filter((r) => r.pos <= 3).map((r) => ({ name: name(r), color: color(r), text: `P${r.pos}` })) }]
  }
  const scorers = mine.filter((r) => r.pos <= 10)
  if (scorers.length) {
    const pts = scorers.reduce((s, r) => s + POINTS[r.pos - 1], 0)
    return [{ ...base, key: 'result', size: 'medium', kind: 'points', title: `${pts} point${pts === 1 ? '' : 's'}`, drivers: scorers.map((r) => ({ name: name(r), color: color(r), text: `P${r.pos}` })) }]
  }
  return []
}

// After a qualifying session: into Q3, the front row, pole.
export function qualiMoments(game, st, ses) {
  const mineRows = ses.rows.filter((r) => st.cars[r.idx].e.isPlayer)
  const who = (r) => ({ name: surname(st.cars[r.idx].e.name), color: driverColor(game, r.id, st.cars[r.idx].e.slot), text: `P${r.pos}` })
  const kicker = `${st.track.name} · Q${ses.s + 1}`
  if (ses.s === 1) {
    const through = mineRows.filter((r) => !r.out)
    return through.length ? [{ key: 'q3', size: 'medium', kind: 'q3', kicker, title: 'Into Q3', sub: 'The top-ten shoot-out for pole.', drivers: through.map(who) }] : []
  }
  if (ses.s === 2) {
    const pole = mineRows.find((r) => r.pos === 1)
    const team = teamColor(game, PLAYER)
    if (pole) return [{ key: 'pole', size: 'big', kind: 'pole', place: 1, kicker, title: 'Pole position', sub: 'Fastest of all in qualifying.', drivers: [who(pole)], confetti: [team, secondColor(team), '#ffffff'] }]
    const second = mineRows.find((r) => r.pos === 2)
    if (second) return [{ key: 'frontrow', size: 'medium', kind: 'frontrow', kicker, title: 'Front row', sub: 'Second on the grid.', drivers: [who(second)] }]
  }
  return []
}
