// The team's look (VISUALS.md, V5): the livery's second colour and the
// badge, kept apart from the drawing so the checks can run it.

import { secondColor } from './format.js'

export const BADGE_SHAPES = {
  shield: 'M50 4 L92 16 V46 C92 72 74 88 50 96 C26 88 8 72 8 46 V16 Z',
  roundel: 'M50 4 A46 46 0 1 1 49.9 4 Z',
  hexagon: 'M50 4 L90 27 V73 L50 96 L10 73 V27 Z',
  arrow: 'M50 4 L94 50 L50 96 L6 50 Z',
}
export const LIVERY_ACCENTS = ['#ffffff', '#111318', '#ffd23f', '#00d1ff', '#b48cff', '#3ddc84', '#ff4fa3', '#ff9f1c', '#c0c4cc']

// The livery's two colours: the team colour and its second colour.
export function livery(team) {
  const accent = team.livery?.accent ?? secondColor(team.color)
  return { color: team.color, accent, badge: team.livery?.badge ?? 'shield' }
}

export function initials(name) {
  const words = name.trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w))
  if (!words.length) return '?'
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase()
}
