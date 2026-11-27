import { PixelCanvas } from '../pixel-ui/canvas.mjs'

/**
 * Cute 32x32 pixel girl ("her"):
 * - Black hair with soft bangs + face-framing locks (youthful, never matronly)
 * - Round black-framed glasses on a soft round face + subtle blush
 * - Grass-green raglan top with black shoulder-sleeves + tiny black cat with golden eyes on chest
 * - Classic denim blue jeans + clean white sneakers
 * Foot anchor strictly at (16, 29).
 */
const C = {
  // Hair (rich dark ink + soft sheen)
  H0: [0x1a, 0x1c, 0x28, 255], // outline / deepest black
  H1: [0x29, 0x2c, 0x3d, 255], // main black hair
  H2: [0x45, 0x4b, 0x63, 255], // glossy highlight
  // Skin (warm rosy cream)
  K0: [0xc7, 0x8e, 0x74, 255], // skin outline/chin shade
  K1: [0xfc, 0xdf, 0xc4, 255], // main face/hand
  K2: [0xff, 0xee, 0xdc, 255], // highlight
  BL: [0xf4, 0x9c, 0xa8, 255], // cute pink blush
  // Glasses & eyes (delicate round rim + clear lenses so eyes shine, never sunglasses)
  G0: [0x2c, 0x2f, 0x3e, 255], // delicate round black glasses rim
  EYE: [0x15, 0x17, 0x22, 255], // bright dark pupil
  GL: [0xff, 0xf7, 0xee, 255], // clear bright lens tint over skin
  // Grass-green raglan top + black shoulder-sleeves
  T0: [0x2b, 0x54, 0x22, 255], // green outline
  T1: [0x4e, 0x91, 0x37, 255], // green shade
  T2: [0x6e, 0xbc, 0x4b, 255], // bright grass green
  T3: [0x92, 0xd8, 0x6c, 255], // green highlight
  S0: [0x18, 0x1a, 0x24, 255], // black raglan sleeve outline
  S1: [0x2a, 0x2d, 0x3b, 255], // black raglan sleeve body
  S2: [0x42, 0x46, 0x59, 255], // sleeve highlight
  // Chest black cat motif
  CAT: [0x15, 0x17, 0x20, 255],
  CEY: [0xff, 0xe2, 0x70, 255], // cute golden cat eyes
  // Denim blue jeans
  J0: [0x23, 0x38, 0x57, 255], // denim outline
  J1: [0x38, 0x59, 0x85, 255], // denim shadow
  J2: [0x50, 0x7b, 0xb2, 255], // denim blue
  J3: [0x70, 0x9c, 0xd1, 255], // denim highlight
  // White sneakers
  W0: [0x4d, 0x54, 0x63, 255], // sneaker outline/sole
  W1: [0xd9, 0xde, 0xe6, 255], // sneaker shade
  W2: [0xfa, 0xf8, 0xf4, 255], // crisp white sneaker
}

