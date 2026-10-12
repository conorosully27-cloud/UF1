# Ultimate F1 Manager: the race weekend (plan)

Status: proposal. Nothing here is built yet. When a part is built it moves into DESIGN.md (section 5.10) and this file keeps only what is still to come.

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

The timing tower updates run by run, with the cut-off line shown. A drying track or rain in qualifying turns this into the "when to go out" gamble from the A/B deck, played live.

### 4.4 Race (Sunday)

**Before the start:** starting tyre for each car, a planned strategy (the strategist proposes one-stop or two-stop windows with an estimate of each), and lap-one instructions (attack or keep out of trouble).

**During the race** the race runs in blocks of about five laps, as the simulation already does. After each block the screen shows:

- a timing tower: position, gap, tyre and age, and pit-stop count for every car, with your cars highlighted
- the event ticker and team radio
- for each of your cars: pace mode (push, normal, conserve tyres), tyre wear, and a Box button with a compound choice
- controls: next block, play until something happens, or hand over to the strategist for the rest of the race

**Automatic pauses** (in Key calls and Full):

- **Safety car or virtual safety car:** box now? A stop costs about half the usual time.
- **Rain starting or stopping:** intermediates or stay out? A radar estimate is shown at the strategist's precision.
- **Tyre cliff:** the driver reports the tyres are going off.
- **Undercut threat:** the car behind has boxed; cover it or stay out?
- **Damage:** a front wing or puncture; box now or nurse it?
- **Team-mates close together:** let them race, or order a swap? This replaces the "team orders" decision.

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

- **Pit stop:** pit-lane time loss per track (18–25 s, a new track figure), plus stop time and error chance from the pit crew rating (as today). About half the loss under a safety car or virtual safety car.
- **Push:** −0.15 s a lap, 1.4× wear, 1.3× error chance.
- **Conserve:** +0.25 s a lap, 0.6× wear.

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
