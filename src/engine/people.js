// Drivers over a long save (design section 5.6, milestone 4): hidden traits,
// ratings that move with age and results, contracts for every seat, rival
// driver reviews, the three-stage winter market, loans and recalls, the
// academy, new drivers and retirement.

import { PLAYER, ROUNDS, clamp, year } from './core.js'
import { overall } from './data/drivers.js'
import { DRIVER_FIRST, DRIVER_LAST } from './data/names.js'
import { salaryDemand, ambition, backingBase, backingRoll } from './contracts.js'
import { canSpend, spend, earn } from './economy.js'
import { SIM } from './weekend.js'
import { streamRng } from './rng.js'

export const MARKET_STAGES = 3
export const STAGE_DISCOUNT = 0.85 // unsigned drivers' demands at each later stage
export const APPROACHES_PER_WINTER = 3
export const SIGNS_AT = 60
export const RELEASE_SHARE = 0.6 // of the remaining salary, to release a driver early
const LOYALTY = 5
const ACADEMY_LOYALTY = 20
const RIVAL_SIGNS_AT = 55
const LAST_CALL = 35 // at the end of the market a driver without a seat takes what is left
const FORM_BAND = 0.05 // seconds a lap against the team-mate that counts as clearly better or worse

// Known long careers. Everyone else rolls a longevity of -2 to +5 years.
const HAND_LONGEVITY = { hamilton: 4, alonso: 5, hulkenberg: 3, bottas: 2, perez: 1, magnussen: 1 }

const exactOverall = (d) => 0.4 * d.pace + 0.25 * d.racecraft + 0.2 * d.consistency + 0.15 * d.wet
const teamName = (game, id) => game.teams[id]?.name ?? id

export function teamRep(game, teamId) {
  return teamId === PLAYER ? game.reputation : game.rivals[teamId].reputation
}

// ---- Traits ----
export function initDriverTraits(game, d) {
  const rng = streamRng(game.seed, 'traits', d.id)
  const ovr = exactOverall(d)
  d.longevity ??= HAND_LONGEVITY[d.id] ?? rng.int(-2, 5)
  if (d.ceiling == null) {
    const pot = d.potential ?? (d.age <= 27 ? ovr + rng.int(0, 2) : ovr)
    // Not every junior makes it: some stall well short of their potential.
    const stall = d.age <= 23 && rng.chance(0.25)
    d.ceiling = stall ? ovr + (pot - ovr) * rng.range(0.1, 0.5) : pot
  }
  d.prefYears ??= d.age >= 33 ? 1 : d.age <= 24 ? rng.int(2, 3) : rng.int(1, 3)
  d.career ??= { starts: 0, points: 0, wins: 0, podiums: 0, titles: 0, seasons: 0, debut: null }
  d.season ??= { starts: 0, points: 0, wins: 0, podiums: 0, half: 0 }
  d.form ??= { n: 0, sum: 0 }
  d.seasonForm ??= { n: 0, sum: 0 }
  d.lastForm ??= 0
  d.unsigned ??= 0
  d.lastOverall ??= overall(d)
  d.interestMod ??= 0
  d.academy ??= false
  return d
}

export function initPeople(game) {
  for (const d of Object.values(game.drivers)) initDriverTraits(game, d)
  for (const t of Object.values(game.teams)) {
    if (t.isPlayer) continue
    for (const id of t.drivers) {
      const d = game.drivers[id]
      const rng = streamRng(game.seed, 'startContract', id)
      const years = d.age >= 36 ? rng.int(1, 2) : d.age <= 23 ? rng.int(2, 3) : rng.int(1, 3)
      d.contract = newContract(d, salaryDemand(d, game.seed, 1), years)
    }
  }
  game.market = { stage: 1, closed: false, tries: {}, log: [], rivalTargets: {}, seatChanges: [] }
  game.approaches = []
  game.retired = []
  game.nextDriverId = 1
}

function newContract(d, salary, years, extra = {}) {
  return { salary, backing: 0, years, role: 'race', loan: false, numberOne: false, releaseClause: false, ...extra }
}

const hunger = (d) => (d.seat === 'other' ? 5 : 15)
const formMean = (d) => (d.seasonForm.n >= 4 ? d.seasonForm.sum / d.seasonForm.n : d.lastForm)
const isFree = (d) => !d.teamId && !d.retired

// How a rival team rates a driver: the true Overall blended with results
// against the team-mate, which are noisy, so teams sometimes misjudge.
export function perceived(game, teamId, d) {
  const rng = streamRng(game.seed, 'scout', teamId, d.id, game.season)
  const ovr = exactOverall(d)
  let v = ovr + clamp(-formMean(d) / FORM_BAND, -3, 3) + rng.normal(0, 1.5)
  // Scouts see some of a young driver's upside, and expect a veteran to fade.
  if (d.age <= 24) v += Math.min(3, 0.5 * Math.max(0, d.ceiling + rng.normal(0, 2) - ovr))
  if (d.age >= 33) v -= 0.6 * (d.age - 32)
  // Smaller teams count a driver's backing.
  if (teamId !== PLAYER && teamRep(game, teamId) < 45) v += Math.min(2.5, backingBase(d) * 0.25)
  return v
}

