import React from 'react'
import { FACILITIES, FACILITY_COST, FACILITY_TIME, DEPTS, ROLES, PAY, headcountCap, engineerCount, skillTarget, playerOps, facilityUpkeep } from '../engine/org.js'
import { buildFacility, hire, fire, setPay, hireKeyStaff } from '../engine/hq.js'
import { headCost } from '../engine/economy.js'
import { money } from './format.js'
import HqBuilding from './HqBuilding.jsx'

export default function HqTab({ game, act }) {
  const o = game.org
  const ops = playerOps(o)
  const frozen = game.finance.austerity > 0
  return (
    <div>
      {frozen && <div className="err">Austerity: building and hiring are frozen for {game.finance.austerity} more rounds.</div>}
      <h2>Facilities</h2>
      <HqBuilding game={game} />
      <p className="muted">Paid in equal instalments over the build. Two builds can run at once. Upkeep is currently {money(facilityUpkeep(o))} a season.</p>
      <div className="scroll">
        <table>
          <thead><tr><th>Facility</th><th className="n">Level</th><th>Effect</th><th className="n">Next level</th><th className="n">Rounds</th><th /></tr></thead>
          <tbody>
            {Object.entries(FACILITIES).map(([id, def]) => {
              const f = o.facilities[id]
              return (
                <tr key={id}>
                  <td>{def.name}</td><td className="n">{f.level}</td><td>{def.effect}</td>
                  <td className="n">{f.level < 5 ? money(FACILITY_COST[f.level], 0) : '—'}</td>
                  <td className="n">{f.level < 5 ? FACILITY_TIME[f.level] : '—'}</td>
                  <td>{f.building ? `Building: ${f.building.roundsLeft} rounds left` : f.level >= 5 ? 'Maximum' : def.locked ? 'Not yet available' : (
                    <button disabled={frozen} onClick={() => act((g) => buildFacility(g, id))}>Upgrade</button>
                  )}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p>Race operations as they stand: pit crew <b>{ops.pit.toFixed(0)}</b>, strategy <b>{ops.strategy.toFixed(0)}</b>, setup <b>{ops.setup.toFixed(0)}</b> (out of 100; rivals range from about 68 to 95).</p>

      <h2>Departments</h2>
      <p className="muted">Aero and Mechanical Design share the Design Office's room: {engineerCount(o)} of {headcountCap(o, 'aero')} places used. New hires take three rounds to become productive. Redundancy costs a quarter of a year's pay.</p>
      <div className="scroll">
        <table>
          <thead><tr><th>Department</th><th className="n">Staff</th><th className="n">Joining</th><th className="n">Room</th><th className="n">Skill</th><th className="n">Heading for</th><th>Pay</th><th className="n">Cost a season</th><th /></tr></thead>
          <tbody>
            {Object.entries(DEPTS).map(([id, def]) => {
              const d = o.staff[id]
              const joining = d.incoming.reduce((s, x) => s + x.heads, 0)
              const eng = id === 'aero' || id === 'mech'
              const room = headcountCap(o, id) - (eng ? engineerCount(o) : d.heads + joining)
              return (
                <tr key={id}>
                  <td>{def.name}</td><td className="n">{d.heads}</td><td className="n">{joining || ''}</td><td className="n">{room}</td>
                  <td className="n">{d.skill.toFixed(1)}</td><td className="n">{skillTarget(o, id).toFixed(0)}</td>
                  <td><select value={d.pay} onChange={(e) => act((g) => setPay(g, id, e.target.value))}>{Object.keys(PAY).map((p) => <option key={p} value={p}>{p}</option>)}</select></td>
                  <td className="n">{money((d.heads + joining) * headCost(d))}</td>
                  <td>
                    <button disabled={frozen || room < 5} onClick={() => act((g) => hire(g, id, 5))}>+5</button>{' '}
                    <button disabled={frozen || room < 10} onClick={() => act((g) => hire(g, id, 10))}>+10</button>{' '}
                    <button disabled={d.heads < 10} onClick={() => act((g) => fire(g, id, 5))}>−5</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">Skill moves half a point a round towards its target, which rises with the department's facility, its pay level and its head of department.</p>

      <h2>Key staff</h2>
      <table>
        <thead><tr><th>Role</th><th>Name</th><th className="n">Rating</th><th className="n">Salary</th></tr></thead>
        <tbody>
          {Object.entries(ROLES).map(([role, label]) => {
            const k = o.keyStaff[role]
            return <tr key={role}><td>{label}</td><td>{k.name}</td><td className="n">{k.rating}</td><td className="n">{money(k.salary, 2)}</td></tr>
          })}
        </tbody>
      </table>
      {o.arrivals.map((a, i) => <p key={i}>{a.person.name} ({a.person.rating}) joins as {ROLES[a.role]} in {a.roundsLeft} rounds.</p>)}

      <h3>Available to hire</h3>
      <p className="muted">Your reputation is {game.reputation.toFixed(0)}. Staff under contract elsewhere need buying out and then serve gardening leave. The list changes at mid-season and each winter.</p>
      <div className="scroll">
        <table>
          <thead><tr><th>Role</th><th>Name</th><th className="n">Rating</th><th className="n">Salary</th><th className="n">Buyout</th><th className="n">Leave (rounds)</th><th className="n">Needs reputation</th><th /></tr></thead>
          <tbody>
            {game.staffMarket.slice().sort((a, b) => b.rating - a.rating).map((c) => (
              <tr key={c.id}>
                <td>{ROLES[c.role]}</td><td>{c.name}</td><td className="n">{c.rating}</td><td className="n">{money(c.salary, 2)}</td>
                <td className="n">{c.buyout ? money(c.buyout, 2) : '—'}</td><td className="n">{c.leave || '—'}</td><td className="n">{c.minReputation}</td>
                <td><button disabled={frozen || game.reputation < c.minReputation} onClick={() => act((g) => hireKeyStaff(g, c.id))}>Hire</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
