// Milestone 5: the balance harness (design sections 6 and 9). Scripted
// managers play whole saves with every system switched on; the results are
// compared with the target curve.
// Usage: node tests/m5-balance.js [saves per bot] [seasons] [--quick | --ab | --only=<bot>] [--report] [--fresh] [--out=<file>]
//   --quick skips the A/B comparison; --ab runs only that comparison;
//   --only=competent (or naive, reckless) runs one manager.
// Each finished save is written to a results file (.m5/results.jsonl) as it
// completes, so a run can be stopped at any time: run again to carry on where
// it stopped, or add --report to report on the saves finished so far without
// playing any more. Results from an older version of the engine, the bots or
// this harness are ignored automatically; --fresh clears the file.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, appendFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const QUICK = process.argv.includes('--quick')
const SAVES = Number(args[0] || 40)
const SEASONS = Number(args[1] || 15)
const PROJECTION_RUNS = 30
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? join(ROOT, '.m5', 'results.jsonl')
const REPORT_ONLY = process.argv.includes('--report')

// ---- The results file ----

// A hash of everything that decides a save's result, so stale results are never reused.
function fingerprint() {
  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, e.name)
      if (e.isDirectory()) walk(f)
      else if (f.endsWith('.js')) files.push(f)
    }
  }
  walk(join(ROOT, 'src', 'engine'))
  files.push(join(ROOT, 'tests', 'bot.js'), fileURLToPath(import.meta.url))
  const h = createHash('sha1')
  for (const f of files.sort()) h.update(f.slice(ROOT.length)).update(readFileSync(f))
  return h.digest('hex').slice(0, 12)
}
const jobKey = (j) => [j.bot, j.choose, j.seed, j.seasons, j.difficulty].join('|')

function loadStore(fp) {
  const store = new Map()
  if (!existsSync(OUT)) return store
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (!line) continue
    try {
      const x = JSON.parse(line)
      if (x.fp === fp) store.set(x.key, x.result)
    } catch { /* a line cut off when a run was stopped */ }
  }
  return store
}

// ---- One save, in a worker ----
async function playSave({ bot, seed, seasons, choose, difficulty }) {
  const { newGame, startSeason, simulateRound, endSeason, prepareTargets, PLAYER } = await import('../src/engine/game.js')
  const { MANAGERS, decide, pickTargets, competentTargets } = await import('./bot.js')
  const { targetValue, targetMetBy } = await import('../src/engine/targets.js')
  const { seasonMetrics } = await import('../src/engine/core.js')
  const manager = MANAGERS[bot]
  const g = newGame({ seed, teamName: 'Bot GP', supplier: 'ferrari', driverIds: ['zhou', 'herta'], reserveId: null, difficulty })
  const out = []
  for (let s = 0; s < seasons; s++) {
    manager(g)
    prepareTargets(g, PROJECTION_RUNS)
    startSeason(g, bot === 'competent' ? competentTargets(g) : pickTargets(g, 'standard'))
    while (g.phase === 'season') { manager(g); decide(g, choose); simulateRound(g) }
    const m = seasonMetrics(g)
    // Every objective offered, judged at every level, so the rates measure the marks rather than the bot's choices.
    const targets = g.targets.offer.map((t) => {
      const v = targetValue(t, m)
      return { id: t.id, level: t.level, met: Object.fromEntries(['safe', 'standard', 'stretch'].map((l) => [l, targetMetBy(t, l, v)])) }
    })
    const crisesBefore = g.finance.crises
    const sum = endSeason(g)
    out.push({
      pos: sum.playerPos, points: sum.playerPoints, wins: sum.playerWins, podiums: sum.playerPodiums, best: sum.playerBest,
      champion: sum.playerPos === 1, crises: g.finance.crises, crisisLog: g.finance.crisisLog || [], crisisThisSeason: g.finance.crises > crisesBefore || false,
      confidence: g.confidence, reputation: g.reputation, cash: g.finance.cash, targets,
      gap: null,
    })
    void PLAYER
  }
  return out
}

