// HQ actions: facilities, workforce and key staff (design sections 5.4, 5.5).

import { ROUNDS, clamp, clock } from './core.js'
import {
  FACILITIES, FACILITY_COST, FACILITY_TIME, MAX_BUILDS, DEPTS, ROLES, PAY,
  headcountCap, engineerCount, skillTarget, staffName, keyStaffSalary,
} from './org.js'
import { canSpend, spend, capRoom, headCost } from './economy.js'
import { streamRng } from './rng.js'

export const ONBOARDING_ROUNDS = 3
export const SEVERANCE = 0.25 // share of a year's pay

const frozen = (game) => game.finance.austerity > 0

export function buildFacility(game, id) {
  const def = FACILITIES[id]
  const fac = game.org.facilities[id]
  if (!def) throw new Error('Unknown facility')
  if (def.locked) throw new Error(`${def.name} arrives in a later milestone`)
  if (frozen(game)) throw new Error('Building is frozen during the austerity period')
  if (fac.level >= 5) throw new Error(`${def.name} is already at level 5`)
  if (fac.building) throw new Error(`${def.name} is already being upgraded`)
  const active = Object.values(game.org.facilities).filter((f) => f.building).length
  if (active >= MAX_BUILDS) throw new Error(`Only ${MAX_BUILDS} builds can run at once`)
  const cost = FACILITY_COST[fac.level] * (1 - (game.bonus.facilityDiscount || 0))
  const rounds = FACILITY_TIME[fac.level]
  // Paid in equal instalments over the build. The first must be affordable now.
  if (!canSpend(game, cost / rounds)) throw new Error('Not enough cash for the first instalment')
  fac.building = { roundsLeft: rounds, perRound: cost / rounds, cost }
  game.bonus.facilityDiscount = 0
}

export function hire(game, dept, n) {
  const d = game.org.staff[dept]
  if (!d || !(n > 0)) throw new Error('Nothing to hire')
  if (frozen(game)) throw new Error('Hiring is frozen during the austerity period')
  const cap = headcountCap(game.org, dept)
  const engineers = dept === 'aero' || dept === 'mech'
  const current = engineers ? engineerCount(game.org) : d.heads + d.incoming.reduce((s, x) => s + x.heads, 0)
  if (current + n > cap) throw new Error(`${engineers ? 'The Design Office' : 'That facility'} only has room for ${cap - current} more`)
  if (dept !== 'commercial' && capRoom(game) < n * headCost(d)) throw new Error('This would break the cost cap')
  d.incoming.push({ heads: n, roundsLeft: ONBOARDING_ROUNDS })
}

export function fire(game, dept, n) {
  const d = game.org.staff[dept]
  if (!d || !(n > 0)) throw new Error('Nothing to do')
  if (n > d.heads - 5) throw new Error('A department needs at least 5 people')
  const cost = n * headCost(d) * SEVERANCE
  if (!canSpend(game, cost)) throw new Error('Not enough cash for the severance')
  spend(game, 'workforce', cost, dept !== 'commercial')
  d.heads -= n
}

export function setPay(game, dept, level) {
  if (!PAY[level]) throw new Error('Unknown pay level')
  game.org.staff[dept].pay = level
}

// Candidates for the six key roles. Better people will not join a team with
// too little reputation, and those under contract elsewhere need buying out
// and then sit out a period of gardening leave.
export function refreshStaffMarket(game) {
  const rng = streamRng(game.seed, 'staffMarket', game.season, game.round)
  const roles = Object.keys(ROLES)
  const list = []
  for (let i = 0; i < 9; i++) {
    const role = roles[i % roles.length]
    const rating = clamp(Math.round(rng.normal(55 + game.reputation * 0.3, 11)), 40, 96)
    const employed = rng.chance(0.6)
    const salary = keyStaffSalary(rating) * rng.range(0.95, 1.2)
    list.push({
      id: `${game.season}-${game.round}-${i}`, role, name: staffName(rng), rating, salary,
      buyout: employed ? salary * rng.range(0.6, 1.2) : 0,
      leave: employed ? rng.int(4, 12) : 0,
      minReputation: Math.max(0, Math.round((rating - 58) * 1.3)),
    })
  }
  game.staffMarket = list
}

export function hireKeyStaff(game, candidateId) {
  const c = game.staffMarket.find((x) => x.id === candidateId)
  if (!c) throw new Error('That candidate is no longer available')
  if (frozen(game)) throw new Error('Hiring is frozen during the austerity period')
  if (game.reputation < c.minReputation) throw new Error(`${c.name} wants a team with reputation ${c.minReputation} or more`)
  if (game.org.arrivals.some((a) => a.role === c.role)) throw new Error('Someone is already on the way for that role')
  if (!canSpend(game, c.buyout)) throw new Error('Not enough cash for the buyout')
  if (c.buyout > 0) spend(game, 'keyStaff', c.buyout, c.role !== 'commercialDirector')
  game.staffMarket = game.staffMarket.filter((x) => x.id !== candidateId)
  const person = { name: c.name, rating: c.rating, salary: c.salary }
  if (c.leave > 0) game.org.arrivals.push({ role: c.role, person, roundsLeft: c.leave })
  else game.org.keyStaff[c.role] = person
}

// One round of organisational change. Called before each race.
export function progressOrg(game) {
  const o = game.org
  for (const [id, fac] of Object.entries(o.facilities)) {
    if (!fac.building) continue
    if (--fac.building.roundsLeft <= 0) {
      fac.building = null
      fac.level++
      game.news.push(`${FACILITIES[id].name} is now level ${fac.level}`)
    }
  }
  for (const [id, d] of Object.entries(o.staff)) {
    const target = skillTarget(o, id)
    for (const inc of d.incoming.slice()) {
      if (--inc.roundsLeft > 0) continue
      d.incoming.splice(d.incoming.indexOf(inc), 1)
      // New starters arrive a little below the department's level.
      d.skill = (d.heads * d.skill + inc.heads * (target - 10)) / (d.heads + inc.heads)
      d.heads += inc.heads
      game.news.push(`${inc.heads} new ${DEPTS[id].name} staff are now productive`)
    }
    d.skill += clamp(target - d.skill, -0.5, 0.5)
  }
  for (const a of o.arrivals.slice()) {
    if (--a.roundsLeft > 0) continue
    o.arrivals.splice(o.arrivals.indexOf(a), 1)
    o.keyStaff[a.role] = a.person
    game.news.push(`${a.person.name} has started as ${ROLES[a.role]}`)
  }
  // The market turns over twice a season.
  if (game.round === ROUNDS / 2) refreshStaffMarket(game)
}

export { clock }
