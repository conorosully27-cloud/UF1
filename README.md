# Ultimate F1 Manager

A Formula 1 team-management game that runs in the browser. You run the 12th and newest team on the grid: build the car, hire the people, find the money, and run every race weekend from the pit wall, from Friday practice through live qualifying to the race, lap by lap.

## Running it

You need Node.js (18 or later).

```
npm install
npm run dev      # play: opens on http://localhost:5180
npm run build    # a production build in dist/
```

The game saves in the browser's local storage.

## Checking it

```
npm run test:fast     # everyday: smaller samples, about a minute
npm test              # everything, full samples: about 4 minutes; run before merging
npm run test:weekend  # just the race-weekend checks
```

The checks run side by side, one per processor core (`tests/run.js`); `node tests/run.js w6-check m2-check` runs only those, and each can also be run on its own with `node tests/<name>.js`. The fast run uses smaller samples (`FAST=1`) and leaves out the pit-wall measure, so its calibration numbers are only a rough guide.

| Check | What it covers |
|---|---|
| `m1-check` | The race simulation: structure, determinism and calibration against real-world rates |
| `m2-check` | Money, development, HQ, sponsors, rivals and the season |
| `m3-check` | The A/B decision deck and season targets |
| `m4-check` | Drivers, the winter market, the academy and rival reviews |
| `w2-check` | The live race weekend |
| `w3-check` | Knockout qualifying |
| `w4-check` | Friday practice |
| `w5-check` | Weekend incidents from the decision deck |
| `w55-check` | Incident outcomes, practice crashes, wet Fridays, lapped cars, double-stacking |
| `w6-check` | The race lap by lap, qualifying as it happens, and old saves |
| `w5-strategist` | What the pit wall is worth: an expert, the strategist and a random player on the same races |
| `v1-check` | Drivers' faces: fixed looks, every trait combination drawn, variety |
| `v2-check` | Faces in place: moods from contract interest and race ratings, faces in moments |
| `v3-check` | The car on the Car tab: each rating's upgrades in design, in the factory, new or a dud; detail by rating, sponsors' names, a rival to compare |
| `v5-check` | Circuit outlines, the cash filed after each race, the livery and badge |

`npm run test:m5` runs the balance harness (scripted managers over many seasons).

## Where things are

- `DESIGN.md`: how the game works, and the numbers behind it.
- `RACE_WEEKEND.md`: how the race weekend was built, step by step, and what is still to do.
- `VISUALS.md`: the plan for the game's pictures (faces, the 3D car, charts), step by step.
- `src/engine/`: the game itself, with no UI. `weekend.js` is the race simulation (with `qualifying.js`), `live.js` the race weekend played live, `game.js` the season, `util.js` small shared helpers.
- `src/ui/`: the React screens. The race weekend is `LiveWeekend.jsx`, which shows `BriefingScreen.jsx`, `PracticeScreen.jsx`, `QualiScreen.jsx`, `GridScreen.jsx` or `RaceScreen.jsx` (shared pieces in `weekendParts.jsx`); `RaceMap.jsx` and `speedProfile.js` draw the live track map; `faces.js` and `Face.jsx` draw drivers' faces, with real drivers' looks in `data/looks.js`. Add `?faces` to the game's address to see every face. The 3D car on the Car tab is `CarView.jsx`, `Car3D.jsx` and `carModel.js` (three.js, loaded only with that tab), with what it shows in `carParts.js`. `Charts.jsx` draws the championship and cash charts, `HqBuilding.jsx` the headquarters, `TrackOutline.jsx` circuit outlines and `Badge.jsx` the team badge (`livery.js`).
- `tests/`: the checks above.

Circuit outlines are from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), used under the MIT licence.
