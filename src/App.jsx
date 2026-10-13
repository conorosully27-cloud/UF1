import React, { useEffect, useRef, useState } from 'react'
import { newGame, startSeason, simulateRound, endSeason, prepareTargets, backToPreseason, currentTrack, year, playerPosition, PLAYER, SAVE_VERSION, migrateSave } from './engine/game.js'
import { forecast } from './engine/economy.js'
import { plannedSpendPerRound, tighteningPlan, AREAS } from './engine/development.js'
import NewGame from './ui/NewGame.jsx'
import WeekendReport, { TrackLine } from './ui/Weekend.jsx'
import { Standings, Results, Grid } from './ui/Tables.jsx'
import CarTab from './ui/CarTab.jsx'
import HqTab from './ui/HqTab.jsx'
import { CommercialTab, FinanceTab, TeamTab, OverdraftNotice } from './ui/MoneyTabs.jsx'
import { DecisionPanel, DecisionLog, TargetPicker, TargetReport, TargetsTab } from './ui/M3Ui.jsx'
import DriversTab, { Approaches, MarketStatus } from './ui/Drivers.jsx'
import HonoursTab from './ui/Honours.jsx'
import LiveWeekend, { Debrief } from './ui/LiveWeekend.jsx'
import { CalendarStrip, RivalCard, GapChart } from './ui/PitWall.jsx'
import { beginWeekend, weekendActive } from './engine/live.js'
import { PLAYER_COLORS } from './engine/data/teams.js'
import { seatsReady } from './engine/people.js'
import { ordinal, money, onColor } from './ui/format.js'

const KEY = 'uf1-save'