// A driver's interest in joining or staying with a rival team.
function rivalInterest(game, teamId, d, { renewal = false, premium = 1.1, stage = 0 } = {}) {
  const rng = streamRng(game.seed, 'rivalTalk', teamId, d.id, game.season, stage)
  let x = 50 + clamp((teamRep(game, teamId) - ambition(d)) / 2, -25, 25)
  if (renewal) x += LOYALTY
  else if (!d.teamId) x += hunger(d)
  x += clamp(40 * (premium - 1), -20, 20)
  return x + rng.int(-10, 10)
}

// ---- Results, ratings and age ----

// After each race: career numbers, and qualifying against the team-mate
// allowing for the gap in Pace (and Wet, in the rain).
export function recordRace(game, res) {
  for (const r of res.race) {
    const d = game.drivers[r.id]
    if (!d) continue
    for (const x of [d.season, d.career]) {
      x.starts++
      x.points += r.points
      if (r.pos === 1) x.wins++
      if (r.pos <= 3) x.podiums++
    }
    d.season.half++
    d.career.debut ??= year(game)
  }
  const wet = res.weather.quali === 'wet'
  const byTeam = {}
  for (const q of res.quali) (byTeam[q.teamId] ??= []).push(q)
  for (const pair of Object.values(byTeam)) {
    if (pair.length !== 2) continue
    const [a, b] = pair.map((q) => game.drivers[q.id])
    if (!a || !b) continue
    const expected = (b.pace - a.pace) * SIM.secPerPace + (wet ? (b.wet - a.wet) * SIM.wetPerPoint : 0)
    const resid = clamp(pair[0].gap - pair[1].gap - expected, -0.3, 0.3)
    for (const [d, x] of [[a, resid], [b, -resid]]) {
      d.form.n++; d.form.sum += x
      d.seasonForm.n++; d.seasonForm.sum += x
    }
  }
}

// Typical change in Overall over a year, by age. Longevity shifts the decline.
export function ageTrend(d) {
  if (d.age <= 23) return [1, 3]
  if (d.age <= 27) return [0, 2]
  const eff = d.age - d.longevity
  if (eff <= 32) return [-1, 1]
  if (eff <= 35) return [-2, 0]
  if (eff <= 39) return [-3, -1]
  return [-4, -2]
}

const GROW = { pace: 1, racecraft: 1, consistency: 1, wet: 1, feedback: 0.6 }
const DECLINE = { pace: 1.3, consistency: 1.3, wet: 0.9, racecraft: 0.2 } // Racecraft and Feedback hold until late
const LATE = { pace: 1.2, consistency: 1.2, wet: 0.9, racecraft: 0.6, feedback: 0.5 }
const RESULTS = { pace: 1.2, consistency: 1.2, racecraft: 0.4, wet: 0.4 }

function shift(d, x, shares, rng) {
  for (const [k, s] of Object.entries(shares)) d[k] = clamp(d[k] + Math.floor(x * s + rng.next()), 35, 99)
}

// Whether a driver is getting seat time somewhere this half-season.
function seatTime(d) {
  if (d.season.half > 0) return 'racing'
  if (d.teamId === PLAYER && d.contract?.role === 'reserve') return 'reserve'
  if (!d.teamId && (d.age <= 22 || d.academy || d.loanFrom || d.seat === 'other')) return 'elsewhere' // junior series or another top-level series
  return 'none'
}

// Ratings change at mid-season and at season end: half a year of the age
// trend with a personal roll, plus -1, 0 or +1 for results against expectation.
export function updateRatings(game, when) {
  const lines = []
  for (const d of Object.values(game.drivers)) {
    if (d.retired) continue
    const rng = streamRng(game.seed, 'ageing', d.id, game.season, when)
    const before = overall(d)
    const [lo, hi] = ageTrend(d)
    let x = rng.range(lo, hi) / 2
    const time = seatTime(d)
    if (x > 0) {
      const room = d.ceiling - exactOverall(d)
      x = room <= 0 ? Math.min(x, 0.25 * rng.next()) : Math.min(x, room)
      // A young driver without seat time does not develop.
      x *= { racing: 1, reserve: 0.5, elsewhere: 0.8, none: 0 }[time]
    }
    // A season without racing costs a point or two.
    if (when === 'end' && d.season.starts === 0 && time === 'none') x -= rng.int(1, 2)
    if (x >= 0) shift(d, x, GROW, rng)
    else shift(d, x, d.age - d.longevity >= 38 ? LATE : DECLINE, rng)
    let adj = 0
    if (d.form.n >= 3) {
      const mean = d.form.sum / d.form.n
      adj = mean < -FORM_BAND ? 1 : mean > FORM_BAND ? -1 : 0
      if (adj) shift(d, adj, RESULTS, rng)
    }
    d.form = { n: 0, sum: 0 }
    d.season.half = 0
    const after = overall(d)
    if (d.teamId === PLAYER && after !== before) lines.push(`${d.name}: Overall ${before} to ${after}${adj > 0 ? ' (beat expectations)' : adj < 0 ? ' (below expectations)' : ''}`)
  }
  return lines
}

