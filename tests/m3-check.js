// Milestone 3 check: the A/B decision deck and season targets.
// Usage: node tests/m3-check.js [target-seasons]

import { newGame, startSeason, simulateRound, endSeason, prepareTargets, projectSeason, PLAYER } from '../src/engine/game.js'
import { DECK, NO_REPEAT, describeDecision, resolveDecision, forceDecision, bestChoice, optionValue, oddsText } from '../src/engine/decisions.js'
import { LEVELS, averageManager, chooseTargets, targetProgress } from '../src/engine/targets.js'
import { ROLES } from '../src/engine/org.js'
import { startProject } from '../src/engine/development.js'
import { autoDrivers } from '../src/engine/people.js'
import { steady, decide, pickTargets, playFullSeason } from './bot.js'

const TARGET_SEASONS = Number(process.argv[2] || 120)
const clone = (x) => JSON.parse(JSON.stringify(x))
const setup = (seed, extra = {}) => newGame({ seed, teamName: 'Test GP', supplier: 'ferrari', driverIds: ['zhou', 'herta'], reserveId: 'crawford', ...extra })

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const expectThrow = (fn) => { try { fn(); return false } catch { return true } }

function hasBadNumber(x, path = '') {
  if (typeof x === 'number') return Number.isFinite(x) ? null : path
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { const bad = hasBadNumber(v, `${path}.${k}`); if (bad) return bad }
  return null
}

// ---- The deck itself ----
{
  const weekend = DECK.filter((d) => d.type === 'Race weekend' || d.type === 'Reliability').length
  check('the deck has 80 decisions with unique ids', DECK.length === 80 && new Set(DECK.map((d) => d.id)).size === 80)
  check('half of them are race-weekend calls', weekend === 40, `${weekend} weekend, ${DECK.length - weekend} HQ`)
  check('every decision names a real key-staff role and what decides it', DECK.every((d) => ROLES[d.staff] && d.factors && d.a && d.b))
  const types = {}
  for (const d of DECK) types[d.type] = (types[d.type] || 0) + 1
  console.log('      by type: ' + Object.entries(types).map(([k, v]) => `${k} ${v}`).join(', '))
}

// ---- Odds reporting ----
{
  check('a strong head of department gives exact odds', oddsText(0.62, 85, 0.5) === '62%')
  check('an average one rounds them', oddsText(0.62, 70, 0.5) === 'about 60%')
  const weak = new Set([0.05, 0.3, 0.5, 0.7, 0.95].map((u) => oddsText(0.62, 50, u)))
  check('a weak one gives a word that can be off', weak.size > 1 && [...weak].every((w) => !w.includes('%')), [...weak].join(' / '))
}

