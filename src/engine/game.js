// Game state and the season loop. The state is one plain object that can be
// saved as JSON. Engine functions change it in place.

import { TEAMS, PLAYER_START_CAR } from './data/teams.js'
import { RACE_DRIVERS, POOL_DRIVERS } from './data/drivers.js'
import { SUPPLIERS } from './data/suppliers.js'
import { TRACKS } from './data/tracks.js'
import { makeRng, streamRng, hashString } from './rng.js'
import { simulateWeekend } from './weekend.js'
import { initialOrg } from './org.js'
import { signingTerms, backingRoll } from './contracts.js'
import {
  SAVE_VERSION, START_YEAR, PLAYER, START_REPUTATION, ROUNDS, clone, clamp, year, currentTrack, effectiveCar, teamOps,
  getStandings, playerPosition, paceTable, atrFor, overall, seasonMetrics,
} from './core.js'
import { initialFinance, applyRoundFinance, checkCrisis, triggerCrisis, closeSeasonBooks, canSpend, spend, perRound } from './economy.js'
import { initialDev, progressDevelopment, tighteningPlan, playerWinter } from './development.js'
import { progressOrg, refreshStaffMarket } from './hq.js'
import { initRivals, rivalRound, rivalWinter, scheduleRivalUpgrades } from './rivals.js'
import { initialSponsors, sponsorsRound, sponsorsSeasonEnd, sponsorsNewSeason, refreshSponsorTargets } from './sponsors.js'
import { drawDecision, progressDelayed } from './decisions.js'
import { averageManager, buildOffer, outlookFrom, chooseTargets, resolveTargets } from './targets.js'

export { SAVE_VERSION, START_YEAR, PLAYER, START_REPUTATION, year, currentTrack, effectiveCar, teamOps, getStandings, playerPosition, paceTable, overall }

// Last year's real-world order, used for prize money and the aero allowance in season 1.
const START_ORDER = ['mercedes', 'ferrari', 'mclaren', 'redbull', 'racingbulls', 'alpine', 'haas', 'audi', 'williams', 'aston', 'cadillac', PLAYER]

export function newGame({ seed = Date.now() >>> 0, teamName = 'New Team', supplier = 'ferrari', driverIds, reserveId = null, difficulty = 'normal', options = {} }) {
  const rng = makeRng(seed)
  if (SUPPLIERS[supplier].minReputation > START_REPUTATION) throw new Error(`${SUPPLIERS[supplier].name} will not supply a new team`)
  const teams = {}
  for (const t of TEAMS) teams[t.id] = { ...clone(t), drivers: [], isPlayer: false }
  teams[PLAYER] = {
    id: PLAYER, name: teamName, supplier, works: false, car: clone(PLAYER_START_CAR), ops: null, drivers: [], isPlayer: true,
  }
  const drivers = {}
  for (const d of [...RACE_DRIVERS, ...POOL_DRIVERS]) {
    drivers[d.id] = { ...clone(d), teamId: d.team, contract: null }
    delete drivers[d.id].team
    if (d.team) teams[d.team].drivers.push(d.id)
  }
  const game = {
    version: SAVE_VERSION,
    seed, difficulty,
    // Tests switch these off to exercise the earlier milestones on their own.
    options: { decisions: true, targets: true, ...options },
    season: 1, round: 0, phase: 'preseason',
    teams, drivers,
    suppliers: clone(SUPPLIERS),
    calendar: TRACKS.map((t) => t.id),
    results: [],
    history: [],
    news: [],
    settings: { approach: 'balanced', priority: 'equal' },
    weekendMods: [],
    org: { ...initialOrg(rng), arrivals: [] },
    reputation: START_REPUTATION,
    confidence: 60,
    reserve: null,
    partsPackage: true,
    lastStandings: START_ORDER.slice(),
    atr: {},
    bonus: { capacity: 0, sponsor: 0, facilityDiscount: 0 },
    tighteningKnown: false,
    winterReport: null,
    seasonReport: null,
    seasonStart: null,
    decision: null, decisionSeen: {}, decisionLog: [], delayed: [], buffs: [],
    substitute: null, weatherOverride: null, insured: false,
    targets: { offer: null, chosen: null, history: [] },
    outlook: null,
  }
  game.finance = initialFinance(difficulty)
  game.dev = initialDev()
  resetAtr(game, game.lastStandings)
  if (!driverIds || driverIds.length !== 2 || driverIds[0] === driverIds[1]) throw new Error('Pick two different race drivers')
  for (const id of driverIds) signDriver(game, id, 'race')
  if (reserveId) signDriver(game, reserveId, 'reserve')
  initRivals(game)
  initialSponsors(game)
  refreshStaffMarket(game)
  return game
}

