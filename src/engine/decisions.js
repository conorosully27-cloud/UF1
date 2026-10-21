// The round decision (design section 5.9): one A/B call before every race.
// Decisions are data (see data/deck.js). Each option is a list of effects;
// this file draws a decision, shows it, applies the chosen option and can
// estimate what an option is worth for the scripted managers.

import { PLAYER, ROUNDS, clamp, clock, currentTrack, effectiveCar, playerPosition, playerDrivers } from './core.js'
import { earn, spend, forecast, perRound, OVERDRAFT } from './economy.js'
import { capacity, diminishing, chassisCap, rushFirstBuild, plannedSpendPerRound } from './development.js'
import { headcountCap, engineerCount } from './org.js'
import { mechFailureChance, crashChance } from './weekend.js'
import { streamRng } from './rng.js'
import { DECK } from './data/deck.js'
import { makeDriver } from './people.js'

export const NO_REPEAT = 32 // rounds before the same decision can come round again
// Race-weekend cards that a live weekend covers with its own practice, calls and orders.
export const LIVE_CALLS = new Set([
  'one-stop-split', 'safety-car-plan', 'start-tyres', 'team-orders', 'lap-one', 'showers', 'driver-strategy', 'low-drag', 'max-downforce',
  'quali-drying', 'quali-run-plan', 'quali-tow', 'rain-setup', 'experimental-setup', 'practice-focus', 'setup-guess', 'radio-coaching',
])
// The rest of the race-weekend cards become incidents in a live weekend
// (RACE_WEEKEND.md 5.6): drawn as now, but put to the player on the day they
// would happen, 0 Thursday to 3 Sunday, instead of before the weekend.
export const INCIDENT_DAY = {
  'driver-ill': 0, 'junior-outings': 0, 'wing-protest': 0, 'untested-part': 0, 'track-limits': 0,
  'practice-crash': 1, vibration: 1, actuator: 1, 'spare-chassis': 1, 'pit-crew-injury': 1, suspension: 1, 'ride-height': 1,
  'quali-engine-mode': 2, 'tyre-allocation': 2, 'gearbox-fault': 2, curfew: 2, 'pu-life': 2,
  overheat: 3, 'fuel-load': 3, 'launch-maps': 3, 'tyre-pressures': 3, 'power-boost': 3, 'brake-wear': 3,
}
export const isIncidentCard = (id) => id in INCIDENT_DAY
// A weekend card waiting for a live weekend, where it comes up as an
// incident. Asking for it before then (`reveal`, for a quick sim) shows it now.
export const deferredIncident = (game) => {
  const dec = game.decision
  return !!dec && !dec.resolved && !dec.reveal && isIncidentCard(dec.id) && game.settings.involvement === 'live'
}
const BY_ID = Object.fromEntries(DECK.map((d) => [d.id, d]))
const WEEKEND_TYPES = new Set(['Race weekend', 'Reliability'])
const SIZE_GAIN = { minor: 1.0, major: 2.5, package: 6.0 }

export function decisionContext(game) {
  const drivers = playerDrivers(game)
  return {
    track: currentTrack(game), car: game.teams[PLAYER].car, eff: effectiveCar(game, PLAYER), drivers,
    reserve: game.reserve ? game.drivers[game.reserve] : null,
    cash: game.finance.cash, forecast: forecast(game, plannedSpendPerRound(game)), rep: game.reputation, pos: playerPosition(game),
    roundsLeft: ROUNDS - game.round, round: game.round, season: game.season,
    staff: game.org.keyStaff, fac: game.org.facilities, cap: capacity(game), deals: game.sponsors.deals, dev: game.dev,
  }
}