// ---- Contracts ----
export function marketDemand(game, d, role = 'race') {
  const free = !d.teamId
  const stage = game.market && !game.market.closed ? game.market.stage : MARKET_STAGES
  return salaryDemand(d, game.seed, game.season) *
    (free ? Math.pow(STAGE_DISCOUNT, stage - 1) : 1) *
    (d.loanFrom ? 0.4 : 1) * (d.academy ? 0.6 : 1) * (role === 'reserve' ? 0.2 : 1)
}

export function personalFactor(game, d) {
  return streamRng(game.seed, 'personal', d.id, game.season).int(-10, 10)
}

export const rivalOffers = (game, d) => Math.min(2, game.market?.rivalTargets?.[d.id] || 0)

// Interest in the player's offer, from section 5.6. `personal` adds the hidden
// personal factor; without it this is the estimate the player sees.
export function offerInterest(game, d, offer, personal = true) {
  const parts = []
  const add = (label, v) => { if (v) parts.push({ label, value: v }) }
  add('Base', 50)
  add('Team appeal', clamp((game.reputation - ambition(d)) / 2, -25, 25))
  if (d.teamId === PLAYER) add('Loyalty', LOYALTY)
  else add('Seat hunger', hunger(d))
  if (d.academy) add('Your academy', ACADEMY_LOYALTY)
  const demand = marketDemand(game, d, offer.role)
  add('Salary against demand', clamp(40 * (offer.salary / demand - 1), -20, 20))
  if (offer.numberOne) add('Number-one status', 8)
  if (offer.years === d.prefYears) add('Preferred length', 5)
  if (offer.releaseClause) add('Release clause', 5)
  if (offer.role === 'reserve') add('Reserve role', -5)
  add('Earlier events', d.interestMod || 0)
  add('Rival offers', -10 * rivalOffers(game, d))
  const shown = parts.reduce((s, p) => s + p.value, 0)
  return { interest: shown + (personal ? personalFactor(game, d) : 0), estimate: shown, parts, demand }
}

const raceSeats = (game) => game.teams[PLAYER].drivers.filter((id) => !game.drivers[id].contract?.expired)

export function canApproach(game, d) {
  if (!d || d.retired) return 'Unknown driver'
  if (game.phase !== 'preseason') return 'Drivers can only be signed in pre-season, before targets are set'
  if (d.teamId && d.teamId !== PLAYER) return `${d.name} is under contract with ${teamName(game, d.teamId)}`
  if (d.teamId === PLAYER && !d.contract?.expired) return `${d.name} is already under contract`
  if ((game.market.tries[d.id] || 0) >= APPROACHES_PER_WINTER) return `${d.name} will not talk again until next winter`
  return null
}

// offer: { role: 'race' | 'reserve', salary, years, numberOne, releaseClause }
export function offerContract(game, driverId, offer) {
  const d = game.drivers[driverId]
  const block = canApproach(game, d)
  if (block) throw new Error(block)
  const role = offer.role === 'reserve' ? 'reserve' : 'race'
  const years = d.loanFrom ? 1 : clamp(Math.round(offer.years || 1), 1, 3)
  const salary = Number(offer.salary)
  if (!(salary > 0)) throw new Error('Offer a salary')
  const team = game.teams[PLAYER]
  const renewing = d.teamId === PLAYER
  const seatsUsed = raceSeats(game).filter((id) => id !== driverId).length
  if (role === 'race' && seatsUsed >= 2) throw new Error('Both race seats are taken')
  if (role === 'reserve' && game.reserve && game.reserve !== driverId && !game.drivers[game.reserve].contract?.expired) throw new Error('The reserve seat is taken')
  if (offer.numberOne && role === 'race' && raceSeats(game).some((id) => id !== driverId && game.drivers[id].contract.numberOne)) throw new Error('The other driver already has number-one status')
  const terms = { role, salary, years, numberOne: !!offer.numberOne && role === 'race', releaseClause: !!offer.releaseClause }
  const { interest } = offerInterest(game, d, terms)
  game.market.tries[d.id] = (game.market.tries[d.id] || 0) + 1
  if (interest < SIGNS_AT) {
    game.market.log.push(`${d.name} turned down your offer`)
    return { accepted: false, interest, triesLeft: APPROACHES_PER_WINTER - game.market.tries[d.id] }
  }
  // An out-of-contract driver in the other seat makes way.
  if (!renewing) {
    if (role === 'race' && team.drivers.length >= 2) {
      const out = team.drivers.find((id) => game.drivers[id].contract?.expired)
      if (out) leavePlayer(game, out)
    }
    if (role === 'reserve' && game.reserve) leavePlayer(game, game.reserve)
  } else if ((role === 'race') !== (d.contract.role === 'race')) {
    // Moving between the race seat and the reserve seat.
    leavePlayer(game, d.id, false)
  }
  d.teamId = PLAYER
  d.contract = newContract(d, salary, years, {
    role, loan: !!d.loanFrom, numberOne: terms.numberOne, releaseClause: terms.releaseClause,
    backing: role === 'race' ? backingRoll(d, game.seed, game.season) * formFactor(d) : 0,
  })
  if (role === 'reserve') game.reserve = d.id
  else if (!team.drivers.includes(d.id)) team.drivers.push(d.id)
  game.market.log.push(`${d.name} signed for ${years} season${years > 1 ? 's' : ''} at £${salary.toFixed(2)}m a year`)
  computeRivalTargets(game)
  return { accepted: true, interest, contract: d.contract }
}

