// The player's organisation: facilities, departments and key staff, and what
// they produce (race operations quality and engineering capacity).

export const FACILITIES = {
  designOffice: { name: 'Design Office', start: 1, effect: 'Engineer headcount cap; Mechanical Design skill' },
  cfd: { name: 'CFD Cluster', start: 1, effect: 'Aero capacity multiplier' },
  windTunnel: { name: 'Wind Tunnel', start: 0, effect: 'Narrows upgrade outcomes; Aero skill. Level 0 is a rented tunnel' },
  factory: { name: 'Factory', start: 1, effect: 'Manufacturing headcount cap and skill; build cost' },
  simulator: { name: 'Simulator', start: 0, effect: 'Setup quality' },
  raceOps: { name: 'Race Operations', start: 1, effect: 'Strategy, pit stops; Race Team headcount cap and skill' },
  commercial: { name: 'Commercial Centre', start: 1, effect: 'Sponsor slots, merchandise; Commercial headcount cap and skill' },
  academy: { name: 'Academy', start: 0, effect: 'Takes on junior drivers; better juniors at higher levels' },
}

export const FACILITY_COST = [3, 6, 12, 22, 38] // £m to reach level 1..5
export const FACILITY_TIME = [3, 4, 6, 8, 10] // rounds to reach level 1..5
export const MAX_BUILDS = 2
export const TUNNEL_RENT = 0.15 // £m per round while the Wind Tunnel is level 0
export const ACADEMY_COST = 0.3 // £m a season for each junior in the academy

export const DEPTS = {
  aero: { name: 'Aero', facility: 'windTunnel', start: 30 },
  mech: { name: 'Mechanical Design', facility: 'designOffice', start: 30 },
  manufacturing: { name: 'Manufacturing', facility: 'factory', start: 45 },
  raceTeam: { name: 'Race Team', facility: 'raceOps', start: 40 },
  commercial: { name: 'Commercial', facility: 'commercial', start: 15 },
}

export const ROLES = {
  technicalDirector: 'Technical Director',
  headOfAero: 'Head of Aero',
  chiefStrategist: 'Chief Strategist',
  raceEngineer1: 'Race Engineer (car 1)',
  raceEngineer2: 'Race Engineer (car 2)',
  commercialDirector: 'Commercial Director',
}

const ENGINEER_CAP = [40, 60, 100, 160, 240, 340] // Aero + Mechanical Design, by Design Office level
const FACTORY_CAP = [30, 50, 80, 130, 200, 280]
const RACE_CAP = [30, 45, 60, 80, 100, 120]
const COMMERCIAL_CAP = [10, 18, 30, 50, 75, 100]
const CFD_MULT = [0.9, 1.0, 1.12, 1.25, 1.4, 1.55]

export const HEAD_COST = 0.08 // £m per head per season at skill 50 on market pay
export const PAY = { low: { cost: 0.9, skill: -5 }, market: { cost: 1.0, skill: 0 }, premium: { cost: 1.2, skill: 8 } }

const FIRST = ['Marco', 'Elena', 'James', 'Sofia', 'Luca', 'Hannah', 'Pierre', 'Aiko', 'Tom', 'Ines', 'Rafael', 'Greta', 'Daniel', 'Priya', 'Mateo', 'Clara', 'Jonas', 'Nadia', 'Ben', 'Yara']
const LAST = ['Bianchi', 'Hartmann', 'Okafor', 'Laurent', 'Sato', 'Whitfield', 'Moreno', 'Lindqvist', 'Castellano', 'Brennan', 'Novak', 'Delacroix', 'Fischer', 'Tanaka', 'Marsh', 'Rossetti', 'Vance', 'Kowalski', 'Ashby', 'Ferreira']

export function staffName(rng) {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`
}

export function keyStaffSalary(rating) {
  return 0.25 + Math.pow(Math.max(0, rating - 40) / 10, 2.4) * 0.06
}

export function initialOrg(rng) {
  const facilities = {}
  for (const [id, f] of Object.entries(FACILITIES)) facilities[id] = { level: f.start, building: null }
  const staff = {}
  for (const [id, dpt] of Object.entries(DEPTS)) staff[id] = { heads: dpt.start, skill: 50, pay: 'market', incoming: [] }
  const keyStaff = {}
  for (const role of Object.keys(ROLES)) {
    const rating = rng.int(45, 60)
    keyStaff[role] = { name: staffName(rng), rating, salary: keyStaffSalary(rating) }
  }
  return { facilities, staff, keyStaff }
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

export function headcountCap(org, dept) {
  const f = org.facilities
  if (dept === 'aero' || dept === 'mech') return ENGINEER_CAP[f.designOffice.level]
  if (dept === 'manufacturing') return FACTORY_CAP[f.factory.level]
  if (dept === 'raceTeam') return RACE_CAP[f.raceOps.level]
  return COMMERCIAL_CAP[f.commercial.level]
}

export function engineerCount(org) {
  const inc = (d) => org.staff[d].heads + org.staff[d].incoming.reduce((s, x) => s + x.heads, 0)
  return inc('aero') + inc('mech')
}

export function cfdMultiplier(org) {
  return CFD_MULT[org.facilities.cfd.level]
}

// Skill each department drifts towards: its facility, its pay level and the
// relevant key staff member.
export function skillTarget(org, dept) {
  const def = DEPTS[dept]
  const base = FACILITIES[def.facility].start
  const lead = { aero: 'headOfAero', mech: 'technicalDirector', manufacturing: 'technicalDirector', raceTeam: 'chiefStrategist', commercial: 'commercialDirector' }[dept]
  const leadBonus = (org.keyStaff[lead].rating - 50) / 6
  return clamp(50 + 7 * (org.facilities[def.facility].level - base) + PAY[org.staff[dept].pay].skill + leadBonus, 20, 99)
}

// Pit crew, strategy and setup quality for the race simulation.
export function playerOps(org) {
  const f = org.facilities
  const k = org.keyStaff
  return {
    pit: clamp(0.75 * org.staff.raceTeam.skill + 5 * f.raceOps.level + 5, 0, 100),
    strategy: clamp(0.7 * k.chiefStrategist.rating + 6 * f.raceOps.level, 0, 100),
    setup: clamp(0.25 * (k.raceEngineer1.rating + k.raceEngineer2.rating) + 8 * f.simulator.level + 15, 0, 100),
  }
}

export function facilityUpkeep(org) {
  let cumulative = 0
  for (const f of Object.values(org.facilities)) for (let l = 0; l < f.level; l++) cumulative += FACILITY_COST[l]
  return cumulative * 0.06 // £m per season
}
