# Ultimate F1 Manager: the race weekend (plan)

Status: W1 (the simulation), W2 (the live race), W3 (knockout qualifying) and W4 (Friday practice, kept simple) are built and playable; W5 (folding in the rest of the A/B deck) is still to come. What is built is described in DESIGN.md section 5.10; this file keeps the plan, including the parts still to come.

**Built:**
- `src/engine/weekend.js`: the race as a state machine stepped block by block: tyres with wear and a cliff, wet tyres, track conditions block by block, real pit stops (cheaper under a safety car or virtual safety car), wing level, standing orders, rival strategies from the tyre model, a race-to-race chaos factor, and random rolls keyed per car and block.
- `src/engine/live.js`: the live weekend: briefing (forecast, wing), qualifying, the grid (start tyres, lap one), the race with pit-wall calls and estimates, a Box button and standing orders on each car, team radio, hand over at any point, and the debrief valuing each call.
- `src/engine/highlights.js`: weekend objectives, driver ratings, the rival head-to-head and the gap-to-front history.
- The screens (`src/ui/LiveWeekend.jsx`, `src/ui/PitWall.jsx`): the dark pit-wall theme with a light option, team colours, five sections with a bottom bar on a phone, Home as the pit wall (next race, calendar strip, rival, gap chart, debrief).
- An involvement setting (on the pit wall or quick sim), with a one-weekend override from the Race screen. New teams start on the pit wall.
- Season-1 fixes: the player's starting car is 5 points better in Aero and Chassis (about 1.5 s off the pace instead of 1.7 s, 0.2 s behind Cadillac), and the objectives' rewards are scaled down to about 7 owner confidence a season.
- `tests/w2-check.js`: the live weekend's checks.
- The live track map (`src/ui/RaceMap.jsx`, outlines in `src/ui/data/trackMaps.js` from the MIT-licensed bacinger/f1-circuits): cars move round the real circuit between the ends of each block, with play and pause, 1×, 2× and 4× speed, and a skip to the next key moment. Your two drivers each have their own colour throughout, and explanations, the per-car breakdown and the key events are folded away until opened.
- Moments (`src/ui/Moments.jsx`, what each says in `src/ui/raceMoments.js`): banners that sweep across a lightly dimmed screen and full-screen moments that wait for a tap. On a race weekend: lights out, safety car, red flag, rain, one of your cars out (or both), team-mates colliding, a car in the podium places, the chequered flag, into Q2 or Q3 for the first time, Q3, the front row and pole. After the race: points, a podium, a win or a one-two (with a ribbon for a career first), and a clean sweep of the objectives. Over the season: a title fight with two to five rounds left (once a season), the title decider at the last round, the championship, beating last year's rival, and a season review with the year in numbers. Off the track: into the red, a crisis, the owner's verdict as confidence falls below 30 or 15 or rises to 80, a driver signed (a star signing full screen) or leaving, and a new title sponsor.
- A red flag in the race: about one race in thirteen, likelier after a multi-car crash or in heavy rain, at most once. The field is stopped and lined up behind the leader, every car may change tyres for free, and the pit wall chooses each car's tyres for the restart.
- W4, practice (`src/engine/practice.js`, the Practice screen): wing and balance dials for each car from the engineers' setup, three runs a car with the driver's feedback and a lap time, or a long run for a little less tyre wear in the race. Practice and qualifying can each be left to the team in the settings or skipped for one weekend; the race cannot be skipped, but the strategist can take the calls while it plays on. Checks: `tests/w4-check.js`.
- W3, knockout qualifying (`runQualiSession` in `weekend.js`, the session flow in `live.js`, the Qualifying screen): Q1, Q2 and Q3 with one late run or two, a normal or big-risk lap, a tow between your cars, four new sets of Softs for the whole of qualifying (a run without one is on a used set), track evolution, late yellow and red flags (with a restart for some cars left with no time), and qualifying that can be wet, drying or caught by rain part-way. The strategist suggests a plan for each car and says how close it is to the cut, as precisely as its rating allows. "A car into Q2" and "into Q3" objectives. The A/B cards for drying qualifying, the qualifying run plan and the tow are not drawn when weekends are played live. Checks: `tests/w3-check.js`.

