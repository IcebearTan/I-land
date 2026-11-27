/**
 * Stardew-inspired cute East-Asian pixel palette for "her":
 * - Silky natural soft-black hair (warm espresso-charcoal 4-tone sheen)
 * - Creamy peach skin + rosy blush (mouthless chibi face)
 * - Delicate thin round glasses (`O-O` clear lens, same-side catchlight, gradient iris)
 * - Warm yellow-tinted grass/matcha green raglan cat top + slim denim + white sneakers
 */
export const HER_PALETTE = {
  // Freshly-washed natural soft black hair (warm charcoal-espresso sheen)
  '0': [0x1b, 0x17, 0x22, 255], // soft ink outer edge
  '1': [0x2c, 0x26, 0x36, 255], // main silky soft-black hair
  '2': [0x43, 0x3b, 0x52, 255], // satin mid-tone locks
  '3': [0x63, 0x58, 0x75, 255], // glossy angel-ring highlight

  // Soft warm East-Asian rosy skin
  'k': [0xd1, 0x96, 0x7d, 255], // warm peach chin/hand contour
  's': [0xff, 0xe6, 0xd2, 255], // creamy peach skin
  'p': [0xff, 0x9e, 0xaa, 255], // sweet pink cheek blush

  // Delicate thin round glasses & sparkling gradient chibi eyes
  'e': [0x19, 0x13, 0x21, 255], // crisp dark upper pupil
  'E': [0x38, 0x29, 0x45, 255], // soft plum lower iris
  'w': [0xff, 0xf6, 0xed, 255], // tiny upper-left catchlight
  'r': [0x45, 0x39, 0x4f, 255], // thin charcoal round upper/side frame
  'b': [0x5e, 0x4e, 0x69, 255], // dainty arched nose bridge
  'q': [0x8c, 0x70, 0x7e, 255], // soft round lower/inner rim curve
  'u': [0xc7, 0x9c, 0x92, 255], // ultra-light inner lower rim hint

  // Slightly yellow-warmed fresh grass/matcha green + charcoal raglan sleeves
  't': [0x4b, 0x60, 0x26, 255], // warm olive-green outline
  'h': [0x86, 0xa6, 0x42, 255], // warm grass shadow
  'G': [0xaf, 0xcc, 0x5c, 255], // warm yellow-tinted grass green main
  'L': [0xcc, 0xe3, 0x7b, 255], // sunlit sprout highlight
  'a': [0x20, 0x21, 0x2e, 255], // black raglan sleeve outline
  'A': [0x33, 0x35, 0x46, 255], // black raglan sleeve fill
  'B': [0x4a, 0x4d, 0x63, 255], // soft sleeve highlight

  // Luo Xiaohei chubby black cat motif on chest
  'c': [0x18, 0x17, 0x21, 255], // solid black cat fur
  'y': [0xff, 0xe0, 0x66, 255], // warm golden cat eyes

  // Clean slim mid-blue denim jeans + crisp white sneakers
  'j': [0x2c, 0x44, 0x69, 255], // denim outline / center seam
  'D': [0x41, 0x65, 0x94, 255], // denim shadow
  'J': [0x58, 0x85, 0xbd, 255], // clean denim blue
  'd': [0x79, 0xa6, 0xd9, 255], // denim front highlight
  'z': [0x5d, 0x64, 0x75, 255], // sneaker sole outline
  'W': [0xff, 0xfb, 0xf5, 255], // crisp off-white sneaker upper
  'v': [0xde, 0xe3, 0xec, 255], // sneaker mid sole
}