function resetAtr(game, order) {
  order.forEach((id, i) => { game.atr[id] = atrFor(i + 1) })
}

// ---- Drivers (the full market arrives in milestone 4) ----
export function signDriver(game, driverId, role) {
  const dr = game.drivers[driverId]
  if (!dr) throw new Error(`Unknown driver ${driverId}`)
  if (dr.teamId) throw new Error(`${dr.name} already has a seat`)
  if (game.phase !== 'preseason') throw new Error('Drivers can only be changed in pre-season, before targets are set')
  if (role === 'race' && game.teams[PLAYER].drivers.length >= 2) throw new Error('Both race seats are taken')
  if (role === 'reserve' && game.reserve) throw new Error('The reserve seat is taken')
  const terms = signingTerms(dr, game.reputation, game.seed, game.season)
  if (!terms.possible) throw new Error(`${dr.name} will not sign for this team yet`)
  // A reserve is paid a fifth of a race salary and brings no backing.
  const reserve = role === 'reserve'
  dr.teamId = PLAYER
  dr.contract = {
    salary: terms.salary * (reserve ? 0.2 : 1), backing: reserve ? 0 : terms.backing, years: terms.loan ? 1 : 2,
    loan: terms.loan, role,
  }
  if (reserve) game.reserve = driverId
  else game.teams[PLAYER].drivers.push(driverId)
  return dr.contract
}

export function releaseCost(driver) {
  return 0.6 * driver.contract.salary * driver.contract.years
}

export function releaseDriver(game, driverId) {
  const dr = game.drivers[driverId]
  if (!dr || dr.teamId !== PLAYER) throw new Error('Not one of your drivers')
  if (game.phase !== 'preseason') throw new Error('Drivers can only be changed in pre-season, before targets are set')
  const cost = releaseCost(dr)
  if (!canSpend(game, cost)) throw new Error('Not enough cash to pay off the contract')
  spend(game, 'drivers', cost)
  dr.teamId = null
  dr.contract = null
  if (game.reserve === driverId) game.reserve = null
  else game.teams[PLAYER].drivers = game.teams[PLAYER].drivers.filter((id) => id !== driverId)
}

export function changeSupplier(game, supplierId) {
  const s = game.suppliers[supplierId]
  if (!s) throw new Error('Unknown supplier')
  if (game.phase !== 'preseason') throw new Error('Power unit deals are agreed in pre-season')
  if (game.reputation < s.minReputation) throw new Error(`${s.name} want a team with reputation ${s.minReputation} or more`)
  game.teams[PLAYER].supplier = supplierId
}

export function setPartsPackage(game, on) {
  if (game.phase !== 'preseason') throw new Error('This is decided in pre-season')
  const f = game.org.facilities
  if (!on && (f.designOffice.level < 3 || f.factory.level < 3)) throw new Error('Going in-house needs the Design Office and Factory at level 3')
  game.partsPackage = on
}