**Not built yet from this plan:**
- W5: weekend incidents replacing the rest of the race-weekend cards.
- From W4's plan, left out to keep practice simple: rain in practice, long runs sharpening the strategist's tyre estimates (a long run lowers wear instead), and setup cards' effects on setup skill when the weekend is run live.
- From W3's plan: tyre sets saved in qualifying are not carried into the race yet, and qualifying engine modes are not modelled (the A/B card stays).
- Calls in the table below that are not modelled yet: pit-exit traffic, floor damage and retiring a car, rear gunner, penalty, late gamble, driver's request, double-stacking.
- Resources across races: power units per season, saved tyre sets, crash damage from pushing.
- The radar warning before the weather changes, rain arriving more than once, and a wet race drying out fully.
- Section 8 extras: championship progress as a line, the cash forecast as an area chart, and tables as lists on a phone. The season review is a full-screen moment, not yet a page of its own.

## 1. Why

The weekend is where everything the player builds at HQ pays off, but today it is one button and a results table. A season is 32 clicks: "Choose A", "Simulate the weekend", sixteen times. The race-weekend calls in the A/B deck (rain setup, one-stop gamble, safety-car plan, start tyres) are the most interesting decisions in the game, and they are made before the race in a text card, then the race happens off screen.

The goal: the weekend becomes the heartbeat of the game. The manager sees the race unfold and makes the calls that a pit wall makes: setup, when to run in qualifying, when to box, which tyre, how hard to push, what to do when it rains or the safety car comes out. Good calls should be worth a few places; the car and drivers built at HQ still decide most of the result.

## 2. Principles

1. **The car decides most of it; the pit wall decides the margins.** An expert player should gain about one place per car per race over an average strategist, more in chaotic races (rain, safety cars), less in processional ones. No single call should be worth more than about three places, except the gambles in pillar 3.
2. **Investment buys information (pillar 2).** A strong Chief Strategist gives tighter weather forecasts and tyre estimates; a strong Race Engineer, a good Simulator and a driver with high Feedback give clearer setup feedback. A weak team plays the same weekend with fuzzier numbers.
3. **Risk flips with position (pillar 3).** A backmarker can gamble on an early stop under a virtual safety car or slicks on a drying track; a leader covers.
4. **Every call is explained (pillar 5).** The debrief says what each decision was worth: "Boxing under the safety car on lap 31: about +9 s, 3 places".
5. **Always skippable.** At any moment the player can hand over to the strategist and jump to the result. A season played fully hands-off takes no longer than today.
6. **No reload-scumming.** Random rolls are fixed per car, per lap block, per weekend from the save's seed, so the same choices give the same race. Different choices change only what they touch: boxing a lap earlier does not change whether a rival crashes.

## 3. How involved the player is

A setting, changeable at any time, with a per-weekend override:

