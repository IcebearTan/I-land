import { PixelCanvas, PAL } from './canvas.mjs'

/** Draw a stepped pixel corner mask (cuts 1px or 2px corner for authentic pixel feel) */
function isCut(x, y, w, h, cut = 1) {
  const dx = Math.min(x, w - 1 - x)
  const dy = Math.min(y, h - 1 - y)
  return dx + dy < cut
}

/**
 * Heavy Stardew carved oak panel (24x24, 9px 9-slice border).
 * Features dark roasted outline, beveled oak molding, brass corner studs,
 * dark recessed groove, and warm aged parchment interior.
 */
export function makeWoodPanel() {
  const w = 24, h = 24
  const c = new PixelCanvas(w, h)
  // Fill base
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isCut(x, y, w, h, 2)) continue
      c.px(x, y, PAL.W)
    }
  }
  // Outer dark roasted outline (stepped corners)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isCut(x, y, w, h, 2)) continue
      const onEdge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || isCut(x, y, w, h, 3)
      if (onEdge) c.px(x, y, PAL.K)
    }
  }
  // Outer top/left oak highlight bevel (ring 1)
  c.hline(3, 1, w - 6, PAL.L)
  c.vline(1, 3, h - 6, PAL.L)
  c.px(2, 2, PAL.H)
  // Outer bottom/right oak shadow bevel (ring 1)
  c.hline(3, h - 2, w - 6, PAL.D)
  c.vline(w - 2, 3, h - 6, PAL.D)
  c.px(w - 3, h - 3, PAL.D)
  // Mid oak molding (ring 2 & 3) with warm plank sheen
  c.hline(3, 2, w - 6, PAL.M)
  c.vline(2, 3, h - 6, PAL.M)
  c.hline(3, h - 3, w - 6, PAL.W)
  c.vline(w - 3, 3, h - 6, PAL.W)
  // Subtle wood grain speckles on the straight edges
  for (const gx of [9, 14]) {
    c.px(gx, 2, PAL.L)
    c.px(gx, h - 3, PAL.D)
  }
  for (const gy of [9, 14]) {
    c.px(2, gy, PAL.L)
    c.px(w - 3, gy, PAL.D)
  }
  // Inner dark groove (ring 4) + dark inner outline (ring 5)
  c.rect(4, 4, w - 8, h - 8, PAL.D)
  c.rect(5, 5, w - 10, h - 10, PAL.K)
  // Aged parchment interior
  c.rect(6, 6, w - 12, h - 12, PAL.P)
  // Inner parchment cast shadow from wood frame (top/left slightly deeper, Stardew classic)
  c.hline(6, 6, w - 12, PAL.S)
  c.vline(6, 6, h - 12, PAL.S)
  c.hline(7, 7, w - 14, PAL.Q)
  c.vline(7, 7, h - 14, PAL.Q)
  c.hline(7, h - 7, w - 13, PAL.C)
  c.vline(w - 7, 7, h - 13, PAL.C)
  // Four brass corner studs on wood corners
  for (const [rx, ry] of [[2, 2], [w - 4, 2], [2, h - 4], [w - 4, h - 4]]) {
    c.px(rx, ry, PAL.G)
    c.px(rx + 1, ry, PAL.B)
    c.px(rx, ry + 1, PAL.B)
    c.px(rx + 1, ry + 1, PAL.D)
  }
  return c
}

/** Compact carved wood frame (18x18, 6px 9-slice) for HUD cards, tooltips & mobile top bar */
export function makeCompactPanel(dark = false) {
  const w = 18, h = 18
  const c = new PixelCanvas(w, h)
  const o = dark ? PAL.N0 : PAL.K
  const d = dark ? PAL.N1 : PAL.D
  const m = dark ? PAL.N2 : PAL.W
  const l = dark ? PAL.N3 : PAL.L
  const hi = dark ? PAL.N4 : PAL.H
  const fill = dark ? PAL.N1 : PAL.P
  const sh = dark ? PAL.N0 : PAL.S
  const q = dark ? PAL.N1 : PAL.Q

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isCut(x, y, w, h, 1)) continue
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || isCut(x, y, w, h, 2)
      c.px(x, y, edge ? o : m)
    }
  }
  c.hline(2, 1, w - 4, l)
  c.vline(1, 2, h - 4, l)
  c.px(2, 2, hi)
  c.hline(2, h - 2, w - 4, d)
  c.vline(w - 2, 2, h - 4, d)
  c.rect(3, 3, w - 6, h - 6, o)
  c.rect(4, 4, w - 8, h - 8, fill)
  c.hline(4, 4, w - 8, sh)
  c.vline(4, 4, h - 8, sh)
  c.hline(5, 5, w - 10, q)
  // Corner rivets
  for (const [rx, ry] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) {
    c.px(rx, ry, dark ? PAL.N4 : PAL.G)
  }
  return c
}