// How the odds of a chance are reported, by the rating of the relevant head
// of department: exact, rounded, or a rough word based on a noisy estimate.
export function oddsText(p, rating, u) {
  if (rating >= 80) return `${Math.round(p * 100)}%`
  if (rating >= 60) return `about ${Math.round(p * 10) * 10}%`
  const est = clamp(p + (u - 0.5) * 0.4, 0.02, 0.98)
  return est < 0.2 ? 'unlikely' : est < 0.4 ? 'possible' : est < 0.6 ? 'an even chance' : est < 0.8 ? 'likely' : 'very likely'
}

export function drawDecision(game) {
  if (!game.options.decisions || game.phase !== 'season') { game.decision = null; return null }
  const c = decisionContext(game)
  const now = clock(game)
  const rng = streamRng(game.seed, 'decision', game.season, game.round)
  // With the race run live, the calls the pit wall now makes during the race are not drawn as cards.
  const live = game.settings.involvement === 'live'
  const eligible = DECK.filter((d) => {
    const seen = game.decisionSeen[d.id]
    return (seen === undefined || now - seen >= NO_REPEAT) && (!d.when || d.when(game, c)) && !(live && LIVE_CALLS.has(d.id))
  })
  if (!eligible.length) { game.decision = null; return null }
  // About half the decisions are race-weekend calls.
  const wantWeekend = rng.chance(0.5)
  let group = eligible.filter((d) => WEEKEND_TYPES.has(d.type) === wantWeekend)
  if (!group.length) group = eligible
  const d = rng.weightedPick(group, group.map((x) => (x.weight ? Math.max(0.01, x.weight(game, c)) : 1)))
  game.decisionSeen[d.id] = now
  game.decision = {
    id: d.id, season: game.season, round: game.round,
    params: d.setup ? d.setup(game, c, rng) : {},
    // Every roll is fixed now, so reloading the save cannot change the outcome.
    rolls: Array.from({ length: 8 }, () => rng.next()), noise: rng.next(),
    resolved: false, choice: null, outcome: [],
  }
  return game.decision
}

// The decision as the player sees it.
export function describeDecision(game, dec = game.decision) {
  if (!dec) return null
  const d = BY_ID[dec.id]
  const c = decisionContext(game)
  const rating = game.org.keyStaff[d.staff].rating
  const P = (p) => oddsText(p, rating, dec.noise)
  const option = (o) => ({ label: typeof o.label === 'function' ? o.label(game, c, dec.params) : o.label, text: o.text(game, c, dec.params, P) })
  return {
    id: d.id, type: d.type, title: typeof d.title === 'function' ? d.title(game, c, dec.params) : d.title,
    text: d.text(game, c, dec.params, P), factors: d.factors, staff: d.staff, staffRating: rating,
    a: option(d.a), b: option(d.b), resolved: dec.resolved, choice: dec.choice, outcome: dec.outcome,
  }
}

const driverBySlot = (game, slot) => (slot === 'reserve' ? game.drivers[game.reserve] : game.drivers[game.teams[PLAYER].drivers[slot]])

// The funded karting prospect joins the player's academy as a junior.
function addProspect(game, st) {
  const rng = streamRng(game.seed, 'prospect', clock(game))
  const d = makeDriver(game, rng, { age: 18, potential: rng.int(86, 94), level: rng.int(71, 75), academy: true })
  st.out.push(`${d.name}, the junior the team has been funding, has joined your academy and can be signed`)
}

