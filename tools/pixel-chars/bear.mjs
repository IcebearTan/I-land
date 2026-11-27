import { PixelCanvas } from '../pixel-ui/canvas.mjs'

/**
 * Cute plump 32x32 pixel Ice Bear ("bear"):
 * - Soft round polar-bear ears (never pointy sticks!)
 * - Expressive dark dot eyes, cute black button nose, rosy cheeks
 * - Chubby cream-white polar fur with gentle cool-gray shading (no scarf per STYLE.md)
 * - Adorable puff tail on back & side views, lively 4-frame waddle walk
 * Foot anchor strictly at (16, 29).
 */
const B = {
  O: [0x6e, 0x7d, 0x87, 255], // soft cool-slate fur outline
  S: [0xcf, 0xd8, 0xdd, 255], // cool shadow fur
  M: [0xee, 0xf1, 0xed, 255], // mid warm-white fur
  W: [0xff, 0xfc, 0xf5, 255], // bright creamy fur
  E: [0xeb, 0xd7, 0xd2, 255], // soft warm inner ear
  D: [0x22, 0x24, 0x30, 255], // dark eyes & nose
  P: [0xf5, 0xc3, 0xc8, 255], // gentle blush
  U: [0xff, 0xff, 0xff, 255], // specular fluff
}

function drawBearHeadFront(c, oy) {
  // Cute round polar bear ears (left x:9..12, right x:19..22, y:3..6)
  for (const ex of [9, 19]) {
    c.rect(ex + 1, 3 + oy, 2, 1, B.O)
    c.rect(ex, 4 + oy, 4, 2, B.O)
    c.rect(ex + 1, 4 + oy, 2, 2, B.W)
    c.px(ex + 1, 5 + oy, B.E)
  }
  // Plump round bear head (x:9..22, y:5..14) — open at bottom so neck blends seamlessly
  c.rect(11, 5 + oy, 10, 1, B.O)
  c.rect(10, 6 + oy, 12, 1, B.O)
  c.rect(9, 7 + oy, 14, 8, B.O)
  // Fill creamy fur seamlessly into neck
  c.rect(11, 6 + oy, 10, 9, B.W)
  c.rect(10, 7 + oy, 12, 8, B.W)
  c.hline(12, 6 + oy, 8, B.U)
  // Subtle lower cheek fluff
  c.px(10, 13 + oy, B.M)
  c.px(21, 13 + oy, B.M)
  // Calm cute face (lower-middle for adorable proportion)
  c.px(12, 9 + oy, B.D) // left eye
  c.px(19, 9 + oy, B.D) // right eye
  c.px(12, 10 + oy, B.D)
  c.px(19, 10 + oy, B.D)
  c.hline(15, 10 + oy, 2, B.D) // cute button nose
  c.px(15, 11 + oy, B.O)
  c.px(16, 11 + oy, B.O)
  // Soft pink blush dots
  c.px(11, 11 + oy, B.P)
  c.px(20, 11 + oy, B.P)
}

function drawBearHeadBack(c, oy) {
  for (const ex of [9, 19]) {
    c.rect(ex + 1, 3 + oy, 2, 1, B.O)
    c.rect(ex, 4 + oy, 4, 2, B.O)
    c.rect(ex + 1, 4 + oy, 2, 2, B.M)
  }
  c.rect(11, 5 + oy, 10, 1, B.O)
  c.rect(10, 6 + oy, 12, 1, B.O)
  c.rect(9, 7 + oy, 14, 8, B.O)
  c.rect(11, 6 + oy, 10, 9, B.W)
  c.rect(10, 7 + oy, 12, 8, B.W)
  c.hline(12, 6 + oy, 8, B.U)
}

