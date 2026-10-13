# Ultimate F1 Manager — game mechanics plan (v4)

Status: milestones 1 to 5 are built and checked (section 10). Numbers changed by the milestone 5 balance pass are marked "tuned"; section 9 gives the measured results against the targets.

To play: `npm run dev` in this folder. To check: `npm test`. To measure balance: `npm run test:m5` (section 9).

## 1. The game

You run the 12th and newest team on the real grid, starting in the 2027 season against the 11 real teams and their 22 real drivers. You begin with a rented wind tunnel, 160 staff, a bought-in gearbox, one small sponsor and an owner whose money runs out after three seasons.

The long-term goal is the Constructors' Championship, which good play should make possible in about eight to ten seasons. The game does not end there, or anywhere else.

## 2. Design pillars

1. **Cash is the bottleneck.** Every pound has three competing uses: pace now (upgrades), pace later (facilities, staff, next year's car) and income later (commercial, academy).
2. **Being poor means uncertainty, not just slowness.** Weak facilities and staff give wide upgrade outcome ranges and vague information on the round decisions. Investment buys information as well as speed.
3. **Risk appetite flips as you climb.** Only the top ten score, so a backmarker gains from high-variance choices and a front-runner loses from them.
4. **Standing still is going backwards.** Every car loses performance each winter, so every team has to develop just to hold its place.
5. **Every result is explained.** Race results, upgrade outcomes and decisions come with a readable breakdown, so good decisions can be learned.

## 3. Structure

A season is 16 rounds on real circuits. Seasons continue indefinitely.

| Phase | When | What the player does |
|---|---|---|
| Pre-season | Once | Change drivers and supply deals, line up upgrades, staff and sponsors; then set three season targets (section 5.12), which fixes drivers and power unit for the year |
| HQ turn | Before each round | Start upgrades and builds, hire and fire, handle sponsor offers, check the cash forecast |
| Round decision | Every round | One A/B call (section 5.9) |
| Race weekend | Every round | Simulated. The player reads qualifying, the race result and the report |
| Off-season | Once | Rules tighten, prize position locks in, drivers' ratings change, contracts expire, the driver market runs in three stages, rivals evolve |

A typical round takes one to two minutes; a season about half an hour.

## 4. Goals, the owner and crises

There is no win screen and no game over.

- **Season targets.** Three a season, each at a chosen level of ambition (section 5.12). They are the main driver of owner confidence. After a first title the targets move on to defending it, winning the drivers' title too, and winning several in a row.
- **Honours board.** Points, podiums, wins, titles and streaks are recorded for the life of the save.
- **Crisis instead of game over.** A crisis starts if cash is below the −£5m overdraft limit for two consecutive rounds, or owner confidence (0–100) reaches zero. An investor clears the debt and takes a permanent 5% of prize money (stacking to a maximum of 25%). One austerity season follows: no facility builds, a hiring freeze, and the forced sale of the most valuable driver or key staff contract. Reputation falls by 10 and confidence resets to 40.

## 5. Systems

### 5.1 The car

Five ratings, 0–100.

| Rating | Effect |
|---|---|
| Aero | Pace, weighted most at high-downforce tracks |
| Chassis | Pace, weighted most at slow, technical tracks |
| Power | Pace, weighted most at power tracks. Comes from the engine supplier |
| Reliability | Chance of a mechanical retirement. The power unit's own reliability counts for 35% of the car's as raced |
| Tyre Care | Race pace relative to qualifying pace |

Each track has its own Aero/Chassis/Power weighting, plus overtaking difficulty, safety-car likelihood and rain likelihood. One weighted rating point is worth about 0.05 s a lap.

The 16 rounds are Melbourne, Suzuka, Miami, Monaco, Montreal, Barcelona, Spielberg, Silverstone, Spa, Budapest, Monza, Baku, Singapore, Austin, São Paulo and Abu Dhabi: five power tracks, five downforce tracks and six balanced. A small team can build a specialist car and target a handful of rounds.

### 5.2 Development and the annual tightening

Staff and facilities produce **engineering capacity** each round. It has two sinks.

**Upgrades to the current car.** Each project has:

| Choice | Options |
|---|---|
| Area | Aero, Chassis, Reliability, Tyre Care |
| Size | Minor (10 units of work, +1.0), major (23 units, +2.5) or package (52 units, +6.0) |
| Approach | Safe, standard, or aggressive (+40% expected gain, 20% chance of a dud) |
| Rush | Optional: shorter lead time for more money |

Gain = base gain × diminishing-returns factor × a random roll.

- **Diminishing returns.** The closer a rating is to 100, the less each unit of work adds: (100 − rating) ÷ 50, raised to the power 1.3 above 50 (tuned). A car rated 50 gains about eight times as much per unit as a car rated 90, so the last few points cost the most.
- **Leadership.** The Technical Director and Head of Aero multiply their departments' output by 0.5 + rating ÷ 100: ×1.0 at 50, ×1.4 at 90 (tuned; it was ×1.0 to ×1.16). A star hire is worth chasing.
- **Roll width** depends on Wind Tunnel and CFD level, the Head of Aero and driver Feedback. Poor facilities mean a +3 project could deliver anything from +1 to +4.
- **Understanding a part.** A new part runs at 70% of its value in its first race. Better facilities shorten this.
- **Manufacturing.** Finished designs need building. A design finished this round is fitted next round at the earliest, and the factory's own capacity can become the bottleneck.
- **Two design departments.** Aero works only on Aero. Mechanical Design covers Chassis, Reliability and Tyre Care, so it has three ratings to hold up.
- **Repeat.** Each department can be told to keep starting the same upgrade whenever it runs out of work.

**Next year's car.** Any share of capacity, 0–100%, can be banked for next year from round 1. Banked work is no more efficient than an in-season upgrade. Its advantages are that it costs nothing to manufacture and is added after the winter's rule change, so none of it is lost. An in-season upgrade helps now, costs money to build, and is then cut by the winter like the rest of the car. Designers with nothing queued bank their work. Banked mechanical work goes 60% to Chassis and 20% each to Tyre Care and Reliability.

**Annual tightening.** After the final round the rules tighten and every car on the grid loses performance:

| Rating | Loss each winter |
|---|---|
| Aero and Chassis | 8% of the current rating on average. One is named at round 8 as the area hit hardest and loses 11%; the other loses 5% |
| Tyre Care | 4% |
| Reliability | 2% |

Each team's banked work is then added. A team that banked nothing starts the new season slower than it finished the old one. Because the loss is a percentage, fast cars lose more points than slow ones, which keeps the field from stretching.

**Aero testing allowance.** Aero capacity is scaled by championship position, from 70% for the champions to 125% for 12th in steps of 5%, reset at mid-season and season end. This mirrors the real rule.

### 5.3 Supply deals

Five real power unit suppliers. Customers run one Power point below the works team.

| Supplier | Customer Power | Reliability | Price per season | Reputation needed |
|---|---|---|---|---|
| Red Bull Ford | 92 | 82 | £18m | 35 |
| Mercedes | 90 | 90 | £17m | 30 |
| Ferrari | 84 | 86 | £13m | None |
| Audi | 82 | 78 | £10m | None |
| Honda | 80 | 72 | £9m | None |

Supplier ratings drift each winter. Weaker suppliers gain more, as the real catch-up rules intend, so the order can change over a long save.

The supplier also sells a **parts package** (gearbox, suspension, hydraulics) for £4m a season. It keeps Chassis from falling below 45 and adds 15% to mechanical design capacity, but limits Chassis to 8 below the supplier's own car. Going in-house needs Design Office and Factory at level 3 and removes the limit.

### 5.4 Facilities

Eight facilities, levels 0–5. Two builds can run at once.

| Facility | Effect | Start |
|---|---|---|
| Design Office | Engineer headcount cap | 1 |
| CFD Cluster | Aero capacity multiplier | 1 |
| Wind Tunnel | Narrows upgrade outcome ranges. Level 0 is a rented tunnel with a per-round fee | 0 |
| Factory | Build cost and lead time, Reliability | 1 |
| Simulator | Setup quality, driver development | 0 |
| Race Operations | Strategy quality, pit-stop time and error rate | 1 |
| Commercial Centre | Sponsor slots, merchandise income | 1 |
| Academy | Quality of junior drivers | 0 |

| Level | Build cost | Build time |
|---|---|---|
| 1 | £3m | 3 rounds |
| 2 | £6m | 4 rounds |
| 3 | £10m | 5 rounds |
| 4 | £16m | 6 rounds |
| 5 | £24m | 8 rounds |

Levels 3 to 5 were tuned down from £12m, £22m and £38m (6, 8 and 10 rounds): at the old prices no sensible manager could build a front-running organisation within ten seasons.

Upkeep is 6% of cumulative build cost per season. A build is paid for in equal instalments over its rounds.

**Academy.** From level 1 the academy may take on a junior each winter (chance 40% plus 10% a level), up to one more junior than its level. Juniors arrive at 16–18 with a potential around 81 + 2.5 × level. Each costs £0.3m a season, races in the junior series, asks 60% of the usual salary and is 20 points more interested in stepping up. Juniors leave the academy at 24. The karting-prospect decision also adds a junior.

### 5.5 Staff

**Departments:** Aero, Mechanical Design, Manufacturing, Race Team, Commercial. Each has a headcount and an average skill. Headcount is capped by the matching facility; Aero and Mechanical Design share the Design Office. New hires take three rounds to become productive; redundancy costs a quarter of a year's pay. Skill moves half a point a round towards a target set by the department's facility, its pay level (low, market, premium) and its head of department.

**Key staff:** Technical Director, Head of Aero, Chief Strategist, two Race Engineers, Commercial Director. Each has ratings, a salary and a contract. Poaching one from a rival costs a buyout plus 4–12 rounds of gardening leave. Rivals poach in return as the team rises. Key staff use generated names in v1; real engineers are not modelled.

### 5.6 Drivers

Two race drivers and a reserve.

| Attribute | Used for |
|---|---|
| Pace | Qualifying and race lap time. One point is about 0.02 s a lap |
| Racecraft | Starts, overtaking, tyre management |
| Consistency | Error and crash rate |
| Wet | Performance in rain |
| Feedback | Setup quality and upgrade outcome ranges |
| Marketability | Sponsor income |

Overall = 40% Pace, 25% Racecraft, 20% Consistency, 15% Wet.

- **Visible and hidden.** Every driver's current ratings are visible. Potential, next year's change and the personal factor in negotiations are hidden.
- **Contracts:** salary, length, bonuses, number-one status, release clause.
- **Loans:** a rival's junior can be taken on a one-season loan for a low salary. The parent team can recall them at season end.
- **New drivers:** real juniors fill the market first. Generated drivers join each winter so the grid never runs dry.
- **The starting line-up** is picked on the new-game screen from a simple list: a driver whose interest is under 60 signs for 5% over their demand per point short. Every later signing goes through the market below.

#### Signing a driver

No driver has a fixed price, a fixed backing figure or a fixed yes/no. Each comes from a formula with a random part, and the player sees an estimate before committing.

**Interest** is a score from 0 to 100. The driver signs at 60 or more.

| Factor | Effect |
|---|---|
| Base | 50 |
| Team appeal | (Team reputation − driver ambition) ÷ 2, limited to ±25. Ambition = 2.5 × (Overall − 70), less 2 for each year of age over 30 |
| Seat hunger | +15 without a top-level race seat, +5 if settled in another top-level series such as IndyCar, Formula E or endurance racing |
| Offer | Salary against demand (up to ±20), number-one status +8, preferred contract length +5, release clause +5 |
| Personal factor | −10 to +10, rolled each winter and hidden |
| Competition | −10 for each rival offer on the table |

Each driver accepts three approaches per winter, so offers cannot be nudged up a pound at a time.

**Salary demand** rises steeply with Overall: about £0.5m at 75, £1.5m at 80, £5m at 85, £15m at 90 and £35m at 95, with a personal variation of ±15%.

**Backing** = (Marketability − 60) × £0.2m × sponsor pull × a yearly roll of 0.7–1.3.

- Sponsor pull is a fixed trait from 0 to 3. It is hand-set for real drivers and rolled for generated ones.
- Before signing, backing is shown as a range. The Commercial Director's rating sets how wide the range is.
- It is paid per race started. Benching the driver stops the money.
- It is rolled again each winter and moves with results: a backed driver who beats expectations attracts more, one who trails loses backers.

**Market timing.** The off-season market runs in three stages. Unsigned drivers cut their salary demand by about 15% at each stage, and rivals sign drivers between stages. Waiting is cheaper and risks losing the driver.

As built:

- **Out of contract.** When one of the player's contracts runs out the driver stays in the seat, marked out of contract, until the market closes. They can be re-signed (+5 loyalty, no seat hunger), and from stage 2 rivals may sign them. Setting the season targets closes the market: rivals fill every seat and out-of-contract drivers leave.
- **Rival offers.** A rival with an empty seat that has a driver among its top choices counts as an offer on the table (−10 each, at most two).
- **Rivals sign** in order of reputation, choosing the free driver they rate highest who would join (interest 55, falling to 35 at the final call; a rookie is promoted if nobody will come). A team with reputation 60 or more can buy out a driver from a team 20 or more below it.
- **Bids for the player's drivers.** A rival with an empty seat and more reputation can bid for a player's driver under contract. Accepting brings in about 1.2 × the salary still owed plus £1.5m; refusing leaves the driver 5 points less interested at the next talks. With a release clause the rival simply pays it (1.5 × salary, at least £2m).
- **Number-one status** costs the other driver's goodwill: each race the player favours the driver without it, the number-one driver loses a point of interest.

The decisions this creates: move early or wait; pay more or offer status and a release clause instead; trust a wide backing estimate or pay for a better Commercial Director; take the backed driver for the money or the quicker one for the results that raise prize money and next year's backing.

#### Ageing, regression and replacement

Ratings change at mid-season and at season end. Each change is the age trend, plus a personal roll, plus a results adjustment, so two drivers of the same age can go different ways.

**Results adjustment:** −1, 0 or +1 Overall at each update, so at most ±2 a year. It is +1 if the driver clearly beat expectation over those rounds, −1 if clearly below, and 0 otherwise. Expectation is what the car and the driver's own rating should have achieved, checked against the team-mate, so a fast car does not inflate a driver and a slow one does not sink them. The change goes mainly to Pace and Consistency.

| Age | Typical yearly change in Overall |
|---|---|
| Up to 23 | +1 to +3, towards potential |
| 24–27 | 0 to +2 |
| 28–32 | −1 to +1 |
| 33–35 | −2 to 0 |
| 36–39 | −3 to −1 |
| 40 and over | −4 to −2 |

- **Longevity** is a hidden trait that shifts the decline by −2 to +5 years.
- **What goes first:** Pace and Consistency. Racecraft and Feedback hold, and can still rise, until late.
- **Rust:** a season without racing costs one or two points, and a young driver without seat time does not develop.
- **Not every junior makes it.** Some stall well short of their potential.
- **Retirement:** from 36 the chance rises each year, and sooner for a driver left unsigned for a season.

**Rivals review their drivers** every winter and once at mid-season.

- A team judges a driver on a perceived level: the true Overall blended with that season's results against the team-mate and against what the car should have achieved. Results are noisy, so teams sometimes misjudge.
- It weighs that level, the trend, age, salary, backing and remaining contract against the best replacement it could realistically sign.
- It then keeps the driver, lets the contract run out, or buys it out early.
- Each team has a patience trait. Red Bull is low and will swap a driver mid-season; Williams is high.

Released drivers join the market, usually cheaper and with extra seat hunger. This is where the player finds bargains: a driver dropped after an unlucky season, or a fading veteran whose Feedback is still excellent.

As built, the results adjustment compares each qualifying lap with the team-mate's after allowing for the gap in Pace (and Wet in the rain); a driver who averages more than 0.05 s a lap better than that over a half-season gains a point. A team's perceived level is Overall plus up to ±3 for that season's form, a random misjudgement (±1.5 typical), some of a young driver's upside, −0.6 a year over 32, and, for a team with reputation under 45, a little for backing. A rival renews an expiring driver if that level, plus 2.5 × its patience, is at least the best replacement it could sign and the driver wants to stay. Juniors without a seat develop at 80% in the junior series; a driver of 23 or more with no seat anywhere does not develop. Drivers who sit out two seasons drift away from the market.

The same applies to the player. A driver who has regressed can be released by paying 60% of the remaining salary, so long contracts for drivers over 33 carry real risk.

### 5.7 Finance

Cash moves every round. A forecast screen projects the balance to season end under current commitments.

| Income | Notes |
|---|---|
| Prize money | By last season's championship position, paid per round. P1 £140m, P6 £90m, P11 £61m, P12 £56m. Season 1 pays a £36m new-entrant amount |
| Sponsors | £8m–£12m in season 1; £80m+ for a front-runner |
| Driver backing | Typically £2m–£10m a season per backed driver (section 5.6) |
| Merchandise | Scales with reputation |
| Owner funding | £20m, £12m, £6m, then nothing |
| Target rewards | Owner bonuses for season targets met (section 5.12) |

| Cost | Season 1 scale |
|---|---|
| Workforce | £15m (160 staff; tuned from £13m) |
| Key staff | £3m |
| Drivers | £0.5m–£5m each |
| Power unit and parts package | £13m–£17m |
| Race operations | £0.9m a round, £14m a season |
| Car build | £7m |
| Facility upkeep and tunnel rental | £5m |
| Development | Discretionary, £5m–£15m |
| Crash damage | Variable |

Season 1 roughly breaks even on a modest development budget.

**Borrowing:** a bank loan (limit set by reputation, 8–14% interest) or an advance of up to half the remaining season's prize payments at a 10% discount.

**Reputation** moves 40% of the way each winter (tuned from 30%) towards a level set by championship position (about 9 for 12th, 95 for 1st), plus a little for points, podiums and wins.

**Cost cap:** £150m on performance spending (development, technical staff, race operations). Drivers, power units, commercial staff and facility construction are outside it. The player starts at about a third of the cap.

### 5.8 Sponsors

Slots: one title, two principal, four partner. Commercial Centre level opens them. An offer's headline value is a base plus an amount per reputation point (title £3m + £0.45m, principal £1m + £0.16m, partner £0.5m + £0.07m; tuned up by about 30%), scaled by the Commercial Director, the commercial staff and the drivers' Marketability. A front-runner with every slot filled is offered about £100m a season.

Each offer comes in three shapes:

| Shape | Structure |
|---|---|
| Guaranteed | Flat fee, lowest total |
| Balanced | Medium fee, medium bonuses |
| Incentive | Low fee, large bonuses for hitting targets |

Targets are scaled to the team's level, for example "both cars finish 12 races" or "a car ahead of a Cadillac car in six races", so small achievements have cash value before the team scores points. They are set from the same pre-season projection as the season targets: a balanced target is one the team meets about half the time, an incentive target about one time in four. Offers may carry demands, such as a minimum driver Marketability. Sponsor satisfaction decides renewal: a deal renews at 50 or more.

### 5.9 The round decision

Every round brings exactly one A/B decision. Both options cost something.

**Rules:**

- The deck is weighted by the team's current state, and no decision repeats within 32 rounds (two seasons).
- The better option depends on context: cash, the next track, car strengths, driver ratings and morale. No option is always right.
- Effects are small: one to three rating points, £0.5m–£3m, a morale shift, or a one-race modifier.
- Information quality depends on staff. A weak Chief Strategist reports "rain possible"; a strong one reports "rain 60%".
- Outcomes are fixed when the round starts, so reloading does not change them. The result of any chance is shown as soon as the choice is made.
- A decision log shows what was chosen and what happened, including results that land several rounds later.

**Size target:** always choosing the better option should be worth about 10% faster progress over a season than choosing at random. No single decision can wreck a season.

| Type | Decision | A | B | What decides it |
|---|---|---|---|---|
| Technical | The new floor is ready but untested | Race it now; 25% chance it underdelivers and hurts setup | Test first; arrives next round at known value | Wind Tunnel level, whether this track suits the car |
| Race weekend | Rain is forecast for Sunday | Wet-leaning setup | Dry setup | Forecast precision, drivers' Wet ratings |
| Race weekend | Tyres look marginal for a one-stop | Split the cars: one gambles on a one-stop | Both run the conventional two-stop | Tyre Care, grid position, safety-car likelihood |
| Reliability | A power unit is near the end of its life | New unit and a 10-place grid penalty here | Run the old one: less power, higher failure risk | Overtaking difficulty here, which tracks come next |
| Commercial | A sponsor offers £1.5m for a show-car day | Accept; drivers lose preparation this round | Decline | Cash position, importance of this track |
| People | The Head of Aero has an offer from a rival | Match it: +£0.8m a season | Promote the deputy: weaker for six rounds, cheaper after | The deputy's rating, budget |
| Drivers | The junior wants three practice outings | Agree: junior develops, race driver's setup suffers | Refuse: junior's morale drops | Junior's potential, championship position |
| Regulatory | Engineers have found a loophole | Build it: +3 Aero, 30% chance of a ban and a £1m fine | Stay legal | Cash buffer, how much three points is worth now |
| Factory | An upgrade could arrive two rounds early | Overtime: extra cost, staff morale drops | Wait | Next two tracks, morale |
| Finance | The supplier offers 10% off next year for payment now | Pay early | Keep the cash | Cash forecast |
| Race weekend | Qualifying starts on a drying track | Run early and bank a lap on intermediates | Wait and gamble on slicks at the end; a red flag or more rain leaves the car at the back | Forecast precision, drivers' Wet and Consistency, overtaking difficulty here |
| Race weekend | The two cars are likely to run together in the race | Agree team orders: the quicker car is let through, and the driver who yields is 5 points less interested at the next contract talks | Let them race: a small chance of contact | Number-one clauses, both drivers' Consistency, how close the points are |
| Race weekend | A race engineer wants to try an unproven setup | One car runs it: between +0.15 s and −0.2 s this weekend, and better setups for the next three rounds either way | Both cars stay on the known setup | Simulator level, that driver's Feedback, importance of this track |
| Reliability | The engine supplier warns of overheating at this race | Open up the cooling: both cars lose 0.15 s a lap | Run as normal: failure risk doubles this race | Reliability rating, how much this track rewards Power, whether points are realistic here |
| Technical | A front-runner's new sidepod idea is visible in photos | Copy it: a cheap +2 Aero, 30% chance it does not suit the car and the work is wasted | Stay on your own development path | Head of Aero rating, how much capacity is spare |
| Regulatory | A rival just ahead in the standings appears to be running an illegal part | Protest: £0.3m deposit, about a one-in-three chance they lose that race's result; fail and lose the deposit and 1 reputation | Let it go | How close that rival is, the Technical Director's read on the odds |
| Commercial | A sponsor offers to swap its end-of-season bonus for cash now | Take £1m guaranteed | Keep the £3m bonus target | How likely the target is, cash forecast |
| Drivers | A bigger team is sounding out your best driver | Open talks now: about 20% over their demand, two more years | Wait for winter: cheaper if results dip, and they may leave | Driver's age and trend, their interest score, cash |
| People | A rival's senior engineer has fallen out with their boss | Sign them now at a premium: one department gains skill immediately | Wait for the winter market: cheaper, and they may be gone | Which department is weakest, budget |
| Academy | A young karting prospect needs funding to carry on | Fund them: £0.5m a season, and a high-potential junior in two seasons if they develop | Pass | Academy level, how far ahead the team can afford to plan |

About half the deck is race-weekend calls, which stand in for live race control. All 80 decisions are written (`src/engine/data/deck.js`): 40 race-weekend and reliability calls and 40 HQ decisions. The table above shows the style; some of its numbers were changed in the build so that each option is the better one in some situations.

### 5.10 Race weekend

A weekend is played one of two ways, set in Settings and changeable for a single weekend from the Race screen. New teams start on the pit wall; the scripted tests, the balance harness and the pre-season projection always use the quick sim.

- **On the pit wall (live):** briefing, qualifying, the grid, then the race block by block with the player making the calls (below). The strategist can take over at any moment.
- **Quick sim:** one click. The strategist makes every call, and two standing settings apply: race approach (conservative, balanced or aggressive: aggressive widens the spread of strategy outcomes and raises error risk) and driver priority (equal, or favour one driver).

A weekend in progress is part of the save (`game.weekend`), so it carries on where it left off.

**Qualifying** is three knockout sessions: all 24 cars in Q1, where the slowest seven are out, 17 in Q2, where seven more go, and a top-ten shoot-out in Q3. A lap time = car pace at this track (with the wing level) + driver Pace + setup roll + the conditions + random variation, with a small chance of a mistake (a few of which end in the wall). In each session a car runs once, late, or twice: an early banker lap, then a late one about 0.12 s quicker as the track rubbers in (and each session is 0.2 s quicker than the one before). Each run takes one of four new sets of Softs for the whole of qualifying; a run without one is about 0.3 s slower. A big-risk lap is about 0.12 s quicker and three times likelier to go wrong. One car can tow the other on the straights (about 0.1 s at an average track, more where Power counts). A late yellow or red flag (about one session in ten, more after a crash) wipes out some cars' final laps; a car left with no time gets one more go after a restart half the time, and otherwise starts from the back of that session. About one weekend in ten qualifying is wet, drying (one late run is right) or caught by rain part-way (bank a lap early). Rival pit walls choose the same way, reading the weather as well as their strategy rating allows. Grid penalties are then applied. Over many weekends a top-four car is knocked out in Q1 about 3% of the time and in Q2 about 3%: the odd shock, not a lottery.

**The race** (`src/engine/weekend.js`) runs in blocks of about five laps (at least eight blocks). Each block every car's time comes from:

| Element | Driven by |
|---|---|
| Base race pace | Car ratings at this track, driver Pace and Racecraft, setup, the wing level against the ideal |
| Tyres | Compound pace, wear (Tyre Care, Racecraft, the track surface, the pace order) and a cliff past the tyre's life |
| Track conditions | Dry, damp or wet, block by block. Damp wants intermediates, wet wants full wets; slicks on a wet track are slow and crash-prone. The Wet attribute and the wet setup count |
| Pit stops | The track's pit-lane loss (18–28 s), about half under a safety car and 60% under a virtual safety car; Race Team skill and rare botched stops |
| Strategy | Each car plans its stops from the tyre model. A rival pit wall's timing is as good as its strategy rating. A dry race must use two dry compounds or take a 20-second penalty |
| Standing orders | Pace (push, normal, save tyres), racing (attack, normal, defend, hold), engine (high, standard, cool), and the lap-one call |
| Traffic and passing | Track overtaking difficulty, Racecraft, the wing level and the racing orders |
| Mechanical retirement | Reliability and the engine mode |
| Errors and crashes | Consistency, race approach, weather and a per-race chaos factor: most races are calm, the odd one is carnage, and rain makes carnage likelier |
| Safety car and virtual safety car | Track likelihood and incidents. A safety car compresses the gaps |

Every random roll is keyed to the save, the race, the block and the car, so the same choices give the same race, and a choice for one car does not change whether a rival breaks down.

**The live weekend** (`src/engine/live.js`):

1. **Briefing:** the forecast for qualifying and the race (a strong Chief Strategist's numbers lean towards what will happen, and from 70 they say roughly when the rain comes), the track's pit loss and tyre wear, the weekend objectives, and the wing level for each car (1 low drag to 5 high downforce) with the race engineer's suggestion. The wing is locked once qualifying starts.
2. **Qualifying:** before each session the strategist suggests a plan for each of your cars (one late run or two, a normal or big-risk lap) and says how close to the cut it should be: to the hundredth with a Chief Strategist of 80 or more, to the tenth from 60, in words below that. From 70 the strategist also says whether conditions will change late in the session. The player can change each plan and set a tow, then runs the session; the strategist can run the rest of qualifying at any point. A save made between sessions carries on the same way, and the choices for your cars never change a rival's laps or Sunday's luck.
3. **Grid:** the qualifying result, the start tyre for each car (with the plan it leads to and how it compares with the best), and the lap-one order.
4. **Race:** a timing tower, the race feed and team radio, and a card for each car with its tyre wear, standing orders and a Box button. The race pauses for pit-wall calls: safety car, virtual safety car, the planned stop, the tyre cliff, rain, a drying track, the compound rule, an undercut by the car behind, wing damage, and team-mates running together (swap, let them race, hold). A puncture needs no decision: the car comes in. Each call shows the strategist's pick and an estimate for each option from a few simulated futures, as a position (Chief Strategist 80+), a range (60+) or a feel (below 60). A strategist of 60 or more goes with the numbers when they clearly beat the textbook call. A driver told to let a team-mate through remembers it at contract time.
5. **Debrief:** the result, the weekend's money, the objectives, a rating out of 10 for each drive, and what each call that went against the strategist was worth, found by replaying the race from that moment with the strategist's choice on the same luck. The whole race is also replayed with the strategist in charge, for comparison.

Race-weekend cards in the decision deck that the live race covers (one-stop split, safety-car plan, start tyres, team orders, lap one, showers, driver strategy, low drag, maximum downforce, drying qualifying, the qualifying run plan, the qualifying tow) are not drawn when weekends are played live.

**What the pit wall is worth** (`tests/w2-check.js`, a midfield car, Chief Strategist 90, 32 weekends): following the strategist finishes about 0.7 places a car better than the quick sim, because a live pit wall is never late with a stop; picking the worst-looking option at every call costs about 2.8 places a car; a call chosen that way loses about 1.1 places on average in the debrief. At the very back in season 1 the gaps are too big for calls to change much (under 0.1 places).

**Weekend objectives.** Three small goals each weekend, set from where the car stands on pace at this track: beat one or both cars of the team just ahead (or just behind), a finishing position a little better than the car's pace suggests, and a qualifying goal: a car into Q2 or Q3 when the car's pace puts it near that cut, otherwise qualifying ahead of the team ahead (or both cars to the flag for the fastest car). Each one met adds 0.3 owner confidence and 0.5 satisfaction with every sponsor. About half are met, worth about 7 confidence a season. Home also shows the head-to-head with the team just ahead in last year's championship and a chart of the gap to the fastest car.

**Calibration** (quick sim), measured over 1,000 simulated seasons with the cars held fixed. The targets are my estimates of recent real-world rates and have not yet been checked against published data:

| Measure | Target | Built |
|---|---|---|
| Retirements per start | 10–12% | 11.8% |
| Races with a safety car | 55–60% overall, set per track | 56.5% |
| Wet or mixed races | 10–15% | 13.0% |
| Pole converts to a win | 35–45% (a design choice, below real F1's 45–50%) | 40.6% |
| The fastest car on the day wins | 40–55% (a design choice, below real F1's 55–65%) | 45.9% |
| A car from the three slowest rival teams scores points | 5–10% of starts | 4.9% |

The player's own season-1 cars score in almost no starts, and the better of them beats at least one Cadillac in about 40% of races.

The game is deliberately a little more chaotic than real F1, so that one team or driver does not win too predictably and the front never goes stale: qualifying varies more from lap to lap, the start shuffles the order more, and strategy and safety-car timing swing more. Pole therefore converts about 40% of the time and the fastest car on the day wins about 46%, both below real-world rates by design. A clearly faster car still dominates: with one car made 0.3 s clear, it wins about 65% of races. The slowest three rival teams score in just under 5% of starts, a hair under the target. Average stops run from about one a car (Monza, Spa) to about two (Montreal), and a race takes about 1 ms in the quick sim.

**Points:** 25-18-15-12-10-8-6-4-2-1 across 24 cars. Ties in the constructors' table are broken by best finishes, so 11th against 12th matters on zero points.

### 5.11 Rivals and the living world

The 11 real teams run a simplified version of the same development model, with the same diminishing returns, annual tightening, aero testing allowance and cost cap. Each has a resource level that follows its results and prize money.

- **Development rate.** Each rival's rate is set so that it holds its starting ratings against the annual tightening. Half a year's work lands over the winter and half as three in-season upgrades. The rate then drifts a little each winter.
- **Resources follow results.** Each rival's development rate is scaled by a resource level that moves 30% of the way each winter towards a level set by championship position (±7% between first and last), relative to where it started.
- **Reputation** moves the same way, on the player's scale, and decides who drivers will join and who signs first.
- **Form events** each winter: an investor (+15% development for three seasons; 7% a year for a team in the lower half, 3% otherwise), losing the technical chief (−15% for two seasons, 6% a year) or, for a customer team, a switch of engine supplier (6% a year; at most four teams per supplier).
- **Reading the new rules.** Each winter each rival's Aero and Chassis move by a random ±0.9 points (typical) on top of its development. Without this the front of the field never changed: diminishing returns hold a top car so close to its starting rating that the fastest team won about 80% of titles.
- **Drivers** age, regress, move teams, get dropped and retire (section 5.6).
- **Poaching:** from reputation 25, rivals approach key staff rated 65 or more (about 10–35% a year each, more for better staff and a better team). Matching costs 30% more salary; otherwise a deputy 8–15 points weaker steps up. Rivals bid for drivers as in section 5.6.
- **Pressure (tuned).** A rival with reputation 65 or more that is slower than the fastest car develops faster: +6% for each 0.1 s a lap it is behind, up to +25%. It is there mainly so the rival world does not settle into one team winning everything; it applies whoever leads, but it is not meant to make defending a title hard.
- **Race operations drift.** Each winter a rival's pit crew, strategy and setup ratings move by a random ±1.5, pulled back towards where the team started.
- **Supplier drift:** each winter Power moves by a random ±0.7 plus 20% of the gap to the best supplier, with a slow pull back towards 88; Reliability likewise. Prices follow Power.

### 5.12 Season targets

Each pre-season the game offers six objectives built from the team's current state: two Sporting, two Commercial and two Technical. The player picks one from each category and sets a level for each.

| Level | A typical team in this position meets it | Reward |
|---|---|---|
| Safe | About four times in five | 1× |
| Standard | About half the time | 2.5× |
| Stretch | About one time in five | 6× |

**Rules:**

- The reward is paid only if the chosen level is reached. Reaching the Standard mark after choosing Stretch pays nothing.
- A met target adds 3, 5 or 8 owner confidence by level. A missed target costs 5, whatever its level.
- Meeting all three adds 3 reputation.
- Levels are locked once the season starts.

**How the marks are set.** Before the season the game runs 150 quick simulations of the year from the team's current car, drivers, cash and facilities, under average management: designers kept busy, a little banked from mid-season, empty sponsor slots filled, nothing built and nobody hired.

- **Results targets** (position, points, best finish, races ahead of a rival, podiums, wins, both cars classified) are placed where that average team reaches them in about 80%, 50% and 20% of runs. Measured over 120 seasons of average management the rates were 79%, 45% and 22%.
- **Management targets** (cash, sponsor fees, rating gained, facility levels) depend mostly on the player's own choices, so they are set against what the average manager achieves. Rating gained: 70%, 100% and 135% of what the average manager manages. Cash: 30%, 65% and 105% of the cash the average manager, who neither builds nor hires, would be left with. Sponsor fees are mostly fixed by the deals already signed, so Safe is 95% of the projection, Standard adds one more partner deal and Stretch a principal deal on top (tuned: a percentage over the projection could not be reached without new slots).
- **Cash** is counted net of bank debt, so borrowing cannot meet the target.

Setting targets is the last step of pre-season. Drivers and power unit are fixed from then on, so the marks cannot be lowered by setting them with a weak line-up and then changing it.

| Category | Reward at 1× | Objectives it draws from |
|---|---|---|
| Sporting | Owner bonus of 2% of annual income, +1 reputation | Championship position, points, best finish, races ahead of a named rival, podiums, wins, titles |
| Commercial | Sponsor offers worth 3% more next season | Cash at season end, sponsor income signed, merchandise income, reputation gained |
| Technical | +2% engineering capacity next season | Rating gained in one car area, races with both cars classified, facility levels completed, pit-stop ranking, junior development |

At 2.5× and 6× those rewards scale directly: a Stretch sporting target pays 12% of annual income and +6 reputation.

Examples at three stages:

| Stage | Category | Objective | Safe | Standard | Stretch |
|---|---|---|---|---|---|
| Season 1 | Sporting | Races finished ahead of a Cadillac | 3 | 6 | 10 |
| Season 1 | Commercial | Cash at season end | £4m | £10m | £18m |
| Season 1 | Technical | Aero rating gained during the season | +5 | +9 | +13 |
| Midfield | Sporting | Championship position | 9th | 8th | 6th |
| Midfield | Commercial | Sponsor income signed for next season | £30m | £38m | £48m |
| Midfield | Technical | Races with both cars classified | 10 | 12 | 14 |
| Front-runner | Sporting | Wins | 1 | 3 | 6 |
| Front-runner | Commercial | Merchandise income | £14m | £18m | £24m |
| Front-runner | Technical | Average pit-stop rank | 4th | 2nd | 1st |

Season targets are separate from sponsor targets (section 5.8), which are agreed deal by deal.

## 6. Progression and difficulty

Target curve for good play on Normal:

| Season | Championship position | Milestone |
|---|---|---|
| 1 | 12th | Beat Cadillac on merit at least once, stay solvent |
| 2 | 11th–10th | First points |
| 3 | 10th–8th | Regular points, owner funding ends |
| 4 | 8th–7th | Established midfield |
| 5 | 6th–5th | First podium, approaching the cost cap |
| 6–7 | 5th–3rd | First win |
| 8–10 | 3rd–1st | Title contention |
| After | — | Staying there |

**Where the build stands** (competent manager, section 9; 60 saves after the race-weekend rebuild, which matched the earlier 200-save curve):

| Season | 1 | 2 | 3 | 4 | 5 | 6–9 | 10 | 11 | 12 | 13–15 |
|---|---|---|---|---|---|---|---|---|---|---|
| Median position | 12th | 11th | 10th | 8th | 6th | 5th | 4th | 3rd | 2nd | 1st |

First points in season 3, first podium in season 7 and first win in season 9 (medians). The first title comes in seasons 8–12 in 38% of saves and by season 15 in 82% (45% and 89% before the race-weekend rebuild: the fastest car on the day now wins less often, by design, so the step to champion takes a little longer). The curve is met to season 5; seasons 6 to 9 sit at 5th, a season or two behind the curve, because the top four teams are a clear step above the rest and breaking into them takes a front-running organisation; the title then follows quickly. Once champion, a well-run team usually stays there (70% of these saves are champions in season 15). That is intended: a player good enough to reach the top has earned it, and staying there gets no extra difficulty beyond the rules that already bear on every leader (annual loss, aero allowance, cost cap).

A manager that does nothing at all now climbs slowly to about 10th, because designers with nothing queued bank their work for free and the starting staff produce more than before tuning. It has no sponsors left after two seasons and wins nothing.

**Why progress is always available:** diminishing returns favour slow cars, the aero allowance favours low finishers, the annual tightening costs fast cars more, each place gained is worth £5m–£12m in prize money, and the cost cap limits the leaders.

**Why it is not easy:** owner funding tapers to nothing, rivals poach from a rising team, driver and sponsor expectations climb, the aero allowance shrinks with success, and the final approach to the front needs several times the development capacity that reaching midfield does.

| Level | Start cash | Owner funding | AI development |
|---|---|---|---|
| Easy | £20m | Tapers from season 5 | −15% |
| Normal | £10m | Tapers from season 1 | Baseline |
| Hard | £5m | Tapers from season 1 | +15% |

## 7. Strategic routes

| Route | Idea | Cost |
|---|---|---|
| Backed drivers | Two funded drivers for two seasons, money into facilities | Slower drivers, sponsor targets missed |
| Bought-in car | Lean on supplier parts and a small design team | Chassis cap, later in-house transition |
| Specialist car | Low-drag car that scores at five power tracks | Nowhere at the downforce tracks |
| Sacrifice season | Bank most capacity for next year from mid-season | A poor finish hits prize money and confidence |
| Loans and academy | Borrow rivals' juniors now, grow your own later | Recalls, slow payback |
| Commercial first | Build sponsor income before lap time | Stays slow for longer |
| Star hire | Poach a top Technical Director early | Buyout, gardening leave, large salary |
| Borrowing | Loans and advances to accelerate | Interest, crisis risk |

## 8. Starting grid

The game starts at the 2027 season with the grid as it stood on 11 October 2026. Haas, Racing Bulls and Mercedes had not formally confirmed 2027 line-ups, so they are assumed unchanged.

Ratings are a judgement of underlying ability and car quality, not a conversion of this season's points. They are in the style of the official game's ratings but use different attributes and are not copied from it. All of them live in one data file and can be edited.

### Cars

| Team | Power unit | Aero | Chassis | Power | Reliability | Tyre Care | Gap to fastest (balanced track) |
|---|---|---|---|---|---|---|---|
| Mercedes | Mercedes | 93 | 92 | 91 | 90 | 86 | — |
| McLaren | Mercedes | 91 | 90 | 90 | 88 | 90 | +0.09 s |
| Ferrari | Ferrari | 93 | 91 | 85 | 86 | 88 | +0.09 s |
| Red Bull | Red Bull Ford | 88 | 88 | 93 | 83 | 84 | +0.15 s |
| Racing Bulls | Red Bull Ford | 78 | 80 | 92 | 82 | 78 | +0.50 s |
| Alpine | Mercedes | 76 | 74 | 90 | 82 | 74 | +0.67 s |
| Haas | Ferrari | 73 | 74 | 84 | 82 | 74 | +0.80 s |
| Audi | Audi | 72 | 73 | 83 | 76 | 76 | +0.85 s |
| Williams | Mercedes | 68 | 66 | 90 | 80 | 70 | +0.97 s |
| Aston Martin | Honda | 70 | 62 | 81 | 70 | 68 | +1.11 s |
| Cadillac | Ferrari | 58 | 60 | 84 | 74 | 64 | +1.35 s |
| **Player** | Chosen | 53 | 55 | By supplier | 60 | 55 | +1.54 s with Ferrari power |

Track type changes the order. On power tracks Red Bull moves level with McLaren and Williams passes Audi. On downforce tracks Ferrari is within 0.05 s of Mercedes and the player's gap grows to 2.0 s.

### Drivers

Age is at the start of the 2027 season. Potential is shown for drivers aged 25 or under.

| Driver | Team | Age | Pace | Racecraft | Consistency | Wet | Feedback | Marketability | Overall | Potential |
|---|---|---|---|---|---|---|---|---|---|---|
| Max Verstappen | Red Bull | 29 | 98 | 97 | 95 | 98 | 92 | 95 | 97 | — |
| Lewis Hamilton | Ferrari | 42 | 91 | 94 | 90 | 96 | 94 | 99 | 92 | — |
| Lando Norris | McLaren | 27 | 95 | 90 | 88 | 90 | 88 | 92 | 92 | — |
| Charles Leclerc | Ferrari | 29 | 96 | 90 | 86 | 86 | 88 | 93 | 91 | — |
| George Russell | Mercedes | 29 | 94 | 89 | 91 | 88 | 90 | 82 | 91 | — |
| Oscar Piastri | McLaren | 25 | 93 | 91 | 90 | 84 | 85 | 84 | 91 | 94 |
| Fernando Alonso | Aston Martin | 45 | 88 | 95 | 92 | 92 | 97 | 90 | 91 | — |
| Kimi Antonelli | Mercedes | 20 | 95 | 88 | 84 | 86 | 80 | 88 | 90 | 98 |
| Carlos Sainz | Williams | 32 | 89 | 88 | 89 | 88 | 95 | 84 | 89 | — |
| Pierre Gasly | Alpine | 31 | 88 | 86 | 86 | 88 | 85 | 78 | 87 | — |
| Alexander Albon | Williams | 30 | 86 | 86 | 87 | 82 | 86 | 78 | 86 | — |
| Nico Hülkenberg | Audi | 39 | 86 | 84 | 88 | 89 | 90 | 74 | 86 | — |
| Isack Hadjar | Red Bull | 22 | 88 | 83 | 82 | 82 | 78 | 74 | 85 | 93 |
| Esteban Ocon | Haas | 30 | 84 | 84 | 84 | 87 | 82 | 72 | 84 | — |
| Oliver Bearman | Haas | 21 | 87 | 84 | 78 | 80 | 78 | 76 | 83 | 93 |
| Liam Lawson | Racing Bulls | 25 | 85 | 85 | 81 | 80 | 78 | 72 | 83 | 87 |
| Gabriel Bortoleto | Audi | 22 | 85 | 81 | 82 | 78 | 80 | 74 | 82 | 91 |
| Sergio Pérez | Cadillac | 37 | 80 | 88 | 82 | 80 | 86 | 88 | 82 | — |
| Valtteri Bottas | Cadillac | 37 | 82 | 79 | 86 | 78 | 90 | 76 | 81 | — |
| Arvid Lindblad | Racing Bulls | 19 | 82 | 79 | 76 | 78 | 72 | 72 | 79 | 92 |
| Franco Colapinto | Alpine | 23 | 81 | 80 | 74 | 76 | 74 | 86 | 79 | 86 |
| Lance Stroll | Aston Martin | 28 | 78 | 79 | 76 | 86 | 74 | 70 | 79 | — |

### Available drivers at the start

Ratings first, then what each driver would cost and bring. Sponsor pull is a game value, not a real figure, and academy ties are as best known.

| Driver | Age | Pace | Racecraft | Consistency | Wet | Feedback | Marketability | Overall | Potential |
|---|---|---|---|---|---|---|---|---|---|
| Yuki Tsunoda | 26 | 85 | 82 | 80 | 80 | 80 | 80 | 83 | — |
| Pato O'Ward | 27 | 82 | 84 | 78 | 82 | 78 | 86 | 82 | — |
| Zhou Guanyu | 27 | 79 | 78 | 84 | 76 | 80 | 82 | 79 | — |
| Colton Herta | 26 | 80 | 80 | 74 | 76 | 76 | 80 | 78 | — |
| Felipe Drugovich | 26 | 79 | 77 | 80 | 76 | 78 | 68 | 78 | — |
| Kevin Magnussen | 34 | 78 | 80 | 76 | 78 | 82 | 70 | 78 | — |
| Leonardo Fornaroli | 22 | 79 | 76 | 82 | 74 | 76 | 62 | 78 | 87 |
| Rafael Câmara | 21 | 80 | 76 | 76 | 76 | 72 | 66 | 78 | 91 |
| Mick Schumacher | 27 | 78 | 76 | 76 | 78 | 78 | 90 | 77 | — |
| Alex Dunne | 21 | 80 | 76 | 68 | 82 | 70 | 70 | 77 | 90 |
| Luke Browning | 25 | 78 | 76 | 75 | 78 | 74 | 62 | 77 | 84 |
| Nikola Tsolov | 20 | 79 | 77 | 72 | 74 | 70 | 64 | 76 | 90 |
| Jack Doohan | 24 | 78 | 75 | 72 | 74 | 72 | 70 | 75 | 82 |
| Jak Crawford | 21 | 77 | 75 | 74 | 72 | 72 | 68 | 75 | 86 |

Backing range and starting interest below come from the formulas in section 5.6, at the player's starting reputation of 10. Starting interest is before the offer and the hidden personal factor; 60 signs.

| Driver | Sponsor pull | Backing range | Starting interest | Route |
|---|---|---|---|---|
| Yuki Tsunoda | 0.5 | £1.4m–£2.6m | 54 | Needs a good offer |
| Pato O'Ward | 1.0 | £3.6m–£6.8m | 45 | Needs a very good offer or more reputation |
| Zhou Guanyu | 2.3 | £7.1m–£13.2m | 59 | Close to signing at asking terms |
| Colton Herta | 1.7 | £4.8m–£8.8m | 60 | Signs at asking terms |
| Felipe Drugovich | 2.5 | £2.8m–£5.2m | 50 | Needs a good offer |
| Kevin Magnussen | 0 | None | 54 | Needs a good offer |
| Leonardo Fornaroli | 0.5 | Under £0.5m | 60 | Loan from McLaren |
| Rafael Câmara | 0 | None | 60 | Loan from Ferrari |
| Mick Schumacher | 0.8 | £3.4m–£6.2m | 51 | Needs a good offer |
| Alex Dunne | 0.5 | £0.7m–£1.3m | 61 | Signs at asking terms |
| Luke Browning | 0 | None | 61 | Loan from Williams |
| Nikola Tsolov | 0 | None | 63 | Loan from Red Bull |
| Jack Doohan | 2.0 | £2.8m–£5.2m | 64 | Signs at asking terms |
| Jak Crawford | 0.5 | £0.6m–£1.0m | 64 | Loan from Aston Martin |

### The player's team

| Item | Value |
|---|---|
| Cash | £10m |
| Workforce | 160: Aero 30, Mechanical 30, Manufacturing 45, Race Team 40, Commercial 15 |
| Key staff | All rated 45–60 |
| Facilities | As in 5.4 |
| Sponsors | One small title sponsor and two partners, about £10m a season |
| Reputation | 10 out of 100 |
| Rival scale | Front-runners have about 900 staff and spend to the cap |

## 9. Balance validation

The engine will be plain JavaScript with a seeded random generator and no UI dependency, so whole saves can run headless in Node. Three scripted managers play it:

| Bot | Behaviour | Target on Normal |
|---|---|---|
| Competent | Sensible priorities, follows the cash forecast, picks the better A/B option | First title in seasons 8–12 in about half of saves; a crisis in under 10% |
| Naive | Spreads money evenly, picks A/B at random | Plateaus at 7th–9th; a title by season 15 in under 5% |
| Reckless | Maximum spend and borrowing | A crisis in over half of saves |

Further checks:

- **A/B value.** The competent bot with random A/B choices should progress about 10% slower than with the better choices.
- **Season targets.** The competent bot should meet Safe targets about 80% of the time, Standard about 50% and Stretch about 20%.
- **World health.** With no player, 30 seasons of the 11 real teams should keep the front-to-back gap between about 1.0 s and 2.0 s, change the champion team several times, and let teams rise and fall by a few places a year without the order reshuffling completely.
- **Driver market.** Over the same 30 seasons, three to six of the 22 rival seats should change each winter, mid-season swaps should be rare, career lengths and retirement ages should look plausible, and the average rating of the grid should stay level, not creep up or down. Built, over four 30-season saves: 3.6 seats change a winter (0–13 in a single winter), 2 mid-season swaps in 120 seasons, drivers retire at 35 on average after about 9 seasons, and the grid's average Overall goes from 86.4 to 86.3.

Each tuning change is checked against 200 saves per bot.

**As built.** `tests/m5-balance.js` plays saves of 15 seasons with every system on (decisions, targets, market), four at a time on worker threads; `npm run test:m5` runs 200 saves per bot (well over an hour with the race-weekend simulation; 60 saves take about 10 minutes). Each finished save is written to `.m5/results.jsonl`, so a run can be stopped and resumed, and `--report` reports on the saves finished so far. The scripted managers are in `tests/bot.js`:

- **Competent** plans a season ahead (next season's income and running costs, not just this season's cash forecast) and takes a prize advance or a bank loan rather than fall into the overdraft. It signs the drivers worth most for their cost (an Overall point is worth more as reputation rises), switches power unit when a better one is affordable without its Chassis cap falling, builds the Design Office, CFD and Factory first, goes in-house once Chassis presses against the parts package's cap, saves for the next facility by banking design work (which costs nothing to build), puts most new engineers into Aero, invests in race operations and race staff once the car is near the midfield, and picks low-risk season targets.
- **Naive** keeps the designers busy on small safe upgrades, banks a quarter, accepts every sponsor, keeps two drivers at a fair price, and spreads the rest evenly: one facility after another in a fixed rotation and the same few heads for every department. It watches this season's forecast but plans no further, and picks A/B at random.
- **Reckless** spends everything and borrows to the limit.

Results over 60 saves per bot after the race-weekend rebuild and the extra race chaos (one target missed, the naive plateau; the 200-save figures from before the rebuild are in brackets where they differ):

| Check | Target | Built |
|---|---|---|
| Competent: first title in seasons 8–12 | About half | 38%, 82% by season 15 (45%, 89%) |
| Competent: crisis | Under 10% | 0% |
| Naive: plateau | 7th–9th | Missed: 9th from season 7, 7th by season 12 and 6th in season 15; the extra chaos helps a middling team score |
| Naive: title by season 15 | Under 5% | 0% |
| Reckless: crisis | Over half | 100% |
| A/B value | About 10% | Random choices score 92% of the points over ten seasons; first title by season 15 in 70% of saves instead of 82% |
| Season targets, competent | 80 / 50 / 20% | 76 / 37 / 13% over every offered objective; results objectives 71–84 / 37–55 / 11–24%. Sponsor-fee targets above Safe need an extra deal (4% and 0%), and Aero rating gained is rarely met by a manager that banks heavily for facilities (28 / 10 / 0%) |

World health with no player (30 seasons, six saves): the front-to-back gap stays between 1.1 and 1.5 s, three or four teams win titles and the title changes hands several times, and teams move about half a place a year. Mercedes still wins about two-thirds of titles: its starting car settles about 0.09 s clear and it signs the best drivers; small development swings near the top barely move this because of the diminishing returns.

## 10. Build order

| Milestone | Contents | Playable result |
|---|---|---|
| M1 Race weekend (built) | Real team, driver and track data; seeded RNG; qualifying and race simulation; standings; bare UI; saves; calibration test | A full season of simulated weekends with fixed cars |
| M2 Money and development (built) | Finance loop, sponsors, upgrades, next-year car, annual tightening, facilities, workforce, key staff, season rollover. Moved here from M4: rival car development, the aero allowance, the cost cap and the crisis | Multi-season play with real trade-offs |
| M3 Decisions and targets (built) | The A/B deck (80 decisions), staff-dependent information, decision log; season targets with the pre-season projection | A decision every round and three targets a season |
| M4 People and world (built) | Driver market in three stages, the hidden personal factor, loans and recalls, academy, ageing and regression, rival driver reviews, new drivers, rival form events, poaching, supplier drift, honours board | An endless save |
| M5 Balance (built) | Bot managers and harness, tuning to sections 6 and 9 | A save that hits the target curve |

## 11. Flaws checked

| Issue | Resolution |
|---|---|
| Found in the build: banked work at 1.5 times the value made banking everything, every year, the best play | Banked work is now worth the same as in-season work; it is free to build and escapes the winter cut |
| Found in the build: with no winter loss, every car's Reliability would creep towards 100 in a long save | Reliability loses 2% each winter |
| Found in the build: one mechanical department could not hold three ratings against the winter loss | Mechanical designers produce more work per head than aerodynamicists |
| Found in the build: a team could set easy targets with weak drivers and then sign better ones | Targets are set last; drivers and power unit are then fixed for the season |
| Found in the build: borrowing on the last day met a cash target | Cash targets are net of bank debt |
| Found in the build: 38 of the 80 decisions always favoured the same option | Numbers reworked; every decision now has each option come out best in some situation, by the scripted manager's own valuation |
| Found in the build: the fastest starting team (Mercedes) won about 80% of titles over 30 seasons, because diminishing returns pin top cars to their starting ratings | Each rival's reading of the winter rules adds a random ±0.9 to Aero and Chassis. The title now changes hands several times in 30 seasons (Mercedes still wins about 70%; milestone 5) |
| Found in the build: a driver whose contract expired had to vanish at once, before the player could react | Out-of-contract drivers stay until the market closes and can be re-signed; rivals can take them from stage 2 |
| Found in the build: real drivers' careers before 2027 are unknown, so "retires after 32 starts" misled | Career numbers count from 2027 and are labelled as such |
| Found in balancing: a department told to repeat a Chassis upgrade crashed the round when Chassis reached the parts package's cap | The repeat stops quietly and the designers bank the work |
| Found in balancing: a sensible manager with the first-pass numbers reached only 5th–6th in 15 seasons, and every scripted manager kept falling into crises | Development output +60% (factory output with it), cheaper top facility levels, faster reputation, larger sponsor values; the competent manager plans a season ahead |
| Found in balancing: with cheaper development, a manager who spread money evenly reached the top six | Staff cost £0.095m a head; key staff multiply output more strongly; steeper diminishing returns above 50 |
| Found in balancing: the A/B valuation counted cash as tight only when the bank balance was low, so the scripted manager paid big sums early with a negative forecast | A cost that would take the season's forecast past the overdraft limit is valued at three times its size |
| Found in balancing: sponsor-fee targets above Safe were a percentage over a figure fixed by signed deals, so almost impossible | Standard and Stretch now ask for one or two more deals |
| Found in balancing: a crisis did not say what caused it | The finance record logs each crisis with its cause (cash or owner confidence) |
| Fixed backing and availability per driver left nothing to decide | Interest, salary and backing are formulas with a random part, shown as estimates, in a three-stage market |
| If targets only had rewards, Stretch would always be the right pick | A reward is paid only at the chosen level, and every miss costs owner confidence |
| Rivals judging drivers perfectly would leave no bargains | Rivals judge on noisy results; the player sees true current ratings |
| The real grid already has 11 teams | The player is the 12th. 24 cars, points still to the top ten, prize and aero tables extended to 12 places |
| The real field is more spread out than v1 assumed | One rating point is now 0.05 s. The player starts 1.7 s off the front and 0.4 s behind Cadillac |
| Removing race control removed the player's only way to take or avoid risk on race day | The race approach setting, plus race-weekend calls in the A/B deck |
| Practice, qualifying and component choices depended on live control | Cut. Component and setup choices appear as A/B decisions |
| Without a rules reset nothing would reshuffle the order | Percentage-based annual loss, diminishing returns, supplier drift and rival form events |
| An endless save needs a world that renews | Driver ageing, retirement and new drivers; rivals whose resources follow results; an honours board and objectives that continue after a title |
| "No definite end" conflicts with game over on bankruptcy or sacking | Replaced by the crisis in section 4 |
| A runaway leader would make a long save dull, whether it is the player or a rival | For the rival world: the annual loss, aero allowance, cost cap and rival pressure bear hardest on the leader, checked by the world-health test. For the player: decided against adding difficulty to staying on top; a player who gets there has earned it |
| A/B decisions could become coin flips or have one obvious answer | The right answer depends on context, information quality depends on staff, and the harness measures what good choices are worth |
| Reloading a save to re-roll a decision or race | Outcomes are fixed from the save's seed when the round starts |
| Real juniors are contracted to rival academies | Loan mechanic |
| Ratings will go out of date | One editable data file |
| Real team and driver names | Fine for a personal game. They would need replacing before any public release |

## 12. Left out of v1

Live race control, a lap-by-lap race model, sprint weekends, becoming an engine manufacturer, real engineers and team principals, equity sales, the full 24-race calendar and all visual polish.
