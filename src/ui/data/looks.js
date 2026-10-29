// How each real driver looks, for their face (VISUALS.md, V1). Every driver
// without a line here, real or generated, gets a look rolled once from their
// id, so it never changes (`faceTraits` in faces.js). A line here replaces
// only the traits it names.
//
// The real drivers' lines were set in October 2026 from labelled photos on
// Wikimedia Commons, each line noting its file. A trait a photo could not show
// (eyes behind sunglasses, hair under a cap) is left out and rolled. Update a
// line from a newer photo when a driver changes their look.
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
// For example:  someid: seen({ shape: 'square', skin: 2, hair: 'brown', style: 'side', facial: 'stubble' }), // photo file

// A look from a photo: the hairline recedes only if a line says so, and grey
// starts at 40 unless the photo shows it sooner.
const seen = (traits) => ({ recedeAge: null, greyAge: 40, ...traits })

export const LOOKS = {
  // Race drivers.
  verstappen: seen({ shape: 'long', skin: 1, hair: 'brown', style: 'side', brows: 'straight', eyes: 'almond', eyeColor: 'blue', nose: 'straight', facial: 'stubble' }), // 2024-08-25_Motorsport,_Formel_1,_Großer_Preis_der_Niederlande_2024_STP_3973_by_Stepro_(portrait_cropped).jpg
  hadjar: seen({ shape: 'oval', skin: 3, hair: 'black', style: 'curly', brows: 'thick', eyes: 'almond', eyeColor: 'brown', nose: 'straight', facial: 'none' }), // Isack_Hadjar_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_(028A8753)_cropped.jpg
  russell: seen({ shape: 'long', skin: 1, hair: 'brown', style: 'short', brows: 'straight', eyes: 'round', eyeColor: 'blue', nose: 'straight', facial: 'none' }), // KingsLeonSilverstne040724_(28_of_112)_(53838006028)_(cropped).jpg
  antonelli: seen({ shape: 'oval', skin: 1, hair: 'brown', style: 'curly', brows: 'arched', eyes: 'almond', eyeColor: 'brown', nose: 'straight', facial: 'none' }), // Kimi_Antonelli_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_(028A7923)_cropped.jpg
  norris: seen({ shape: 'oval', skin: 1, hair: 'brown', style: 'curly', brows: 'straight', eyes: 'narrow', eyeColor: 'hazel', nose: 'straight', facial: 'stubble' }), // 2024-08-25_Motorsport,_Formel_1,_Großer_Preis_der_Niederlande_2024_STP_4016_by_Stepro_(cropped).jpg
  piastri: seen({ shape: 'long', skin: 0, hair: 'brown', style: 'short', brows: 'straight', eyes: 'hooded', eyeColor: 'brown', nose: 'long', facial: 'none' }), // Oscar_Piastri_2025_(cropped).jpg
  leclerc: seen({ shape: 'long', skin: 1, hair: 'darkBrown', style: 'side', brows: 'thick', eyes: 'almond', eyeColor: 'green', nose: 'straight', facial: 'goatee' }), // 2024-08-25_Motorsport,_Formel_1,_Großer_Preis_der_Niederlande_2024_STP_3978_by_Stepro_(cropped2).jpg
  hamilton: seen({ shape: 'oval', skin: 5, hair: 'black', style: 'bun', brows: 'thick', eyes: 'almond', eyeColor: 'darkBrown', nose: 'wide', facial: 'beard', greyAge: 44 }), // Prime_Minister_Keir_Starmer_meets_Sir_Lewis_Hamilton_(54566928382)_(cropped).jpg
  lawson: seen({ shape: 'square', skin: 1, hair: 'lightBrown', style: 'messy', brows: 'straight', eyes: 'almond', eyeColor: 'blue', nose: 'straight', facial: 'stubble' }), // Liam_Lawson_at_the_Red_Bull_Fan_Zone_–_Crown_Riverwalk,_Melbourne_(028A7795).jpg
  lindblad: seen({ shape: 'oval', skin: 3, hair: 'black', style: 'curly', brows: 'thick', eyes: 'almond', eyeColor: 'darkBrown', nose: 'wide', facial: 'none' }), // Arvid_Lindblad_at_the_Red_Bull_Fan_Zone_–_Crown_Riverwalk,_Melbourne_(028A7869).jpg
  gasly: seen({ shape: 'long', skin: 1, hair: 'darkBrown', style: 'short', brows: 'straight', eyes: 'almond', nose: 'straight', facial: 'short' }), // 2022_French_Grand_Prix_(52279066548)_(cropped)_(cropped).png
  colapinto: seen({ shape: 'oval', skin: 1, hair: 'brown', style: 'messy', brows: 'straight', eyes: 'almond', eyeColor: 'brown', nose: 'straight', facial: 'none' }), // Franco_Colapinto_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_(028A8689).jpg
  ocon: seen({ shape: 'long', skin: 1, hair: 'darkBrown', style: 'short', brows: 'thick', eyes: 'hooded', eyeColor: 'brown', nose: 'long', facial: 'stubble' }), // Esteban_Ocon_2024_Suzuka_(cropped).jpg
  bearman: seen({ shape: 'oval', skin: 1, hair: 'darkBrown', style: 'short', brows: 'straight', eyes: 'narrow', eyeColor: 'brown', nose: 'straight', facial: 'none' }), // 2025_Japan_GP_-_Haas_-_Oliver_Bearman_-_Thursday_(cropped02).jpg
  hulkenberg: seen({ shape: 'square', skin: 0, hair: 'lightBrown', style: 'quiff', brows: 'straight', eyes: 'almond', eyeColor: 'blue', nose: 'straight', facial: 'stubble' }), // 2019_Formula_One_tests_Barcelona,_Hulkenberg_(40287128313)_(headshot).jpg
  bortoleto: seen({ shape: 'long', skin: 2, hair: 'black', style: 'curly', brows: 'thick', eyes: 'almond', eyeColor: 'brown', nose: 'long', facial: 'none' }), // Gabriel_Bortoleto_(cropped).jpg
  sainz: seen({ shape: 'long', skin: 2, hair: 'darkBrown', style: 'short', brows: 'thick', eyes: 'almond', eyeColor: 'brown', nose: 'straight', facial: 'short' }), // Formula1Gabelhofen2022_(04)_(cropped2).jpg
  albon: seen({ shape: 'oval', skin: 2, hair: 'black', style: 'short', brows: 'straight', eyes: 'almond', eyeColor: 'darkBrown', nose: 'small', facial: 'none' }), // Alex_Albon_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_(028A8626)_(cropped).jpg
  alonso: seen({ shape: 'long', skin: 2, hair: 'darkBrown', style: 'short', brows: 'thick', eyes: 'hooded', eyeColor: 'darkBrown', nose: 'long', facial: 'short', greyAge: 41 }), // Fernando_Alonso_racing_at_the_2024_F1_in_Schools_World_Finals_(cropped).jpg
  stroll: seen({ shape: 'long', skin: 1, hair: 'darkBrown', style: 'quiff', brows: 'thick', eyes: 'almond', eyeColor: 'brown', nose: 'long', facial: 'stubble' }), // FIA_F1_Austria_2022_Lance_Stroll_(cropped_2).jpg
  perez: seen({ shape: 'round', skin: 3, hair: 'black', style: 'short', brows: 'thick', eyes: 'almond', eyeColor: 'darkBrown', nose: 'wide', facial: 'none' }), // 2021_US_GP_driver_parade_(cropped2).jpg
  bottas: seen({ shape: 'square', skin: 0, hair: 'blond', style: 'messy', brows: 'straight', eyes: 'almond', eyeColor: 'blue', nose: 'straight', facial: 'moustache' }), // Valtteri_Bottas_at_the_2026_Adelaide_Motorsport_Festival_(028A7556).jpg
  // Free agents and juniors.
  tsunoda: seen({ shape: 'oval', skin: 2, hair: 'black', style: 'short', brows: 'straight', eyes: 'narrow', eyeColor: 'darkBrown', nose: 'small', facial: 'none' }), // Yuki_Tsunoda_at_the_Melbourne_Walk_during_the_2026_Australian_Grand_Prix_(028A8096).jpg
  oward: seen({ shape: 'oval', skin: 2, hair: 'brown', style: 'quiff', brows: 'straight', eyes: 'almond', eyeColor: 'brown', nose: 'straight', facial: 'none' }), // Pato_O'Ward_(2021).jpg
  zhou: seen({ shape: 'long', skin: 2, hair: 'black', style: 'short', brows: 'straight', eyes: 'narrow', eyeColor: 'darkBrown', nose: 'straight', facial: 'none' }), // Zhou_Guanyu_at_the_2022_Austrian_Grand_Prix.jpg
  herta: seen({ shape: 'square', skin: 1, hair: 'brown', style: 'long', brows: 'straight', eyes: 'almond', eyeColor: 'brown', nose: 'straight', facial: 'stubble' }), // Colton_Herta_(2021).jpg
  drugovich: seen({ shape: 'long', skin: 1, hair: 'darkBrown', style: 'side', brows: 'thick', eyes: 'almond', eyeColor: 'brown', nose: 'long', facial: 'stubble' }), // 2023_Fala,_Drugovich_(interview)_01.jpg
  magnussen: seen({ shape: 'square', skin: 0, hair: 'blond', style: 'side', brows: 'straight', eyes: 'almond', eyeColor: 'blue', nose: 'straight', facial: 'short' }), // Kevin_Magnussen,_2019_Formula_One_Tests_Barcelona_(cropped).jpg
  fornaroli: { skin: 1, hair: 'darkBrown' }, // no portrait on Commons (only car photos): from memory
  camara: seen({ shape: 'oval', skin: 2, hair: 'darkBrown', style: 'side', brows: 'thick', eyes: 'almond', eyeColor: 'brown', nose: 'straight', facial: 'none' }), // Rafael_Câmara_in_2022.jpg
  schumacher: seen({ shape: 'square', skin: 0, hair: 'lightBrown', style: 'side', brows: 'straight', eyes: 'almond', eyeColor: 'blue', nose: 'straight', facial: 'none' }), // Mick_Schumacher_in_2022.JPG
  dunne: seen({ shape: 'round', skin: 0, hair: 'brown', style: 'curly', brows: 'straight', eyes: 'almond', eyeColor: 'blue', nose: 'straight', facial: 'none' }), // Alex_dunne_zandvoort_2025_(cropped2).jpg
  browning: seen({ shape: 'oval', skin: 1, hair: 'brown', style: 'short', facial: 'none' }), // Luke_Browning.jpg
  tsolov: seen({ shape: 'oval', skin: 1, hair: 'blond', style: 'messy', brows: 'straight', eyes: 'almond', nose: 'straight', facial: 'none' }), // Nikola_Tsolov_Monza_2025.jpg
  doohan: seen({ shape: 'long', skin: 1, hair: 'darkBrown', style: 'short', brows: 'straight', eyes: 'almond', eyeColor: 'brown', nose: 'straight', facial: 'none' }), // Jack_Doohan_Austria_2022.jpg
  crawford: seen({ shape: 'long', skin: 1, hair: 'brown', style: 'curly', brows: 'straight', eyes: 'almond', nose: 'straight', facial: 'short' }), // Jak_Crawford_2026.png
  aron: seen({ shape: 'oval', skin: 0, hair: 'blond', style: 'messy', brows: 'straight', nose: 'straight', facial: 'none' }), // Paul-Aron-F2-2024.jpg
  iwasa: seen({ shape: 'oval', skin: 2, hair: 'black', style: 'messy', brows: 'straight', eyes: 'narrow', eyeColor: 'darkBrown', nose: 'small', facial: 'none' }), // Ayumu_Iwasa_Austria_2022.jpg
  vesti: seen({ shape: 'long', skin: 0, hair: 'lightBrown', style: 'side', brows: 'straight', eyes: 'almond', eyeColor: 'blue', nose: 'straight', facial: 'none' }), // Frederik_Vesti_-_Singapore_Adidas_Orchard_Ignition_(A)_(cropped).jpg
  sargeant: seen({ shape: 'long', skin: 1, hair: 'lightBrown', style: 'short', brows: 'straight', eyes: 'almond', eyeColor: 'blue', nose: 'straight', facial: 'none' }), // Logan_Sargeant_NYC_(cropped).jpg
}