/** Tactile 3-state pixel button (18x18, 6px 9-slice) for wood or jade-teal accent */
export function makeButton(theme = 'wood', state = 'normal') {
  const w = 18, h = 18
  const c = new PixelCanvas(w, h)
  const isAccent = theme === 'accent'
  const pressed = state === 'pressed'
  const hover = state === 'hover'

  const out = isAccent ? PAL.T0 : PAL.K
  const top = isAccent
    ? (pressed ? PAL.T1 : hover ? PAL.T4 : PAL.T4)
    : (pressed ? PAL.S : hover ? PAL.C : PAL.C)
  const mid = isAccent
    ? (pressed ? PAL.T2 : hover ? PAL.T3 : PAL.T2)
    : (pressed ? PAL.Q : hover ? PAL.C : PAL.P)
  const bot = isAccent
    ? (pressed ? PAL.T3 : PAL.T1)
    : (pressed ? PAL.L : PAL.S)
  const rim = isAccent ? PAL.T1 : PAL.W
  const rimHi = isAccent ? PAL.T3 : (hover ? PAL.H : PAL.L)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isCut(x, y, w, h, 1)) continue
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || isCut(x, y, w, h, 2)
      c.px(x, y, edge ? out : rim)
    }
  }
  // Outer bevel
  c.hline(2, 1, w - 4, pressed ? rim : rimHi)
  c.vline(1, 2, h - 4, pressed ? rim : rimHi)
  c.hline(2, h - 2, w - 4, isAccent ? PAL.T0 : PAL.D)
  c.vline(w - 2, 2, h - 4, isAccent ? PAL.T0 : PAL.D)
  // Face
  c.rect(2, 2, w - 4, h - 4, mid)
  c.hline(2, 2, w - 4, top)
  c.vline(2, 2, h - 4, top)
  c.hline(2, h - 3, w - 4, bot)
  c.vline(w - 3, 2, h - 4, bot)
  if (!pressed) {
    c.hline(3, h - 4, w - 6, isAccent ? PAL.T1 : PAL.Q)
  } else {
    c.hline(3, 3, w - 6, isAccent ? PAL.T1 : PAL.S)
  }
  return c
}

/** Inventory-style square pixel slot (18x18, 5px 9-slice) */
export function makeSlot(active = false) {
  const w = 18, h = 18
  const c = new PixelCanvas(w, h)
  const out = active ? PAL.T0 : PAL.K
  const rim = active ? PAL.T3 : PAL.W
  const hi = active ? PAL.T4 : PAL.L
  const dk = active ? PAL.T1 : PAL.D

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isCut(x, y, w, h, 1)) continue
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      c.px(x, y, edge ? out : rim)
    }
  }
  c.hline(1, 1, w - 2, hi)
  c.vline(1, 1, h - 2, hi)
  c.hline(1, h - 2, w - 2, dk)
  c.vline(w - 2, 1, h - 2, dk)
  c.rect(3, 3, w - 6, h - 6, active ? PAL.T4 : PAL.P)
  c.hline(3, 3, w - 6, active ? PAL.T3 : PAL.S)
  c.vline(3, 3, h - 6, active ? PAL.T3 : PAL.S)
  c.hline(4, h - 4, w - 7, active ? PAL.U : PAL.C)
  c.vline(w - 4, 4, h - 7, active ? PAL.U : PAL.C)
  if (active) {
    c.rect(4, 4, w - 8, h - 8, [0xe3, 0xf2, 0xe8, 255])
  }
  return c
}