// Removes a driver from the player's team. `toMarket` leaves them unsigned.
function leavePlayer(game, id, toMarket = true) {
  const d = game.drivers[id]
  const team = game.teams[PLAYER]
  team.drivers = team.drivers.filter((x) => x !== id)
  if (game.reserve === id) game.reserve = null
  if (toMarket) { d.teamId = null; d.contract = null }
}

export function releaseCost(d) {
  if (!d.contract || d.contract.expired) return 0
  return RELEASE_SHARE * d.contract.salary * d.contract.years
}

export function releaseDriver(game, driverId) {
  const d = game.drivers[driverId]
  if (!d || d.teamId !== PLAYER) throw new Error('Not one of your drivers')
  if (game.phase !== 'preseason') throw new Error('Drivers can only be changed in pre-season, before targets are set')
  const cost = releaseCost(d)
  if (!canSpend(game, cost)) throw new Error('Not enough cash to pay off the contract')
  if (cost > 0) spend(game, 'drivers', cost)
  leavePlayer(game, driverId)
  game.market?.log.push(`${d.name} has been released`)
}

// Backing moves with results: beating expectation attracts backers.
const formFactor = (d) => clamp(1 - 2 * formMean(d), 0.7, 1.3)

// ---- Rival line-ups ----
const vacancies = (game, t) => 2 - t.drivers.length

function eligibleFor(game, teamId, d) {
  if (!isFree(d) && !(d.teamId === PLAYER && d.contract?.expired)) return false
  if (d.academy) return false // the player's own juniors
  if (d.loanFrom && d.loanFrom !== teamId) {
    // Another team's junior: only a sister team can take them on.
    const family = game.teams[d.loanFrom]?.family
    if (!family || family !== game.teams[teamId].family) return false
  }
  return overall(d) >= 70 && d.age >= 18
}

function candidatesFor(game, teamId, stage, threshold) {
  return Object.values(game.drivers)
    .filter((d) => eligibleFor(game, teamId, d) && rivalInterest(game, teamId, d, { stage }) >= threshold)
    .map((d) => ({ d, v: perceived(game, teamId, d) }))
    .sort((a, b) => b.v - a.v)
}

function signForRival(game, teamId, d, why = '') {
  const t = game.teams[teamId]
  const from = d.teamId
  if (from === PLAYER) leavePlayer(game, d.id, false)
  else if (from) game.teams[from].drivers = game.teams[from].drivers.filter((x) => x !== d.id)
  const rng = streamRng(game.seed, 'rivalContract', teamId, d.id, game.season)
  d.teamId = teamId
  d.contract = newContract(d, salaryDemand(d, game.seed, game.season) * 1.1, d.age >= 35 ? 1 : clamp(d.prefYears + rng.int(-1, 1), 1, 3))
  if (d.loanFrom === teamId || (d.loanFrom && game.teams[d.loanFrom]?.family && game.teams[d.loanFrom].family === t.family)) d.loanFrom = null
  t.drivers.push(d.id)
  const line = `${t.name} sign ${d.name}${from === PLAYER ? ` from ${game.teams[PLAYER].name}` : from ? ` from ${teamName(game, from)}` : ''}${why}`
  game.market.log.push(line)
  game.news.push(line)
}