function drawHeadFront(c, oy) {
  // Soft rounded black hair crown (x: 9..22, y: 3..15)
  c.rect(12, 3 + oy, 8, 1, C.H0)
  c.rect(10, 4 + oy, 12, 1, C.H0)
  c.rect(11, 4 + oy, 10, 1, C.H1)
  c.rect(9, 6 + oy, 14, 10, C.H0)
  c.rect(10, 5 + oy, 12, 10, C.H1)
  c.px(10, 5 + oy, C.H0)
  c.px(21, 5 + oy, C.H0)
  // Youthful hair shine arc
  c.hline(12, 5 + oy, 8, C.H2)
  c.px(11, 6 + oy, C.H2)
  c.px(20, 6 + oy, C.H2)
  // Soft long locks framing shoulders
  c.rect(9, 14 + oy, 3, 5, C.H0)
  c.rect(20, 14 + oy, 3, 5, C.H0)
  c.rect(10, 14 + oy, 1, 4, C.H1)
  c.rect(21, 14 + oy, 1, 4, C.H1)
  // Cute round face (x: 11..20, y: 8..14)
  c.rect(11, 8 + oy, 10, 6, C.K1)
  c.rect(12, 14 + oy, 8, 1, C.K1)
  c.hline(13, 15 + oy, 6, C.K0)
  // Soft wispy bangs across forehead (y: 6..8)
  c.rect(11, 6 + oy, 10, 2, C.H1)
  c.px(11, 8 + oy, C.H1)
  c.px(14, 8 + oy, C.H1)
  c.px(17, 8 + oy, C.H1)
  c.px(20, 8 + oy, C.H1)
  // Delicate round black-framed glasses (clear lenses + sparkling dot eyes!)
  for (const [gx, eyeX] of [[11, 13], [17, 18]]) {
    c.hline(gx + 1, 9 + oy, 2, C.G0)
    c.hline(gx + 1, 12 + oy, 2, C.G0)
    c.vline(gx, 10 + oy, 2, C.G0)
    c.vline(gx + 3, 10 + oy, 2, C.G0)
    // Clear warm lens showing cute eyes & face underneath
    c.rect(gx + 1, 10 + oy, 2, 2, C.GL)
    c.px(eyeX, 10 + oy, C.EYE)
    c.px(eyeX, 11 + oy, C.EYE)
  }
  // Thin glasses bridge
  c.hline(15, 10 + oy, 2, C.G0)
  // Soft rosy cheeks & sweet tiny mouth
  c.px(11, 13 + oy, C.BL)
  c.px(20, 13 + oy, C.BL)
  c.hline(15, 13 + oy, 2, C.K0)
}

function drawHeadBack(c, oy) {
  c.rect(11, 3 + oy, 10, 1, C.H0)
  c.rect(10, 4 + oy, 12, 1, C.H0)
  c.rect(11, 4 + oy, 10, 1, C.H1)
  c.rect(9, 5 + oy, 14, 14, C.H0)
  c.rect(10, 5 + oy, 12, 13, C.H1)
  // Soft layered long hair drape over back of grass-green shirt
  c.rect(10, 18 + oy, 12, 2, C.H0)
  c.rect(11, 18 + oy, 10, 1, C.H1)
  c.px(12, 20 + oy, C.H0)
  c.px(15, 20 + oy, C.H0)
  c.px(16, 20 + oy, C.H0)
  c.px(19, 20 + oy, C.H0)
  // Glossy hair shine arc
  c.hline(12, 6 + oy, 8, C.H2)
  c.px(11, 7 + oy, C.H2)
  c.px(20, 7 + oy, C.H2)
  c.hline(12, 15 + oy, 8, C.H2)
}

function drawHeadRight(c, oy) {
  // Facing right: round bangs on right, soft long hair flowing behind on left
  c.rect(11, 3 + oy, 9, 1, C.H0)
  c.rect(10, 4 + oy, 11, 1, C.H0)
  c.rect(11, 4 + oy, 9, 1, C.H1)
  c.rect(9, 5 + oy, 13, 10, C.H0)
  c.rect(10, 5 + oy, 11, 9, C.H1)
  c.hline(12, 5 + oy, 7, C.H2)
  // Back hair drape down to shoulders
  c.rect(9, 14 + oy, 6, 5, C.H0)
  c.rect(10, 14 + oy, 4, 4, C.H1)
  c.px(10, 19 + oy, C.H0)
  c.px(12, 19 + oy, C.H0)
  // Round profile face (right side x: 15..21, y: 8..14)
  c.rect(15, 8 + oy, 6, 6, C.K1)
  c.px(21, 10 + oy, C.K1) // cute tiny nose
  c.px(21, 11 + oy, C.K1)
  c.hline(15, 14 + oy, 5, C.K1)
  c.hline(15, 15 + oy, 5, C.K0)
  // Side bangs over forehead
  c.rect(16, 6 + oy, 5, 2, C.H1)
  c.px(20, 8 + oy, C.H1)
  c.px(18, 8 + oy, C.H1)
  // Side round black glasses with clear lens + single crisp eye
  c.hline(17, 9 + oy, 3, C.G0)
  c.hline(17, 12 + oy, 3, C.G0)
  c.vline(16, 10 + oy, 2, C.G0)
  c.vline(20, 10 + oy, 2, C.G0)
  c.rect(17, 10 + oy, 3, 2, C.GL)
  c.px(19, 10 + oy, C.EYE)
  c.px(19, 11 + oy, C.EYE)
  c.hline(14, 10 + oy, 2, C.G0) // glasses temple arm
  c.px(18, 13 + oy, C.BL) // soft cheek blush
}

