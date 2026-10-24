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

- **V1, looks** (`src/ui/faces.js`, `src/ui/Face.jsx`, `src/ui/data/looks.js`): a head-and-shoulders face in the team's race suit, built from traits: face shape, skin, hair colour and style, brows, eyes and their colour, nose, facial hair and glasses. A driver's traits come from `looks.js` where they have a line there, and are otherwise rolled once from their id, so a face never changes. Real drivers have a skin tone and hair colour there for now. Faces age: hair greys from an age each driver rolls, some hairlines recede and in time go, and lines come in the late thirties. A mood from -1 to 1 moves the brows, eyes and mouth. Rolled faces have no facial hair; that is set per driver in `looks.js`. `?faces` on the game's address opens a gallery of every face and each trait in turn. Checks: `tests/v1-check.js`.

- **V2, faces in place**: faces on the driver lists (your drivers, the academy, drivers without a seat), in contract talks, on the debrief, in moments and as small heads on every timing tower. In contract talks the face shows how the offer lands, from the interest you can see (60 signs, so a driver who might sign looks undecided; the hidden personal factor never shows): keen, interested, unsure or not interested, changing as the terms change. On the debrief a driver's face follows their rating for the race, and is unhappy after a retirement that was not their fault. Moments show the drivers they are about: pleased on a podium, glum outside the points, downcast when out, and a large face for a moment about one driver, such as a star signing. The offer form stays in view however far its table is scrolled. Checks: `tests/v2-check.js`.

- **V3 and V4, the car** (`src/ui/CarView.jsx`, `src/ui/Car3D.jsx`, `src/ui/carModel.js`, `src/ui/carParts.js`): a low-poly 3D car at the top of the Car tab, in the team's colours, built from simple shapes in code with three.js. It turns slowly on its own; drag to turn it, pinch or scroll to zoom, tap a part to pick its rating. three.js comes in a file of its own (about 550 kB, 140 kB compressed) that loads only with the Car tab, and the car draws only while it is on screen. Each part belongs to a rating: the wings, floor and diffuser to Aero; the nose, monocoque, sidepods and engine cover to Chassis; the suspension to Tyre Care (a tap on a wheel picks it too); the cooling inlets, louvres and outlet to Reliability; the airbox and exhaust to Power. A rating's parts show where its upgrades are, the most recent first: a gold glow for a part fitted for the last race, grey for an upgrade that gave nothing, filling in as a part is built in the factory, and a faint ghost in outline while it is in design. Below the car each rating has its value and state; picking one shows the rating, as raced, what each unit of work adds, the last part fitted and each project's progress. Where the browser cannot draw 3D (and while the 3D file loads) the car is drawn flat from above, with the same parts and states. Checks: `tests/v3-check.js`.

## Not built yet

- **Real drivers' looks.** Each real driver has only a skin tone and hair colour in `looks.js`, from memory; the rest of their look is rolled. The full traits are to be set from labelled photos (Wikimedia Commons), which the build environment could not reach; each line will note its photo and date.
