// Drivers' faces (VISUALS.md, V1): one flat drawing style, with each driver
// told apart by a handful of traits (face shape, skin, hair, brows, eyes,
// nose, facial hair, glasses). A driver's traits come from data/looks.js where
// they have a line there, and are otherwise rolled once from their id. The
// same face ages (greying, a receding hairline, lines) and shows a mood.
//
// Everything is drawn on a 100 × 100 box: head and shoulders, in the colour of
// the driver's team. `faceParts` returns the shapes to draw, in order, and
// Face.jsx draws them; kept apart from React so the checks can run it.

import { hashString, makeRng } from '../engine/rng.js'
import { clamp } from '../engine/util.js'
import { LOOKS } from './data/looks.js'

// Half-widths at the cheeks (wc), jaw (wj) and chin (wch), and how far down
// the jaw and chin come.
export const SHAPES = {
  oval: { wc: 18.5, wj: 14.5, wch: 6, jaw: 61, chin: 71 },
  round: { wc: 20, wj: 16.5, wch: 8.5, jaw: 60, chin: 69.5 },
  square: { wc: 19.5, wj: 18, wch: 10, jaw: 62, chin: 70.5 },
  long: { wc: 17.5, wj: 14, wch: 6.5, jaw: 63, chin: 73.5 },
  heart: { wc: 19.5, wj: 13, wch: 4.5, jaw: 61, chin: 71 },
}
export const SKIN = ['#f7dcc8', '#f0c6a8', '#e2ae88', '#cc9268', '#ae744f', '#8e5a3a', '#6d432a', '#4f2f1e']
export const HAIR = {
  black: '#1d1b1b', darkBrown: '#3b2a20', brown: '#5e3f2a', lightBrown: '#8c653f',
  blond: '#d2ae68', platinum: '#e6dbb8', ginger: '#b5582c', auburn: '#7a3626',
}
export const EYE_COLORS = { brown: '#5c3b22', darkBrown: '#382415', hazel: '#7d6436', green: '#527c4b', blue: '#4b7fb4', grey: '#7d8a96' }
export const EYES = { almond: 1.9, round: 2.3, narrow: 1.4, hooded: 1.7 } // eye height
export const NOSES = { straight: { w: 3, y: 53 }, small: { w: 2.4, y: 52 }, wide: { w: 4, y: 53 }, long: { w: 2.8, y: 54.5 } }
export const BROWS = { straight: 0.5, arched: 2, angled: 1.5, thick: 0.9, thin: 1.3 } // how high the brow arches
export const FACIAL = ['none', 'stubble', 'short', 'beard', 'moustache', 'goatee']

// o: how far the hair stands off the head; hl: the hairline at the middle;
// side: how far down the sides come; fringe: the hairline's shape.
const HAIRDO = {
  buzz: { o: 0.9, hl: 27.5, side: 44, fringe: 'flat', op: 0.78 },
  short: { o: 2.4, hl: 28, side: 45, fringe: 'flat' },
  side: { o: 3.2, hl: 28.5, side: 45, fringe: 'swept' },
  quiff: { o: 2.6, hl: 26.5, side: 44.5, fringe: 'flat' },
  curly: { o: 3.4, hl: 27.5, side: 45, fringe: 'flat' },
  slick: { o: 1.8, hl: 26.5, side: 44.5, fringe: 'flat' },
  messy: { o: 3, hl: 29, side: 45, fringe: 'spiky' },
  long: { o: 3, hl: 28, side: 53, fringe: 'parted' },
  bun: { o: 1.8, hl: 27, side: 45, fringe: 'parted' },
  receding: { o: 2, hl: 28, side: 45, fringe: 'flat' },
  bald: null,
}
export const STYLES = Object.keys(HAIRDO)
// Styles whose hairline can recede with age.
const RECEDES = new Set(['buzz', 'short', 'side', 'quiff', 'curly', 'slick', 'messy'])

export const MOODS = [[-1, 'Angry'], [-0.5, 'Unhappy'], [0, 'Neutral'], [0.5, 'Pleased'], [1, 'Delighted']]

const pickW = (rng, table) => rng.weightedPick(Object.keys(table), Object.values(table))

