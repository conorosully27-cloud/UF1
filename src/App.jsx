import React, { useRef, useState } from 'react'
import { newGame, startSeason, simulateRound, endSeason, prepareTargets, backToPreseason, currentTrack, year, playerPosition, PLAYER, SAVE_VERSION } from './engine/game.js'
import { forecast } from './engine/economy.js'
import { plannedSpendPerRound, tighteningPlan, AREAS } from './engine/development.js'
import NewGame from './ui/NewGame.jsx'
import WeekendReport, { TrackLine } from './ui/Weekend.jsx'
import { Standings, Results, Grid } from './ui/Tables.jsx'
import CarTab from './ui/CarTab.jsx'
import HqTab from './ui/HqTab.jsx'
import { CommercialTab, FinanceTab, TeamTab } from './ui/MoneyTabs.jsx'
import { DecisionPanel, DecisionLog, TargetPicker, TargetReport, TargetsTab } from './ui/M3Ui.jsx'
import { ordinal, money } from './ui/format.js'

const KEY = 'uf1-save'

function loadSave() {
  try {
    const raw = localStorage.getItem(KEY)
    const g = raw ? JSON.parse(raw) : null
    return g && g.version === SAVE_VERSION ? g : null
  } catch {
    return null
  }
}

function writeSave(g) {
  try { localStorage.setItem(KEY, JSON.stringify(g)) } catch { /* storage unavailable: play on without saving */ }
}

function News({ game }) {
  if (!game.news.length) return null
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>News</h3>
      <ul className="plain">{game.news.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </div>
  )
}

function LastSeason({ game }) {
  const r = game.seasonReport
  const w = game.winterReport
  if (!r || !w) return null
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>{r.year} in review</h3>
      <p>
        Finished <b>{ordinal(r.playerPos)}</b> with {r.playerPoints} points{r.playerBest ? `, best result ${ordinal(r.playerBest)}` : ''}.
        Reputation {r.reputationChange >= 0 ? 'up' : 'down'} {Math.abs(r.reputationChange).toFixed(1)}. Cash at season end {money(r.cashEnd)}.
        Champions: {r.constructors[0].name} and {r.drivers[0].name}.
      </p>
      {r.sponsors.length > 0 && (
        <table>
          <thead><tr><th>Sponsor</th><th>Target</th><th>Result</th><th className="n">Bonus</th><th>Next</th></tr></thead>
          <tbody>{r.sponsors.map((x, i) => <tr key={i}><td>{x.name}</td><td>{x.target ?? '—'}</td><td>{x.hit === null ? '—' : x.hit ? 'Met' : 'Missed'}</td><td className="n">{x.bonus ? money(x.bonus, 2) : '—'}</td><td>{x.outcome}</td></tr>)}</tbody>
        </table>
      )}
      <TargetReport report={r.targets} />
      {r.targets && <p>Owner confidence is now <b>{r.confidence.toFixed(0)}</b>.</p>}
      <h3>Winter rule change: {AREAS[w.hard].label} hit hardest</h3>
      <table>
        <thead><tr><th>Rating</th><th className="n">End of season</th><th className="n">After the rule change</th><th className="n">With banked work</th></tr></thead>
        <tbody>
          {Object.entries(AREAS).map(([id, a]) => <tr key={id}><td>{a.label}</td><td className="n">{w.before[id].toFixed(1)}</td><td className="n">{w.afterLoss[id].toFixed(1)}</td><td className="n">{w.after[id].toFixed(1)}</td></tr>)}
        </tbody>
      </table>
      <p className="muted">Banked work used: {w.banked.aero.toFixed(1)} aero units and {w.banked.mech.toFixed(1)} mechanical units. Every rival's car went through the same rule change.</p>
    </div>
  )
}

