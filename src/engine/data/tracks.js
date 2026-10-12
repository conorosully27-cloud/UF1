// The 16-round calendar. `w` is the Aero/Chassis/Power weighting (sums to 1).
// `overtaking` runs from 0 (easy) to 1 (very hard). `sc` is the chance of a
// safety car that is not caused by a modelled incident. `rain` is the chance
// the race is wet or mixed. `lap1` is the chance of a first-lap incident.
// `baseLap` is a notional perfect lap in seconds, used only for display.
export const TRACKS = [
  { id: 'melbourne', name: 'Melbourne', country: 'Australia', type: 'balanced', laps: 58, baseLap: 78.0, w: { aero: 0.40, chassis: 0.35, power: 0.25 }, overtaking: 0.55, sc: 0.45, rain: 0.12, lap1: 0.35 },
  { id: 'suzuka', name: 'Suzuka', country: 'Japan', type: 'downforce', laps: 53, baseLap: 88.0, w: { aero: 0.50, chassis: 0.35, power: 0.15 }, overtaking: 0.65, sc: 0.30, rain: 0.15, lap1: 0.25 },
  { id: 'miami', name: 'Miami', country: 'USA', type: 'balanced', laps: 57, baseLap: 87.0, w: { aero: 0.40, chassis: 0.35, power: 0.25 }, overtaking: 0.45, sc: 0.40, rain: 0.12, lap1: 0.30 },
  { id: 'monaco', name: 'Monaco', country: 'Monaco', type: 'downforce', laps: 78, baseLap: 70.0, w: { aero: 0.45, chassis: 0.50, power: 0.05 }, overtaking: 1.0, sc: 0.45, rain: 0.12, lap1: 0.25 },
  { id: 'montreal', name: 'Montreal', country: 'Canada', type: 'power', laps: 70, baseLap: 71.0, w: { aero: 0.25, chassis: 0.35, power: 0.40 }, overtaking: 0.35, sc: 0.55, rain: 0.20, lap1: 0.30 },
  { id: 'barcelona', name: 'Barcelona', country: 'Spain', type: 'downforce', laps: 66, baseLap: 72.0, w: { aero: 0.55, chassis: 0.30, power: 0.15 }, overtaking: 0.60, sc: 0.18, rain: 0.06, lap1: 0.25 },
  { id: 'spielberg', name: 'Spielberg', country: 'Austria', type: 'power', laps: 71, baseLap: 64.5, w: { aero: 0.30, chassis: 0.30, power: 0.40 }, overtaking: 0.30, sc: 0.30, rain: 0.15, lap1: 0.35 },
  { id: 'silverstone', name: 'Silverstone', country: 'Great Britain', type: 'balanced', laps: 52, baseLap: 86.0, w: { aero: 0.45, chassis: 0.30, power: 0.25 }, overtaking: 0.40, sc: 0.40, rain: 0.20, lap1: 0.30 },
  { id: 'spa', name: 'Spa-Francorchamps', country: 'Belgium', type: 'power', laps: 44, baseLap: 103.0, w: { aero: 0.35, chassis: 0.20, power: 0.45 }, overtaking: 0.25, sc: 0.35, rain: 0.25, lap1: 0.35 },
  { id: 'budapest', name: 'Budapest', country: 'Hungary', type: 'downforce', laps: 70, baseLap: 75.5, w: { aero: 0.50, chassis: 0.40, power: 0.10 }, overtaking: 0.75, sc: 0.22, rain: 0.12, lap1: 0.30 },
  { id: 'monza', name: 'Monza', country: 'Italy', type: 'power', laps: 53, baseLap: 79.5, w: { aero: 0.20, chassis: 0.25, power: 0.55 }, overtaking: 0.30, sc: 0.35, rain: 0.10, lap1: 0.35 },
  { id: 'baku', name: 'Baku', country: 'Azerbaijan', type: 'power', laps: 51, baseLap: 101.0, w: { aero: 0.25, chassis: 0.30, power: 0.45 }, overtaking: 0.30, sc: 0.50, rain: 0.02, lap1: 0.30 },
  { id: 'singapore', name: 'Singapore', country: 'Singapore', type: 'downforce', laps: 62, baseLap: 90.0, w: { aero: 0.40, chassis: 0.50, power: 0.10 }, overtaking: 0.80, sc: 0.70, rain: 0.15, lap1: 0.25 },
  { id: 'austin', name: 'Austin', country: 'USA', type: 'balanced', laps: 56, baseLap: 93.0, w: { aero: 0.40, chassis: 0.35, power: 0.25 }, overtaking: 0.40, sc: 0.30, rain: 0.08, lap1: 0.35 },
  { id: 'saopaulo', name: 'São Paulo', country: 'Brazil', type: 'balanced', laps: 71, baseLap: 69.5, w: { aero: 0.35, chassis: 0.35, power: 0.30 }, overtaking: 0.30, sc: 0.50, rain: 0.25, lap1: 0.35 },
  { id: 'abudhabi', name: 'Abu Dhabi', country: 'UAE', type: 'balanced', laps: 58, baseLap: 83.0, w: { aero: 0.40, chassis: 0.35, power: 0.25 }, overtaking: 0.50, sc: 0.25, rain: 0.0, lap1: 0.25 },
]

export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]))

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
