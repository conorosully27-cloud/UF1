// How each real driver looks, for their face (VISUALS.md, V1). Every driver
// without a line here, real or generated, gets a look rolled once from their
// id, so it never changes (`faceTraits` in faces.js). A line here replaces
// only the traits it names.
//
// The real drivers' lines are to be filled in from labelled photos, which the
// build environment could not reach. Until then each has only a skin tone and
// a hair colour, from memory, so no face is plainly wrong; the rest of their
// look is rolled. Replace each line from a photo, noting the photo and its
// date beside it, so it can be updated when a driver changes their look.
//
// The traits and their values:
//   shape      oval, round, square, long, heart
//   skin       0 (lightest) to 7 (darkest)
//   hair       black, darkBrown, brown, lightBrown, blond, platinum, ginger, auburn
//   style      buzz, short, side, quiff, curly, slick, messy, long, bun, receding, bald
//   brows      straight, arched, angled, thick, thin
//   eyes       almond, round, narrow, hooded
//   eyeColor   brown, darkBrown, hazel, green, blue, grey
//   nose       straight, small, wide, long
//   facial     none, stubble, short, beard, moustache, goatee
//   glasses    true or false
//   recedeAge  the age at which the hair starts to recede, or null for never
//              (only short styles recede; long hair and buns do not)
//   greyAge    the age at which the hair starts to go grey
//
// For example:  someid: { shape: 'square', skin: 2, hair: 'brown', style: 'side', facial: 'stubble' },  // photo, year

export const LOOKS = {
  // Race drivers. Skin and hair colour only, from memory, until set from photos.
  verstappen: { skin: 1, hair: 'brown' },
  hadjar: { skin: 2, hair: 'darkBrown' },
  russell: { skin: 1, hair: 'brown' },
  antonelli: { skin: 1, hair: 'darkBrown' },
  norris: { skin: 1, hair: 'brown' },
  piastri: { skin: 1, hair: 'darkBrown' },
  leclerc: { skin: 1, hair: 'darkBrown' },
  hamilton: { skin: 5, hair: 'black' },
  lawson: { skin: 1, hair: 'brown' },
  lindblad: { skin: 3, hair: 'darkBrown' },
  gasly: { skin: 1, hair: 'darkBrown' },
  colapinto: { skin: 2, hair: 'darkBrown' },
  ocon: { skin: 1, hair: 'darkBrown' },
  bearman: { skin: 1, hair: 'brown' },
  hulkenberg: { skin: 1, hair: 'lightBrown' },
  bortoleto: { skin: 2, hair: 'darkBrown' },
  sainz: { skin: 2, hair: 'darkBrown' },
  albon: { skin: 2, hair: 'black' },
  alonso: { skin: 2, hair: 'darkBrown' },
  stroll: { skin: 1, hair: 'darkBrown' },
  perez: { skin: 3, hair: 'black' },
  bottas: { skin: 0, hair: 'blond' },
  // Free agents and juniors.
  tsunoda: { skin: 2, hair: 'black' },
  oward: { skin: 2, hair: 'darkBrown' },
  zhou: { skin: 2, hair: 'black' },
  herta: { skin: 1, hair: 'lightBrown' },
  drugovich: { skin: 1, hair: 'brown' },
  magnussen: { skin: 1, hair: 'lightBrown' },
  fornaroli: { skin: 1, hair: 'darkBrown' },
  camara: { skin: 2, hair: 'darkBrown' },
  schumacher: { skin: 1, hair: 'lightBrown' },
  dunne: { skin: 0, hair: 'lightBrown' },
  browning: { skin: 1, hair: 'brown' },
  tsolov: { skin: 1, hair: 'darkBrown' },
  doohan: { skin: 1, hair: 'brown' },
  crawford: { skin: 1, hair: 'brown' },
  aron: { skin: 1, hair: 'lightBrown' },
  iwasa: { skin: 2, hair: 'black' },
  vesti: { skin: 0, hair: 'lightBrown' },
  sargeant: { skin: 1, hair: 'brown' },
}
