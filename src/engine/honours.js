// The honours board (design section 4): the team's record for the life of
// the save: points, podiums, wins, poles, titles, firsts and streaks.

import { PLAYER, year } from './core.js'
import { TRACK_BY_ID } from './data/tracks.js'

export function initialHonours() {
  return {
    starts: 0, points: 0, wins: 0, podiums: 0, poles: 0, pointsFinishes: 0, doubleFinishes: 0,
    bestFinish: null, bestPos: null,
    firsts: {}, // point, podium, win, pole, q2, q3: { year, track, driver }
    titles: { constructors: [], drivers: [] },
    streaks: { scoring: 0, scoringBest: 0, titles: 0, titlesBest: 0 },
  }
}

export function honoursRound(game, res) {
  const h = game.honours
  const where = TRACK_BY_ID[res.trackId]?.name ?? res.trackId
  const first = (key, id) => { h.firsts[key] ??= { year: year(game), track: where, driver: game.drivers[id]?.name ?? '' } }
  const mine = res.race.filter((r) => r.teamId === PLAYER)
  let scored = false
  for (const r of mine) {
    h.starts++
    h.points += r.points
    if (r.points > 0) { h.pointsFinishes++; scored = true; first('point', r.id) }
    if (r.pos <= 3) { h.podiums++; first('podium', r.id) }
    if (r.pos === 1) { h.wins++; first('win', r.id) }
    if (r.status === 'finished' && (h.bestFinish === null || r.pos < h.bestFinish)) h.bestFinish = r.pos
  }
  if (mine.length === 2 && mine.every((r) => r.status === 'finished')) h.doubleFinishes++
  for (const q of res.quali.filter((x) => x.teamId === PLAYER)) {
    const reached = q.session ?? (q.pos <= 10 ? 3 : q.pos <= 17 ? 2 : 1)
    if (reached >= 2) first('q2', q.id)
    if (reached >= 3) first('q3', q.id)
  }
  const pole = res.quali.find((q) => q.pos === 1)
  if (pole?.teamId === PLAYER) { h.poles++; first('pole', pole.id) }
  h.streaks.scoring = scored ? h.streaks.scoring + 1 : 0
  h.streaks.scoringBest = Math.max(h.streaks.scoringBest, h.streaks.scoring)
}

// Season end. `summary` is the season summary from endSeason.
export function honoursSeason(game, summary) {
  const h = game.honours
  if (h.bestPos === null || summary.playerPos < h.bestPos) h.bestPos = summary.playerPos
  const champion = summary.playerPos === 1
  if (champion) h.titles.constructors.push(summary.year)
  const driverChamp = summary.drivers[0]
  if (driverChamp?.teamId === PLAYER) h.titles.drivers.push({ year: summary.year, name: driverChamp.name })
  h.streaks.titles = champion ? h.streaks.titles + 1 : 0
  h.streaks.titlesBest = Math.max(h.streaks.titlesBest, h.streaks.titles)
}