if (!isMainThread) {
  parentPort.on('message', async (job) => {
    try { parentPort.postMessage({ id: job.id, result: await playSave(job) }) } catch (err) { parentPort.postMessage({ id: job.id, error: String(err.stack || err) }) }
  })
} else {
  main()
}

// Plays every job not already in the results file, writing each save as it
// finishes. Returns one result per job, or null for a save not played yet.
async function runAll(jobs) {
  const fp = fingerprint()
  const store = loadStore(fp)
  const results = jobs.map((j) => store.get(jobKey(j)) ?? null)
  const todo = results.map((r, i) => (r ? null : i)).filter((i) => i !== null)
  let done = jobs.length - todo.length
  console.error(`${done} of ${jobs.length} saves already in ${OUT}${REPORT_ONLY ? ' (report only)' : ''}`)
  if (REPORT_ONLY || !todo.length) return results
  mkdirSync(dirname(OUT), { recursive: true })
  const n = Math.max(1, Math.min(cpus().length, todo.length))
  const workers = Array.from({ length: n }, () => new Worker(fileURLToPath(import.meta.url)))
  let next = 0
  await Promise.all(workers.map((w) => new Promise((resolve, reject) => {
    const feed = () => {
      if (next >= todo.length) { w.terminate(); resolve(); return }
      const id = todo[next++]
      w.postMessage({ ...jobs[id], id })
    }
    w.on('message', (msg) => {
      if (msg.error) { reject(new Error(msg.error)); return }
      results[msg.id] = msg.result
      appendFileSync(OUT, JSON.stringify({ fp, key: jobKey(jobs[msg.id]), result: msg.result }) + '\n')
      done++
      if (done % 10 === 0 || done === jobs.length) console.error(`  ${done} of ${jobs.length} saves done`)
      feed()
    })
    w.on('error', reject)
    feed()
  })))
  return results
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN }
const quantile = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] }
const pct = (x) => `${Math.round(x * 100)}%`
const firstSeason = (save, test) => { const i = save.findIndex(test); return i < 0 ? null : i + 1 }

function report(label, saves) {
  console.log(`\n${label}: ${saves.length} saves of ${SEASONS} seasons`)
  console.log('  Season       ' + Array.from({ length: SEASONS }, (_, i) => String(i + 1).padStart(4)).join(''))
  const row = (name, fn) => console.log(`  ${name.padEnd(13)}` + Array.from({ length: SEASONS }, (_, i) => String(fn(saves.map((s) => s[i]))).padStart(4)).join(''))
  row('median pos', (xs) => median(xs.map((x) => x.pos)))
  row('best quarter', (xs) => quantile(xs.map((x) => x.pos), 0.25))
  row('worst quarter', (xs) => quantile(xs.map((x) => x.pos), 0.75))
  row('titles', (xs) => xs.filter((x) => x.champion).length)
  const firsts = (test) => saves.map((s) => firstSeason(s, test))
  const describe = (arr) => { const got = arr.filter((x) => x !== null); return got.length ? `median season ${median(got)} (${pct(got.length / arr.length)} of saves)` : 'never' }
  console.log(`  First points: ${describe(firsts((x) => x.points > 0))}; first podium: ${describe(firsts((x) => x.podiums > 0))}; first win: ${describe(firsts((x) => x.wins > 0))}; first title: ${describe(firsts((x) => x.champion))}`)
  const crisis = saves.filter((s) => s.at(-1).crises > 0).length / saves.length
  const reasons = {}
  for (const s of saves) for (const c of s.at(-1).crisisLog || []) reasons[`${c.reason} in season ${c.season}`] = (reasons[`${c.reason} in season ${c.season}`] || 0) + 1
  console.log(`  Saves with a crisis: ${pct(crisis)}${Object.keys(reasons).length ? ` (${Object.entries(reasons).sort().map(([k, v]) => `${v}× ${k}`).join(', ')})` : ''}; final owner confidence median ${median(saves.map((s) => s.at(-1).confidence)).toFixed(0)}`)
  return { crisis, firstTitle: firsts((x) => x.champion), saves }
}