function drawTorsoFront(c, oy, armL, armR) {
  // Grass-green raglan top body (x: 11..20, y: 16..22)
  c.rect(11, 16 + oy, 10, 7, C.T0)
  c.rect(12, 16 + oy, 8, 6, C.T2)
  c.hline(13, 16 + oy, 6, C.T3)
  c.hline(12, 21 + oy, 8, C.T1)
  // Black raglan shoulders + swinging sleeves
  c.rect(10, 16 + oy, 3, 2, C.S0)
  c.rect(19, 16 + oy, 3, 2, C.S0)
  c.px(11, 16 + oy, C.S1)
  c.px(20, 16 + oy, C.S1)
  // Left sleeve & hand
  c.rect(9, 17 + oy + armL, 3, 4, C.S0)
  c.rect(10, 17 + oy + armL, 1, 3, C.S1)
  c.px(10, 17 + oy + armL, C.S2)
  c.rect(10, 21 + oy + armL, 2, 1, C.K1)
  // Right sleeve & hand
  c.rect(20, 17 + oy + armR, 3, 4, C.S0)
  c.rect(21, 17 + oy + armR, 1, 3, C.S1)
  c.px(21, 17 + oy + armR, C.S2)
  c.rect(20, 21 + oy + armR, 2, 1, C.K1)
  // Tiny cute black cat on chest (x: 14..17, y: 17..20)
  c.px(14, 17 + oy, C.CAT) // left cat ear
  c.px(17, 17 + oy, C.CAT) // right cat ear
  c.rect(14, 18 + oy, 4, 3, C.CAT)
  c.px(14, 19 + oy, C.CEY) // golden cat eye L
  c.px(17, 19 + oy, C.CEY) // golden cat eye R
}

function drawTorsoBack(c, oy, armL, armR) {
  c.rect(11, 16 + oy, 10, 7, C.T0)
  c.rect(12, 16 + oy, 8, 6, C.T2)
  c.hline(12, 21 + oy, 8, C.T1)
  // Black raglan sleeves
  c.rect(9, 17 + oy + armL, 3, 4, C.S0)
  c.rect(10, 17 + oy + armL, 1, 3, C.S1)
  c.rect(10, 21 + oy + armL, 2, 1, C.K1)
  c.rect(20, 17 + oy + armR, 3, 4, C.S0)
  c.rect(21, 17 + oy + armR, 1, 3, C.S1)
  c.rect(20, 21 + oy + armR, 2, 1, C.K1)
}

function drawTorsoRight(c, oy, armSwing) {
  // Side grass-green body + black raglan sleeve
  c.rect(12, 16 + oy, 8, 7, C.T0)
  c.rect(13, 16 + oy, 6, 6, C.T2)
  c.vline(18, 16 + oy, 5, C.T3)
  c.hline(13, 21 + oy, 6, C.T1)
  // Black raglan shoulder cap + swinging arm
  const ax = 14 + armSwing
  c.rect(13, 16 + oy, 4, 2, C.S0)
  c.rect(ax, 17 + oy, 4, 4, C.S0)
  c.rect(ax + 1, 17 + oy, 2, 3, C.S1)
  c.px(ax + 1, 17 + oy, C.S2)
  c.rect(ax + 1, 21 + oy, 2, 2, C.K1)
}

function drawLegsFront(c, legL, legR) {
  // Denim jeans waist (y: 23..24)
  c.rect(11, 23, 10, 2, C.J0)
  c.rect(12, 23, 8, 1, C.J2)
  // Left leg + white sneaker
  const ly = 25 + legL
  c.rect(11, 24, 4, 4 + legL, C.J0)
  c.rect(12, 24, 2, 3 + legL, C.J2)
  c.px(12, 24, C.J3)
  c.rect(11, ly + 2, 4, 2, C.W0)
  c.rect(12, ly + 2, 2, 1, C.W2)
  // Right leg + white sneaker
  const ry = 25 + legR
  c.rect(17, 24, 4, 4 + legR, C.J0)
  c.rect(18, 24, 2, 3 + legR, C.J2)
  c.px(18, 24, C.J3)
  c.rect(17, ry + 2, 4, 2, C.W0)
  c.rect(18, ry + 2, 2, 1, C.W2)
}