function drawBearHeadRight(c, oy) {
  // Cute round ear on crown
  c.rect(13, 3 + oy, 3, 1, B.O)
  c.rect(12, 4 + oy, 4, 2, B.O)
  c.rect(13, 4 + oy, 2, 2, B.W)
  c.px(14, 5 + oy, B.E)
  // Plump round bear head + soft rounded muzzle facing right (blends seamlessly into neck)
  c.rect(11, 5 + oy, 9, 1, B.O)
  c.rect(10, 6 + oy, 11, 1, B.O)
  c.rect(9, 7 + oy, 13, 8, B.O)
  // Rounded muzzle bump (x:21..22, y:9..12)
  c.rect(21, 9 + oy, 2, 4, B.O)
  c.rect(11, 6 + oy, 9, 9, B.W)
  c.rect(10, 7 + oy, 11, 8, B.W)
  c.rect(20, 10 + oy, 2, 2, B.W)
  c.hline(12, 6 + oy, 7, B.U)
  c.px(21, 13 + oy, B.O)
  // Eye + button nose at muzzle tip + rosy cheek
  c.px(18, 9 + oy, B.D)
  c.px(18, 10 + oy, B.D)
  c.px(22, 10 + oy, B.D)
  c.px(19, 11 + oy, B.P)
}

function drawBearBodyFront(c, oy, armL, armR, legL, legR, back = false) {
  // Chubby round polar-bear torso (x:9..22, y:14..26)
  c.rect(9, 14 + oy, 14, 12, B.O)
  c.rect(10, 14 + oy, 12, 11, B.W)
  c.vline(10, 15 + oy, 9, B.M)
  c.vline(21, 15 + oy, 9, B.M)
  c.hline(11, 24 + oy, 10, B.S)
  // Soft belly highlight on front; puff tail on back!
  if (!back) {
    c.rect(13, 17 + oy, 6, 5, B.U)
  } else {
    // Adorable puff tail
    c.rect(14, 22 + oy, 4, 3, B.O)
    c.rect(15, 23 + oy, 2, 1, B.U)
  }
  // Short plump swinging arms
  c.rect(8, 16 + oy + armL, 3, 6, B.O)
  c.rect(9, 17 + oy + armL, 1, 4, B.M)
  c.rect(21, 16 + oy + armR, 3, 6, B.O)
  c.rect(22, 17 + oy + armR, 1, 4, B.M)
  // Stubby cute polar-bear legs (y: 25..29)
  c.rect(10, 25 + legL, 5, 4, B.O)
  c.rect(11, 25 + legL, 3, 3, B.W)
  c.hline(11, 27 + legL, 3, B.S)
  c.rect(17, 25 + legR, 5, 4, B.O)
  c.rect(18, 25 + legR, 3, 3, B.W)
  c.hline(18, 27 + legR, 3, B.S)
}

function drawBearBodyRight(c, oy, step) {
  // Plump side belly + cute tail on left
  c.rect(10, 14 + oy, 12, 12, B.O)
  c.rect(11, 14 + oy, 10, 11, B.W)
  c.vline(11, 15 + oy, 9, B.M)
  c.vline(20, 16 + oy, 7, B.U)
  c.hline(12, 24 + oy, 8, B.S)
  // Puff tail on left hip
  c.rect(8, 21 + oy, 3, 4, B.O)
  c.rect(9, 22 + oy, 2, 2, B.W)
  // Softly shaded swinging side paw (no harsh closed box outline)
  const ax = 15 + step
  c.rect(ax, 17 + oy, 3, 5, B.M)
  c.vline(ax, 17 + oy, 5, B.S)
  c.vline(ax + 3, 17 + oy, 5, B.O)
  c.hline(ax + 1, 22 + oy, 2, B.O)
  // Side legs with distinct stride
  if (step === 0) {
    c.rect(13, 25, 6, 4, B.O)
    c.rect(14, 25, 4, 3, B.W)
    c.hline(14, 27, 4, B.S)
  } else {
    const bx = step > 0 ? 11 : 16
    const fx = step > 0 ? 16 : 11
    c.rect(bx, 25, 4, 4, B.O)
    c.rect(bx + 1, 25, 2, 3, B.S)
    c.rect(fx, 25, 5, 4, B.O)
    c.rect(fx + 1, 25, 3, 3, B.W)
    c.hline(fx + 1, 27, 3, B.S)
  }
}

