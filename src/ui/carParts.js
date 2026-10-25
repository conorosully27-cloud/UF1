// What the car on the Car tab shows (VISUALS.md, V3 and V4): for each rating,
// the parts of the car it stands for and where its upgrades are. Kept apart
// from the drawing so the checks can run it.
//
// The car also shows how far each rating has come (more detail at 60, 75 and
// 88, `detailTier` in carModel.js) and the team's sponsors (`carLook`), and a
// rival's car can stand alongside for comparison.
//
// A rating's parts show one state at a time, the most recent first:
//   new     an upgrade fitted for the last race (it glows)
//   dud     the last upgrade fitted gave nothing (greyed out)
//   build   an upgrade in the factory (solid as far as it is built)
//   design  an upgrade on the drawing board (a ghost in outline)

import { PLAYER, effectiveCar } from '../engine/core.js'
import { AREAS, SIZES, diminishing } from '../engine/development.js'

export const CAR_AREAS = {
  aero: { label: 'Aero', parts: 'Front and rear wings, floor and diffuser' },
  chassis: { label: 'Chassis', parts: 'Nose, monocoque, sidepods and engine cover' },
  tyreCare: { label: 'Tyre Care', parts: 'Suspension' },
  reliability: { label: 'Reliability', parts: 'Cooling inlets and louvres' },
  power: { label: 'Power', parts: 'Power unit and airbox' },
}

export const STATE_TEXT = { new: 'New part', dud: 'No gain', build: 'In the factory', design: 'In design' }

export function partStates(game) {
  const car = game.teams[PLAYER].car
  const raced = effectiveCar(game, PLAYER)
  const dev = game.dev
  const out = {}
  for (const area of Object.keys(AREAS)) {
    const pool = AREAS[area].pool
    const design = dev.queues[pool].filter((q) => q.area === area)
    const build = dev.builds.filter((q) => q.area === area)
    let last = null
    for (let i = dev.log.length - 1; i >= 0 && !last; i--) if (dev.log[i].area === area) last = dev.log[i]
    // Parts are fitted before a race, and the round moves on after it.
    const recent = !!last && last.season === game.season && last.round >= game.round - 1
    const state = recent ? (last.dud || last.gain <= 0 ? 'dud' : 'new') : build.length ? 'build' : design.length ? 'design' : null
    const first = build[0] ?? design[0]
    out[area] = {
      area, ...CAR_AREAS[area], rating: car[area], raced: raced[area], perUnit: diminishing(car[area]), state, last: recent ? last : null,
      // How far the next part along is: built, or designed.
      progress: !first ? null : build.length ? build[0].buildDone / build[0].units : design[0].done / design[0].units,
      queue: [...build.map((q) => ({ ...q, stage: 'build' })), ...design.map((q) => ({ ...q, stage: 'design' }))].map((q) => ({
        id: q.id, label: `${SIZES[q.size].label} ${AREAS[q.area].label}`, stage: q.stage, done: q.stage === 'build' ? q.buildDone : q.done, units: q.units,
      })),
    }
  }
  const s = game.suppliers[game.teams[PLAYER].supplier]
  out.power = { area: 'power', ...CAR_AREAS.power, rating: raced.power, raced: raced.power, supplier: s.name, state: null, last: null, progress: null, queue: [] }
  return out
}

// What a team's car looks like: its colours, how far each rating has come,
// and the names on it. Your car carries your sponsors, the title sponsor on
// the sidepods and rear wing (or the team's name, without one), principal and
// partner sponsors on the nose and front wing. A rival's car carries its name.
export const DETAIL_AT = [60, 75, 88]
export const detailTier = (rating) => DETAIL_AT.filter((r) => rating >= r).length
const TIER_ORDER = { title: 0, principal: 1, partner: 2 }

export function carLook(game, teamId) {
  const team = game.teams[teamId]
  const tiers = Object.fromEntries(Object.keys(AREAS).map((a) => [a, detailTier(team.car[a])]))
  const name = team.name.toUpperCase()
  if (teamId !== PLAYER) return { tiers, decals: { pods: name, rear: name } }
  const deals = [...game.sponsors.deals].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])
  const title = deals.find((d) => d.tier === 'title')
  const rest = deals.filter((d) => d !== title).map((d) => d.name.toUpperCase())
  return { tiers, decals: { pods: title ? title.name.toUpperCase() : name, rear: title ? title.name.toUpperCase() : name, nose: rest[0], front: rest[1] ?? (title ? name : null) } }
}

// Each rating against another team's, as raced.
export function compareCars(game, teamId) {
  const mine = effectiveCar(game, PLAYER)
  const theirs = effectiveCar(game, teamId)
  return Object.fromEntries(Object.keys(CAR_AREAS).map((a) => [a, { mine: mine[a], theirs: theirs[a], gap: mine[a] - theirs[a] }]))
}