function applyEffect(game, e, st) {
  const car = game.teams[PLAYER].car
  const o = game.org
  if ('chance' in e) {
    const hit = st.rolls[st.i++ % st.rolls.length] < e.chance
    // A chance that plays out on track (`wait`) is rolled now but kept back:
    // the race feed tells what happened, when it happens.
    const line = 'wait' in e ? e.wait : e.text?.[hit ? 0 : 1]
    if (line) st.out.push(line)
    applyEffects(game, hit ? e.then : e.else || [], st)
    return
  }
  if ('cash' in e) { if (e.cash >= 0) earn(game, 'other', e.cash); else spend(game, 'other', -e.cash) }
  if ('rating' in e) {
    const [area, x] = e.rating
    car[area] = clamp(car[area] + x, 20, area === 'chassis' ? Math.max(car[area], chassisCap(game)) : 99)
  }
  if ('weekend' in e) game.weekendMods.push(e.weekend.timed ? { ...e.weekend, timed: { ...e.weekend.timed, title: st.title } } : e.weekend)
  if ('buff' in e) game.buffs.push({ roundsLeft: e.buff.rounds, car: e.buff.car ?? 'both', mods: e.buff.mods })
  if ('weather' in e) game.weatherOverride = e.weather
  if ('skill' in e) o.staff[e.skill[0]].skill = clamp(o.staff[e.skill[0]].skill + e.skill[1], 20, 99)
  if ('staff' in e) o.keyStaff[e.staff[0]].rating = clamp(o.keyStaff[e.staff[0]].rating + e.staff[1], 30, 99)
  if ('staffSalary' in e) o.keyStaff[e.staffSalary[0]].salary *= e.staffSalary[1]
  if ('rep' in e) game.reputation = clamp(game.reputation + e.rep, 0, 100)
  if ('conf' in e) game.confidence = clamp(game.confidence + e.conf, 0, 100)
  if ('sat' in e) {
    const [who, x] = Array.isArray(e.sat) ? e.sat : ['all', e.sat]
    for (const d of game.sponsors.deals) if (who === 'all' || d.id === who) d.satisfaction = clamp(d.satisfaction + x, 0, 100)
  }
  if ('units' in e) {
    const [pool, x] = e.units
    const p = game.dev.queues[pool][0]
    if (p) p.done = clamp(p.done + x, 0, p.units - 0.01)
    else game.dev.banked[pool] = Math.max(0, game.dev.banked[pool] + x)
  }
  if ('driver' in e) { const d = driverBySlot(game, e.driver[0]); if (d) d[e.driver[1]] = clamp(d[e.driver[1]] + e.driver[2], 40, 99) }
  if ('salary' in e) { const d = driverBySlot(game, e.salary[0]); if (d) d.contract.salary *= e.salary[1] }
  if ('years' in e) { const d = driverBySlot(game, e.years[0]); if (d) d.contract.years += e.years[1] }
  if ('backing' in e) { const d = driverBySlot(game, e.backing[0]); if (d) d.contract.backing *= e.backing[1] }
  if ('interest' in e) { const d = driverBySlot(game, e.interest[0]); if (d) d.interestMod = (d.interestMod || 0) + e.interest[1] }
  if ('heads' in e) {
    const [dept, n] = e.heads
    const eng = dept === 'aero' || dept === 'mech'
    const used = eng ? engineerCount(o) : o.staff[dept].heads + o.staff[dept].incoming.reduce((s, x) => s + x.heads, 0)
    const add = Math.min(n, headcountCap(o, dept) - used)
    if (add > 0) o.staff[dept].incoming.push({ heads: add, roundsLeft: 1 })
  }
  if ('discount' in e) game.bonus.facilityDiscount = Math.max(game.bonus.facilityDiscount, e.discount)
  if ('sponsorBonus' in e) game.bonus.sponsor += e.sponsorBonus
  if ('capacityBonus' in e) game.bonus.capacity += e.capacityBonus
  if ('power' in e) game.teams[PLAYER].powerBonus = (game.teams[PLAYER].powerBonus || 0) + e.power
  if ('insure' in e) game.insured = true
  if ('completeBuild' in e) rushFirstBuild(game, e.completeBuild)
  if ('nextUpgrade' in e) game.dev.nextPenalty[e.nextUpgrade[0]] = e.nextUpgrade[1]
  if ('dealBonusOff' in e) { const d = game.sponsors.deals.find((x) => x.id === e.dealBonusOff); if (d) { d.bonus = 0; d.target = null } }
  if ('substitute' in e) game.substitute = e.substitute
  if ('prospect' in e) addProspect(game, st)
  if ('later' in e) game.delayed.push({ roundsLeft: e.later.rounds, effects: e.later.effects, rolls: st.rolls.slice(st.i), title: st.title })
}

