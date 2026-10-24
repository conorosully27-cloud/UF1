// How each real driver looks, for their face (VISUALS.md, V1). Every driver
// without a line here, real or generated, gets a look rolled once from their
// id, so it never changes (`faceTraits` in faces.js). A line here replaces
// only the traits it names.
//
// The real drivers' lines are still to be filled in from labelled photos (the
// photo sources could not be reached from the build environment), so for now
// every real driver's look is rolled too. Note the photo and its date beside
// each line when it is added, so it can be updated when a driver changes their
// look.
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
}
