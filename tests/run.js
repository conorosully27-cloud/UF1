// Runs the checks side by side, one per processor core, longest first, and
// prints each one's output as it finishes, then a summary.
// Usage: node tests/run.js [--fast] [check ...]
//   --fast    smaller samples (FAST=1), and the pit-wall measure left out:
//             for everyday use; run the full set before merging.
//   check     only these (names as in the list below, e.g. w6-check)

import { spawn } from 'child_process'
import { cpus } from 'os'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Longest first, so the slow ones are not left running alone at the end.
const ALL = ['m3-check', 'w5-strategist', 'm1-check', 'w2-check', 'm4-check', 'w6-check', 'm2-check', 'w3-check', 'w55-check', 'w4-check', 'w5-check', 'v1-check', 'v2-check']
const FAST_SKIPS = new Set(['w5-strategist'])

const args = process.argv.slice(2)
const fast = args.includes('--fast')
const asked = args.filter((a) => !a.startsWith('--'))
const unknown = asked.filter((a) => !ALL.includes(a))
if (unknown.length) {
  console.error(`Unknown check(s): ${unknown.join(', ')}. The checks: ${ALL.join(', ')}`)
  process.exit(2)
}
const list = (asked.length ? ALL.filter((t) => asked.includes(t)) : ALL).filter((t) => !(fast && !asked.length && FAST_SKIPS.has(t)))
const here = dirname(fileURLToPath(import.meta.url))
const slots = Math.max(1, cpus().length)

const results = []
const started = Date.now()
function run(name) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const child = spawn(process.execPath, [join(here, `${name}.js`)], { env: { ...process.env, ...(fast ? { FAST: '1' } : {}) } })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    child.on('close', (code) => {
      const secs = Math.round((Date.now() - t0) / 1000)
      results.push({ name, code, secs })
      console.log(`\n===== ${name}: ${code === 0 ? 'passed' : 'FAILED'} (${secs} s) =====\n${out.trimEnd()}`)
      resolve()
    })
  })
}

const queue = list.slice()
await Promise.all(Array.from({ length: Math.min(slots, queue.length) }, async () => {
  while (queue.length) await run(queue.shift())
}))

const failed = results.filter((r) => r.code !== 0)
console.log(`\n===== Summary${fast ? ' (fast)' : ''}: ${results.length - failed.length} of ${results.length} passed in ${Math.round((Date.now() - started) / 1000)} s =====`)
for (const name of list) {
  const r = results.find((x) => x.name === name)
  console.log(`  ${r.code === 0 ? 'pass' : 'FAIL'}  ${name.padEnd(14)} ${String(r.secs).padStart(4)} s`)
}
if (fast && !asked.length) console.log('  (fast: smaller samples, and w5-strategist left out; run npm test before merging)')
process.exit(failed.length ? 1 : 0)