/** Parchment ribbon banner (24x16, 8px horizontal / 5px vertical 9-slice) */
export function makeRibbon() {
  const w = 24, h = 16
  const c = new PixelCanvas(w, h)
  c.rect(2, 1, w - 4, h - 2, PAL.K)
  c.rect(3, 2, w - 6, h - 4, PAL.P)
  c.hline(3, 2, w - 6, PAL.C)
  c.hline(3, h - 3, w - 6, PAL.S)
  c.hline(3, h - 4, w - 6, PAL.Q)
  // Swallowtail folded ends
  for (const side of [0, 1]) {
    const x0 = side === 0 ? 0 : w - 3
    c.rect(x0, 3, 3, h - 6, PAL.K)
    c.rect(side === 0 ? 1 : w - 3, 4, 2, h - 8, PAL.Q)
    c.px(side === 0 ? 0 : w - 1, Math.floor(h / 2) - 1, PAL._)
    c.px(side === 0 ? 0 : w - 1, Math.floor(h / 2), PAL._)
    // Little wooden fold notch
    c.px(side === 0 ? 2 : w - 3, 2, PAL.D)
    c.px(side === 0 ? 2 : w - 3, h - 3, PAL.D)
  }
  // Tiny corner rivets
  c.px(4, 4, PAL.B)
  c.px(w - 5, 4, PAL.B)
  c.px(4, h - 5, PAL.B)
  c.px(w - 5, h - 5, PAL.B)
  return c
}

/** Progress bar wooden trough (14x10) and glowing jade-gold fill (10x6) */
export function makeProgressTrack() {
  const w = 14, h = 10
  const c = new PixelCanvas(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isCut(x, y, w, h, 1)) continue
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      c.px(x, y, edge ? PAL.K : PAL.D)
    }
  }
  c.hline(1, 1, w - 2, PAL.W)
  c.hline(1, h - 2, w - 2, PAL.L)
  c.rect(2, 2, w - 4, h - 4, [0x4c, 0x2c, 0x1b, 255])
  c.hline(2, 2, w - 4, PAL.K)
  return c
}

export function makeProgressFill() {
  const w = 12, h = 6
  const c = new PixelCanvas(w, h)
  c.rect(0, 0, w, h, PAL.F1)
  c.hline(0, 0, w, PAL.F3)
  c.hline(0, 1, w, PAL.F2)
  c.hline(0, h - 1, w, PAL.F0)
  // Subtle pixel segment notches every 6px
  c.vline(5, 0, h, PAL.F0)
  c.vline(11, 0, h, PAL.F0)
  return c
}

/** Crisp pixel D-pad directional base (48x48) for mobile touch */
export function makeDpad() {
  const s = 48
  const c = new PixelCanvas(s, s)
  const arm = 16
  const o = (s - arm) / 2 // 16
  // Draw cross silhouette
  const inCross = (x, y) =>
    (x >= o && x < o + arm && y >= 2 && y < s - 2) ||
    (y >= o && y < o + arm && x >= 2 && x < s - 2)

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (!inCross(x, y)) continue
      const edge = !inCross(x - 1, y) || !inCross(x + 1, y) || !inCross(x, y - 1) || !inCross(x, y + 1)
      c.px(x, y, edge ? PAL.K : PAL.P)
    }
  }
  // Inner wooden bevel
  c.hline(o + 1, 3, arm - 2, PAL.C)
  c.hline(3, o + 1, o - 2, PAL.C)
  c.hline(o + arm, o + 1, o - 3, PAL.C)
  c.vline(o + 1, 3, o - 2, PAL.C)
  c.vline(3, o + 1, arm - 2, PAL.C)
  c.hline(o + 1, s - 4, arm - 2, PAL.S)
  c.hline(3, o + arm - 2, s - 6, PAL.S)
  c.vline(s - 4, o + 1, arm - 2, PAL.S)
  c.vline(o + arm - 2, o + arm, o - 3, PAL.S)
  // Center recessed dimple
  c.rect(20, 20, 8, 8, PAL.Q)
  c.hline(20, 20, 8, PAL.S)
  c.vline(20, 20, 8, PAL.S)
  // Four directional pixel arrows
  for (let i = 0; i < 4; i++) {
    c.hline(24 - i, 6 + i, i * 2 + 1, PAL.W) // Up
    c.hline(24 - i, s - 7 - i, i * 2 + 1, PAL.W) // Down
    c.vline(6 + i, 24 - i, i * 2 + 1, PAL.W) // Left
    c.vline(s - 7 - i, 24 - i, i * 2 + 1, PAL.W) // Right
  }
  return c
}

const FONT_5X7 = {
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  '-': ['00000', '00000', '00000', '11110', '00000', '00000', '00000'],
  l: ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  n: ['00000', '00000', '10110', '11001', '10001', '10001', '10001'],
  d: ['00001', '00001', '01101', '10011', '10001', '10001', '01111'],
}

