// The living world each winter (design section 5.11, milestone 4): rival
// reputation and resources follow results, rivals have form events, power
// unit suppliers drift, and rivals try to poach the player's key staff.

import { PLAYER, clamp } from './core.js'
import { ROLES, staffName, keyStaffSalary } from './org.js'
import { streamRng } from './rng.js'

// Reputation a championship position earns, the same scale the player uses.
export const repForPosition = (pos) => clamp(100 - (pos - 1) * 8.3, 5, 95)

// Prize-money resource level by position, relative to an average team.
export const resourceForPosition = (pos) => 1 + 0.012 * (6.5 - pos)

export function rivalReputationWinter(game, order) {
  order.forEach((id, i) => {
    const r = game.rivals[id]
    if (!r) return
    r.reputation += 0.3 * (repForPosition(i + 1) - r.reputation)
    r.resource += 0.3 * (resourceForPosition(i + 1) - r.resource)
  })
}

const MAX_CUSTOMERS = 4 // teams on one supplier's power units, works team included

function supplierLoad(game, id) {
  return Object.values(game.teams).filter((t) => t.supplier === id).length
}

// An investor arrives, a technical chief leaves, or a customer team changes
// engine supplier. Effects on development last a few seasons.
export function rivalFormEvents(game) {
  const news = []
  for (const [id, r] of Object.entries(game.rivals)) {
    if (r.event && --r.event.seasonsLeft <= 0) r.event = null
    const t = game.teams[id]
    const rng = streamRng(game.seed, 'formEvent', id, game.season)
    const u = rng.next()
    const lowerHalf = game.lastStandings.indexOf(id) >= 6
    if (!r.event && u < (lowerHalf ? 0.07 : 0.03)) {
      r.event = { kind: 'investor', mult: 1.15, seasonsLeft: 3 }
      news.push(`${t.name} have a new investor: expect faster development`)
    } else if (!r.event && u < 0.09) {
      r.event = { kind: 'chief', mult: 0.85, seasonsLeft: 2 }
      news.push(`${t.name} have lost their technical chief`)
    } else if (!t.works && u > 0.94) {
      const options = Object.values(game.suppliers).filter((s) => s.id !== t.supplier && supplierLoad(game, s.id) < MAX_CUSTOMERS && r.reputation >= s.minReputation)
      if (options.length) {
        const s = rng.weightedPick(options, options.map((x) => Math.pow(x.power - 75, 2)))
        news.push(`${t.name} will switch to ${s.name} power units`)
        t.supplier = s.id
      }
    }
  }
  return news
}

// Supplier ratings drift each winter. Weaker suppliers gain more, as the
// catch-up rules intend, so the order can change over a long save.
export function supplierDrift(game) {
  const list = Object.values(game.suppliers)
  const topPower = Math.max(...list.map((s) => s.power))
  const topRel = Math.max(...list.map((s) => s.reliability))
  const news = []
  for (const s of list) {
    const rng = streamRng(game.seed, 'supplierDrift', s.id, game.season)
    const before = s.power
    // A slow pull back towards a long-run level stops the whole field creeping up.
    s.power = clamp(s.power + rng.normal(0, 0.7) + 0.2 * (topPower - s.power) + 0.05 * (88 - s.power), 75, 98)
    s.reliability = clamp(s.reliability + rng.normal(0, 1) + 0.15 * (topRel - s.reliability) + 0.05 * (84 - s.reliability), 65, 96)
    s.price = Math.max(7, Math.round((s.price + 0.6 * (s.power - before)) * 2) / 2)
    if (Math.abs(s.power - before) >= 1) news.push(`${s.name} power units ${s.power > before ? 'gain' : 'lose'} ${Math.abs(s.power - before).toFixed(1)} Power over the winter`)
  }
  return news
}

// Rivals approach the player's best key staff, more often as the team rises.
export function staffApproaches(game) {
  if (game.reputation < 25) return
  const rivals = Object.values(game.teams).filter((t) => !t.isPlayer && game.rivals[t.id].reputation > game.reputation)
  if (!rivals.length) return
  for (const [role, k] of Object.entries(game.org.keyStaff)) {
    if (k.rating < 65) continue
    const rng = streamRng(game.seed, 'staffPoach', role, game.season)
    const p = clamp(0.1 + (game.reputation - 25) / 250, 0, 0.35) * clamp((k.rating - 60) / 25, 0, 1.2)
    if (!rng.chance(p)) continue
    const team = rng.pick(rivals)
    const rating = clamp(k.rating - rng.int(8, 15), 40, 90)
    game.approaches.push({
      id: `staff-${game.season}-${role}`, kind: 'staff', role, teamId: team.id, raise: 1.3,
      deputy: { name: staffName(rng), rating, salary: keyStaffSalary(rating) },
      text: `${team.name} want your ${ROLES[role]}, ${k.name}. Match their offer (salary +30%) or let ${k.name} go and promote a deputy rated ${rating}`,
    })
  }
}

export { PLAYER }
