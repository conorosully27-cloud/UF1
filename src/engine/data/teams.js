// The 11 real teams as they stood in October 2026. Ratings are judgement
// calls, not conversions of championship points. `reliability` is the team's
// own build quality; the power unit's reliability is blended in at race time.
// `ops` covers pit crew, strategy and setup work. `patience` (0-1) is how long
// a team sticks with a driver who is not delivering; `family` links sister teams;
// `color` is the team's colour on screen.
export const TEAMS = [
  { id: 'mercedes', color: '#27f4d2', patience: 0.6, name: 'Mercedes', supplier: 'mercedes', works: true, car: { aero: 93, chassis: 92, reliability: 90, tyreCare: 86 }, ops: { pit: 90, strategy: 88, setup: 92 } },
  { id: 'mclaren', color: '#ff8000', patience: 0.7, name: 'McLaren', supplier: 'mercedes', works: false, car: { aero: 91, chassis: 90, reliability: 88, tyreCare: 90 }, ops: { pit: 93, strategy: 85, setup: 90 } },
  { id: 'ferrari', color: '#e8002d', patience: 0.5, name: 'Ferrari', supplier: 'ferrari', works: true, car: { aero: 93, chassis: 91, reliability: 86, tyreCare: 88 }, ops: { pit: 88, strategy: 74, setup: 90 } },
  { id: 'redbull', color: '#3671c6', patience: 0.15, family: 'redbull', name: 'Red Bull', supplier: 'rbf', works: true, car: { aero: 88, chassis: 88, reliability: 83, tyreCare: 84 }, ops: { pit: 95, strategy: 90, setup: 90 } },
  { id: 'racingbulls', color: '#6692ff', patience: 0.3, family: 'redbull', name: 'Racing Bulls', supplier: 'rbf', works: false, car: { aero: 78, chassis: 80, reliability: 82, tyreCare: 78 }, ops: { pit: 84, strategy: 80, setup: 84 } },
  { id: 'alpine', color: '#ff87bc', patience: 0.4, name: 'Alpine', supplier: 'mercedes', works: false, car: { aero: 76, chassis: 74, reliability: 82, tyreCare: 74 }, ops: { pit: 76, strategy: 72, setup: 78 } },
  { id: 'haas', color: '#b6babd', patience: 0.5, name: 'Haas', supplier: 'ferrari', works: false, car: { aero: 73, chassis: 74, reliability: 82, tyreCare: 74 }, ops: { pit: 74, strategy: 78, setup: 78 } },
  { id: 'audi', color: '#c8a27a', patience: 0.6, name: 'Audi', supplier: 'audi', works: true, car: { aero: 72, chassis: 73, reliability: 76, tyreCare: 76 }, ops: { pit: 80, strategy: 76, setup: 78 } },
  { id: 'williams', color: '#1868db', patience: 0.9, name: 'Williams', supplier: 'mercedes', works: false, car: { aero: 68, chassis: 66, reliability: 80, tyreCare: 70 }, ops: { pit: 78, strategy: 80, setup: 82 } },
  { id: 'aston', color: '#229971', patience: 0.6, name: 'Aston Martin', supplier: 'honda', works: true, car: { aero: 70, chassis: 62, reliability: 70, tyreCare: 68 }, ops: { pit: 78, strategy: 75, setup: 78 } },
  { id: 'cadillac', color: '#d4af37', patience: 0.6, name: 'Cadillac', supplier: 'ferrari', works: false, car: { aero: 58, chassis: 60, reliability: 74, tyreCare: 64 }, ops: { pit: 68, strategy: 68, setup: 70 } },
]

export const PLAYER_START_CAR = { aero: 53, chassis: 55, reliability: 60, tyreCare: 55 }

// Colours the player can pick for a new team.
export const PLAYER_COLORS = ['#ff5a36', '#00d1ff', '#b48cff', '#3ddc84', '#ffd23f', '#ff4fa3', '#f2f2f2', '#ff9f1c']