/** Stardew-style carved wooden title signboard "I-land" (136x42) with vine leaf & waves */
export function makeTitlePlaque() {
  const w = 136, h = 42
  const c = new PixelCanvas(w, h)
  // Wooden signboard base (y: 4..39, x: 4..131)
  const bx = 4, by = 4, bw = 128, bh = 34
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      if (isCut(x - bx, y - by, bw, bh, 2)) continue
      const edge = x === bx || y === by || x === bx + bw - 1 || y === by + bh - 1 || isCut(x - bx, y - by, bw, bh, 3)
      c.px(x, y, edge ? PAL.K : PAL.W)
    }
  }
  // Wood plank seams & warm highlights
  c.hline(bx + 3, by + 1, bw - 6, PAL.H)
  c.hline(bx + 2, by + 2, bw - 4, PAL.L)
  c.vline(bx + 1, by + 3, bh - 6, PAL.L)
  c.hline(bx + 3, by + bh - 2, bw - 6, PAL.D)
  c.hline(bx + 2, by + bh - 3, bw - 4, PAL.D)
  c.vline(bx + bw - 2, by + 3, bh - 6, PAL.D)
  // Recessed carved board face
  c.rect(bx + 4, by + 4, bw - 8, bh - 8, PAL.D)
  c.rect(bx + 5, by + 5, bw - 10, bh - 10, PAL.M)
  c.hline(bx + 5, by + 5, bw - 10, PAL.W)
  c.hline(bx + 5, by + bh - 6, bw - 10, PAL.L)
  // Horizontal plank grain lines
  c.hline(bx + 7, by + 12, bw - 14, PAL.W)
  c.hline(bx + 7, by + 22, bw - 14, PAL.W)
  // Four brass nails
  for (const [nx, ny] of [[bx + 6, by + 6], [bx + bw - 9, by + 6], [bx + 6, by + bh - 9], [bx + bw - 9, by + bh - 9]]) {
    c.rect(nx, ny, 3, 3, PAL.K)
    c.px(nx, ny, PAL.G)
    c.px(nx + 1, ny, PAL.B)
    c.px(nx, ny + 1, PAL.B)
  }
  // Carved pixel lettering "I-land" (2x blocky embossed gold-cream)
  const word = 'I-land'
  const scale = 2
  const glyphW = 6 * scale
  const startX = Math.floor((w - word.length * glyphW) / 2) + 2
  const startY = by + 9
  for (let i = 0; i < word.length; i++) {
    const g = FONT_5X7[word[i]]
    const gx = startX + i * glyphW
    for (let r = 0; r < g.length; r++) {
      for (let col = 0; col < g[r].length; col++) {
        if (g[r][col] !== '1') continue
        // Drop outline
        c.rect(gx + col * scale + 1, startY + r * scale + 2, scale, scale, PAL.K)
        c.rect(gx + col * scale - 1, startY + r * scale, scale, scale, PAL.K)
        c.rect(gx + col * scale + 1, startY + r * scale, scale, scale, PAL.K)
        c.rect(gx + col * scale, startY + r * scale - 1, scale, scale, PAL.K)
        c.rect(gx + col * scale, startY + r * scale + 1, scale, scale, PAL.K)
      }
    }
    for (let r = 0; r < g.length; r++) {
      for (let col = 0; col < g[r].length; col++) {
        if (g[r][col] !== '1') continue
        const colFill = r < 2 ? PAL.Y3 : r < 5 ? PAL.Y2 : PAL.Y1
        c.rect(gx + col * scale, startY + r * scale, scale, scale, colFill)
      }
    }
  }
  // Cute pixel vine & leaves draping top-left
  const leaf = [
    '..KKK...',
    '.KF2F3K.',
    'KF1F2F1K',
    '.KF0F1K.',
    '..KKF0K.',
    '....KK..',
  ]
  const lmap = { K: PAL.K, '0': PAL.F0, '1': PAL.F1, '2': PAL.F2, '3': PAL.F3 }
  for (let y = 0; y < leaf.length; y++) {
    let x = 0
    for (let p = 0; p < leaf[y].length; p++) {
      const ch = leaf[y][p]
      if (ch === 'F') {
        c.px(12 + x, 1 + y, lmap[leaf[y][++p]])
      } else if (ch === 'K') {
        c.px(12 + x, 1 + y, PAL.K)
      }
      x++
    }
  }
  // Tiny turquoise wave sparkle at bottom-right
  c.hline(w - 28, h - 5, 14, PAL.A0)
  c.hline(w - 27, h - 6, 12, PAL.A2)
  c.px(w - 25, h - 7, PAL.A3)
  c.px(w - 19, h - 7, PAL.A3)
  return c
}