// A look rolled from the id, around any traits looks.js sets: hair and eye
// colour follow the skin tone. Facial hair is left to looks.js.
function rolled(id, set) {
  const rng = makeRng(hashString(`face|${id}`))
  const rolledSkin = rng.weightedPick([0, 1, 2, 3, 4, 5, 6, 7], [2, 3, 3, 2, 2, 2, 1.5, 1])
  const skin = set.skin ?? rolledSkin
  const hair = pickW(rng, skin <= 2
    ? { black: 1.5, darkBrown: 4, brown: 4, lightBrown: 3, blond: 2, platinum: 0.4, ginger: 0.6, auburn: 1 }
    : skin <= 4 ? { black: 4, darkBrown: 4, brown: 2, lightBrown: 0.8 } : { black: 7, darkBrown: 3 })
  return {
    shape: pickW(rng, { oval: 3, round: 2, square: 2, long: 2, heart: 1 }),
    skin,
    hair,
    style: pickW(rng, { buzz: 1, short: 4, side: 3, quiff: 2, curly: skin >= 5 ? 3 : 1, slick: 1.5, messy: 1.5, long: 1, bun: 0.6 }),
    brows: pickW(rng, { straight: 3, arched: 2, angled: 2, thick: 1.5, thin: 1 }),
    eyes: pickW(rng, { almond: 3, round: 2, narrow: 1.5, hooded: 1.5 }),
    eyeColor: pickW(rng, skin >= 3 ? { brown: 4, darkBrown: 4, hazel: 1 } : { brown: 3, blue: 3, green: 1.2, hazel: 1.5, grey: 1 }),
    nose: pickW(rng, { straight: 3, small: 2, wide: 1.5, long: 1.5 }),
    facial: 'none',
    glasses: false,
    recedeAge: rng.chance(0.45) ? rng.int(29, 50) : null,
    greyAge: rng.int(29, 42),
  }
}

export function faceTraits(driver) {
  const set = LOOKS[driver.id] ?? {}
  return { ...rolled(driver.id, set), ...set }
}

const rgb = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
export function mix(a, b, t) {
  const x = rgb(a)
  const y = rgb(b)
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}
const shade = (c, t) => mix(c, '#000000', t)
// A path template with its numbers rounded.
const p = (strs, ...v) => strs.reduce((a, s, i) => a + s + (i < v.length ? +v[i].toFixed(2) : ''), '')

const X = 50
const TOP = 19
const CHEEK = 46
const EYE = 45