function mirrorX(src) {
  const out = new PixelCanvas(src.w, src.h)
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4
      if (src.data[i + 3] > 0) {
        out.px(src.w - 1 - x, y, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]])
      }
    }
  }
  return out
}

function makeSit(dir) {
  const c = new PixelCanvas(32, 32)
  if (dir === 'down') {
    drawBearBodyFront(c, 3, 0, 0, -2, -2, false)
    drawBearHeadFront(c, 3)
  } else if (dir === 'up') {
    drawBearBodyFront(c, 3, 0, 0, -2, -2, true)
    drawBearHeadBack(c, 3)
  } else {
    drawBearBodyRight(c, 3, 1)
    drawBearHeadRight(c, 3)
  }
  return c
}

function makeLean(dir, step) {
  const base = makeSit('up')
  const c = new PixelCanvas(32, 32)
  const shift = (dir === 'right' ? 1 : -1) * (step + 1)
  for (let y = 0; y < 32; y++) {
    const dx = y < 19 ? shift : y < 23 ? Math.sign(shift) : 0
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4
      if (base.data[i + 3] > 0) {
        c.px(x + dx, y, [base.data[i], base.data[i + 1], base.data[i + 2], base.data[i + 3]])
      }
    }
  }
  return c
}

export function buildBearFrames() {
  const mk = (fn) => {
    const c = new PixelCanvas(32, 32)
    fn(c)
    return c
  }
  const idleDown = mk((c) => { drawBearBodyFront(c, 0, 0, 0, 0, 0, false); drawBearHeadFront(c, 0) })
  const walkDown = [
    mk((c) => { drawBearBodyFront(c, -1, 1, -1, -1, 0, false); drawBearHeadFront(c, -1) }),
    idleDown,
    mk((c) => { drawBearBodyFront(c, -1, -1, 1, 0, -1, false); drawBearHeadFront(c, -1) }),
    idleDown,
  ]
  const idleUp = mk((c) => { drawBearBodyFront(c, 0, 0, 0, 0, 0, true); drawBearHeadBack(c, 0) })
  const walkUp = [
    mk((c) => { drawBearBodyFront(c, -1, 1, -1, -1, 0, true); drawBearHeadBack(c, -1) }),
    idleUp,
    mk((c) => { drawBearBodyFront(c, -1, -1, 1, 0, -1, true); drawBearHeadBack(c, -1) }),
    idleUp,
  ]
  const idleRight = mk((c) => { drawBearBodyRight(c, 0, 0); drawBearHeadRight(c, 0) })
  const walkRight = [
    mk((c) => { drawBearBodyRight(c, -1, 1); drawBearHeadRight(c, -1) }),
    idleRight,
    mk((c) => { drawBearBodyRight(c, -1, -1); drawBearHeadRight(c, -1) }),
    idleRight,
  ]
  const sitRight = makeSit('right')

  return {
    'idle-down': idleDown,
    'walk-down-0': walkDown[0],
    'walk-down-1': walkDown[1],
    'walk-down-2': walkDown[2],
    'walk-down-3': walkDown[3],
    'sit-down': makeSit('down'),
    'idle-up': idleUp,
    'walk-up-0': walkUp[0],
    'walk-up-1': walkUp[1],
    'walk-up-2': walkUp[2],
    'walk-up-3': walkUp[3],
    'sit-up': makeSit('up'),
    'idle-right': idleRight,
    'walk-right-0': walkRight[0],
    'walk-right-1': walkRight[1],
    'walk-right-2': walkRight[2],
    'walk-right-3': walkRight[3],
    'sit-right': sitRight,
    'idle-left': mirrorX(idleRight),
    'walk-left-0': mirrorX(walkRight[0]),
    'walk-left-1': mirrorX(walkRight[1]),
    'walk-left-2': mirrorX(walkRight[2]),
    'walk-left-3': mirrorX(walkRight[3]),
    'sit-left': mirrorX(sitRight),
    'lean-left-0': makeLean('left', 0),
    'lean-left-1': makeLean('left', 1),
    'lean-right-0': makeLean('right', 0),
    'lean-right-1': makeLean('right', 1),
  }
}