function applyEffects(game, effects, st) {
  for (const e of effects) applyEffect(game, e, st)
}

export function resolveDecision(game, choice, dec = game.decision) {
  if (!dec || dec.resolved) throw new Error('There is no decision waiting')
  if (choice !== 'a' && choice !== 'b') throw new Error('Choose A or B')
  const d = BY_ID[dec.id]
  const c = decisionContext(game)
  const view = describeDecision(game, dec)
  const st = { rolls: dec.rolls, i: 0, out: [], title: view.title }
  applyEffects(game, d[choice].fx(game, c, dec.params), st)
  dec.resolved = true
  dec.choice = choice
  dec.outcome = st.out
  game.decisionLog.push({ season: game.season, round: game.round, id: d.id, type: d.type, title: view.title, choice, label: view[choice].label, outcome: st.out.slice() })
  return dec
}

// Effects that land some rounds after a decision. Called before each race.
export function progressDelayed(game) {
  for (const b of game.buffs) b.roundsLeft--
  game.buffs = game.buffs.filter((b) => b.roundsLeft >= 0)
  for (const item of game.delayed.slice()) {
    if (--item.roundsLeft > 0) continue
    game.delayed.splice(game.delayed.indexOf(item), 1)
    const st = { rolls: item.rolls.length ? item.rolls : [0.5], i: 0, out: [], title: item.title }
    applyEffects(game, item.effects, st)
    for (const line of st.out) {
      game.news.push(`${item.title}: ${line}`)
      const entry = game.decisionLog.slice().reverse().find((l) => l.title === item.title)
      if (entry) entry.outcome.push(line)
    }
  }
}

// ---- Rough worth of an option, in £m, for the scripted managers ----
// These are estimates, not the truth: the balance harness measures what good
// choices are really worth. They only need to rank the two options sensibly.
const stakes = (game) => 1 + game.reputation / 40 // results are worth more to a bigger team
const yearPoints = (c, pool) => (c.cap[pool] * ROUNDS) / 10 // rating points of work a year

// A timed effect counts for the share of the race it covers; a time penalty
// counts as time lost on strategy.
function timedMods(w) {
  const t = w.timed
  if (!t?.mods) return w.mods
  const m = { ...w.mods }
  for (const [k, v] of Object.entries(t.mods)) {
    const key = k === 'timePenalty' ? 'stratMean' : k
    m[key] = (m[key] ?? 0) + v * (t.share ?? 1)
  }
  return m
}

function weekendValue(game, c, w, rainOverride) {
  const m = timedMods(w)
  const n = w.car === 'both' ? 2 : 1
  const t = c.track
  const second = 0.4 * stakes(game) // one car a second a lap quicker for one race
  const finish = 0.5 * stakes(game) // getting one car to the flag
  const rain = rainOverride ?? game.weatherOverride ?? t.rain
  const perLap = (s) => (s / t.laps) * second * n
  let v = 0
  v -= (m.racePace || 0) * second * n
  v -= (m.qualiPace || 0) * second * n * (0.3 + 0.7 * t.overtaking)
  v -= (m.gridDrop || 0) * 0.02 * second * n * (0.3 + t.overtaking)
  v -= perLap((m.stratMean || 0) + (m.pitTime || 0) * 1.5)
  // Time won or lost at the start is worth more where passing is hard.
  v -= perLap((m.startTime || 0) * (1 + 3 * t.overtaking))
  v -= (mechFailureChance(c.eff.reliability) * ((m.mechMult || 1) - 1) + (m.dnfAdd || 0)) * finish * n
  // For one car, that driver's own error rate; for both, the average.
  const who = w.car === 'both' ? c.drivers : [c.drivers[w.car] ?? c.drivers[0]]
  const crash = who.reduce((s, d) => s + crashChance(d.consistency), 0) / who.length
  v -= crash * ((m.errMult || 1) - 1) * (finish + 0.6) * n
  v += (m.setupSkill || 0) * 0.0008 * second * n
  if (m.wetSetup) v += (rain * 0.725 * 0.25 - (1 - rain * 0.725) * 0.2) * second * n
  if (m.rainPlan === 'early') v -= perLap(rain * -2.5 + (1 - rain) * 2.5)
  if (m.rainPlan === 'late') v -= perLap(rain * 1.5 + (1 - rain) * -0.5)
  // Wider strategy swings help a team outside the points and hurt one inside them.
  if (m.stratSd) v += (m.stratSd - 1) * 0.05 * (c.pos >= 9 ? 1 : c.pos <= 4 ? -1 : 0) * n
  return v
}

