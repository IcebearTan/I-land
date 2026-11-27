import { PixelCanvas, drawAsciiGrid } from '../pixel-ui/canvas.mjs'
import { HER_PALETTE as P } from './her-palette.mjs'
import { FRONT_IDLE, BACK_IDLE, RIGHT_IDLE } from './her-poses.mjs'

function clone(src) {
  const out = new PixelCanvas(src.w, src.h)
  out.blit(src, 0, 0)
  return out
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

/** Smooth 4-frame Stardew walk: 1px soft bounce, silky connected hair sway & slim leg stride */
function makeFrontBackWalk(baseRows, stepDir, isBack) {
  const rows = baseRows.map((r) => r.split(''))
  const liftLeft = stepDir < 0

  if (!isBack) {
    if (liftLeft) {
      rows[15] = '......01211aAtLLLLtAa1210.......'.split('')
      rows[16] = '......0120.aBGcGGcGBa0210.......'.split('')
      rows[17] = '.......010.aAGccccGAa010........'.split('')
      rows[18] = '........00.aAcyccycAa00.........'.split('')
    } else {
      rows[15] = '.......0121aAtLLLLtAa11210......'.split('')
      rows[16] = '.......0120aBGcGGcGBa.0210......'.split('')
      rows[17] = '........010aAGccccGAa.010.......'.split('')
      rows[18] = '.........00aAcyccycAa.00........'.split('')
    }
  } else {
    if (liftLeft) {
      rows[15] = '......012112111111211210........'.split('')
      rows[16] = '.......0120112002110210.........'.split('')
      rows[17] = '........00.a000GG000a00.........'.split('')
    } else {
      rows[15] = '........012112111111211210......'.split('')
      rows[16] = '.........0120112002110210.......'.split('')
      rows[17] = '.........00a000GG000a.00........'.split('')
    }
  }

  // Slender close-leg stride (no bow-legged gap)
  if (liftLeft) {
    rows[24] = '............jdJj.Jdj............'.split('')
    rows[25] = '............zWWz.JDj............'.split('')
    rows[26] = '............zvvz.JDj............'.split('')
    rows[27] = '.............zz.zWWz............'.split('')
    rows[28] = '................zvvz............'.split('')
    rows[29] = '.................zz.............'.split('')
  } else {
    rows[24] = '............jdJ.jJdj............'.split('')
    rows[25] = '............jDJ.zWWz............'.split('')
    rows[26] = '............jDJ.zvvz............'.split('')
    rows[27] = '............zWWz.zz.............'.split('')
    rows[28] = '............zvvz................'.split('')
    rows[29] = '.............zz.................'.split('')
  }

  const bounced = Array.from({ length: 32 }, () => Array(32).fill('.'))
  for (let y = 2; y <= 21; y++) bounced[y - 1] = rows[y]
  bounced[21] = '............jjJJJJjj............'.split('')
  for (let y = 22; y < 32; y++) bounced[y] = rows[y]
  return drawAsciiGrid(bounced.map((r) => r.join('')), P)
}

function makeRightWalk(stepDir) {
  const rows = RIGHT_IDLE.map((r) => r.split(''))
  // Silky hair trailing softly in the breeze when walking
  rows[15] = '....012111110aAAtLLt............'.split('')
  rows[16] = '...011011110aABAtGGt............'.split('')
  rows[17] = '....00..010..aAAAtGGt...........'.split('')
  if (stepDir > 0) {
    rows[18] = '.........00..aAAtGGt............'.split('')
    rows[19] = '...............kstGGt...........'.split('')
    rows[24] = '............jDJj.Jdj............'.split('')
    rows[25] = '...........jDJj..JDj............'.split('')
    rows[26] = '...........zWWzz.JDj............'.split('')
    rows[27] = '...........zvvzz.zWWzz..........'.split('')
    rows[28] = '............zzz..zvvzz..........'.split('')
    rows[29] = '..................zzzz..........'.split('')
  } else {
    rows[18] = '........00...aAAAtGGt...........'.split('')
    rows[19] = '.............ksstGGt............'.split('')
    rows[24] = '............jdJ.jDJj............'.split('')
    rows[25] = '...........jdJj..jDJj...........'.split('')
    rows[26] = '...........jDJj..zWWzz..........'.split('')
    rows[27] = '..........zWWzz..zvvzz..........'.split('')
    rows[28] = '..........zvvzz...zzz...........'.split('')
    rows[29] = '...........zzzz.................'.split('')
  }

  const bounced = Array.from({ length: 32 }, () => Array(32).fill('.'))
  for (let y = 2; y <= 21; y++) bounced[y - 1] = rows[y]
  bounced[21] = '.............jjJJJJjj...........'.split('')
  for (let y = 22; y < 32; y++) bounced[y] = rows[y]
  return drawAsciiGrid(bounced.map((r) => r.join('')), P)
}

function makeSit(baseRows, dir) {
  const rows = Array.from({ length: 32 }, () => Array(32).fill('.'))
  for (let y = 2; y <= 21; y++) rows[y + 3] = baseRows[y].split('')
  if (dir === 'right') {
    rows[25] = '.............jjJJJJJjj..........'.split('')
    rows[26] = '.............jDJJJJJdj..........'.split('')
    rows[27] = '..............jjzWWWWzz.........'.split('')
    rows[28] = '................zvvvvzz.........'.split('')
    rows[29] = '.................zzzz...........'.split('')
  } else {
    rows[25] = '............jjJJJJjj............'.split('')
    rows[26] = '............zWWjjWWz............'.split('')
    rows[27] = '............zvvjjvvz............'.split('')
    rows[28] = '.............zz..zz.............'.split('')
  }
  return drawAsciiGrid(rows.map((r) => r.join('')), P)
}

function makeLean(dir, step) {
  const base = makeSit(BACK_IDLE, 'up')
  const c = new PixelCanvas(32, 32)
  const shift = (dir === 'right' ? 1 : -1) * (step + 1)
  for (let y = 0; y < 32; y++) {
    const dx = y < 20 ? shift : y < 24 ? Math.sign(shift) : 0
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
  const idleDown = drawAsciiGrid(FRONT_IDLE, P)
  const walkDown0 = makeFrontBackWalk(FRONT_IDLE, -1, false)
  const walkDown2 = makeFrontBackWalk(FRONT_IDLE, 1, false)
  const idleUp = drawAsciiGrid(BACK_IDLE, P)
  const walkUp0 = makeFrontBackWalk(BACK_IDLE, -1, true)
  const walkUp2 = makeFrontBackWalk(BACK_IDLE, 1, true)
  const idleRight = drawAsciiGrid(RIGHT_IDLE, P)
  const walkRight0 = makeRightWalk(1)
  const walkRight2 = makeRightWalk(-1)
  const sitRight = makeSit(RIGHT_IDLE, 'right')

  return {
    'idle-down': idleDown,
    'walk-down-0': walkDown0,
    'walk-down-1': clone(idleDown),
    'walk-down-2': walkDown2,
    'walk-down-3': clone(idleDown),
    'sit-down': makeSit(FRONT_IDLE, 'down'),
    'idle-up': idleUp,
    'walk-up-0': walkUp0,
    'walk-up-1': clone(idleUp),
    'walk-up-2': walkUp2,
    'walk-up-3': clone(idleUp),
    'sit-up': makeSit(BACK_IDLE, 'up'),
    'idle-right': idleRight,
    'walk-right-0': walkRight0,
    'walk-right-1': clone(idleRight),
    'walk-right-2': walkRight2,
    'walk-right-3': clone(idleRight),
    'sit-right': sitRight,
    'idle-left': mirrorX(idleRight),
    'walk-left-0': mirrorX(walkRight0),
    'walk-left-1': mirrorX(idleRight),
    'walk-left-2': mirrorX(walkRight2),
    'walk-left-3': mirrorX(idleRight),
    'sit-left': mirrorX(sitRight),
    'lean-left-0': makeLean('left', 0),
    'lean-left-1': makeLean('left', 1),
    'lean-right-0': makeLean('right', 0),
    'lean-right-1': makeLean('right', 1),
  }
}