| Level | What the player does | Typical time |
|---|---|---|
| Quick | Nothing: the strategist runs the weekend (today's flow) | Under 30 s |
| Key calls | Practice and qualifying run themselves; the race pauses at key moments (start, safety car, rain, pit window, damage) | 2–3 min |
| Full weekend | Setup in practice, qualifying runs, and full control of the race | 4–6 min |

The bots and the pre-season projection always use Quick, so balance tests and projections stay fast.

## 4. The weekend, step by step

### 4.1 Briefing (Thursday)

One screen: the track (map outline, type, overtaking, pit-lane time loss), the tyre allocation for this track (Soft, Medium and Hard, drawn from five compounds), the weather forecast for each session at the strategist's precision, the rivals around you in the championship, and the weekend objectives (section 6.1).

### 4.2 Practice (Friday): find the setup

Each car has two setup dials:

- **Wing level**, from low drag (1) to high downforce (5). Low drag gives top speed, which helps overtaking and defending and suits power tracks; high downforce suits slow, twisty tracks and the rain. Each track has an ideal level for each car, which depends on the track's Aero/Power weighting and on the car's own strengths: a car strong on Aero wants more wing.
- **Balance**, from oversteer to understeer. The ideal point is hidden and differs by car, driver and track.

**The mini-game.** Practice gives a few runs per car (fewer if it rains). After each run the driver reports in words: "The rear is loose in the slow corners", "We're a sitting duck on the straights". How precise the report is depends on the driver's Feedback, the Race Engineer and the Simulator level. The player turns the dials and runs again, homing in on the sweet spot. Each run can instead go on a long run, which sharpens the tyre-wear estimates the strategist uses on Sunday.

**What it is worth.** Setup quality replaces today's random setup loss: a perfect setup is worth about 0.2 s a lap against an average engineer's. In Quick mode the engineers set the car up themselves, as well as their ratings allow (today's behaviour).

**Parc fermé.** Setup is locked after qualifying, so a wet-race forecast matters on Saturday. This replaces the "Rain threatens the race" decision.

### 4.3 Qualifying (Saturday)

Three knockout sessions. With 24 cars, Q1 drops the slowest seven, Q2 the next seven, and Q3 decides the top ten.

In each session, for each car, the player chooses:

- **Run plan:** one late run (the track is fastest at the end, but a yellow flag, red flag or rain can wipe it out), or two runs (a banker, then an attempt).
- **Push level:** a normal lap or a big-risk lap (faster, with a higher chance of a mistake).
- **Tow:** one car gives the other a slipstream (a small gain for one, a loss for the other).

The timing tower updates session by session, with the cut-off line shown. A drying track or rain in qualifying turns this into the "when to go out" gamble from the A/B deck, played live.

### 4.4 Race (Sunday)

**Before the start:** starting tyre for each car, a planned strategy (the strategist proposes one-stop or two-stop windows with an estimate of each), and lap-one instructions (attack or keep out of trouble).

**During the race** the race runs in blocks of about five laps, as the simulation already does, and the block shortens to a single lap when a call is pending. After each block the screen shows:

- a timing tower: position, gap, tyre and age, and pit-stop count for every car, with your cars highlighted
- the event ticker and team radio
- for each of your cars: the standing orders below, tyre wear, engine life, and a Box button with a compound choice
- controls: next block, play until the next call, or hand over to the strategist for the rest of the race

#### Standing orders

Each of your cars has standing orders that can be changed at any time and take effect from the next block.

| Order | Options | What it does |
|---|---|---|
| Pace | Push · Normal · Save tyres | Push is quicker but wears the tyres and the driver faster; Save tyres stretches a stint for a one-stop or to reach the end |
| Racing | Attack · Normal · Defend · Hold position | Attack makes a pass more likely and contact more likely; Defend makes the car harder to pass but costs time and tyre; Hold position means no passing attempts and almost no risk, for protecting a result or a team-mate |
| Engine | High · Standard · Cool | High gives more Power but uses power-unit life faster and raises the failure risk; Cool does the opposite |

**What a driver brings:**
- **Push and Attack** are worth more from a driver with high Pace and Racecraft, and riskier from one with low Consistency.
- **Character:** a hot-headed racer may ignore Hold position. A driver who is told to hold or yield remembers it at contract time; the interest effect already exists in the market.

**Resources across races.** Some choices cost something beyond this race, so pushing has a price:
- **Engine life:** each car has four power units a season, and a fifth brings a 10-place grid penalty. Running High burns life faster.
- **New tyre sets:** sets saved in qualifying are available for the race.
- **Crash damage:** it comes out of the budget.

#### Pit-wall calls

In Key calls and Full, the race pauses for these. In Quick the strategist answers them. Every call shows the strategist's recommendation and an estimate of what each option is worth, precise with a strong Chief Strategist and vague with a weak one. There is always a "do what the strategist says" button. The game only pauses when a call is close or matters; an obvious one, such as a puncture, is handled automatically and reported.

| Call | Comes up when | Options | Usually right when | Usually wrong when |
|---|---|---|---|---|
| Safety car | The safety car comes out | Box (choose compound) · stay out · box one car · double-stack both | Tyres are past half their life; you still owe the second compound; enough laps are left for new tyres to pay (about 8 or more); the gap behind means you rejoin without losing places | You stopped recently; few laps are left; everyone around you pits, so staying out gains track position at a track where passing is hard; double-stacking costs the second car about 4 s queuing |
| Virtual safety car | A VSC is called | Box this lap · stay out | As for the safety car, but the saving is only about 40% and you have one lap to decide | The pit window is not open, or the VSC is about to end |
| Red flag | The race is stopped | Compound for the restart (everyone gets a free change) | Matching the compound to the laps left and the forecast | — |
| Rain arriving | Rain on the radar or starting | Stay on slicks · box for intermediates now · wait a lap | The radar shows heavy, lasting rain; your driver is weak in the wet | It is a short shower; your driver is strong in the wet and can survive a lap or two; you would lose track position for nothing |
| Track drying | The intermediates are overheating | Slicks now · one more lap | A dry line has formed: the first car on slicks gains seconds a lap | Too early: slow, sliding laps and a crash risk |
| Tyre cliff | The driver reports the tyres are going | Box now · nurse to the planned lap · push and stop next lap | Plenty of laps left, or a free gap to rejoin into | The end is close, or a stop now drops you into traffic |
| Undercut threat | The car just behind (within about 2 s) boxes | Cover next lap · stay out (overcut) | Fresh tyres are worth a lot here and warm up fast | Your tyres are still good, the rival rejoins in traffic, or the track is cool and new tyres are slow for a lap |
| Pit-exit traffic | A stop now rejoins behind a train of cars | Box anyway · delay a lap · extend the stint | The train is short or slow cars will pit soon | The train is long and passing is hard |
| Front-wing damage | Contact | New nose at the next stop · box now · continue | The loss is large (about 0.4 s a lap or more) or a tyre stop is due anyway | The loss is small and few laps are left |
| Floor damage or a failing part | Damage that cannot be fixed, or a reliability warning | Continue · turn the engine down · retire the car | Continue when points are in reach | Retiring saves power-unit life and the crash bill when the race is lost anyway |
| Team-mates together | Your cars are within a second | Let them race · hold positions · swap | Swap when the car behind is faster or on a better strategy; let them race when nobody is close behind | Contact would cost both cars; the driver who yields remembers it at contract time |
| Rear gunner | Your other car is being undercut by the car behind your lead car | One car holds the rival up for a lap or two | It protects the team-mate's position through the stops | It costs the gunner tyre life and time, and risks contact |
| Penalty | A 5 s penalty, or a track-limits warning | Serve it at the stop · push to build a gap · give the place back | Serving at a planned stop is cheap | Not giving the place back after a warning risks the 5 s anyway |
| Late gamble | About 10 laps left with a big gap behind | Free stop for softs and chase the car ahead · stay out | The gap behind covers the stop | Passing is hard here: track position beats fresh tyres |
| Driver's request | "I can make these last" or "give me the push" | Trust the driver · stick to the plan | The driver has high Feedback, so the estimate is good | The driver's Feedback is low and the estimate is optimistic |

**Before the start**, the lap-one call: attack (gain places, more risk in the first-lap incidents) or keep out of trouble.

**After the flag** comes the debrief (section 4.5).

### 4.5 Debrief

The result, points, money earned (prize instalment, bonuses), weekend objectives ticked, and what each call was worth. The figures come from replaying the race with the strategist's choice in place of the player's, using the same random rolls, so they are real, not guesses. Driver reactions follow, e.g. "Herta is unhappy about being told to hold position".

## 5. The simulation changes

The race simulation (`src/engine/weekend.js`) becomes a state machine that can be stepped one block at a time and saved part-way through a weekend. The finished result keeps today's shape (classification, qualifying, events, per-car breakdown), so standings, money, sponsors, driver form and honours keep working unchanged.

### 5.1 Tyres (new)

First-pass numbers, to be calibrated:

| Compound | Pace against Medium | Wear (s a lap, each lap) | Cliff after |
|---|---|---|---|
| Soft | −0.6 s | 0.08 | 15 laps |
| Medium | 0 | 0.05 | 25 laps |
| Hard | +0.4 s | 0.03 | 35 laps |
| Intermediate | Best on a damp track | 0.04 | 30 laps |
| Wet | Best in heavy rain | 0.03 | 40 laps |

- Wear scales with the track's abrasiveness (a new track figure, 0.7–1.4), the car's Tyre Care, the driver's Racecraft and the pace mode.
- Past the cliff a tyre loses an extra 0.5 s a lap, every lap.
- A dry race must use two dry compounds.
- Tyre Care, today a flat race-pace figure, becomes the wear rate, so it matters more on high-wear tracks.

### 5.2 Pit stops and pace modes

- **Pit stop:** pit-lane time loss per track (18–25 s, a new track figure), plus stop time and error chance from the pit crew rating (as today).
  - The loss is about 50% under a safety car and about 60% under a virtual safety car.
  - A new nose adds 6–8 s.
  - Double-stacking costs the second car about 4 s.
- **Pace:** Push is −0.15 s a lap, with 1.4× wear and 1.3× error chance. Save tyres is +0.25 s a lap, with 0.6× wear.
- **Racing stance:**
  - Attack: +30% chance to complete a pass, 1.5× contact chance, 1.2× wear while following.
  - Defend: the rival's pass chance −30%, +0.1 s a lap, 1.5× contact chance.
  - Hold position: no passing attempts and almost no contact.
- **Engine mode:** High is +2 Power, with 2× power-unit wear and 1.5× failure chance. Cool is −2 Power, with half the failure chance. Each car has four power units a season; a fifth brings a 10-place grid penalty. This replaces the "power unit near the end of its life" decision.

### 5.3 Wing level

The car's score at a track uses the track's weights shifted by the wing level: more wing adds Aero weight and takes Power weight. The distance from the ideal level costs lap time. Low drag gives a bonus when overtaking and defending.

### 5.4 Rival strategies

Each rival car gets a strategy from the same tyre model: a planned stop window, boxing under a safety car if inside the window, and a reaction to rain. Timing quality comes from the team's strategy rating. They run in the same state machine as the player's cars, with AI orders.

### 5.5 Calibration and speed

- The M1 calibration bands (retirements, safety cars, wet races, pole conversion, fastest car wins, backmarkers scoring) must still hold in Quick mode.
- A full race must stay under about 1 ms in Quick mode, so the 150-run pre-season projection stays under a second.

### 5.6 The A/B deck

The race-weekend calls that become live decisions are retired from the deck: rain setup, one-stop split, drying qualifying, team orders, safety-car plan, start tyres, low drag, max downforce, qualifying run plan, tyre allocation, showers, lap one, fuel load, qualifying tow and others.

The rest (power unit life, gearbox fault, practice crash, driver unwell, overheating) become **weekend incidents**: they pop up during the weekend at the moment they would happen, instead of in a card beforehand. The one HQ decision between rounds stays.

## 6. Making it matter

### 6.1 Weekend objectives

Two or three small goals each weekend, built from the season targets and sponsor targets: "Beat both Cadillacs", "Both cars to the flag", "Into Q2". These are visible in the timing tower as they are won or lost, and pay small sponsor-satisfaction or confidence rewards.

This gives a backmarker something to fight for every Sunday. In season 1 the player finishes 20th–24th almost every race, and today nothing on screen says that beating a Cadillac to 19th was a good day.

### 6.2 Team radio

Short lines, generated from what happens, give the drivers voices, e.g. "Tyres are gone, box this lap", "I can get him, just give me the push", "That was the plan? Really?". Drivers' reactions feed a small morale or interest effect at contract time, which already exists in the market.

## 7. Build order

| Step | Contents | Playable result |
|---|---|---|
| W1 Engine | Tyre model, pit stops, pace modes and wing level in a steppable race; rival strategies; Quick mode with calibration unchanged; mid-weekend saves | Same game, new simulation underneath |
| W2 Live race | Race screen (timing tower, car controls, events and radio), key-call pauses, hand over to the strategist, debrief with call values | The race becomes interactive |
| W3 Saturday | Qualifying knockout sessions with run plans; parc fermé | Qualifying becomes interactive |
| W4 Friday | Setup mini-game, long runs feeding the tyre estimates | The full weekend |
| W5 Folding in | A/B weekend calls retired or turned into incidents; weekend objectives; involvement setting; balance harness extended with a scripted expert strategist to measure what good calls are worth | Balanced and finished |

**Checks for each step:**
- the existing M1–M5 checks still pass
- new checks: Quick mode matches the old calibration bands
- an expert scripted strategist gains about one place per car per race over the average one
- a deliberately bad strategist loses about as much
- the same choices on the same seed give the same race

## 8. Look and feel (alongside W2)

The live race needs a proper look, and the rest of the game should match it. The mockup is `docs/mockups/race-live.html`, with screenshots alongside it.

- **Theme:** a dark "pit wall" theme, with a light option. Titillium Web for headings and numbers, and tabular figures throughout.
- **Team identity:** each team has a colour. The player picks a team colour on the new-game screen, and it becomes the game's accent colour. Tyre compounds are coloured rings (Soft red, Medium yellow, Hard white, Inter green, Wet blue).
- **Navigation:** five sections instead of fourteen tabs: Race (home, the weekend), Car, Team (drivers, staff, facilities), Business (sponsors, finance, targets) and Season (standings, results, grid, honours). Save and settings move into a menu. On a phone this becomes a bottom bar.
- **Home becomes the pit wall:**
  - the next race
  - a calendar strip
  - the championship around you
  - cash and forecast
  - alerts: a decision waiting, a contract expiring, a rival's approach
- **Pictures instead of tables where they read better:**
  - car ratings as bars against the leader
  - championship progress as a line
  - the cash forecast as an area chart
  - on a phone, tables become lists
- **Moments:** the first point, podium, win and title each get a moment on screen, and the season review becomes a page of its own.