// Rivals with an empty seat sign the best driver they can attract. A team
// well above another can also buy out that team's driver.
export function rivalSignings(game, final = false) {
  const stage = game.market.stage
  const order = Object.values(game.teams).filter((t) => !t.isPlayer).sort((a, b) => teamRep(game, b.id) - teamRep(game, a.id))
  for (let pass = 0; pass < 3; pass++) {
    for (const t of order) {
      while (vacancies(game, t) > 0) {
        const best = candidatesFor(game, t.id, stage, final ? LAST_CALL : RIVAL_SIGNS_AT)[0]
        const poach = buyoutTarget(game, t, best?.v ?? 0, stage)
        if (poach) { signForRival(game, t.id, poach, ' in a buyout'); continue }
        if (!best) break
        signForRival(game, t.id, best.d)
      }
    }
  }
  if (final) {
    // Nobody left who will come: a rookie is promoted.
    for (const t of order) while (vacancies(game, t) > 0) signForRival(game, t.id, makeDriver(game, streamRng(game.seed, 'rookie', t.id, game.season, t.drivers.length), { age: 21, level: 76 }), ' (promoted from the junior series)')
  }
  computeRivalTargets(game)
}

function buyoutTarget(game, t, bestFree, stage) {
  const rep = teamRep(game, t.id)
  const rng = streamRng(game.seed, 'buyout', t.id, game.season, stage, t.drivers.length)
  if (rep < 60 || !rng.chance(0.5)) return null
  let pick = null
  for (const o of Object.values(game.teams)) {
    if (o.isPlayer || o.id === t.id || teamRep(game, o.id) > rep - 20) continue
    for (const id of o.drivers) {
      const d = game.drivers[id]
      const v = perceived(game, t.id, d)
      if (v >= bestFree + 3 && (!pick || v > pick.v) && rivalInterest(game, t.id, d, { premium: 1.2, stage }) >= RIVAL_SIGNS_AT) pick = { d, v }
    }
  }
  return pick?.d ?? null
}

// Which free drivers rival teams are chasing, for the "rival offers" factor.
export function computeRivalTargets(game) {
  const out = {}
  if (!game.market || game.market.closed) { if (game.market) game.market.rivalTargets = out; return }
  for (const t of Object.values(game.teams)) {
    if (t.isPlayer || vacancies(game, t) <= 0) continue
    for (const { d } of candidatesFor(game, t.id, game.market.stage, RIVAL_SIGNS_AT).slice(0, vacancies(game, t))) out[d.id] = (out[d.id] || 0) + 1
  }
  game.market.rivalTargets = out
}

// The winter review: keep, let the contract run out, or buy it out early.
function rivalReviews(game, mid = false) {
  for (const t of Object.values(game.teams)) {
    if (t.isPlayer) continue
    const patience = t.patience ?? 0.5
    // Only an impatient team swaps a driver mid-season.
    if (mid && patience >= 0.3) continue
    const altV = candidatesFor(game, t.id, 0, RIVAL_SIGNS_AT)[0]?.v ?? 0
    for (const id of t.drivers.slice()) {
      const d = game.drivers[id]
      const rng = streamRng(game.seed, 'review', t.id, id, game.season, mid ? 'mid' : 'end')
      const mine = perceived(game, t.id, d)
      if (mid) {
        if (altV - mine > 3.5 && rng.chance(0.5)) {
          dropDriver(game, t, d, `${t.name} drop ${d.name} mid-season`)
        }
        continue
      }
      if (d.contract.years > 0) {
        if (altV - mine > 5 + 6 * patience && rng.chance(0.5)) dropDriver(game, t, d, `${t.name} buy out ${d.name}'s contract`)
        continue
      }
      // Contract up: renew if the driver is worth it and wants to stay.
      const keep = mine + 2.5 * patience >= altV
      if (keep && rivalInterest(game, t.id, d, { renewal: true, premium: 1.15 }) >= RIVAL_SIGNS_AT) {
        d.contract = newContract(d, salaryDemand(d, game.seed, game.season) * 1.15, d.age >= 35 ? 1 : clamp(d.prefYears + rng.int(0, 1), 1, 3))
      } else {
        dropDriver(game, t, d, keep ? `${d.name} leaves ${t.name} at the end of the contract` : `${t.name} let ${d.name}'s contract run out`)
      }
    }
  }
  if (mid) { for (const t of Object.values(game.teams)) if (!t.isPlayer) while (vacancies(game, t) > 0) midSeasonFill(game, t) }
}

function dropDriver(game, t, d, text) {
  t.drivers = t.drivers.filter((x) => x !== d.id)
  d.teamId = null
  d.contract = null
  game.news.push(text)
  game.market?.log.push(text)
}

function midSeasonFill(game, t) {
  const best = candidatesFor(game, t.id, 9, LAST_CALL)[0]
  const d = best?.d ?? makeDriver(game, streamRng(game.seed, 'midRookie', t.id, game.season), { age: 21, level: 76 })
  signForRival(game, t.id, d, ' mid-season')
  game.midSeasonSwaps = (game.midSeasonSwaps || 0) + 1
}

