import React, { useState } from 'react'
import { PLAYER, clock } from '../engine/core.js'
import { TIERS, SHAPES, slotTiers, freeSlots, acceptOffer, endDeal } from '../engine/sponsors.js'
import {
  perRound, forecast, merchandise, projectedCapSpend, COST_CAP, OVERDRAFT, prizeThisSeason, ownerFunding, inOverdraft,
} from '../engine/economy.js'
import { plannedSpendPerRound } from '../engine/development.js'
import { changeSupplier, setPartsPackage } from '../engine/game.js'
import { PARTS_PACKAGE_PRICE } from '../engine/data/suppliers.js'
import { money, pct } from './format.js'

const LABELS = {
  prize: 'Prize money', sponsors: 'Sponsor fees', backing: 'Driver backing', merchandise: 'Merchandise', owner: 'Owner funding',
  bonuses: 'Sponsor and target bonuses', other: 'Other', workforce: 'Workforce', keyStaff: 'Key staff', drivers: 'Drivers',
  powerUnit: 'Power unit and parts', raceOps: 'Race operations', carBuild: 'Car build', facilities: 'Facilities', development: 'Development',
  damage: 'Crash damage', interest: 'Loan interest (before borrowing was withdrawn)',
}

export function CommercialTab({ game, act }) {
  const s = game.sponsors
  const now = clock(game)
  return (
    <div>
      <h2>Sponsors</h2>
      <p>Slots at Commercial Centre level {game.org.facilities.commercial.level}: {slotTiers(game).map((t) => TIERS[t].label).join(', ')}. Merchandise is worth about {money(merchandise(game))} a season.</p>
      <div className="scroll">
        <table>
          <thead><tr><th>Sponsor</th><th>Slot</th><th>Deal</th><th className="n">Fee a season</th><th className="n">Bonus</th><th>Target this season</th><th className="n">Seasons left</th><th className="n">Satisfaction</th><th /></tr></thead>
          <tbody>
            {s.deals.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td><td>{TIERS[d.tier].label}</td><td>{SHAPES[d.shape].label}</td><td className="n">{money(d.fee, 2)}</td>
                <td className="n">{d.bonus ? money(d.bonus, 2) : '—'}</td><td>{d.target?.label ?? '—'}</td><td className="n">{d.seasonsLeft}</td><td className="n">{d.satisfaction.toFixed(0)}</td>
                <td><button onClick={() => { if (window.confirm(`End the deal with ${d.name}? There is a buy-out cost.`)) act((g) => endDeal(g, d.id)) }}>End</button></td>
              </tr>
            ))}
            {s.deals.length === 0 && <tr><td colSpan="9" className="muted">No sponsors.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted">A sponsor renews if satisfaction is 50 or more when the deal ends. Meeting the target adds 12, missing it costs 10, and finishing above or below last year's position moves it by 3 a place.</p>

      <h2>Offers</h2>
      {s.offers.length === 0 && <p className="muted">No offers on the table. More arrive as the Commercial department grows.</p>}
      {s.offers.map((o) => {
        const free = freeSlots(game, o.tier) > 0
        return (
          <div className="panel" key={o.id}>
            <b>{o.name}</b> · {TIERS[o.tier].label} · headline value {money(o.value, 2)} a season · {o.seasons} season{o.seasons > 1 ? 's' : ''} ·
            {' '}expires in {o.expires - now} rounds{o.renewal ? ' · renewal' : ''}
            {o.demand > 0 && <> · <span className="bad">wants a driver with Marketability {o.demand}+</span></>}
            {!free && <span className="muted"> · no free {TIERS[o.tier].label.toLowerCase()} slot</span>}
            <table>
              <thead><tr><th>Shape</th><th className="n">Fee</th><th className="n">Bonus</th><th>Target</th><th /></tr></thead>
              <tbody>
                {Object.entries(SHAPES).map(([id, sh]) => (
                  <tr key={id}>
                    <td>{sh.label}</td><td className="n">{money(o.value * sh.fee, 2)}</td><td className="n">{sh.bonus ? money(o.value * sh.bonus, 2) : '—'}</td>
                    <td>{id === 'guaranteed' ? 'None' : o.targets[id].label}</td>
                    <td><button disabled={!free} onClick={() => act((g) => acceptOffer(g, o.id, id))}>Accept</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

// Shown while cash is below zero: what is frozen, and how close the investor is.
export function OverdraftNotice({ game }) {
  const f = game.finance
  const deep = f.cash < OVERDRAFT
  return (
    <div className="err">
      <b>In the red: {money(f.cash, 2)}.</b> No new spending can start until cash is back above zero; running costs carry on, and designers bank their work for free.
      {deep
        ? <> Below {money(OVERDRAFT, 0)}: {f.overdraftRounds >= 1 ? 'still down here after the next race and an investor takes over' : 'two races in a row down here and an investor takes over'}.</>
        : <> Below {money(OVERDRAFT, 0)} after two races in a row brings in an investor.</>}
    </div>
  )
}

export function FinanceTab({ game }) {
  const f = game.finance
  const pr = perRound(game)
  const planned = plannedSpendPerRound(game)
  const sum = (x) => Object.values(x).reduce((t, v) => t + v, 0)
  const ledger = (title, rows, perRoundRows) => (
    <table>
      <thead><tr><th>{title}</th><th className="n">This season so far</th><th className="n">Each round now</th></tr></thead>
      <tbody>
        {Object.keys(rows).map((k) => <tr key={k}><td>{LABELS[k]}</td><td className="n">{money(rows[k], 2)}</td><td className="n">{perRoundRows[k] !== undefined ? money(perRoundRows[k], 2) : '—'}</td></tr>)}
        <tr><th>Total</th><th className="n">{money(sum(rows), 2)}</th><th className="n">{money(sum(perRoundRows), 2)}</th></tr>
      </tbody>
    </table>
  )
  return (
    <div>
      <h2>Finance</h2>
      <p>
        Cash <b>{money(f.cash, 2)}</b> · forecast at season end <b className={forecast(game, planned) < 0 ? 'bad' : ''}>{money(forecast(game, planned), 1)}</b> ·
        recurring net {money(pr.net - planned, 2)} a round{planned > 0 && <> (including {money(planned, 2)} of repeating upgrades)</>}
      </p>
      {inOverdraft(game) && <OverdraftNotice game={game} />}
      <p className="muted">
        The forecast leaves out sponsor bonuses and crash damage. There is no borrowing: cash can dip into an overdraft of up to {money(OVERDRAFT, 0)}, but while
        the team is in the red no new spending can start (upgrades, facilities, hiring, pay rises, buyouts) until cash is back above zero. Two rounds in a row below
        {' '}{money(OVERDRAFT, 0)} brings in an investor, who clears the debt for a permanent 5% of prize money{f.prizeShareLost > 0 ? ` (${pct(f.prizeShareLost)} already signed away)` : ''}.
      </p>
      <p>
        Prize money this season {money(prizeThisSeason(game))} · owner funding {money(ownerFunding(game))} ·
        cost cap: {money(projectedCapSpend(game))} projected of {money(COST_CAP, 0)}
      </p>
      <div className="row">
        <div>{ledger('Income', f.season.income, pr.income)}</div>
        <div>{ledger('Costs', f.season.costs, pr.costs)}</div>
      </div>

      {f.history.length > 0 && (
        <>
          <h3>Past seasons</h3>
          <table>
            <thead><tr><th>Season</th><th className="n">Income</th><th className="n">Costs</th><th className="n">Cost-cap spend</th><th className="n">Cash at end</th></tr></thead>
            <tbody>{f.history.map((h) => <tr key={h.season}><td>{h.season}</td><td className="n">{money(h.totalIncome)}</td><td className="n">{money(h.totalCosts)}</td><td className="n">{money(h.cap)}</td><td className="n">{money(h.cashEnd)}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  )
}

export function TeamTab({ game, act }) {
  const team = game.teams[PLAYER]
  const f = game.org.facilities
  const canInHouse = f.designOffice.level >= 3 && f.factory.level >= 3
  return (
    <div>
      <h2>Team</h2>
      <p>Reputation <b>{game.reputation.toFixed(0)}</b> of 100 · owner confidence <b>{game.confidence.toFixed(0)}</b> of 100</p>

      <p className="muted">Drivers are signed and released on the Drivers tab.</p>

      <h3>Power unit</h3>
      <p>Current supplier: <b>{game.suppliers[team.supplier].name}</b>.</p>
      <table>
        <thead><tr><th>Supplier</th><th className="n">Power as a customer</th><th className="n">Reliability</th><th className="n">Price a season</th><th className="n">Needs reputation</th><th /></tr></thead>
        <tbody>
          {Object.values(game.suppliers).map((s) => (
            <tr key={s.id} className={s.id === team.supplier ? 'me' : ''}>
              <td>{s.name}</td><td className="n">{(s.power - 1).toFixed(1)}</td><td className="n">{s.reliability.toFixed(1)}</td><td className="n">{money(s.price, 0)}</td><td className="n">{s.minReputation || '—'}</td>
              <td>{s.id !== team.supplier && <button disabled={game.phase !== 'preseason' || game.reputation < s.minReputation} onClick={() => act((g) => changeSupplier(g, s.id))}>Switch</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Bought-in parts package ({money(PARTS_PACKAGE_PRICE, 0)} a season): <b>{game.partsPackage ? 'in use' : 'not used, parts made in-house'}</b>.{' '}
        {game.partsPackage
          ? <button disabled={game.phase !== 'preseason' || !canInHouse} onClick={() => act((g) => setPartsPackage(g, false))}>Go in-house</button>
          : <button disabled={game.phase !== 'preseason'} onClick={() => act((g) => setPartsPackage(g, true))}>Buy the package again</button>}
      </p>
      <p className="muted">Supplier ratings and prices drift each winter; weaker suppliers tend to catch up. Prices are per season.</p>
      <p className="muted">The package adds 15% to mechanical design capacity and keeps Chassis from falling below 45, but limits Chassis to 8 below the supplier's own car. Going in-house needs the Design Office and Factory at level 3. Supplier and package changes are made in pre-season.</p>
    </div>
  )
}