function loadSave() {
  try {
    const raw = localStorage.getItem(KEY)
    const g = raw ? JSON.parse(raw) : null
    return g && g.version === SAVE_VERSION ? migrateSave(g) : null
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

function Home({ game, act, last, setTab }) {
  const track = currentTrack(game)
  if (game.phase === 'preseason') {
    const expired = game.teams[PLAYER].drivers.map((id) => game.drivers[id]).filter((d) => d.contract?.expired)
    return (
      <div>
        <h2>{year(game)} pre-season</h2>
        <p>{game.calendar.length} rounds. This is the time to sign drivers (Drivers), change power unit (Team), and line up upgrades, staff and sponsors.</p>
        <p>When the team is as you want it, set the season's targets. The driver market then closes, and drivers and power unit are fixed for the season.</p>
        {expired.length > 0 && <div className="err">Out of contract: {expired.map((d) => d.name).join(' and ')}. Re-sign them on the <button onClick={() => setTab('drivers')}>Drivers</button> tab or they leave when the market closes.</div>}
        {!seatsReady(game) && expired.length === 0 && <div className="err">A race seat is empty. Sign a driver on the <button onClick={() => setTab('drivers')}>Drivers</button> tab.</div>}
        {game.finance.cash < 0 && <OverdraftNotice game={game} />}
        <MarketStatus game={game} act={act} />
        <Approaches game={game} act={act} />
        <button className="primary" onClick={() => act((g) => (g.options.targets ? prepareTargets(g) : startSeason(g)))}>{game.options.targets ? 'Set season targets' : 'Start the season'}</button>
        <News game={game} />
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
        {last && <Debrief game={game} result={last} />}
        <News game={game} />
        {last && <WeekendReport game={game} result={last} />}
        <Standings game={game} />
      </div>
    )
  }
  if (weekendActive(game)) return <LiveWeekend game={game} act={act} />
  const waiting = !!game.decision && !game.decision.resolved
  const live = game.settings.involvement === 'live'
  const goLive = <button className={live ? 'primary' : ''} disabled={waiting} onClick={() => act((g) => { beginWeekend(g) })}>{live ? 'Go to the race weekend' : 'Run this one live'}</button>
  const goQuick = <button className={live ? 'ghost' : 'primary'} disabled={waiting} onClick={() => act((g) => { simulateRound(g) })}>{live ? 'Quick sim this one' : 'Simulate the weekend'}</button>
  return (
    <div>
      {last && <Debrief game={game} result={last} />}
      {game.finance.cash < 0 && <OverdraftNotice game={game} />}
      <div className="panel">
        <div className="kicker">Next: round {game.round + 1} of {game.calendar.length}</div>
        <h2 style={{ margin: '2px 0 4px' }}>{track.name}, {track.country}</h2>
        <p><TrackLine track={track} /></p>
        <CalendarStrip game={game} />
        {!live && (
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
        )}
        {game.tighteningKnown && <p>Next winter's rule change will hit <b>{AREAS[tighteningPlan(game)].label}</b> hardest.</p>}
        <div className="row" style={{ gap: 8 }}>{live ? <>{goLive}{goQuick}</> : <>{goQuick}{goLive}</>}</div>
        {waiting && <p className="muted">Make this round's decision first.</p>}
      </div>
      <DecisionPanel game={game} act={act} />
      <div className="cols">
        <RivalCard game={game} />
        <GapChart game={game} />
      </div>
      <News game={game} />
      {last && <WeekendReport game={game} result={last} />}
    </div>
  )
}

function SettingsTab({ game, act, theme, setTheme }) {
  return (
    <div>
      <h2>Settings</h2>
      <div className="panel">
        <div className="kicker">Race weekends</div>
        <div style={{ margin: '8px 0' }}><Seg value={game.settings.involvement} options={[['live', 'On the pit wall'], ['quick', 'Quick sim']]} onPick={(v) => act((g) => { g.settings.involvement = v })} /></div>
        <p className="muted">On the pit wall you set the wing, pick start tyres and make the calls during the race; the strategist can take over at any moment. Quick sim plays the weekend in one click. Either can be overridden for a single weekend from the Race screen.</p>
      </div>
      <div className="panel">
        <div className="kicker">Look</div>
        <div style={{ margin: '8px 0' }}><Seg value={theme} options={[['dark', 'Dark'], ['light', 'Light']]} onPick={setTheme} /></div>
        <p>Team colour</p>
        <div className="swatches">
          {PLAYER_COLORS.map((c) => <button key={c} aria-label={`Team colour ${c}`} className={game.teams[PLAYER].color === c ? 'on' : ''} style={{ background: c }} onClick={() => act((g) => { g.teams[PLAYER].color = c })} />)}
        </div>
      </div>
    </div>
  )
}

function Seg({ options, value, onPick }) {
  return <div className="seg">{options.map(([k, label]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onPick(k)}>{label}</button>)}</div>
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
      migrateSave(g)
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

// Five sections, each with its own tabs (RACE_WEEKEND.md section 8). Save and settings sit behind the menu.
const SECTIONS = [
  { id: 'race', label: 'Race', ico: '🏁', tabs: [['home', 'Pit wall'], ['decisions', 'Decisions']] },
  { id: 'car', label: 'Car', ico: '🔧', tabs: [['car', 'Car']] },
  { id: 'team', label: 'Team', ico: '👥', tabs: [['drivers', 'Drivers'], ['hq', 'Staff and HQ'], ['team', 'Power unit']] },
  { id: 'business', label: 'Business', ico: '💷', tabs: [['commercial', 'Sponsors'], ['finance', 'Finance'], ['targets', 'Targets']] },
  { id: 'season', label: 'Season', ico: '🏆', tabs: [['standings', 'Standings'], ['results', 'Results'], ['grid', 'Grid'], ['honours', 'Honours']] },
  { id: 'menu', label: 'Menu', ico: '⚙', tabs: [['settings', 'Settings'], ['save', 'Save']], hidden: true },
]
const sectionOf = (tab) => SECTIONS.find((s) => s.tabs.some(([id]) => id === tab))

const THEME_KEY = 'uf1-theme'
function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'dark' } catch { return 'dark' }
}

export default function App() {
  const [game, setGame] = useState(loadSave)
  const [tab, setTab] = useState('home')
  const [error, setError] = useState('')
  const [theme, setThemeState] = useState(loadTheme)
  const setTheme = (t) => { setThemeState(t); try { localStorage.setItem(THEME_KEY, t) } catch { /* not saved: fine */ } }
  const accent = game?.teams[PLAYER].color ?? '#ff5a36'
  const racing = !!game && weekendActive(game) && tab === 'home'
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--on-accent', onColor(accent))
    document.body.classList.toggle('racing', racing)
  }, [theme, accent, racing])

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
  // Returns what the engine function returned, or undefined if it failed.
  const act = (fn) => {
    try {
      const next = JSON.parse(JSON.stringify(game))
      const out = fn(next)
      setGame(next)
      writeSave(next)
      setError('')
      return out
    } catch (err) { setError(err.message) }
  }
  const last = game.results[game.results.length - 1]
  const team = game.teams[PLAYER]
  const endCash = forecast(game, plannedSpendPerRound(game))
  const section = sectionOf(tab) ?? SECTIONS[0]
  const alert = weekendActive(game) || (!!game.decision && !game.decision.resolved)

  return (
    <div className="app">
      <div className="top">
        <h1>{team.name}</h1>
        <span className="stat"><b>{year(game)}</b></span>
        <span className="stat">{game.phase === 'season' ? <>Round <b>{game.round + 1}</b>/{game.calendar.length}</> : game.phase === 'seasonEnd' ? 'Season complete' : 'Pre-season'}</span>
        <span className="stat">Champ. <b>{game.results.length ? ordinal(playerPosition(game)) : '—'}</b></span>
        <span className="stat">Cash <b className={game.finance.cash < 0 ? 'bad' : ''}>{money(game.finance.cash)}</b></span>
        <span className="stat wide">Forecast <b className={endCash < 0 ? 'bad' : ''}>{money(endCash)}</b></span>
        <span className="stat wide">Reputation <b>{game.reputation.toFixed(0)}</b></span>
        <span className="stat">Owner <b>{game.confidence.toFixed(0)}</b></span>
        <button className="menu ghost" aria-label="Settings and save" onClick={() => setTab('settings')}>⚙</button>
      </div>
      <nav className="nav">
        {SECTIONS.filter((s) => !s.hidden).map((s) => (
          <button key={s.id} className={section.id === s.id ? 'on' : ''} onClick={() => setTab(s.tabs[0][0])}>
            <span className="ico">{s.ico}</span>{s.label}{s.id === 'race' && alert && <span className="dot" />}
          </button>
        ))}
      </nav>
      {section.tabs.length > 1 && (
        <div className="subtabs">{section.tabs.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
      )}
      {error && <div className="err">{error}</div>}
      {tab === 'home' && <Home game={game} act={act} last={last} setTab={setTab} />}
      {tab === 'car' && <CarTab game={game} act={act} />}
      {tab === 'hq' && <HqTab game={game} act={act} />}
      {tab === 'drivers' && <DriversTab game={game} act={act} />}
      {tab === 'commercial' && <CommercialTab game={game} act={act} />}
      {tab === 'finance' && <FinanceTab game={game} act={act} />}
      {tab === 'team' && <TeamTab game={game} act={act} />}
      {tab === 'targets' && <TargetsTab game={game} />}
      {tab === 'decisions' && <DecisionLog game={game} />}
      {tab === 'standings' && <Standings game={game} />}
      {tab === 'results' && <Results game={game} />}
      {tab === 'grid' && <Grid game={game} />}
      {tab === 'honours' && <HonoursTab game={game} />}
      {tab === 'save' && <SaveTab game={game} setGame={setGame} />}
      {tab === 'settings' && <SettingsTab game={game} act={act} theme={theme} setTheme={setTheme} />}
    </div>
  )
}