// ---- The race weekend ----
export function buildEntries(game) {
  const entries = []
  for (const t of Object.values(game.teams)) {
    const car = effectiveCar(game, t.id)
    const ops = teamOps(game, t.id)
    t.drivers.forEach((seatId, slot) => {
      // A decision can put the reserve in a race seat for one weekend.
      const id = t.isPlayer && game.substitute === slot && game.reserve ? game.reserve : seatId
      const d = game.drivers[id]
      const mods = {}
      if (t.isPlayer) {
        // Driver priority: the favoured car gets the better strategy and first call on the pit box.
        const fav = { driver1: 0, driver2: 1 }[game.settings.priority]
        if (fav !== undefined) Object.assign(mods, slot === fav ? { stratMean: -0.6 } : { stratMean: 0.6, pitTime: 0.4 })
        for (const m of [...game.weekendMods, ...game.buffs]) {
          if (m.car !== 'both' && m.car !== slot) continue
          for (const [k, v] of Object.entries(m.mods)) {
            if (typeof v !== 'number') mods[k] = v
            else if (k === 'mechMult' || k === 'errMult' || k === 'stratSd') mods[k] = (mods[k] ?? 1) * v
            else mods[k] = (mods[k] ?? 0) + v
          }
        }
      }
      entries.push({
        id, name: d.name, teamId: t.id, teamName: t.name, isPlayer: t.isPlayer, slot,
        car, ops,
        driver: { pace: d.pace, racecraft: d.racecraft, consistency: d.consistency, wet: d.wet, feedback: d.feedback },
        approach: t.isPlayer ? game.settings.approach : 'balanced',
        mods,
      })
    })
  }
  return entries
}

// Qualifying and race only, with no HQ work or money. Used by the calibration test.
export function raceRound(game) {
  if (game.phase !== 'season') throw new Error('The season is not running')
  // A weather decision replaces the track's usual chance of rain for this race.
  const track = game.weatherOverride == null ? currentTrack(game) : { ...currentTrack(game), rain: game.weatherOverride }
  const rng = streamRng(game.seed, 'weekend', game.season, game.round)
  const result = simulateWeekend(track, buildEntries(game), rng)
  result.round = game.round
  game.results.push(result)
  game.weekendMods = []
  game.weatherOverride = null
  game.substitute = null
  game.round++
  if (game.round >= game.calendar.length) game.phase = 'seasonEnd'
  return result
}

// One full round: HQ work, the weekend, then the money.
export function simulateRound(game) {
  if (game.phase !== 'season') throw new Error('The season is not running')
  if (game.decision && !game.decision.resolved) throw new Error("Make this round's decision first")
  game.news = []
  progressDelayed(game)
  progressOrg(game)
  progressDevelopment(game)
  rivalRound(game)
  const result = raceRound(game)
  applyRoundFinance(game, result)
  sponsorsRound(game)
  if (game.round === ROUNDS / 2) {
    // Mid-season: the winter's rule change is announced and the aero allowance is reset.
    game.tighteningKnown = true
    resetAtr(game, getStandings(game).constructors.map((c) => c.id))
    game.news.push(`Rule change announced for next season: ${tighteningPlan(game) === 'aero' ? 'Aero' : 'Chassis'} will be hit hardest`)
  }
  checkCrisis(game)
  drawDecision(game)
  return result
}

// A few hundred quick runs of the coming season under average management.
export function projectSeason(game, runs = 150) {
  const out = []
  for (let i = 0; i < runs; i++) {
    const g = clone(game)
    g.seed = hashString(`${game.seed}|projection|${game.season}|${i}`)
    g.options = { decisions: false, targets: false }
    g.phase = 'preseason'
    startSeason(g)
    while (g.phase === 'season') { averageManager(g); simulateRound(g) }
    out.push(seasonMetrics(g))
  }
  return out
}

// Pre-season, step two: project the year and offer six targets to choose from.
export function prepareTargets(game, runs = 150) {
  if (game.phase !== 'preseason') throw new Error('Not in pre-season')
  if (game.teams[PLAYER].drivers.length !== 2) throw new Error('Sign two race drivers first')
  const projection = projectSeason(game, runs)
  const yearIncome = Object.values(perRound(game).income).reduce((s, v) => s + v, 0) * ROUNDS
  game.targets.offer = buildOffer(game, projection, yearIncome)
  game.targets.chosen = null
  game.outlook = outlookFrom(game, projection)
  refreshSponsorTargets(game)
  game.phase = 'targets'
}

export function backToPreseason(game) {
  if (game.phase !== 'targets') throw new Error('Targets are not being set')
  game.targets.offer = null
  game.phase = 'preseason'
}