// ---- New drivers ----
export function makeDriver(game, rng, { age = rng.int(17, 19), level = null, potential = null, academy = false, loanFrom = null, seat = 'none' } = {}) {
  const used = new Set(Object.values(game.drivers).map((d) => d.name))
  let name = `${rng.pick(DRIVER_FIRST)} ${rng.pick(DRIVER_LAST)}`
  for (let i = 0; used.has(name) && i < 20; i++) name = `${rng.pick(DRIVER_FIRST)} ${rng.pick(DRIVER_LAST)}`
  const pot = potential ?? clamp(Math.round(rng.normal(84, 5)), 74, 97)
  const base = level ?? clamp(Math.round(pot - rng.range(9, 16) + (age - 18) * 1.5), 62, 82)
  const id = `gen-${game.nextDriverId++}`
  const d = {
    id, name, age, generated: true,
    pace: base + rng.int(-1, 3), racecraft: base + rng.int(-3, 2), consistency: base + rng.int(-4, 2), wet: base + rng.int(-4, 3),
    feedback: base - rng.int(1, 7), marketability: rng.int(55, 80), potential: pot,
    pull: rng.chance(0.3) ? Math.round(rng.range(0.5, 2.5) * 10) / 10 : 0, seat, loanFrom, academy, teamId: null, contract: null,
  }
  game.drivers[id] = d
  initDriverTraits(game, d)
  return d
}

// A handful of juniors each winter, about half tied to a rival academy, plus
// one driver from another series. The player's academy adds its own.
function newDrivers(game) {
  const rng = streamRng(game.seed, 'newDrivers', game.season)
  const rivals = Object.values(game.teams).filter((t) => !t.isPlayer)
  const lines = []
  for (let i = 0; i < 4; i++) {
    const tie = rng.chance(0.5) ? rng.weightedPick(rivals, rivals.map((t) => 10 + teamRep(game, t.id))).id : null
    makeDriver(game, rng, { loanFrom: tie })
  }
  makeDriver(game, rng, { age: rng.int(24, 28), potential: rng.int(77, 84), seat: 'other' })
  const level = game.org.facilities.academy?.level || 0
  const roster = Object.values(game.drivers).filter((d) => d.academy && !d.teamId && !d.retired)
  if (level > 0 && roster.length < level + 1 && rng.chance(0.4 + 0.1 * level)) {
    const d = makeDriver(game, rng, { age: rng.int(16, 18), potential: clamp(Math.round(rng.normal(81 + 2.5 * level, 4)), 74, 97), academy: true })
    lines.push(`${d.name} (${d.age}) joins your academy`)
  }
  return lines
}

// ---- Retirement and leaving the market ----
function retireChance(game, d) {
  const eff = d.age - 0.6 * d.longevity
  let p = eff >= 34 ? 0.08 + 0.08 * (eff - 34) : 0
  const unsigned = !d.teamId && !d.academy
  if (unsigned && d.age >= 24) p += d.unsigned >= 1 ? 0.35 : 0.1
  if (unsigned && overall(d) < 75 && d.age >= 26) p += 0.3
  if (d.contract && d.contract.years > 0) p *= 0.4
  if (d.age >= 46) p = 1
  return clamp(p, 0, 0.95)
}

function retireDriver(game, d) {
  const lines = []
  if (d.teamId === PLAYER) { leavePlayer(game, d.id); lines.push(`${d.name} has retired from your team`) }
  else if (d.teamId) game.teams[d.teamId].drivers = game.teams[d.teamId].drivers.filter((x) => x !== d.id)
  if (d.career.starts > 0) {
    game.retired.push({ name: d.name, age: d.age, year: year(game) - 1, starts: d.career.starts, wins: d.career.wins, titles: d.career.titles, points: d.career.points })
    if (game.retired.length > 80) game.retired.shift()
    if (d.career.starts > 20) game.news.push(`${d.name} retires at ${d.age}${d.generated ? ` after ${d.career.starts} starts and ${d.career.wins} wins` : ''}`)
  }
  delete game.drivers[d.id]
  return lines
}