function staffPointValue(game, c, role) {
  if (role === 'headOfAero') return 0.004 * yearPoints(c, 'aero') * 0.9
  if (role === 'technicalDirector') return 0.004 * yearPoints(c, 'mech') * 0.9
  if (role === 'chiefStrategist') return 0.08 * stakes(game)
  if (role === 'commercialDirector') return 0.004 * c.deals.reduce((s, d) => s + d.fee, 0)
  return 0.02 * stakes(game)
}

const DRIVER_WORTH = { pace: 0.3, consistency: 0.2, racecraft: 0.15, feedback: 0.08, wet: 0.05 }

function effectValue(game, c, e, rain) {
  if ('chance' in e) return e.chance * effectsValue(game, c, e.then, rain) + (1 - e.chance) * effectsValue(game, c, e.else || [], rain)
  let v = 0
  const perPoint = (area) => (0.9 / diminishing(c.car[area])) * (area === 'aero' || area === 'chassis' ? 1 : 0.7)
  const seasonShare = Math.max(0.1, c.roundsLeft / ROUNDS)
  const dealWorth = (d, x) => 0.003 * d.fee * x * (d.seasonsLeft <= 1 ? 3 : 1)
  if ('cash' in e) {
    // Money matters more when there is none: a cost the team cannot cover, or income when the forecast is negative.
    // A cost that would take the season's forecast past the overdraft limit risks a crisis.
    const tight = (e.cash < 0 && (c.cash + e.cash < 1 || c.forecast + e.cash < 0)) || (e.cash > 0 && c.forecast < 0)
    const danger = e.cash < 0 && c.forecast + e.cash < OVERDRAFT
    v += e.cash * (danger ? 3 : tight ? 1.5 : 1)
  }
  if ('rating' in e) {
    const [area, x] = e.rating
    const room = area === 'chassis' ? Math.max(0, chassisCap(game) - c.car.chassis) : 99
    v += Math.min(x, room) * perPoint(area)
  }
  if ('weekend' in e) v += weekendValue(game, c, e.weekend, rain)
  if ('buff' in e) v += weekendValue(game, c, { car: e.buff.car ?? 'both', mods: e.buff.mods }) * Math.min(e.buff.rounds, c.roundsLeft)
  if ('skill' in e) {
    const [dept, x] = e.skill
    v += dept === 'aero' || dept === 'mech' ? x * 0.02 * 0.3 * yearPoints(c, dept) * 0.9 : x * 0.03 * stakes(game)
  }
  if ('staff' in e) v += e.staff[1] * staffPointValue(game, c, e.staff[0])
  if ('staffSalary' in e) v -= game.org.keyStaff[e.staffSalary[0]].salary * (e.staffSalary[1] - 1) * 2
  if ('rep' in e) v += e.rep
  if ('conf' in e) v += e.conf * (game.confidence < 25 ? 0.5 : 0.1)
  if ('sat' in e) {
    if (Array.isArray(e.sat)) { const d = c.deals.find((x) => x.id === e.sat[0]); if (d) v += dealWorth(d, e.sat[1]) }
    else for (const d of c.deals) v += dealWorth(d, e.sat)
  }
  if ('units' in e) v += e.units[1] * 0.05
  if ('driver' in e) {
    const d = driverBySlot(game, e.driver[0])
    if (d) v += e.driver[2] * (DRIVER_WORTH[e.driver[1]] || 0.05) * stakes(game) * (e.driver[0] === 'reserve' ? 0.3 : 1)
  }
  if ('salary' in e) { const d = driverBySlot(game, e.salary[0]); if (d) v -= d.contract.salary * (e.salary[1] - 1) * d.contract.years }
  if ('years' in e) v += 0.1 * e.years[1]
  if ('backing' in e) { const d = driverBySlot(game, e.backing[0]); if (d) v += d.contract.backing * (e.backing[1] - 1) * seasonShare }
  if ('interest' in e) v += e.interest[1] * 0.03
  if ('heads' in e) v += e.heads[1] * 0.04
  if ('discount' in e) v += e.discount * 8
  if ('sponsorBonus' in e) v += e.sponsorBonus * c.deals.reduce((s, d) => s + d.fee, 0)
  if ('capacityBonus' in e) v += e.capacityBonus * (yearPoints(c, 'aero') + yearPoints(c, 'mech')) * seasonShare * 0.9
  // A point of Power is worth about 0.6 of a point of Aero, and a supplier upgrade lasts one season.
  if ('power' in e) v += e.power * 0.625 * perPoint('aero') * 0.2 * seasonShare
  if ('insure' in e) v += 0.7 * c.drivers.reduce((s, d) => s + crashChance(d.consistency) * 0.8 + 0.035, 0) * c.roundsLeft
  if ('completeBuild' in e) {
    const p = c.dev.builds[0]
    const mult = e.completeBuild.mult ?? 1
    if (p) { const gain = SIZE_GAIN[p.size] * diminishing(c.car[p.area]); v += 0.12 * gain * mult - (1 - mult) * gain * 0.9 }
  }
  if ('nextUpgrade' in e) v -= (1 - e.nextUpgrade[1]) * 0.9
  if ('dealBonusOff' in e) { const d = c.deals.find((x) => x.id === e.dealBonusOff); if (d) v -= d.bonus * 0.45 }
  if ('substitute' in e && c.reserve) {
    const pace = (d) => 0.6 * d.pace + 0.4 * d.racecraft
    v -= (pace(c.drivers[e.substitute]) - pace(c.reserve)) * 0.02 * 0.4 * stakes(game) * 1.65
  }
  if ('prospect' in e) v += 1.2
  if ('later' in e) v += effectsValue(game, c, e.later.effects) * 0.95
  return v
}

// `rain` is the forecast a weather decision carries, so its options are judged on it.
function effectsValue(game, c, effects, rain = effects.find((e) => 'weather' in e)?.weather) {
  return effects.reduce((s, e) => s + effectValue(game, c, e, rain), 0)
}

export function optionValue(game, choice, dec = game.decision) {
  const d = BY_ID[dec.id]
  const c = decisionContext(game)
  return effectsValue(game, c, d[choice].fx(game, c, dec.params))
}

export function bestChoice(game, dec = game.decision) {
  return optionValue(game, 'a', dec) >= optionValue(game, 'b', dec) ? 'a' : 'b'
}

export { DECK, BY_ID }

// Puts a named decision on the table if it applies right now. For tests.
export function forceDecision(game, id) {
  const d = BY_ID[id]
  const c = decisionContext(game)
  if (!d || (d.when && !d.when(game, c))) return false
  const rng = streamRng(game.seed, 'forced', id, game.season, game.round)
  game.decision = {
    id, season: game.season, round: game.round, params: d.setup ? d.setup(game, c, rng) : {},
    rolls: Array.from({ length: 8 }, () => rng.next()), noise: rng.next(), resolved: false, choice: null, outcome: [],
  }
  return true
}