function targetRates(saves) {
  const tally = { safe: [0, 0], standard: [0, 0], stretch: [0, 0] }
  for (const s of saves) for (const season of s) for (const t of season.targets) for (const l of Object.keys(tally)) { tally[l][1]++; if (t.met[l]) tally[l][0]++ }
  return Object.fromEntries(Object.entries(tally).map(([l, [m, n]]) => [l, m / n]))
}

// Progress: championship points over the first ten seasons. Places top out at
// 1st, so points show the difference better once a team is winning.
const progress = (saves, upto = 10) => saves.reduce((s, save) => s + save.slice(0, upto).reduce((t, x) => t + x.points, 0), 0) / saves.length

function targetBreakdown(saves) {
  const by = {}
  for (const s of saves) for (const season of s) for (const t of season.targets) {
    const b = (by[t.id] ??= { n: 0, safe: 0, standard: 0, stretch: 0 })
    b.n++
    for (const l of ['safe', 'standard', 'stretch']) if (t.met[l]) b[l]++
  }
  return Object.entries(by).map(([id, b]) => `${id} ${Math.round((100 * b.safe) / b.n)}/${Math.round((100 * b.standard) / b.n)}/${Math.round((100 * b.stretch) / b.n)} (n ${b.n})`).join(', ')
}

// --ab: only the A/B comparison, over more saves.
async function abOnly() {
  const seeds = Array.from({ length: SAVES }, (_, i) => 9000 + i)
  const jobs = [...seeds.map((seed) => ({ bot: 'competent', seed, seasons: 10, choose: 'best', difficulty: 'normal' })), ...seeds.map((seed) => ({ bot: 'competent', seed, seasons: 10, choose: 'random', difficulty: 'normal' }))]
  const res = await runAll(jobs)
  // Only seeds played both ways are compared.
  const both = seeds.map((_, i) => i).filter((i) => res[i] && res[SAVES + i])
  const best = both.map((i) => res[i])
  const rnd = both.map((i) => res[SAVES + i])
  if (!both.length) { console.log('No paired saves finished yet'); process.exit(0) }
  const ratio = progress(rnd) / progress(best)
  const posAvg = (saves) => saves.reduce((s, x) => s + x.reduce((t, y) => t + y.pos, 0) / x.length, 0) / saves.length
  console.log(`A/B over ${both.length} paired saves of 10 seasons: random choices score ${pct(ratio)} of the points; average position ${posAvg(best).toFixed(2)} with the better option, ${posAvg(rnd).toFixed(2)} at random`)
  process.exit(0)
}

// --only=<bot>: one manager's table, for quick tuning runs.
async function onlyOne(bot) {
  const seeds = Array.from({ length: SAVES }, (_, i) => 9000 + i)
  const res = (await runAll(seeds.map((seed) => ({ bot, seed, seasons: SEASONS, choose: bot === 'naive' ? 'random' : 'best', difficulty: 'normal' })))).filter(Boolean)
  if (!res.length) { console.log('No saves finished yet'); process.exit(0) }
  const r = report(bot, res)
  const win = r.firstTitle.filter((x) => x !== null && x >= 8 && x <= 12).length / res.length
  console.log(`  First title in seasons 8-12: ${pct(win)}; median final position ${median(res.map((s) => s.at(-1).pos))}`)
  process.exit(0)
}

