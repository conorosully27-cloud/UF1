// Sponsors: slots, offers in three shapes, targets and renewal (design 5.8).

import { PLAYER, ROUNDS, clamp, clock, playerDrivers, effectiveCar, seasonMetrics, ordinal } from './core.js'
import { earn, spend, canSpend } from './economy.js'
import { mechFailureChance, crashChance } from './weekend.js'
import { streamRng } from './rng.js'

export const TIERS = {
  title: { label: 'Title', base: 3, perRep: 0.34 },
  principal: { label: 'Principal', base: 1, perRep: 0.12 },
  partner: { label: 'Partner', base: 0.5, perRep: 0.055 },
}

// Share of the headline value paid as a flat fee, and as a bonus if the target is met.
export const SHAPES = {
  guaranteed: { label: 'Guaranteed', fee: 0.85, bonus: 0 },
  balanced: { label: 'Balanced', fee: 0.7, bonus: 0.6 },
  incentive: { label: 'Incentive', fee: 0.4, bonus: 1.5 },
}

const SLOTS_BY_LEVEL = [
  ['title', 'partner'],
  ['title', 'partner', 'partner'],
  ['title', 'principal', 'partner', 'partner'],
  ['title', 'principal', 'partner', 'partner', 'partner'],
  ['title', 'principal', 'principal', 'partner', 'partner', 'partner'],
  ['title', 'principal', 'principal', 'partner', 'partner', 'partner', 'partner'],
]

// Invented names. No real companies.
const NAMES = [
  'Northwind Logistics', 'Helix Energy', 'Corvane Systems', 'Albury & Stone', 'Meridian Air', 'Kestrel Tools', 'Lumen Cloud',
  'Varga Watches', 'Tidewater Bank', 'Orbis Freight', 'Halden Brewing', 'Pinnacle Robotics', 'Ardent Insurance', 'Solace Hotels',
  'Quanta Mobile', 'Greyfriar Capital', 'Ember Fuels', 'Novaline Paints', 'Castellan Security', 'Riverton Foods', 'Apex Composites',
  'Brightwater Telecom', 'Ironbark Mining', 'Sable Cosmetics', 'Vector Lubricants', 'Thornfield Estates', 'Polaris Shipping',
  'Cobalt Software', 'Wexford Tyres Direct', 'Marlowe Coffee', 'Zephyr Drones', 'Oakhurst Pharma',
]

export function slotTiers(game) {
  return SLOTS_BY_LEVEL[game.org.facilities.commercial.level]
}

export function freeSlots(game, tier) {
  const total = slotTiers(game).filter((t) => t === tier).length
  return total - game.sponsors.deals.filter((d) => d.tier === tier).length
}

function headlineValue(game, tier, rng) {
  const o = game.org
  const drivers = playerDrivers(game)
  const market = drivers.reduce((s, d) => s + d.marketability, 0) / Math.max(1, drivers.length)
  const power = o.staff.commercial.heads * (o.staff.commercial.skill / 50)
  return (TIERS[tier].base + TIERS[tier].perRep * game.reputation) * (0.8 + o.keyStaff.commercialDirector.rating / 250) *
    (0.9 + Math.min(0.3, power / 200)) * (1 + (market - 75) / 200) * rng.range(0.85, 1.15) * (1 + (game.bonus.sponsor || 0))
}

// ---- Targets ----
const expectedPos = (game) => game.lastStandings.indexOf(PLAYER) + 1

function describe(t, game) {
  if (t.type === 'pos') return `Finish ${ordinal(t.value)} or better in the Constructors' Championship`
  if (t.type === 'classified') return `Both cars classified in at least ${t.value} races`
  if (t.type === 'beat') return `Finish ahead of ${game.teams[t.rival].name} in the championship`
  if (t.type === 'ahead') return `A car ahead of a ${game.teams[t.rival].name} car in at least ${t.value} races`
  if (t.type === 'best') return `A best race finish of ${ordinal(t.value)} or better`
  return `Score at least ${t.value} points`
}

// Before the first projection exists, targets come from rules of thumb.
function roughTargets(game, hard) {
  const pos = expectedPos(game)
  const options = []
  const car = effectiveCar(game, PLAYER)
  const out = playerDrivers(game).map((d) => mechFailureChance(car.reliability) + crashChance(d.consistency) + 0.03)
  const bothFinish = out.reduce((p, x) => p * (1 - x), 1) * ROUNDS
  options.push({ type: 'classified', value: clamp(Math.round(bothFinish + (hard ? 1.5 : -0.3)), 4, ROUNDS - 1) })
  if (pos > 1 && pos < game.lastStandings.length) options.push({ type: 'pos', value: Math.max(1, pos - (hard ? 2 : 1)) })
  return options
}

