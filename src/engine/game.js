// Game state and the season loop. The state is one plain object that can be
// saved as JSON. Engine functions change it in place.

import { TEAMS, PLAYER_START_CAR } from './data/teams.js'
import { RACE_DRIVERS, POOL_DRIVERS } from './data/drivers.js'
import { SUPPLIERS } from './data/suppliers.js'
import { TRACKS } from './data/tracks.js'
import { makeRng, streamRng, hashString } from './rng.js'
import { createRace, runToEnd, raceResult, idealWing } from './weekend.js'
import { initialOrg } from './org.js'
import { signingTerms, backingRoll } from './contracts.js'
import {
  SAVE_VERSION, START_YEAR, PLAYER, START_REPUTATION, ROUNDS, clone, clamp, year, currentTrack, effectiveCar, teamOps,
  getStandings, playerPosition, paceTable, atrFor, overall, seasonMetrics,
} from './core.js'
import { setupLossFor, SETUP } from './practice.js'
import { initialFinance, applyRoundFinance, checkCrisis, triggerCrisis, closeSeasonBooks, canSpend, spend, perRound, settleOldBorrowing } from './economy.js'
import { initialDev, progressDevelopment, tighteningPlan, playerWinter } from './development.js'
import { progressOrg, refreshStaffMarket } from './hq.js'
import { initRivals, rivalRound, rivalWinter, scheduleRivalUpgrades } from './rivals.js'
import { initialSponsors, sponsorsRound, sponsorsSeasonEnd, sponsorsNewSeason, refreshSponsorTargets } from './sponsors.js'
import { drawDecision, progressDelayed } from './decisions.js'
import { averageManager, buildOffer, outlookFrom, chooseTargets, resolveTargets } from './targets.js'
import { initPeople, recordRace, peopleMidSeason, peopleWinter, closeMarket, seatsReady, releaseCost, releaseDriver } from './people.js'
import { rivalReputationWinter, rivalFormEvents, supplierDrift, staffApproaches } from './world.js'
import { initialHonours, honoursRound, honoursSeason } from './honours.js'
import { weekendObjectives, settleObjectives, recordPace, driverRatings, seasonReview } from './highlights.js'

export { SAVE_VERSION, START_YEAR, PLAYER, START_REPUTATION, year, currentTrack, effectiveCar, teamOps, getStandings, playerPosition, paceTable, overall, releaseCost, releaseDriver }

// Last year's real-world order, used for prize money and the aero allowance in season 1.
const START_ORDER = ['mercedes', 'ferrari', 'mclaren', 'redbull', 'racingbulls', 'alpine', 'haas', 'audi', 'williams', 'aston', 'cadillac', PLAYER]

export function newGame({ seed = Date.now() >>> 0, teamName = 'New Team', color = '#ff5a36', supplier = 'ferrari', driverIds, reserveId = null, difficulty = 'normal', involvement = 'quick', options = {} }) {
  const rng = makeRng(seed)
  if (SUPPLIERS[supplier].minReputation > START_REPUTATION) throw new Error(`${SUPPLIERS[supplier].name} will not supply a new team`)
  const teams = {}
  for (const t of TEAMS) teams[t.id] = { ...clone(t), drivers: [], isPlayer: false }
  teams[PLAYER] = {
    id: PLAYER, name: teamName, color, supplier, works: false, car: clone(PLAYER_START_CAR), ops: null, drivers: [], isPlayer: true,
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
    // involvement: 'live' runs the weekend with the player on the pit wall, 'quick' simulates it.
    // The game screen starts new teams on 'live'; scripted tests stay on 'quick'.
    settings: { approach: 'balanced', priority: 'equal', involvement },
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
    honours: initialHonours(),
  }
  game.finance = initialFinance(difficulty)
  game.dev = initialDev()
  resetAtr(game, game.lastStandings)
  if (!driverIds || driverIds.length !== 2 || driverIds[0] === driverIds[1]) throw new Error('Pick two different race drivers')
  for (const id of driverIds) signDriver(game, id, 'race')
  if (reserveId) signDriver(game, reserveId, 'reserve')
  initRivals(game)
  initPeople(game)
  initialSponsors(game)
  refreshStaffMarket(game)
  return game
}

function resetAtr(game, order) {
  order.forEach((id, i) => { game.atr[id] = atrFor(i + 1) })
}

