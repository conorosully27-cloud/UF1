// Driver salary, interest and backing formulas (design section 5.6).
// `signingTerms` is the simple list used for the starting line-up, where a
// driver whose interest falls short of 60 can be signed by paying over their
// demand. Later signings go through the market in people.js.

import { overall } from './data/drivers.js'
import { streamRng } from './rng.js'

const SALARY_KNOTS = [[75, 0.5], [80, 1.5], [85, 5], [90, 15], [95, 35]]

export function baseSalary(ovr) {
  if (ovr <= 75) return Math.max(0.15, 0.5 * Math.pow(0.8, 75 - ovr))
  if (ovr >= 95) return 35 * Math.pow(1.15, ovr - 95)
  for (let i = 0; i < SALARY_KNOTS.length - 1; i++) {
    const [x0, y0] = SALARY_KNOTS[i]
    const [x1, y1] = SALARY_KNOTS[i + 1]
    if (ovr <= x1) {
      const f = (ovr - x0) / (x1 - x0)
      return Math.exp(Math.log(y0) + f * (Math.log(y1) - Math.log(y0)))
    }
  }
  return 35
}

export function salaryDemand(driver, seed, season) {
  const personal = streamRng(seed, 'salary', driver.id, season).range(0.85, 1.15)
  return baseSalary(overall(driver)) * personal
}

export function ambition(driver) {
  return Math.max(0, 2.5 * (overall(driver) - 70) - 2 * Math.max(0, driver.age - 30))
}

// Interest before the offer and the hidden personal factor. 60 signs.
export function baseInterest(driver, reputation) {
  const appeal = Math.max(-25, Math.min(25, (reputation - ambition(driver)) / 2))
  const hunger = driver.seat === 'other' ? 5 : 15
  return Math.round(50 + appeal + hunger)
}

export function backingBase(driver) {
  return Math.max(0, driver.marketability - 60) * 0.2 * (driver.pull || 0)
}

export function backingRoll(driver, seed, season) {
  return backingBase(driver) * streamRng(seed, 'backing', driver.id, season).range(0.7, 1.3)
}

// Terms the player would have to meet to sign this driver right now.
export function signingTerms(driver, reputation, seed, season) {
  const demand = salaryDemand(driver, seed, season)
  const interest = baseInterest(driver, reputation)
  const shortfall = Math.max(0, 60 - interest)
  const loan = !!driver.loanFrom
  // Each point of interest short of 60 costs 5% over the demand, up to +100%.
  const premium = 1 + 0.05 * shortfall
  const salary = (loan ? 0.4 : 1) * demand * premium
  const base = backingBase(driver)
  return {
    demand, interest, loan, premium, salary,
    possible: shortfall <= 20,
    backingLow: base * 0.7,
    backingHigh: base * 1.3,
    backing: backingRoll(driver, seed, season),
  }
}