// With a projection, a balanced target is one the team meets about half the
// time and an incentive target about one time in four.
function outlookTargets(game, hard) {
  const o = game.outlook
  const teams = game.lastStandings.length
  const options = []
  const posValue = hard ? Math.min(o.pos.good, o.pos.mid - 1) : o.pos.mid
  if (posValue >= 1 && posValue < teams) options.push({ type: 'pos', value: posValue })
  if (o.points.high >= 1) options.push({ type: 'points', value: hard ? Math.max(o.points.high, o.points.mid + 1) : Math.max(1, o.points.mid) })
  options.push({ type: 'classified', value: clamp(hard ? Math.max(o.classified.high, o.classified.mid + 1) : o.classified.mid, 1, ROUNDS) })
  const bestValue = hard ? Math.min(o.best.good, o.best.mid - 1) : o.best.mid
  if (bestValue >= 1) options.push({ type: 'best', value: bestValue })
  if (o.rival) options.push({ type: 'ahead', rival: o.rival, value: clamp(hard ? Math.max(o.ahead.high, o.ahead.mid + 1) : Math.max(1, o.ahead.mid), 1, ROUNDS) })
  const [lo, hi] = hard ? [0.15, 0.35] : [0.35, 0.65]
  const beatable = Object.entries(o.beat).filter(([, p]) => p >= lo && p <= hi).sort((a, b) => Math.abs(a[1] - (lo + hi) / 2) - Math.abs(b[1] - (lo + hi) / 2))[0]
  if (beatable) options.push({ type: 'beat', rival: beatable[0] })
  return options
}

// A target for the season, harder for the incentive shape.
export function makeTarget(game, hard, rng) {
  const t = rng.pick(game.outlook ? outlookTargets(game, hard) : roughTargets(game, hard))
  t.label = describe(t, game)
  return t
}

export function targetMet(game, t, metrics) {
  if (t.type === 'pos') return metrics.pos <= t.value
  if (t.type === 'points') return metrics.points >= t.value
  if (t.type === 'beat') return metrics.pos < metrics.order[t.rival]
  if (t.type === 'ahead') return (metrics.ahead[t.rival] || 0) >= t.value
  if (t.type === 'best') return metrics.best <= t.value
  return metrics.classified >= t.value
}

// Sets every running deal's and open offer's target from the latest outlook.
export function refreshSponsorTargets(game) {
  const rng = streamRng(game.seed, 'sponsorTargets', game.season)
  for (const d of game.sponsors.deals) if (d.target) d.target = makeTarget(game, d.shape === 'incentive', rng)
  for (const o of game.sponsors.offers) o.targets = { balanced: makeTarget(game, false, rng), incentive: makeTarget(game, true, rng) }
}

// ---- Offers ----
function makeOffer(game, tier, rng, renewalOf = null) {
  const value = headlineValue(game, tier, rng) * (renewalOf ? 1.05 : 1)
  const used = new Set([...game.sponsors.deals.map((d) => d.name), ...game.sponsors.offers.map((o) => o.name)])
  const free = NAMES.filter((n) => !used.has(n))
  const demand = !renewalOf && rng.chance(0.25) ? Math.round(68 + { partner: 0, principal: 5, title: 10 }[tier] + rng.range(0, 8)) : 0
  return {
    id: game.sponsors.nextId++, name: renewalOf || rng.pick(free.length ? free : NAMES), tier, value,
    seasons: tier === 'title' ? rng.int(2, 3) : rng.int(1, 3),
    targets: { balanced: makeTarget(game, false, rng), incentive: makeTarget(game, true, rng) },
    expires: clock(game) + 4, demand, renewal: !!renewalOf,
  }
}

export function initialSponsors(game) {
  game.sponsors = { deals: [], offers: [], nextId: 1 }
  const rng = streamRng(game.seed, 'sponsors', 'start')
  for (const [tier, shape, seasons] of [['title', 'balanced', 2], ['partner', 'guaranteed', 1], ['partner', 'balanced', 2]]) {
    const o = makeOffer(game, tier, rng)
    o.seasons = seasons
    o.demand = 0
    game.sponsors.offers.push(o)
    acceptOffer(game, o.id, shape)
  }
}

