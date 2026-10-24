# Ultimate F1 Manager: visuals (plan and build history)

The game's pictures, planned and built in steps, V1 to V5, the way the race weekend was (RACE_WEEKEND.md).

## Principles

1. **Drawn in code.** Faces, charts and the 2D pieces are SVG drawn from the game's data; the 3D car is built from shapes in code. No image files, and nothing the game doesn't need on a screen is loaded with it: the 3D library loads only with the Car tab.
2. **Pictures show the game, not decoration.** Each one changes with the game: a face shows its driver's mood and age, the car shows the upgrades being built.
3. **One style.** Every face is drawn the same way; drivers are told apart by a handful of traits. Real drivers look a little like themselves, at caricature level, never a likeness.
4. **Results never change.** The pictures only read the game; the race simulation and its results are untouched.

## The plan

| Step | Contents | What you get |
|---|---|---|
| V1 Looks | The face component with moods and ageing, the traits file for real drivers, a gallery of every face | The style, checked before it goes everywhere |
| V2 Faces in place | The driver list, contract talks (the face shows how keen a driver is), the market, the debrief, race moments, small heads on the timing tower | Drivers become people |
| V3 Car, stage 1 | A low-poly 3D car in the team's colours on the Car tab, drag to rotate; a flat drawing where 3D is not available | The car you can spin |
| V4 Car, stage 2 | Parts tied to the ratings: wings and floor for Aero, bodywork for Chassis, suspension for Tyre Care, cooling for Reliability. A part in design shows as a wireframe, a new part glows for a race, a dud is greyed out; tap a part for its rating | The Car tab shows what you are building |
| V5 Smaller wins | Circuit outlines on the calendar and briefing, championship progress as a line, the cash forecast as a chart, HQ as a building that grows, a team badge and livery picked at the start | Builds on what is already there |

After V5: the car's third stage (more detail as ratings rise, sponsor logos, set camera views, a rival's car alongside).

## Built, in order

- **V1, looks** (`src/ui/faces.js`, `src/ui/Face.jsx`, `src/ui/data/looks.js`): a head-and-shoulders face in the team's race suit, built from traits: face shape, skin, hair colour and style, brows, eyes and their colour, nose, facial hair and glasses. A driver's traits come from `looks.js` where they have a line there, and are otherwise rolled once from their id, so a face never changes. Faces age: hair greys from an age each driver rolls, some hairlines recede and in time go, and lines come in the late thirties. A mood from -1 to 1 moves the brows, eyes and mouth. Rolled faces have no facial hair; that is set per driver in `looks.js`. `?faces` on the game's address opens a gallery of every face and each trait in turn. Checks: `tests/v1-check.js`.

## Not built yet

- **Real drivers' looks.** `looks.js` is empty, so every real driver's face is rolled for now. The traits are to be set from labelled photos (Wikimedia Commons), which the build environment could not reach; each line will note its photo and date.