// ---- Drivers ----
// Signs a driver at asking terms. Used for the starting line-up on the new-game
// screen; after that, drivers are signed through the market (people.js).
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
    loan: terms.loan, role, numberOne: false, releaseClause: false,
  }
  if (reserve) game.reserve = driverId
  else game.teams[PLAYER].drivers.push(driverId)
  return dr.contract
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
      const timed = []
      if (t.isPlayer) {
        // Driver priority: the favoured car gets the better strategy and first call on the pit box.
        const fav = { driver1: 0, driver2: 1 }[game.settings.priority]
        if (fav !== undefined) Object.assign(mods, slot === fav ? { stratMean: -0.6 } : { stratMean: 0.6, pitTime: 0.4 })
        for (const m of [...game.weekendMods, ...game.buffs]) {
          if (m.car !== 'both' && m.car !== slot) continue
          if (m.timed) timed.push(m.timed)
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
        ...(timed.length ? { timed } : {}),
        ...(t.isPlayer ? playerEntryExtras(game, slot) : {}),
      })
    })
  }
  return entries
}

// The player's wing levels, start tyres and orders for a weekend run live.
function playerEntryExtras(game, slot) {
  const w = game.weekend
  if (!w) return {}
  const extras = { wing: w.wing?.[slot], controlled: !!w.live, startTyre: w.startTyre?.[slot], orders: w.orders?.[slot] }
  // Run live, the car's balance from practice (or the engineers' setup) sets
  // the setup loss, and a long run in practice means a little less tyre wear.
  if (w.live && w.balance) extras.setupLoss = setupLossFor(game, slot, w.balance[slot])
  if (w.practice?.cars[slot]?.longRun) extras.wearMult = SETUP.longRunWear
  return extras
}

// Brings a save from an earlier build up to date. Safe to run on any save.
export function migrateSave(game) {
  settleOldBorrowing(game)
  // Q2 and Q3 firsts were added later: a team that has already scored or reached
  // the podium is taken to have been there, so it is not told it is new.
  const f = game.honours?.firsts
  if (f && !f.q2 && f.point) f.q2 = { legacy: true }
  if (f && !f.q3 && f.podium) f.q3 = { legacy: true }
  return game
}

// Qualifying and the race grid for this round. Rolls come from the save's seed.
export function createWeekendRace(game, opts = {}) {
  // A weather decision replaces the track's usual chance of rain for this race.
  const track = game.weatherOverride == null ? currentTrack(game) : { ...currentTrack(game), rain: game.weatherOverride }
  const rng = streamRng(game.seed, 'weekend', game.season, game.round)
  return createRace(track, buildEntries(game), rng, opts)
}

// Files a finished race: the result, and the round moves on.
export function completeRace(game, state) {
  const result = raceResult(state)
  result.round = game.round
  game.results.push(result)
  // What came of this round's card, now that it has happened.
  for (const e of result.events) {
    if (!e.card) continue
    const entry = game.decisionLog.slice().reverse().find((l) => l.title === e.card && l.season === game.season && l.round === game.round)
    if (entry && !entry.outcome.includes(e.text)) entry.outcome.push(e.text)
  }
  game.weekendMods = []
  game.weatherOverride = null
  game.substitute = null
  game.round++
  if (game.round >= game.calendar.length) game.phase = 'seasonEnd'
  return result
}

// Qualifying and race only, with no HQ work or money. Used by the calibration test.
export function raceRound(game) {
  if (game.phase !== 'season') throw new Error('The season is not running')
  const state = createWeekendRace(game)
  runToEnd(state)
  return completeRace(game, state)
}

// HQ work before the weekend: delayed decision effects, staff and facilities,
// design and the factory, rivals' upgrades.
export function preRace(game) {
  if (game.phase !== 'season') throw new Error('The season is not running')
  if (game.decision && !game.decision.resolved) throw new Error("Make this round's decision first")
  game.news = []
  progressDelayed(game)
  progressOrg(game)
  progressDevelopment(game)
  rivalRound(game)
}

// The engineers' wing recommendation for each car, as precise as the race engineers.
export function recommendedWing(game, slot) {
  const track = currentTrack(game)
  const ideal = idealWing(track, effectiveCar(game, PLAYER))
  const k = game.org.keyStaff[slot === 0 ? 'raceEngineer1' : 'raceEngineer2']
  const err = streamRng(game.seed, 'wingAdvice', game.season, game.round, slot).normal(0, Math.max(0, (85 - k.rating) / 45))
  return { level: clamp(Math.round(ideal + err), 1, 5), ideal, sure: k.rating >= 75 }
}

// One full round on the quick path: HQ work, the weekend with the strategist on the pit wall, then the money.
export function simulateRound(game) {
  if (game.weekend) throw new Error('A race weekend is under way')
  preRace(game)
  const objectives = weekendObjectives(game)
  game.weekend = { wing: [0, 1].map((s) => recommendedWing(game, s).level), live: false }
  const result = raceRound(game)
  game.weekend = null
  postRace(game, result, objectives)
  return result
}