// ---- Every decision, both ways ----
{
  // A set of situations that between them make every decision applicable.
  const situations = []
  const g0 = setup(301)
  prepareTargets(g0, 10); startSeason(g0, pickTargets(g0))
  startProject(g0, { area: 'aero', size: 'minor', approach: 'standard' })
  startProject(g0, { area: 'chassis', size: 'minor', approach: 'standard' })
  for (let r = 0; r < 16; r++) {
    situations.push(clone(g0))
    if (g0.decision && !g0.decision.resolved) resolveDecision(g0, 'b')
    if (g0.dev.queues.aero.length === 0) startProject(g0, { area: 'aero', size: 'minor', approach: 'standard' })
    simulateRound(g0)
  }
  const done = new Set()
  const problems = []
  for (const d of DECK) {
    for (const base of situations) {
      const probe = clone(base)
      if (!forceDecision(probe, d.id)) continue
      const view = describeDecision(probe)
      const words = [view.title, view.text, view.a.label, view.a.text, view.b.label, view.b.text].join(' | ')
      if (/undefined|NaN|\[object/.test(words) || !view.a.label || !view.b.label) problems.push(`${d.id}: bad text: ${words.slice(0, 120)}`)
      for (const choice of ['a', 'b']) {
        const g = clone(base)
        forceDecision(g, d.id)
        try {
          resolveDecision(g, choice)
          if (!Number.isFinite(optionValue({ ...clone(base), decision: clone(probe.decision) }, choice))) problems.push(`${d.id}/${choice}: value is not a number`)
          // Play on so one-race effects, three-race effects and delayed outcomes all land.
          for (let r = 0; r < 7 && g.phase === 'season'; r++) { if (g.decision && !g.decision.resolved) resolveDecision(g, 'b'); simulateRound(g) }
          const bad = hasBadNumber(g)
          if (bad) problems.push(`${d.id}/${choice}: broken number at ${bad}`)
        } catch (err) { problems.push(`${d.id}/${choice}: ${err.message}`) }
      }
      done.add(d.id)
      break
    }
  }
  const missed = DECK.filter((d) => !done.has(d.id)).map((d) => d.id)
  check('all 80 decisions can be shown and resolved both ways', done.size === 80, missed.length ? `not exercised: ${missed.join(', ')}` : '')
  check('none of them breaks the save or prints a bad value', problems.length === 0, problems.slice(0, 5).join(' ; '))
}

// ---- One per round, no repeats, fixed outcomes ----
{
  const g = setup(302)
  const seen = []
  let blocked = true
  let outcomeFixed = true
  for (let s = 0; s < 3; s++) {
    autoDrivers(g)
    prepareTargets(g, 10); startSeason(g, pickTargets(g))
    while (g.phase === 'season') {
      if (!g.decision || g.decision.resolved) { blocked = false; break }
      if (!expectThrow(() => simulateRound(clone(g)))) blocked = false
      // A reloaded save gives the same outcome for the same choice.
      const a = clone(g); const b = clone(g)
      resolveDecision(a, 'a'); resolveDecision(b, 'a')
      if (JSON.stringify(a.decision.outcome) !== JSON.stringify(b.decision.outcome)) outcomeFixed = false
      seen.push({ id: g.decision.id, at: (g.season - 1) * 16 + g.round })
      decide(g, 'random')
      simulateRound(g)
    }
    endSeason(g)
  }
  let repeatOk = true
  const last = {}
  for (const x of seen) { if (last[x.id] !== undefined && x.at - last[x.id] < NO_REPEAT) repeatOk = false; last[x.id] = x.at }
  const weekendShare = seen.filter((x) => ['Race weekend', 'Reliability'].includes(DECK.find((d) => d.id === x.id).type)).length / seen.length
  check('every round has exactly one decision, and the race waits for it', blocked && seen.length === 48)
  check(`no decision repeats within ${NO_REPEAT} rounds`, repeatOk, `${new Set(seen.map((x) => x.id)).size} different decisions in 48 rounds`)
  check('about half are race-weekend calls', weekendShare > 0.35 && weekendShare < 0.65, `${Math.round(weekendShare * 100)}%`)
  check('the outcome is fixed when the round starts', outcomeFixed)
  check('the decision log records every choice', g.decisionLog.length === 48 && g.decisionLog.every((l) => l.title && l.label))
  const h = setup(302)
  for (let s = 0; s < 1; s++) { prepareTargets(h, 10); startSeason(h, pickTargets(h)); while (h.phase === 'season') { decide(h, 'random'); simulateRound(h) } }
  check('same seed and same choices give the same decisions', JSON.stringify(h.decisionLog) === JSON.stringify(g.decisionLog.slice(0, 16)))
}

// ---- Does the better option depend on the situation? ----
{
  // Saves at different stages: new backmarker, growing team, established team.
  const stages = []
  for (const seed of [401, 402, 403]) {
    const g = setup(seed, { options: { decisions: false, targets: false } })
    for (let s = 0; s < 10; s++) {
      steady(g); startSeason(g)
      while (g.phase === 'season') { steady(g); if (g.round % 3 === 0) stages.push(clone(g)); simulateRound(g) }
      endSeason(g)
    }
  }
  // The bot's saves only reach midfield, so add the same moments as a front-runner,
  // as a team out of cash, and with a big part in the factory.
  const real = stages.length
  for (const base of stages.filter((x, i) => i % 6 === 0)) {
    const top = clone(base)
    top.reputation = 88
    Object.assign(top.teams[PLAYER].car, { aero: 91, chassis: 90, reliability: 90, tyreCare: 88 })
    top.teams[PLAYER].supplier = 'mercedes'
    for (const k of Object.values(top.org.keyStaff)) k.rating = 88
    for (const f of Object.values(top.org.facilities)) f.level = Math.max(f.level, 4)
    for (const d of Object.values(top.org.staff)) { d.heads *= 4; d.skill = 82 }
    top.teams[PLAYER].drivers.forEach((id, i) => Object.assign(top.drivers[id], { pace: 94 - i * 2, racecraft: 86, consistency: 92 - i * 2, wet: 90, feedback: 90, marketability: 90 }))
    top.drivers[top.teams[PLAYER].drivers[0]].contract.salary = 20
    for (const d of top.sponsors.deals) { d.fee *= 12; d.bonus *= 12; d.value *= 12 }
    top.finance.cash = 40
    stages.push(top)
    const broke = clone(base)
    broke.finance.cash = 0.3
    for (const d of Object.values(broke.org.staff)) d.heads += 20
    stages.push(broke)
    const big = clone(base)
    big.dev.builds.unshift({ id: 99999, area: 'aero', size: 'package', approach: 'standard', rush: false, units: 52, done: 52, stage: 'build', buildDone: 0, cost: 2 })
    stages.push(big)
  }
  const verdicts = {}
  for (const d of DECK) verdicts[d.id] = { a: 0, b: 0 }
  for (const base of stages) for (const d of DECK) {
    const g = clone(base)
    if (forceDecision(g, d.id)) verdicts[d.id][bestChoice(g)]++
  }
  const never = Object.entries(verdicts).filter(([, v]) => v.a + v.b === 0).map(([id]) => id)
  const oneSided = Object.entries(verdicts).filter(([, v]) => v.a + v.b > 0 && (v.a === 0 || v.b === 0)).map(([id, v]) => `${id} (always ${v.a ? 'A' : 'B'})`)
  const both = DECK.length - never.length - oneSided.length
  console.log(`\nAcross ${stages.length} situations (${real} from three ten-season saves, plus the same moments as a front-runner, out of cash, and with a big part in the factory), by the bot's own valuation:`)
  console.log(`  ${both} decisions had each option come out best at least once`)
  console.log(`  ${oneSided.length} always favoured the same option: ${oneSided.join(', ') || 'none'}`)
  if (never.length) console.log(`  ${never.length} never applied in these saves: ${never.join(', ')}`)
  check('at least nine in ten of the deck depends on the situation', both >= 72, `${both} of 80`)
}

// ---- Season targets ----
{
  const g = setup(501)
  const t0 = Date.now()
  prepareTargets(g, 150)
  const ms = Date.now() - t0
  const offer = g.targets.offer
  const cats = offer.map((o) => o.category)
  check('six targets are offered, two in each category', offer.length === 6 && ['sporting', 'commercial', 'technical'].every((c) => cats.filter((x) => x === c).length === 2))
  const rising = offer.every((o) => (o.lowerBetter ? o.marks.safe > o.marks.standard && o.marks.standard > o.marks.stretch : o.marks.safe < o.marks.standard && o.marks.standard < o.marks.stretch))
  check('each has three levels, each harder than the last', rising)
  console.log(`      season 1 offer (projection of 150 seasons took ${ms} ms):`)
  for (const o of offer) console.log(`        ${o.category.padEnd(10)} ${o.name}: ${o.levels.safe} / ${o.levels.standard} / ${o.levels.stretch}`)
  check('the projection is quick enough to run in pre-season', ms < 8000, `${ms} ms`)
  check('the season cannot start without three targets', expectThrow(() => startSeason(clone(g))))
  check('targets must come from three different categories', expectThrow(() => chooseTargets(clone(g), [0, 1, 2].map((i) => ({ id: offer[i].id, area: offer[i].area, level: 'safe' })))))
  check('drivers cannot be changed once targets are being set', expectThrow(() => { const h = clone(g); h.teams[PLAYER].drivers.pop(); startSeason(h, pickTargets(h)) }))

  // Rewards and penalties, on a season played out.
  startSeason(g, pickTargets(g, 'safe'))
  const conf0 = g.confidence
  while (g.phase === 'season') { averageManager(g); decide(g, 'best'); simulateRound(g) }
  const confAfterSeason = g.confidence
  const progress = targetProgress(g)
  endSeason(g)
  const rep = g.seasonReport.targets
  // Weekend objectives add a point each through the season; targets are judged at the end.
  const fromObjectives = confAfterSeason - conf0
  const expected = progress.reduce((s, t) => s + (t.met ? LEVELS.safe.confidence : -5), 0)
  check('owner confidence moves by +3 for each Safe target met and −5 for each missed', Math.abs(g.confidence - Math.min(100, confAfterSeason) - expected) < 1e-9 || (g.confidence === 100 && expected > 0),
    `${progress.filter((t) => t.met).length} of 3 met, confidence ${conf0} to ${confAfterSeason} over the weekends (${fromObjectives >= 0 ? '+' : ''}${fromObjectives} from weekend objectives), then ${g.confidence}`)
  const tech = rep.report.find((r) => r.name.includes('rating') || r.name.includes('Facility') || r.name.includes('classified'))
  check('a technical target met adds engineering capacity next season, and only then', (g.bonus.capacity > 0) === !!tech.met)
  check('the review lists all three targets with their results', rep.report.length === 3 && rep.report.every((r) => r.mark && r.level))
}

// ---- Hit rates under average management ----
{
  const tally = {}
  const bump = (key, level, met) => { const t = ((tally[key] ??= {})[level] ??= { met: 0, n: 0 }); t.n++; if (met) t.met++ }
  let seed = 600
  let seasons = 0
  while (seasons < TARGET_SEASONS) {
    const g = setup(seed++)
    for (let s = 0; s < 4 && seasons < TARGET_SEASONS; s++, seasons++) {
      averageManager(g)
      prepareTargets(g, 60)
      const offer = clone(g.targets.offer)
      startSeason(g, pickTargets(g))
      while (g.phase === 'season') { averageManager(g); decide(g, 'random'); simulateRound(g) }
      // Judge every offered target at every level against what happened.
      const live = clone(g)
      for (const o of offer) for (const level of Object.keys(LEVELS)) {
        live.targets.chosen = [{ ...o, level }]
        const luck = ['wins', 'podiums', 'pos', 'points', 'ahead', 'best', 'classified'].includes(o.id)
        bump(luck ? 'results (set from the projection)' : `${o.id} (set from a baseline)`, level, targetProgress(live)[0].met)
      }
      endSeason(g)
    }
  }
  console.log(`\nShare of targets met over ${seasons} seasons of average management, random A/B choices:`)
  console.log('  kind                                 Safe   Standard  Stretch')
  for (const [key, t] of Object.entries(tally)) {
    const pc = (l) => (t[l] ? `${Math.round((100 * t[l].met) / t[l].n)}%` : '—').padStart(6)
    console.log(`  ${key.padEnd(36)} ${pc('safe')}  ${pc('standard')}  ${pc('stretch')}`)
  }
  const r = tally['results (set from the projection)']
  const rate = (l) => r[l].met / r[l].n
  check('results targets get harder by level, roughly 80 / 50 / 20', rate('safe') > 0.6 && rate('standard') > 0.25 && rate('standard') < 0.7 && rate('stretch') < 0.4 && rate('safe') > rate('standard') && rate('standard') > rate('stretch'),
    `${Math.round(rate('safe') * 100)}% / ${Math.round(rate('standard') * 100)}% / ${Math.round(rate('stretch') * 100)}%`)
}

// ---- A long save with everything switched on ----
{
  const run = (choose) => {
    const g = setup(701)
    const rows = []
    for (let s = 0; s < 8; s++) { const { summary } = playFullSeason(g, steady, { choose, level: 'standard', runs: 30 }); rows.push(summary.playerPos) }
    return { g, rows }
  }
  const best = run('best')
  check('eight seasons with decisions and targets leave no broken numbers', !hasBadNumber(best.g), hasBadNumber(best.g) || '')
  check('targets are reviewed every season', best.g.targets.history.length === 8)
  check('the log holds a decision for every round', best.g.decisionLog.length === 128)
  const met = best.g.targets.history.reduce((s, h) => s + h.report.filter((r) => r.met).length, 0)
  console.log(`\nSteady manager, 8 seasons, Standard targets, bot's preferred A/B option: positions ${best.rows.join(', ')}; ${met} of 24 targets met; owner confidence ${best.g.confidence.toFixed(0)}; crises ${best.g.finance.crises}`)
  const worst = run('worst')
  console.log(`Same save taking the other option every time: positions ${worst.rows.join(', ')}; owner confidence ${worst.g.confidence.toFixed(0)}; crises ${worst.g.finance.crises}`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