function drawLegsRight(c, step) {
  // Side denim jeans + white sneakers with clear stride separation
  c.rect(12, 23, 8, 2, C.J0)
  c.rect(13, 23, 6, 1, C.J2)
  if (step === 0) {
    c.rect(13, 24, 5, 4, C.J0)
    c.rect(14, 24, 3, 3, C.J2)
    c.vline(16, 24, 3, C.J3)
    c.rect(13, 27, 6, 2, C.W0)
    c.rect(14, 27, 4, 1, C.W2)
  } else {
    // Front & back striding legs
    const bx = step > 0 ? 11 : 16
    const fx = step > 0 ? 16 : 11
    c.rect(bx, 24, 4, 4, C.J0)
    c.rect(bx + 1, 24, 2, 3, C.J1)
    c.rect(bx, 27, 4, 2, C.W0)
    c.rect(bx + 1, 27, 2, 1, C.W1)
    c.rect(fx, 24, 4, 4, C.J0)
    c.rect(fx + 1, 24, 2, 3, C.J2)
    c.rect(fx, 27, 5, 2, C.W0)
    c.rect(fx + 1, 27, 3, 1, C.W2)
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

function shiftY(src, dy) {
  const out = new PixelCanvas(src.w, src.h)
  out.blit(src, 0, dy)
  return out
}

function makeSit(dir) {
  const c = new PixelCanvas(32, 32)
  if (dir === 'down') {
    drawLegsFront(c, -2, -2)
    drawTorsoFront(c, 3, 0, 0)
    drawHeadFront(c, 3)
  } else if (dir === 'up') {
    drawLegsFront(c, -2, -2)
    drawTorsoBack(c, 3, 0, 0)
    drawHeadBack(c, 3)
  } else {
    drawLegsRight(c, 1)
    drawTorsoRight(c, 3, 1)
    drawHeadRight(c, 3)
  }
  return c
}

function makeLean(dir, step) {
  const base = makeSit('up')
  const c = new PixelCanvas(32, 32)
  const shift = (dir === 'right' ? 1 : -1) * (step + 1)
  // Upper half tilts gently toward partner while seated
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

export function buildHerFrames() {
  const mk = (fn) => {
    const c = new PixelCanvas(32, 32)
    fn(c)
    return c
  }
  const idleDown = mk((c) => { drawLegsFront(c, 0, 0); drawTorsoFront(c, 0, 0, 0); drawHeadFront(c, 0) })
  const walkDown = [
    mk((c) => { drawLegsFront(c, -1, 0); drawTorsoFront(c, -1, 1, -1); drawHeadFront(c, -1) }),
    idleDown,
    mk((c) => { drawLegsFront(c, 0, -1); drawTorsoFront(c, -1, -1, 1); drawHeadFront(c, -1) }),
    shiftY(idleDown, 0),
  ]
  const idleUp = mk((c) => { drawLegsFront(c, 0, 0); drawTorsoBack(c, 0, 0, 0); drawHeadBack(c, 0) })
  const walkUp = [
    mk((c) => { drawLegsFront(c, -1, 0); drawTorsoBack(c, -1, 1, -1); drawHeadBack(c, -1) }),
    idleUp,
    mk((c) => { drawLegsFront(c, 0, -1); drawTorsoBack(c, -1, -1, 1); drawHeadBack(c, -1) }),
    shiftY(idleUp, 0),
  ]
  const idleRight = mk((c) => { drawLegsRight(c, 0); drawTorsoRight(c, 0, 0); drawHeadRight(c, 0) })
  const walkRight = [
    mk((c) => { drawLegsRight(c, 1); drawTorsoRight(c, -1, 1); drawHeadRight(c, -1) }),
    idleRight,
    mk((c) => { drawLegsRight(c, -1); drawTorsoRight(c, -1, -1); drawHeadRight(c, -1) }),
    shiftY(idleRight, 0),
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