// ---- The winter ----
export function peopleWinter(game) {
  const news = []
  const lineups = Object.fromEntries(Object.values(game.teams).filter((t) => !t.isPlayer).map((t) => [t.id, [...t.drivers]]))
  news.push(...updateRatings(game, 'end'))
  for (const d of Object.values(game.drivers)) {
    const rng = streamRng(game.seed, 'winter', d.id, game.season)
    d.marketability = clamp(d.marketability + rng.int(-1, 1) + (d.season.wins > 0 ? 1 : 0) + (d.season.podiums >= 3 ? 1 : 0) - (d.age >= 37 ? 1 : 0), 40, 99)
    if (d.season.starts > 0) d.career.seasons++
    d.unsigned = d.season.starts > 0 || d.teamId ? 0 : d.unsigned + 1
    d.lastForm = d.seasonForm.n >= 4 ? d.seasonForm.sum / d.seasonForm.n : 0
    d.seasonForm = { n: 0, sum: 0 }
    d.season = { starts: 0, points: 0, wins: 0, podiums: 0, half: 0 }
    d.age++
    d.interestMod = 0
    if (d.academy && d.age >= 24) { d.academy = false; news.push(`${d.name} leaves your academy`) }
    if (d.loanFrom && d.age >= 25 && !d.teamId) d.loanFrom = null
  }
  for (const d of Object.values(game.drivers)) {
    if (streamRng(game.seed, 'retire', d.id, game.season).chance(retireChance(game, d))) news.push(...retireDriver(game, d))
  }
  // Contracts run down. The player's expiring drivers stay until the market closes.
  for (const d of Object.values(game.drivers)) {
    const c = d.contract
    if (!c) continue
    c.years--
    if (d.teamId === PLAYER) {
      if (c.role === 'race') c.backing = backingRoll(d, game.seed, game.season) * formFactor(d)
      if (c.years <= 0) { c.expired = true; news.push(`${d.name}'s contract has expired: re-sign them before the market closes or they leave`) }
    }
  }
  game.market = { stage: 1, closed: false, tries: {}, log: [], rivalTargets: {}, seatChanges: [] }
  rivalReviews(game)
  news.push(...loanRecalls(game))
  news.push(...newDrivers(game))
  pruneMarket(game)
  driverBids(game)
  computeRivalTargets(game)
  game.market.lineupsBefore = lineups
  return news
}

// A loan ends at season end; the parent team can recall the driver.
function loanRecalls(game) {
  const lines = []
  for (const id of [...game.teams[PLAYER].drivers, ...(game.reserve ? [game.reserve] : [])]) {
    const d = game.drivers[id]
    if (!d?.contract?.loan || !d.contract.expired) continue
    const parent = game.teams[d.loanFrom]
    if (!parent) continue
    const best = candidatesFor(game, parent.id, 0, RIVAL_SIGNS_AT).find((c) => c.d.id !== id)
    if (vacancies(game, parent) > 0 && perceived(game, parent.id, d) >= (best?.v ?? 0) - 1) {
      signForRival(game, parent.id, d, ' (recalled from loan)')
      lines.push(`${parent.name} have recalled ${d.name} from loan`)
    }
  }
  return lines
}

// Drivers who have been out of a seat too long drift away from the market.
function pruneMarket(game) {
  for (const d of Object.values(game.drivers)) {
    if (d.teamId || d.academy) continue
    const ovr = overall(d)
    const gone = (d.age >= 25 && d.unsigned >= 2 && ovr < 82) || (d.age >= 23 && d.unsigned >= 3) || (d.age >= 30 && d.unsigned >= 1 && ovr < 78)
    if (gone && !d.loanFrom) retireDriver(game, d)
  }
}

// ---- Rivals bid for the player's drivers ----
function driverBids(game) {
  for (const id of game.teams[PLAYER].drivers) {
    const d = game.drivers[id]
    const c = d.contract
    if (!c || c.expired || c.loan || c.years <= 0) continue
    const suitors = Object.values(game.teams).filter((t) => !t.isPlayer && vacancies(game, t) > 0 && teamRep(game, t.id) >= game.reputation + 5)
      .sort((a, b) => teamRep(game, b.id) - teamRep(game, a.id))
    for (const t of suitors) {
      const best = candidatesFor(game, t.id, 0, RIVAL_SIGNS_AT)[0]
      if (perceived(game, t.id, d) < (best?.v ?? 0) + 2) continue
      if (rivalInterest(game, t.id, d, { premium: 1.2 }) < SIGNS_AT) continue
      if (c.releaseClause) {
        const fee = releaseFee(c)
        earn(game, 'other', fee)
        signForRival(game, t.id, d, ` by paying the £${fee.toFixed(1)}m release clause`)
      } else {
        const fee = c.salary * c.years * 1.2 + 1.5
        game.approaches.push({ id: `bid-${game.season}-${d.id}`, kind: 'driver', driverId: d.id, teamId: t.id, fee, text: `${t.name} offer £${fee.toFixed(1)}m to buy ${d.name} out of their contract` })
      }
      break
    }
  }
}

export const releaseFee = (c) => Math.max(2, 1.5 * c.salary)