export function startSeason(game, picks) {
  if (game.options.targets) {
    if (game.phase !== 'targets') throw new Error('Set the season targets first')
    chooseTargets(game, picks)
  } else if (game.phase !== 'preseason') throw new Error('Not in pre-season')
  if (game.teams[PLAYER].drivers.length !== 2) throw new Error('Sign two race drivers first')
  game.seasonStart = {
    car: { ...game.teams[PLAYER].car },
    facilityLevels: Object.values(game.org.facilities).reduce((s, f) => s + f.level, 0),
  }
  game.phase = 'season'
  drawDecision(game)
}

function updateReputation(game, standings) {
  const me = standings.constructors.find((c) => c.id === PLAYER)
  const pos = standings.constructors.indexOf(me) + 1
  const target = clamp(100 - (pos - 1) * 8.3, 5, 95)
  const milestones = (me.points > 0 ? 1 : 0) + Math.min(3, me.podiums) + Math.min(6, me.wins * 2)
  const before = game.reputation
  game.reputation = clamp(before + 0.3 * (target - before) + milestones, 0, 100)
  return game.reputation - before
}

function renewContracts(game) {
  const ids = [...game.teams[PLAYER].drivers, ...(game.reserve ? [game.reserve] : [])]
  for (const id of ids) {
    const d = game.drivers[id]
    const c = d.contract
    const terms = signingTerms(d, game.reputation, game.seed, game.season)
    if (c.role === 'race') c.backing = backingRoll(d, game.seed, game.season)
    if (--c.years > 0) continue
    // Until the driver market exists, an expiring deal rolls over at the driver's current demand.
    c.salary = terms.salary * (c.role === 'reserve' ? 0.2 : 1)
    c.years = c.loan ? 1 : 2
  }
}

export function endSeason(game) {
  if (game.phase !== 'seasonEnd') throw new Error('The season has not finished')
  const st = getStandings(game)
  const me = st.constructors.find((c) => c.id === PLAYER)
  const summary = {
    season: game.season, year: year(game),
    constructors: st.constructors.map((c, i) => ({ pos: i + 1, id: c.id, name: c.name, points: c.points })),
    drivers: st.drivers.slice(0, 10).map((d, i) => ({ pos: i + 1, id: d.id, name: d.name, teamId: d.teamId, points: d.points, wins: d.wins })),
    playerPos: st.constructors.indexOf(me) + 1, playerPoints: me.points, playerBest: me.best, playerWins: me.wins, playerPodiums: me.podiums,
  }
  game.history.push(summary)
  game.news = []

  // Season targets are judged first, so "cash at season end" is the figure on screen after the last race.
  const reputationBefore = game.reputation
  const yearIncome = Object.values(game.finance.season.income).reduce((s, v) => s + v, 0)
  const targetReport = game.targets.chosen ? resolveTargets(game, yearIncome) : null
  const sponsorReport = sponsorsSeasonEnd(game)
  updateReputation(game, st)
  const reputationChange = game.reputation - reputationBefore
  const cashEnd = game.finance.cash
  closeSeasonBooks(game)

  // Winter: the rules tighten for everyone, then each team adds its winter work.
  const hard = tighteningPlan(game)
  rivalWinter(game, hard)
  game.winterReport = playerWinter(game, hard)
  game.seasonReport = { ...summary, sponsors: sponsorReport.map(({ deal, ...line }) => line), reputationChange, cashEnd, targets: targetReport, confidence: game.confidence }

  game.lastStandings = st.constructors.map((c) => c.id)
  game.season++
  game.round = 0
  game.results = []
  game.phase = 'preseason'
  game.tighteningKnown = false
  game.bonus = { capacity: targetReport?.next.capacity || 0, sponsor: targetReport?.next.sponsor || 0, facilityDiscount: 0 }
  if (targetReport) game.targets.history.push({ season: summary.season, report: targetReport.report, sweep: targetReport.sweep })
  game.targets.offer = null
  game.targets.chosen = null
  game.decision = null
  game.insured = false
  game.teams[PLAYER].powerBonus = 0
  if (game.confidence <= 0) triggerCrisis(game)
  resetAtr(game, game.lastStandings)
  renewContracts(game)
  scheduleRivalUpgrades(game)
  sponsorsNewSeason(game, sponsorReport)
  refreshStaffMarket(game)
  return summary
}
