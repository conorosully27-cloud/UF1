// Visuals V1 check: drivers' faces.
//   1. Every driver's look is fixed: the same id always gives the same traits,
//      and a line in looks.js uses only known traits and values.
//   2. Every combination of shape, hair style, facial hair, mood and age draws
//      without a broken number.
//   3. Rolled looks vary: the generated drivers between them use every face
//      shape, most hair styles and most skin tones.
// Usage: node tests/v1-check.js

import { faceTraits, faceParts, SHAPES, SKIN, HAIR, EYE_COLORS, EYES, NOSES, BROWS, FACIAL, STYLES } from '../src/ui/faces.js'
import { LOOKS } from '../src/ui/data/looks.js'
import { RACE_DRIVERS, POOL_DRIVERS } from '../src/engine/data/drivers.js'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

const VALUES = {
  shape: Object.keys(SHAPES), skin: SKIN.map((_, i) => i), hair: Object.keys(HAIR), style: STYLES, brows: Object.keys(BROWS),
  eyes: Object.keys(EYES), eyeColor: Object.keys(EYE_COLORS), nose: Object.keys(NOSES), facial: FACIAL, glasses: [true, false],
}
const valid = (t) => Object.entries(t).every(([k, v]) => (k === 'recedeAge' || k === 'greyAge' ? v === null || Number.isInteger(v) : VALUES[k]?.includes(v)))
const broken = (parts) => parts.some((q) => /NaN|undefined|Infinity/.test(q.d ?? q.e.join(' ')) || !q.fill)

// 1. Fixed looks.
const real = [...RACE_DRIVERS, ...POOL_DRIVERS]
const generated = Array.from({ length: 300 }, (_, i) => ({ id: `gen-${i + 1}`, age: 18 + (i % 25) }))
const all = [...real, ...generated]
check('the same id always gives the same look', all.every((d) => JSON.stringify(faceTraits(d)) === JSON.stringify(faceTraits({ ...d }))))
check('every look uses known traits and values', all.every((d) => valid(faceTraits(d))), all.filter((d) => !valid(faceTraits(d))).map((d) => d.id).join(', '))
const badLooks = Object.entries(LOOKS).filter(([, t]) => !valid(t)).map(([id]) => id)
check('looks.js uses known traits and values', badLooks.length === 0, badLooks.join(', '))
const unknown = Object.keys(LOOKS).filter((id) => !real.some((d) => d.id === id))
check('looks.js names only drivers in the game', unknown.length === 0, unknown.join(', '))

// 2. Every combination draws.
let combos = 0
let bad = 0
for (const shape of Object.keys(SHAPES)) {
  for (const style of STYLES) {
    for (const facial of FACIAL) {
      for (const mood of [-1, -0.4, 0, 0.6, 1]) {
        for (const age of [17, 33, 41, 48]) {
          const t = { ...faceTraits({ id: `${shape}${style}` }), shape, style, facial, glasses: facial === 'goatee', recedeAge: 35 }
          combos++
          if (broken(faceParts(t, { age, mood, suit: '#ff5a36' }))) bad++
        }
      }
    }
  }
}
check('every combination draws', bad === 0, `${combos} drawn, ${bad} broken`)
check('every driver in the game draws', all.every((d) => !broken(faceParts(faceTraits(d), { age: d.age }))))

// 3. Variety.
const looks = generated.map(faceTraits)
const seen = (k) => new Set(looks.map((t) => t[k])).size
check('every face shape is rolled', seen('shape') === Object.keys(SHAPES).length, `${seen('shape')}`)
check('most hair styles are rolled', seen('style') >= 8, `${seen('style')} of ${STYLES.length}`)
check('most skin tones are rolled', seen('skin') >= 7, `${seen('skin')} of ${SKIN.length}`)
const keys = new Set(real.map((d) => JSON.stringify(faceTraits(d))))
check('no two real drivers look the same', keys.size === real.length, `${keys.size} looks for ${real.length} drivers`)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