// The shapes that draw a face: paths ({ d, fill, stroke, w, o }) and
// ellipses ({ e: [cx, cy, rx, ry], fill }), back to front.
export function faceParts(t, { age = 25, mood = 0, suit = '#8b93a3' } = {}) {
  const out = []
  const P = (d, fill, extra = {}) => out.push({ d, fill, ...extra })
  const E = (cx, cy, rx, ry, fill, extra = {}) => out.push({ e: [cx, cy, rx, ry], fill, ...extra })
  const line = (d, stroke, w, o = 1) => P(d, 'none', { stroke, w, o })

  const s = SHAPES[t.shape] ?? SHAPES.oval
  const { wc, wj, wch, jaw, chin } = s
  const L = X - wc
  const R = X + wc
  const mid = jaw + (chin - jaw) * 0.55
  const skin = SKIN[clamp(t.skin ?? 2, 0, SKIN.length - 1)]
  const skinShade = shade(skin, 0.14)
  const lineCol = shade(skin, 0.32)
  const grey = clamp((age - (t.greyAge ?? 34)) / 14, 0, 1)
  const base = HAIR[t.hair] ?? HAIR.brown
  const hairCol = mix(base, '#b8b8b8', grey * 0.8)
  const browCol = mix(['blond', 'platinum', 'ginger'].includes(t.hair) ? shade(base, 0.3) : shade(base, 0.08), '#9a9a9a', grey * 0.35)
  const facialCol = mix(shade(base, 0.1), '#c4c4c4', Math.min(1, grey * 1.2))
  const nose = NOSES[t.nose] ?? NOSES.straight
  const ny = nose.y
  const my = ny + (chin - ny) * 0.42
  const mw = 5.2
  const m = clamp(mood, -1, 1)

  // The hairstyle at this age: hairlines recede, and some go altogether.
  let style = HAIRDO[t.style] === undefined ? 'short' : t.style
  let recede = 0
  if (style === 'receding') recede = t.recedeAge != null ? clamp(3 + (age - t.recedeAge) * 0.4, 3, 7) : 4.5
  else if (RECEDES.has(style) && t.recedeAge != null && age >= t.recedeAge) {
    if (age >= t.recedeAge + 14) style = 'bald'
    else recede = clamp(1.5 + (age - t.recedeAge) * 0.45, 1.5, 6)
  }
  const h = HAIRDO[style]

  // Shoulders in the team's race suit, with its collar.
  P(p`M2,100 C4,84 24,77.5 ${X},77.5 C76,77.5 96,84 98,100 Z`, suit)
  if (style === 'long') P(p`M${L - 4},38 C${L - 6.5},60 ${L - 6},80 ${L + 1},85 L${R - 1},85 C${R + 6},80 ${R + 6.5},60 ${R + 4},38 Z`, hairCol)
  P(p`M${X - 9.5},56 L${X - 9.5},82 L${X + 9.5},82 L${X + 9.5},56 Z`, skinShade)
  P(p`M${X - 12},75.5 Q${X},80.5 ${X + 12},75.5 L${X + 12.5},82 Q${X},87.5 ${X - 12.5},82 Z`, shade(suit, 0.35))
  line(p`M${X},84.8 L${X},100`, shade(suit, 0.3), 0.8)
  line(p`M12,100 C16,89 26,84.5 36,83`, mix(suit, '#ffffff', 0.35), 1.6, 0.5)

  // Ears, then the head.
  for (const sg of [-1, 1]) {
    E(X + sg * (wc + 0.3), 47, 3.3, 5.6, skin)
    line(p`M${X + sg * (wc + 1.6)},44.5 Q${X + sg * (wc + 2.4)},47.5 ${X + sg * (wc + 1)},50`, skinShade, 0.8)
  }
  P(p`M${X},${TOP} C${X + wc * 0.62},${TOP} ${R},${TOP + 9} ${R},${CHEEK}` +
    p` C${R},${CHEEK + 7} ${X + wj + 1},${jaw - 5} ${X + wj},${jaw}` +
    p` C${X + wj - 1},${mid} ${X + wch * 1.3},${chin} ${X},${chin}` +
    p` C${X - wch * 1.3},${chin} ${X - wj + 1},${mid} ${X - wj},${jaw}` +
    p` C${X - wj - 1},${jaw - 5} ${L},${CHEEK + 7} ${L},${CHEEK}` +
    p` C${L},${TOP + 9} ${X - wc * 0.62},${TOP} ${X},${TOP} Z`, skin)

  // Lines with age.
  if (age >= 35) line(p`M${X - 6},31.5 Q${X},30.6 ${X + 6},31.5`, lineCol, 0.6, 0.5)
  if (age >= 41) {
    line(p`M${X - 4},33.6 Q${X},32.9 ${X + 4},33.6`, lineCol, 0.55, 0.45)
    for (const sg of [-1, 1]) {
      line(p`M${X + sg * 11.4},44 L${X + sg * 13},43.1 M${X + sg * 11.4},45.6 L${X + sg * 13},46.2`, lineCol, 0.5, 0.5)
      line(p`M${X + sg * (nose.w + 1.4)},${ny - 1.5} Q${X + sg * (nose.w + 3.2)},${my - 2} ${X + sg * (mw + 0.6)},${my + 0.5}`, lineCol, 0.6, 0.45)
    }
  }

  // A beard or stubble over the lower face, from the sideburns round the chin.
  const lowerFace = p`M${R},${CHEEK} C${R},${CHEEK + 7} ${X + wj + 1},${jaw - 5} ${X + wj},${jaw}` +
    p` C${X + wj - 1},${mid} ${X + wch * 1.3},${chin} ${X},${chin}` +
    p` C${X - wch * 1.3},${chin} ${X - wj + 1},${mid} ${X - wj},${jaw}` +
    p` C${X - wj - 1},${jaw - 5} ${L},${CHEEK + 7} ${L},${CHEEK}` +
    p` C${L + 3},${ny + 1} ${X - 6},${ny + 0.5} ${X - 2.5},${ny + 1.2} L${X + 2.5},${ny + 1.2} C${X + 6},${ny + 0.5} ${R - 3},${ny + 1} ${R},${CHEEK} Z`
  if (t.facial === 'stubble') P(lowerFace, mix(shade(base, 0.3), '#5a6470', 0.3), { o: 0.3 })
  if (t.facial === 'short') P(lowerFace, facialCol, { o: 0.75 })
  if (t.facial === 'beard') P(lowerFace, facialCol)
  if (t.facial === 'goatee') P(p`M${X - 4.2},${my + 2} C${X - 4.6},${chin - 0.5} ${X + 4.6},${chin - 0.5} ${X + 4.2},${my + 2} Q${X},${my + 3.4} ${X - 4.2},${my + 2} Z`, facialCol)

  // Nose.
  line(p`M${X - 1.2},47 Q${X - 1.8},${ny - 2} ${X - nose.w},${ny - 0.6} Q${X},${ny + 1.3} ${X + nose.w},${ny - 0.6}`, shade(skin, 0.28), 0.9)

  // Eyes: narrower when smiling.
  const ry = (EYES[t.eyes] ?? EYES.almond) * (1 - 0.22 * Math.max(0, m - 0.3))
  const iris = EYE_COLORS[t.eyeColor] ?? EYE_COLORS.brown
  for (const sg of [-1, 1]) {
    const ex = X + sg * 7.2
    E(ex, EYE, 3.3, ry, '#f4f1ec')
    E(ex, EYE + 0.1, 1.6, Math.min(1.6, ry), iris)
    E(ex, EYE + 0.1, 0.75, Math.min(0.75, ry * 0.6), '#151313')
    E(ex + 0.5, EYE - 0.45, 0.35, 0.35, '#ffffff', { o: 0.85 })
    line(p`M${ex - 3.6},${EYE + 0.2} C${ex - 2},${EYE - ry * 1.35} ${ex + 2},${EYE - ry * 1.35} ${ex + 3.6},${EYE + 0.2}`, shade(skin, 0.55), t.eyes === 'hooded' ? 1.3 : 0.9)
    if (t.eyes === 'hooded') line(p`M${ex - 3},${EYE - ry - 1.1} Q${ex},${EYE - ry - 2} ${ex + 3},${EYE - ry - 1.1}`, lineCol, 0.6, 0.6)
  }

  // Brows: the inner ends drop when angry and lift when pleased.
  const by = 39.6 - 0.7 * Math.max(0, m)
  const arch = BROWS[t.brows] ?? BROWS.straight
  const bw = t.brows === 'thick' ? 2.3 : t.brows === 'thin' ? 1 : 1.6
  for (const sg of [-1, 1]) {
    const ix = X + sg * 3.4
    const iy = by + Math.max(0, -m) * 1.7 - Math.max(0, m) * 0.4
    const ox = X + sg * 10.8
    const d = t.brows === 'angled'
      ? p`M${ix},${iy} L${X + sg * 8.2},${by - arch} L${ox},${by + 0.8}`
      : p`M${ix},${iy} Q${X + sg * 7.4},${by - arch} ${ox},${by + 0.6}`
    line(d, browCol, bw)
  }

  // Mouth: a smile opens when delighted.
  const lip = mix(shade(skin, 0.25), '#a0404a', 0.25)
  if (t.facial === 'beard' || t.facial === 'short') E(X, my + 0.6, mw - 0.5, 1.6, mix(skin, lip, 0.5))
  if (m > 0.45) {
    P(p`M${X - mw},${my - 1} Q${X},${my + 0.6} ${X + mw},${my - 1} Q${X},${my + 2.6 + 2 * m} ${X - mw},${my - 1} Z`, '#6e2a2c')
    P(p`M${X - mw + 0.9},${my - 0.6} Q${X},${my + 0.7} ${X + mw - 0.9},${my - 0.6} Q${X},${my + 1.7} ${X - mw + 0.9},${my - 0.6} Z`, '#f6f3ee')
  } else {
    line(p`M${X - mw},${my - m * 1.4} Q${X},${my + m * 3.2} ${X + mw},${my - m * 1.4}`, lip, 1.1)
    line(p`M${X - 2},${my + 2.5} Q${X},${my + 3.1} ${X + 2},${my + 2.5}`, shade(skin, 0.2), 0.7, 0.5)
  }
  if (t.facial === 'moustache' || t.facial === 'goatee' || t.facial === 'beard' || t.facial === 'short') {
    P(p`M${X - mw - 0.5},${my - 0.4} C${X - mw},${my - 3.6} ${X - 1},${my - 4} ${X},${my - 3} C${X + 1},${my - 4} ${X + mw},${my - 3.6} ${X + mw + 0.5},${my - 0.4} C${X + 2},${my - 2} ${X - 2},${my - 2} ${X - mw - 0.5},${my - 0.4} Z`, facialCol, t.facial === 'short' ? { o: 0.8 } : {})
  }

  // Hair.
  if (h) {
    const o = h.o
    const hl = h.hl - recede * 0.5
    const ty = hl + 3 - recede * 0.9 // the temples
    // How far out the temples sit at that height: the head narrows towards the top.
    const tx = (wc - 2) * Math.sqrt(1 - Math.min(0.95, ((CHEEK - ty) / (CHEEK - TOP)) ** 2))
    const side = h.side
    const extra = h.op ? { o: h.op } : {}
    if (style === 'bun') E(X, TOP - o - 3.6, 6, 5, hairCol)
    let d = p`M${L - o},${side} C${L - o},${TOP + 9 - o * 0.6} ${X - (wc + o) * 0.62},${TOP - o} ${X},${TOP - o}` +
      p` C${X + (wc + o) * 0.62},${TOP - o} ${R + o},${TOP + 9 - o * 0.6} ${R + o},${side} L${R - 1.2},${side} L${X + Math.min(wc - 2, tx + 2)},${ty}`
    const lt = X - Math.min(wc - 2, tx + 2)
    if (h.fringe === 'swept') d += p` C${X + 3},${ty + 1.5} ${X - 7},${hl - 2.5} ${lt},${ty - 1}`
    else if (h.fringe === 'parted') d += p` C${R - 5},${hl - 1} ${X + 3},${hl - 2} ${X},${hl - 1.2} C${X - 3},${hl - 2} ${L + 5},${hl - 1} ${lt},${ty}`
    else if (h.fringe === 'spiky') {
      for (let i = 1; i <= 7; i++) {
        const x = R - 2 - ((R - L - 4) * i) / 8
        d += p` L${x},${i % 2 ? hl + 2.6 : hl - 1.5}`
      }
      d += p` L${lt},${ty}`
    } else d += p` C${R - 6},${hl - 0.5} ${L + 6},${hl - 0.5} ${lt},${ty}`
    d += p` L${L + 1.2},${side} Z`
    if (style === 'quiff') P(p`M${X - 11},${TOP - o + 4} C${X - 10},${TOP - o - 5} ${X + 10},${TOP - o - 8} ${X + 14},${TOP - o + 2} Z`, hairCol)
    P(d, hairCol, extra)
    if (style === 'curly') {
      const rx = wc + o - 1.4
      const ryc = CHEEK - TOP + o - 1.4
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (1.08 + (0.84 * i) / 10)
        E(X + rx * Math.cos(a), CHEEK + ryc * Math.sin(a), 3.4, 3.4, hairCol)
      }
      for (let i = 0; i < 5; i++) E(L + 5 + ((R - L - 10) * i) / 4, hl + 0.4, 2.3, 2.1, hairCol)
    }
    if (style === 'messy') {
      for (const [x0, lean] of [[-9, -2], [-2, 1], [5, 3]]) P(p`M${X + x0 - 3},${TOP - o + 1.5} L${X + x0 + lean},${TOP - o - 3.5} L${X + x0 + 3},${TOP - o + 1}`, hairCol)
    }
    if (style === 'slick') line(p`M${X - 9},${TOP - o + 3.5} Q${X},${TOP - o + 0.5} ${X + 9},${TOP - o + 3.5}`, mix(hairCol, '#ffffff', 0.3), 1.1, 0.6)
    if (style === 'side') line(p`M${X - 6},${TOP - o + 1.5} L${X - 7.5},${hl - 1}`, shade(hairCol, 0.4), 0.7)
  } else {
    // Bald on top: what is left at the sides.
    for (const sg of [-1, 1]) {
      P(p`M${X + sg * (wc + 1.2)},45 C${X + sg * (wc + 1.4)},38 ${X + sg * (wc + 0.6)},33 ${X + sg * (wc - 1)},31 L${X + sg * (wc - 2.4)},34 L${X + sg * (wc - 1.4)},45 Z`, mix(hairCol, '#cfcfcf', grey * 0.6), { o: 0.85 })
    }
  }

  // Glasses.
  if (t.glasses) {
    for (const sg of [-1, 1]) {
      const ex = X + sg * 7.2
      P(p`M${ex - 4.6},${EYE - 3.2} H${ex + 4.6} V${EYE + 3.2} H${ex - 4.6} Z`, 'rgba(255,255,255,0.08)', { stroke: '#222', w: 1 })
      line(p`M${X + sg * 11.8},${EYE - 1.5} L${X + sg * (wc + 0.5)},${EYE - 2}`, '#222', 0.9)
    }
    line(p`M${X - 2.6},${EYE - 0.8} Q${X},${EYE - 2} ${X + 2.6},${EYE - 0.8}`, '#222', 0.9)
  }
  return out
}