async function main() {
  if (process.argv.includes('--fresh') && existsSync(OUT)) rmSync(OUT)
  if (process.argv.includes('--ab')) return abOnly()
  const only = process.argv.find((a) => a.startsWith('--only='))
  if (only) return onlyOne(only.slice(7))
  const t0 = Date.now()
  const seeds = Array.from({ length: SAVES }, (_, i) => 9000 + i)
  // Seed by seed across the managers, so a run stopped part-way has some of each.
  const groups = [['competent', 'best'], ['reckless', 'best'], ['naive', 'random']]
  if (!QUICK) groups.push(['competent', 'random'])
  const jobs = []
  for (const seed of seeds) groups.forEach(([bot, choose], group) => jobs.push({ bot, seed, seasons: SEASONS, choose, difficulty: 'normal', group }))
  const res = await runAll(jobs)
  const by = (i) => jobs.map((j, k) => (j.group === i ? res[k] : null)).filter(Boolean)
  const finished = res.filter(Boolean).length
  if (finished < jobs.length) console.log(`PARTIAL: ${finished} of ${jobs.length} saves finished; the figures below use those only`)
  if (groups.some((_, i) => !by(i).length)) { console.log('Not every manager has a finished save yet'); process.exit(0) }
  const comp = report('Competent manager, better A/B option', by(0))
  const reck = report('Reckless manager', by(1))
  const naive = report('Naive manager, random A/B option', by(2))

  let failures = 0
  const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'MISS'}  ${name}${detail ? '  ' + detail : ''}`) }
  console.log('\nAgainst the targets in sections 6 and 9:')
  const nc = comp.saves.length
  const inWindow = comp.firstTitle.filter((x) => x !== null && x >= 8 && x <= 12).length / nc
  const early = comp.firstTitle.filter((x) => x !== null && x < 8).length / nc
  check('competent: first title in seasons 8-12 in about half of saves', inWindow >= 0.35 && inWindow <= 0.7 && early < 0.15, `${pct(inWindow)} in the window, ${pct(early)} earlier`)
  check('competent: a crisis in under 10% of saves', comp.crisis < 0.1, pct(comp.crisis))
  const med = (i) => median(by(0).map((s) => s[i]?.pos))
  check('competent: 12th in season 1, 11th-10th in 2, 10th-8th in 3', med(0) >= 11 && med(1) >= 9 && med(1) <= 12 && med(2) >= 7 && med(2) <= 11, `${med(0)}, ${med(1)}, ${med(2)}`)
  check('competent: 8th-7th by season 4, 6th-5th by 5', med(3) >= 6 && med(3) <= 9 && med(4) >= 4 && med(4) <= 7, `${med(3)}, ${med(4)}`)
  const rates = targetRates(by(0))
  console.log(`  by objective (Safe/Standard/Stretch %): ${targetBreakdown(by(0))}`)
  check('competent: season targets met about 80 / 50 / 20% at Safe / Standard / Stretch', rates.safe > 0.6 && rates.standard > 0.3 && rates.standard < 0.7 && rates.stretch < 0.4, `${pct(rates.safe)} / ${pct(rates.standard)} / ${pct(rates.stretch)}`)
  const naiveFinal = median(by(2).map((s) => s.at(-1).pos))
  const naiveTitle = by(2).filter((s) => s.slice(0, 15).some((x) => x.champion)).length / by(2).length
  check('naive: plateaus at 7th-9th', naiveFinal >= 7 && naiveFinal <= 10, `median final position ${naiveFinal}`)
  check('naive: a title by season 15 in under 5% of saves', naiveTitle < 0.05, pct(naiveTitle))
  check('reckless: a crisis in over half of saves', reck.crisis > 0.5, pct(reck.crisis))
  if (!QUICK) {
    // Compared on the seeds finished both ways.
    const pair = seeds.map((_, k) => [res[k * groups.length], res[k * groups.length + 3]]).filter(([a, b]) => a && b)
    const rnd = report('Competent manager, random A/B option', pair.map((x) => x[1]))
    const ratio = progress(rnd.saves) / progress(pair.map((x) => x[0]))
    check('choosing the better A/B option is worth about 10% faster progress', ratio > 0.8 && ratio < 0.97, `random choices score ${pct(ratio)} of the points over 10 seasons`)
  }
  console.log(`\n${failures ? `${failures} target(s) missed` : 'All targets met'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  process.exit(0)
}