export function sponsorsRound(game) {
  const s = game.sponsors
  const now = clock(game)
  s.offers = s.offers.filter((o) => o.expires > now)
  const rng = streamRng(game.seed, 'sponsorOffer', game.season, game.round)
  const o = game.org.staff.commercial
  const power = o.heads * (o.skill / 50)
  if (s.offers.length < 6 && rng.chance(Math.min(0.75, 0.2 + power / 120))) {
    const tiers = [...new Set(slotTiers(game))]
    // Sponsors approach more readily when a slot of their size is empty.
    const tier = rng.weightedPick(tiers, tiers.map((t) => ({ partner: 0.6, principal: 0.28, title: 0.12 }[t] * (freeSlots(game, t) > 0 ? 4 : 1))))
    const offer = makeOffer(game, tier, rng)
    s.offers.push(offer)
    game.news.push(`New sponsor offer: ${offer.name} (${TIERS[tier].label})`)
  }
}

export function acceptOffer(game, offerId, shape) {
  const s = game.sponsors
  const o = s.offers.find((x) => x.id === offerId)
  if (!o) throw new Error('That offer has gone')
  if (!SHAPES[shape]) throw new Error('Unknown deal shape')
  if (freeSlots(game, o.tier) <= 0) throw new Error(`No free ${TIERS[o.tier].label.toLowerCase()} slot`)
  const best = Math.max(0, ...playerDrivers(game).map((d) => d.marketability))
  if (o.demand && best < o.demand) throw new Error(`${o.name} want a driver with Marketability ${o.demand} or more`)
  s.offers = s.offers.filter((x) => x.id !== offerId)
  const sh = SHAPES[shape]
  s.deals.push({
    id: o.id, name: o.name, tier: o.tier, shape, value: o.value, fee: o.value * sh.fee, bonus: o.value * sh.bonus,
    target: shape === 'guaranteed' ? null : o.targets[shape], seasonsLeft: o.seasons, satisfaction: 60,
  })
}

export function endDeal(game, dealId) {
  const d = game.sponsors.deals.find((x) => x.id === dealId)
  if (!d) throw new Error('No such deal')
  const penalty = d.fee * Math.max(0, d.seasonsLeft - 1) * 0.25 + d.fee * 0.1
  if (!canSpend(game, penalty)) throw new Error('Not enough cash to buy out the contract')
  spend(game, 'other', penalty)
  game.sponsors.deals = game.sponsors.deals.filter((x) => x.id !== dealId)
}

// Season end: pay bonuses, update satisfaction, expire and renew.
export function sponsorsSeasonEnd(game) {
  const s = game.sponsors
  const metrics = seasonMetrics(game)
  const pos = metrics.pos
  const expected = expectedPos(game)
  const report = []
  for (const d of s.deals.slice()) {
    let hit = null
    if (d.target) {
      hit = targetMet(game, d.target, metrics)
      if (hit) earn(game, 'bonuses', d.bonus)
      d.satisfaction += hit ? 12 : -10
    }
    d.satisfaction = clamp(d.satisfaction + (expected - pos) * 3, 0, 100)
    d.seasonsLeft--
    const line = { name: d.name, target: d.target?.label ?? null, hit, bonus: hit ? d.bonus : 0, outcome: 'continues' }
    if (d.seasonsLeft <= 0) {
      s.deals.splice(s.deals.indexOf(d), 1)
      line.outcome = d.satisfaction >= 50 ? 'offers to renew' : 'leaves'
      if (d.satisfaction >= 50) d.wantsRenewal = true
    }
    report.push(line)
    if (line.outcome === 'offers to renew') line.deal = d
  }
  return report
}

// Called once the new season's state is in place, so targets suit next year.
export function sponsorsNewSeason(game, pending) {
  const rng = streamRng(game.seed, 'sponsorNew', game.season)
  for (const d of game.sponsors.deals) if (d.target) d.target = makeTarget(game, d.shape === 'incentive', rng)
  for (const line of pending) {
    if (!line.deal) continue
    const o = makeOffer(game, line.deal.tier, rng, line.deal.name)
    o.expires = clock(game) + 4
    game.sponsors.offers.push(o)
    delete line.deal
  }
  // A couple of fresh offers each winter.
  for (let i = 0; i < 2; i++) {
    const tiers = [...new Set(slotTiers(game))]
    game.sponsors.offers.push(makeOffer(game, rng.pick(tiers), rng))
  }
}
