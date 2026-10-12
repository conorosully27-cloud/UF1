// Drivers as of October 2026. Age is at the start of the 2027 season.
// Columns: pace, racecraft, consistency, wet, feedback, marketability.
// `potential` is the hidden ceiling for younger drivers.
// `pull` is sponsor pull (0-3) and `seat` is 'none' (no top-level race seat)
// or 'other' (settled in another top-level series); both are game values.

const d = (id, name, team, age, pace, racecraft, consistency, wet, feedback, marketability, extra = {}) => ({
  id, name, team, age, pace, racecraft, consistency, wet, feedback, marketability,
  potential: null, pull: 0, seat: 'none', loanFrom: null, ...extra,
})

export const RACE_DRIVERS = [
  d('verstappen', 'Max Verstappen', 'redbull', 29, 98, 97, 95, 98, 92, 95),
  d('hadjar', 'Isack Hadjar', 'redbull', 22, 88, 83, 82, 82, 78, 74, { potential: 93 }),
  d('russell', 'George Russell', 'mercedes', 29, 94, 89, 91, 88, 90, 82),
  d('antonelli', 'Kimi Antonelli', 'mercedes', 20, 95, 88, 84, 86, 80, 88, { potential: 98 }),
  d('norris', 'Lando Norris', 'mclaren', 27, 95, 90, 88, 90, 88, 92),
  d('piastri', 'Oscar Piastri', 'mclaren', 25, 93, 91, 90, 84, 85, 84, { potential: 94 }),
  d('leclerc', 'Charles Leclerc', 'ferrari', 29, 96, 90, 86, 86, 88, 93),
  d('hamilton', 'Lewis Hamilton', 'ferrari', 42, 91, 94, 90, 96, 94, 99),
  d('lawson', 'Liam Lawson', 'racingbulls', 25, 85, 85, 81, 80, 78, 72, { potential: 87 }),
  d('lindblad', 'Arvid Lindblad', 'racingbulls', 19, 82, 79, 76, 78, 72, 72, { potential: 92 }),
  d('gasly', 'Pierre Gasly', 'alpine', 31, 88, 86, 86, 88, 85, 78),
  d('colapinto', 'Franco Colapinto', 'alpine', 23, 81, 80, 74, 76, 74, 86, { potential: 86 }),
  d('ocon', 'Esteban Ocon', 'haas', 30, 84, 84, 84, 87, 82, 72),
  d('bearman', 'Oliver Bearman', 'haas', 21, 87, 84, 78, 80, 78, 76, { potential: 93 }),
  d('hulkenberg', 'Nico Hülkenberg', 'audi', 39, 86, 84, 88, 89, 90, 74),
  d('bortoleto', 'Gabriel Bortoleto', 'audi', 22, 85, 81, 82, 78, 80, 74, { potential: 91 }),
  d('sainz', 'Carlos Sainz', 'williams', 32, 89, 88, 89, 88, 95, 84),
  d('albon', 'Alexander Albon', 'williams', 30, 86, 86, 87, 82, 86, 78),
  d('alonso', 'Fernando Alonso', 'aston', 45, 88, 95, 92, 92, 97, 90),
  d('stroll', 'Lance Stroll', 'aston', 28, 78, 79, 76, 86, 74, 70),
  d('perez', 'Sergio Pérez', 'cadillac', 37, 80, 88, 82, 80, 86, 88),
  d('bottas', 'Valtteri Bottas', 'cadillac', 37, 82, 79, 86, 78, 90, 76),
]

export const POOL_DRIVERS = [
  d('tsunoda', 'Yuki Tsunoda', null, 26, 85, 82, 80, 80, 80, 80, { pull: 0.5 }),
  d('oward', "Pato O'Ward", null, 27, 82, 84, 78, 82, 78, 86, { pull: 1.0, seat: 'other' }),
  d('zhou', 'Zhou Guanyu', null, 27, 79, 78, 84, 76, 80, 82, { pull: 2.3 }),
  d('herta', 'Colton Herta', null, 26, 80, 80, 74, 76, 76, 80, { pull: 1.7 }),
  d('drugovich', 'Felipe Drugovich', null, 26, 79, 77, 80, 76, 78, 68, { pull: 2.5, seat: 'other' }),
  d('magnussen', 'Kevin Magnussen', null, 34, 78, 80, 76, 78, 82, 70, { seat: 'other' }),
  d('fornaroli', 'Leonardo Fornaroli', null, 22, 79, 76, 82, 74, 76, 62, { potential: 87, pull: 0.5, loanFrom: 'mclaren' }),
  d('camara', 'Rafael Câmara', null, 21, 80, 76, 76, 76, 72, 66, { potential: 91, loanFrom: 'ferrari' }),
  d('schumacher', 'Mick Schumacher', null, 27, 78, 76, 76, 78, 78, 90, { pull: 0.8, seat: 'other' }),
  d('dunne', 'Alex Dunne', null, 21, 80, 76, 68, 82, 70, 70, { potential: 90, pull: 0.5 }),
  d('browning', 'Luke Browning', null, 25, 78, 76, 75, 78, 74, 62, { potential: 84, loanFrom: 'williams' }),
  d('tsolov', 'Nikola Tsolov', null, 20, 79, 77, 72, 74, 70, 64, { potential: 90, loanFrom: 'redbull' }),
  d('doohan', 'Jack Doohan', null, 24, 78, 75, 72, 74, 72, 70, { potential: 82, pull: 2.0 }),
  d('crawford', 'Jak Crawford', null, 21, 77, 75, 74, 72, 72, 68, { potential: 86, pull: 0.5, loanFrom: 'aston' }),
  d('aron', 'Paul Aron', null, 23, 78, 75, 74, 74, 74, 60, { potential: 84, loanFrom: 'alpine' }),
  d('iwasa', 'Ayumu Iwasa', null, 25, 78, 76, 77, 76, 76, 66, { potential: 82, pull: 1.2 }),
  d('vesti', 'Frederik Vesti', null, 25, 77, 75, 78, 74, 80, 60, { potential: 81, loanFrom: 'mercedes' }),
  d('sargeant', 'Logan Sargeant', null, 26, 75, 72, 68, 70, 70, 66, { pull: 2.2, seat: 'other' }),
]

export function overall(dr) {
  return Math.round(0.4 * dr.pace + 0.25 * dr.racecraft + 0.2 * dr.consistency + 0.15 * dr.wet)
}