function Home({ game, act, last }) {
  const track = currentTrack(game)
  if (game.phase === 'preseason') {
    return (
      <div>
        <h2>{year(game)} pre-season</h2>
        <p>{game.calendar.length} rounds. This is the time to change drivers or power unit (Team), and to line up upgrades, staff and sponsors.</p>
        <p>When the team is as you want it, set the season's targets. Drivers and power unit are fixed from that point.</p>
        <button className="primary" onClick={() => act((g) => (g.options.targets ? prepareTargets(g) : startSeason(g)))}>{game.options.targets ? 'Set season targets' : 'Start the season'}</button>
        <LastSeason game={game} />
      </div>
    )
  }
  if (game.phase === 'targets') {
    return <TargetPicker game={game} onStart={(picks) => act((g) => startSeason(g, picks))} onBack={() => act((g) => backToPreseason(g))} />
  }
  if (game.phase === 'seasonEnd') {
    return (
      <div>
        <h2>{year(game)} season complete</h2>
        <p>You finished <b>{ordinal(playerPosition(game))}</b> in the Constructors' Championship.</p>
        <button className="primary" onClick={() => act((g) => endSeason(g))}>Go to the {year(game) + 1} pre-season</button>
        <News game={game} />
        {last && <WeekendReport game={game} result={last} />}
        <Standings game={game} />
      </div>
    )
  }
  const waiting = !!game.decision && !game.decision.resolved
  return (
    <div>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Next: round {game.round + 1} of {game.calendar.length}, {track.name}</h2>
        <p><TrackLine track={track} /></p>
        <p>
          <label>Race approach{' '}
            <select value={game.settings.approach} onChange={(e) => act((g) => { g.settings.approach = e.target.value })}>
              <option value="conservative">Conservative: fewer swings, fewer errors</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive: bigger strategy swings, more errors</option>
            </select>
          </label>
          <label>Driver priority{' '}
            <select value={game.settings.priority} onChange={(e) => act((g) => { g.settings.priority = e.target.value })}>
              <option value="equal">Equal</option>
              <option value="driver1">Favour {game.drivers[game.teams[PLAYER].drivers[0]].name}</option>
              <option value="driver2">Favour {game.drivers[game.teams[PLAYER].drivers[1]].name}</option>
            </select>
          </label>
        </p>
        {game.tighteningKnown && <p>Next winter's rule change will hit <b>{AREAS[tighteningPlan(game)].label}</b> hardest.</p>}
        <button className="primary" disabled={waiting} onClick={() => act((g) => { simulateRound(g) })}>Simulate the weekend</button>
        {waiting && <span className="muted gap">Make this round's decision first.</span>}
      </div>
      <DecisionPanel game={game} act={act} />
      <News game={game} />
      {last && <WeekendReport game={game} result={last} />}
    </div>
  )
}

function SaveTab({ game, setGame }) {
  const file = useRef(null)
  const [msg, setMsg] = useState('')
  const exportSave = () => {
    const blob = new Blob([JSON.stringify(game)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `uf1-${game.teams[PLAYER].name.replace(/\W+/g, '-')}-${year(game)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importSave = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    try {
      const g = JSON.parse(await f.text())
      if (g.version !== SAVE_VERSION || !g.teams || !g.drivers) throw new Error('Not a save from this version')
      setGame(g)
      writeSave(g)
      setMsg('Save loaded.')
    } catch (err) {
      setMsg(`Could not load that file: ${err.message}`)
    }
  }
  return (
    <div>
      <h2>Save</h2>
      <p>The game saves in this browser after every action. Seed: {game.seed}.</p>
      <p><button onClick={exportSave}>Export save to a file</button> <button onClick={() => file.current.click()}>Import a save file</button>
        <input ref={file} type="file" accept="application/json" style={{ display: 'none' }} onChange={importSave} /></p>
      <p><button onClick={() => { if (window.confirm('Delete this save and start again?')) { localStorage.removeItem(KEY); setGame(null) } }}>Delete save and start a new team</button></p>
      {msg && <p>{msg}</p>}
    </div>
  )
}

const TABS = [['home', 'Home'], ['car', 'Car'], ['hq', 'HQ'], ['commercial', 'Sponsors'], ['finance', 'Finance'], ['team', 'Team'], ['targets', 'Targets'], ['decisions', 'Decisions'], ['standings', 'Standings'], ['results', 'Results'], ['grid', 'Grid'], ['save', 'Save']]

export default function App() {
  const [game, setGame] = useState(loadSave)
  const [tab, setTab] = useState('home')
  const [error, setError] = useState('')

  if (!game) {
    return (
      <>
        {error && <div className="app"><div className="err">{error}</div></div>}
        <NewGame onStart={(opts) => {
          try {
            const g = newGame(opts)
            setGame(g)
            writeSave(g)
            setError('')
            setTab('home')
          } catch (err) { setError(err.message) }
        }} />
      </>
    )
  }

  // Engine functions change the state in place, so each action works on a copy.
  const act = (fn) => {
    try {
      const next = JSON.parse(JSON.stringify(game))
      fn(next)
      setGame(next)
      writeSave(next)
      setError('')
    } catch (err) { setError(err.message) }
  }
  const last = game.results[game.results.length - 1]
  const team = game.teams[PLAYER]
  const endCash = forecast(game, plannedSpendPerRound(game))

  return (
    <div className="app">
      <div className="top">
        <h1>{team.name}</h1>
        <span className="stat"><b>{year(game)}</b> season {game.season}</span>
        <span className="stat">{game.phase === 'season' ? <>Round <b>{game.round + 1}</b> of {game.calendar.length}</> : game.phase === 'seasonEnd' ? 'Season complete' : 'Pre-season'}</span>
        <span className="stat">Championship <b>{game.results.length ? ordinal(playerPosition(game)) : '—'}</b></span>
        <span className="stat">Cash <b className={game.finance.cash < 0 ? 'bad' : ''}>{money(game.finance.cash)}</b></span>
        <span className="stat">Forecast <b className={endCash < 0 ? 'bad' : ''}>{money(endCash)}</b></span>
        <span className="stat">Reputation <b>{game.reputation.toFixed(0)}</b></span>
        <span className="stat">Owner confidence <b>{game.confidence.toFixed(0)}</b></span>
      </div>
      <div className="tabs">
        {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {error && <div className="err">{error}</div>}
      {tab === 'home' && <Home game={game} act={act} last={last} />}
      {tab === 'car' && <CarTab game={game} act={act} />}
      {tab === 'hq' && <HqTab game={game} act={act} />}
      {tab === 'commercial' && <CommercialTab game={game} act={act} />}
      {tab === 'finance' && <FinanceTab game={game} act={act} />}
      {tab === 'team' && <TeamTab game={game} act={act} />}
      {tab === 'targets' && <TargetsTab game={game} />}
      {tab === 'decisions' && <DecisionLog game={game} />}
      {tab === 'standings' && <Standings game={game} />}
      {tab === 'results' && <Results game={game} />}
      {tab === 'grid' && <Grid game={game} />}
      {tab === 'save' && <SaveTab game={game} setGame={setGame} />}
    </div>
  )
}