export function answerApproach(game, approachId, accept) {
  const a = game.approaches.find((x) => x.id === approachId)
  if (!a) throw new Error('That approach has gone')
  game.approaches = game.approaches.filter((x) => x !== a)
  if (a.kind === 'driver') {
    const d = game.drivers[a.driverId]
    if (!d || d.teamId !== PLAYER) return
    if (accept && game.teams[a.teamId].drivers.length < 2) {
      earn(game, 'other', a.fee)
      signForRival(game, a.teamId, d, ` for £${a.fee.toFixed(1)}m`)
    } else {
      // Turned down: the driver is unsettled at the next talks.
      d.interestMod -= 5
    }
  } else if (a.kind === 'staff') {
    const k = game.org.keyStaff[a.role]
    if (accept) {
      if (!canSpend(game, 0)) throw new Error('Not enough cash')
      k.salary *= a.raise
    } else {
      game.org.keyStaff[a.role] = a.deputy
      game.news.push(`${k.name} leaves for ${teamName(game, a.teamId)}; ${a.deputy.name} steps up`)
    }
  }
  computeRivalTargets(game)
}

// ---- Market stages ----
export function advanceMarket(game) {
  if (game.phase !== 'preseason') throw new Error('The market runs in pre-season')
  if (game.market.closed) throw new Error('The market has closed for this winter')
  if (game.market.stage >= MARKET_STAGES) return closeMarket(game)
  rivalSignings(game)
  game.market.stage++
  computeRivalTargets(game)
}

// Rivals fill every seat, unanswered approaches are settled, and drivers whose
// contracts have expired leave.
export function closeMarket(game) {
  if (!game.market || game.market.closed) return
  rivalSignings(game)
  game.market.stage = MARKET_STAGES
  rivalSignings(game, true)
  for (const a of game.approaches.slice()) answerApproach(game, a.id, false)
  for (const id of [...game.teams[PLAYER].drivers, ...(game.reserve ? [game.reserve] : [])]) {
    const d = game.drivers[id]
    if (d.contract?.expired) { leavePlayer(game, id); game.market.log.push(`${d.name} leaves at the end of their contract`) }
  }
  game.market.closed = true
  game.market.rivalTargets = {}
  if (game.market.lineupsBefore) {
    let changes = 0
    for (const [id, before] of Object.entries(game.market.lineupsBefore)) changes += game.teams[id].drivers.filter((x) => !before.includes(x)).length
    game.market.seatChanges = changes
    game.market.lineupsBefore = null
  }
}

export function seatsReady(game) {
  return raceSeats(game).length === 2
}

// Mid-season: ratings move, and impatient teams may change a driver.
export function peopleMidSeason(game) {
  const lines = updateRatings(game, 'mid')
  rivalReviews(game, true)
  return lines
}

// ---- What an average manager does in the winter ----
// Turns down bids, matches staff offers it can afford, re-signs drivers who
// are out of contract at a fair price, and fills any empty seat with the best
// driver who will sign at a fair price.
export function autoDrivers(game, { maxSalary = null, pick = (d) => overall(d) } = {}) {
  if (game.phase !== 'preseason' || game.market.closed) return
  for (const a of game.approaches.slice()) answerApproach(game, a.id, a.kind === 'staff' && game.finance.cash > 3)
  const cap = maxSalary ?? Math.max(1.5, game.reputation / 6)
  const fair = (d, role) => {
    const demand = marketDemand(game, d, role)
    return { role, salary: demand * 1.1, years: d.prefYears, releaseClause: true }
  }
  const tryOffer = (d, role) => {
    const o = fair(d, role)
    if (o.salary > cap * (role === 'reserve' ? 0.3 : 1)) return false
    if (canApproach(game, d)) return false
    if (offerInterest(game, d, o, false).estimate < SIGNS_AT - 4) return false
    try { return offerContract(game, d.id, o).accepted } catch { return false }
  }
  for (const id of game.teams[PLAYER].drivers.slice()) {
    const d = game.drivers[id]
    if (d.contract?.expired && !tryOffer(d, 'race')) {
      if ((game.market.tries[d.id] || 0) < APPROACHES_PER_WINTER) tryOffer(d, 'race')
    }
  }
  const pool = Object.values(game.drivers).filter((d) => !d.teamId && !d.retired && overall(d) >= 70).sort((a, b) => pick(b) - pick(a))
  for (const d of pool) {
    if (raceSeats(game).length >= 2) break
    tryOffer(d, 'race')
  }
  // Last resort: anyone at all, at whatever they ask.
  for (const d of pool) {
    if (raceSeats(game).length >= 2) break
    if (canApproach(game, d)) continue
    try { offerContract(game, d.id, { role: 'race', salary: marketDemand(game, d) * 1.5, years: d.prefYears, releaseClause: true, numberOne: raceSeats(game).every((id) => !game.drivers[id].contract.numberOne) }) } catch { /* try the next */ }
  }
  for (const id of game.teams[PLAYER].drivers.slice()) if (game.drivers[id].contract?.expired && raceSeats(game).length >= 2) leavePlayer(game, id)
}

export { ROUNDS }