// Everything after the flag: driver records, money, sponsors, the mid-season
// review, objectives, the crisis check and the next decision.
export function postRace(game, result, objectives = []) {
  recordRace(game, result)
  const had = new Set(Object.keys(game.honours.firsts))
  honoursRound(game, result)
  // Career firsts from this race (first point, podium, win, pole, Q2, Q3), for the moments on screen.
  result.firsts = Object.keys(game.honours.firsts).filter((k) => !had.has(k))
  if (game.phase === 'seasonEnd') {
    // The final round: where the team finished, and against the rival from last year.
    const order = getStandings(game).constructors.map((c) => c.id)
    const rival = game.lastStandings[game.lastStandings.indexOf(PLAYER) - 1]
    result.seasonEnd = { pos: order.indexOf(PLAYER) + 1, rival: rival ? { id: rival, name: game.teams[rival].name, beaten: order.indexOf(PLAYER) < order.indexOf(rival) } : null }
  }
  // A number-one driver resents being made to play second fiddle.
  const fav = { driver1: 0, driver2: 1 }[game.settings.priority]
  if (fav !== undefined) {
    const other = game.drivers[game.teams[PLAYER].drivers[1 - fav]]
    if (other?.contract?.numberOne) other.interestMod -= 1
  }
  applyRoundFinance(game, result)
  sponsorsRound(game)
  if (game.round === ROUNDS / 2) {
    // Mid-season: ratings move, the winter's rule change is announced and the aero allowance is reset.
    game.news.push(...peopleMidSeason(game))
    game.tighteningKnown = true
    resetAtr(game, getStandings(game).constructors.map((c) => c.id))
    game.news.push(`Rule change announced for next season: ${tighteningPlan(game) === 'aero' ? 'Aero' : 'Chassis'} will be hit hardest`)
  }
  if (objectives.length) settleObjectives(game, objectives, result)
  result.objectives = objectives
  result.ratings = driverRatings(game, result)
  const pace = paceTable(game)
  const gapOf = (id) => pace.find((r) => r.id === id)?.gap ?? null
  const above = game.lastStandings[game.lastStandings.indexOf(PLAYER) - 1]
  recordPace(game, gapOf(PLAYER), above ? gapOf(above) : null)
  checkCrisis(game)
  drawDecision(game)
  if (result.seasonEnd) result.seasonEnd.review = seasonReview(game)
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
  if (!seatsReady(game)) throw new Error('Sign two race drivers first. A driver who is out of contract leaves when the market closes')
  closeMarket(game)
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
  if (!seatsReady(game)) throw new Error('Sign two race drivers first. A driver who is out of contract leaves when the market closes')
  closeMarket(game)
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
  game.reputation = clamp(before + 0.4 * (target - before) + milestones, 0, 100)
  return game.reputation - before
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
  honoursSeason(game, summary)
  const champ = game.drivers[st.drivers[0]?.id]
  if (champ) champ.career.titles++

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
  rivalReputationWinter(game, st.constructors.map((c) => c.id))
  rivalWinter(game, hard)
  game.winterReport = playerWinter(game, hard)
  game.seasonReport = { ...summary, sponsors: sponsorReport.map(({ deal, ...line }) => line), reputationChange, cashEnd, targets: targetReport, confidence: game.confidence }

  game.lastStandings = st.constructors.map((c) => c.id)
  game.news.push(...rivalFormEvents(game), ...supplierDrift(game))
  game.season++
  game.round = 0
  game.results = []
  game.phase = 'preseason'
  // The driver market opens: ratings change, contracts expire, rivals review their drivers.
  game.approaches = []
  game.news.push(...peopleWinter(game))
  staffApproaches(game)
  game.tighteningKnown = false
  game.bonus = { capacity: targetReport?.next.capacity || 0, sponsor: targetReport?.next.sponsor || 0, facilityDiscount: 0 }
  if (targetReport) game.targets.history.push({ season: summary.season, report: targetReport.report, sweep: targetReport.sweep })
  game.targets.offer = null
  game.targets.chosen = null
  game.decision = null
  game.insured = false
  game.teams[PLAYER].powerBonus = 0
  if (game.confidence <= 0) triggerCrisis(game, 'confidence')
  resetAtr(game, game.lastStandings)
  scheduleRivalUpgrades(game)
  sponsorsNewSeason(game, sponsorReport)
  refreshStaffMarket(game)
  return summary
}
