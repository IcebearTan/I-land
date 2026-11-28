import type Phaser from 'phaser'
import { PixelArt } from './island'
import { HOME_ATLAS } from '../../visual/artV2'

export const COTTAGE_KEY = 'cottage-v4'

/** Shared pixel anchor & light coordinates (relative to HOME = {x, y}) for IslandScene. */
export const COTTAGE_META = {
  width: 136,
  height: 134,
  cx: 68,
  anchorY: 122,
  floorWindows: [
    { dx: -33, dy: -23, w: 12, h: 12 },
    { dx: 33, dy: -23, w: 12, h: 12 },
  ],
  doorPanes: [
    { dx: -4.5, dy: -25.5, w: 7, h: 9 },
    { dx: 4.5, dy: -25.5, w: 7, h: 9 },
  ],
  porchLamp: { dx: 18, dy: -24.5 },
  atticWindow: { dx: 0, dy: -70, w: 26, h: 14, mullionsX: [-4.5, 4.5], transomY: -71 },
  skylight: { dx: -37.5, dy: -69.5, r: 3.5 },
  chimneyTop: { dx: 38, dy: -115 },
} as const

const P = {
  woodOut: '#523221',
  woodDark: '#6e4529',
  woodMid: '#99643d',
  woodLit: '#c28b58',
  woodHi: '#dfb47c',
  wallHi: '#f7e8c8',
  wallBase: '#ead2a0',
  wallShade: '#d2b280',
  wallDeep: '#b48f63',
  roofOut: '#5c3b3a',
  roofDeep: '#7d4240',
  roofMid: '#a8584d',
  roofLit: '#c9725c',
  roofHi: '#e59c76',
  ridgeHi: '#f0be88',
  stoneDark: '#726d61',
  stoneMid: '#9e9784',
  stoneLight: '#cbc3a9',
  stoneHi: '#ebe3c8',
  brickDark: '#6e5a55',
  brickMid: '#917a70',
  brickLit: '#b8a28d',
  shutterDark: '#355d4e',
  shutterMid: '#497a66',
  shutterLit: '#669980',
  glassDeep: '#558496',
  glassMid: '#7fb6c5',
  glassHi: '#c8e4e0',
  curtain: '#f5ead2',
  leafDark: '#345b40',
  leafMid: '#528a48',
  leafLit: '#7cb860',
  leafHi: '#afd073',
  rose: '#e8637c',
  cream: '#fdf6e9',
  warm: '#ffd98a',
  terra: '#b86d52',
  terraHi: '#d99370',
}

function blossom(p: PixelArt, x: number, y: number, color: string): void {
  p.rect(x, y, 1, 3, P.leafDark)
  p.rect(x - 1, y - 1, 3, 3, color)
  p.rect(x, y, 1, 1, P.warm)
}

function drawGroundWindow(p: PixelArt, x: number, y: number): void {
  // Forest-green louvered shutters flanking the 16x16 oak window frame
  for (const sx of [x - 3, x + 16]) {
    p.rect(sx, y, 3, 15, P.shutterDark)
    p.rect(sx + 1, y + 1, 1, 13, P.shutterMid)
    for (let ly = y + 2; ly < y + 14; ly += 3) p.rect(sx + 1, ly, 1, 1, P.shutterLit)
  }
  p.rect(x, y - 1, 16, 16, P.woodOut)
  p.rect(x + 1, y, 14, 14, P.woodMid)
  p.rect(x + 1, y, 14, 1, P.woodHi)
  // 12x12 glass pane (aligns with COTTAGE_META.floorWindows)
  p.rect(x + 2, y + 1, 12, 12, P.glassMid)
  p.rect(x + 2, y + 1, 12, 2, P.glassDeep)
  p.rect(x + 3, y + 2, 3, 9, P.glassHi)
  p.rect(x + 7, y + 1, 2, 12, P.cream)
  p.rect(x + 2, y + 6, 12, 2, P.cream)
  // Wooden flowerbox tucked right below the sill
  p.rect(x - 2, y + 14, 20, 5, P.woodOut)
  p.rect(x - 1, y + 15, 18, 3, P.woodMid)
  p.rect(x - 1, y + 14, 18, 1, P.woodHi)
  p.rect(x, y + 13, 16, 2, P.leafMid)
  p.rect(x + 1, y + 12, 14, 2, P.leafLit)
  blossom(p, x + 2, y + 12, P.rose)
  blossom(p, x + 8, y + 11, P.cream)
  blossom(p, x + 13, y + 12, P.rose)
}

function drawChimney(p: PixelArt): void {
  // Chimney pot + stepped weathered brick crown (back-right roof slope)
  p.rect(103, 5, 6, 3, P.brickDark)
  p.rect(104, 5, 3, 2, P.brickLit)
  p.rect(97, 8, 18, 4, P.brickDark)
  p.rect(98, 8, 16, 2, P.stoneHi)
  p.rect(98, 10, 16, 1, P.stoneLight)
  p.rect(99, 12, 14, 34, P.brickDark)
  p.rect(100, 12, 12, 34, P.brickMid)
  p.rect(100, 12, 4, 34, P.brickLit)
  for (let row = 0; row < 8; row++) {
    const by = 15 + row * 4
    p.rect(100, by, 12, 1, P.brickDark)
    p.rect(103 + (row % 2) * 4, by - 3, 1, 3, P.brickDark)
  }
}

function drawMainRoof(p: PixelArt): void {
  // Steep two-story shingle roof: ridge y=26 (x=31..105), eaves y=79 (x=10..126)
  p.polygon([[10, 79], [31, 26], [105, 26], [126, 79], [126, 83], [10, 83]], P.roofOut)
  p.polygon([[12, 78], [32, 27], [103, 27], [124, 78]], P.roofMid)
  p.polygon([[12, 78], [32, 27], [68, 27], [64, 78]], P.roofLit)
  p.polygon([[98, 27], [104, 27], [124, 78], [112, 78]], P.roofDeep)
  // 8 crisp horizontal shingle courses with staggered joints
  for (let row = 0; row < 8; row++) {
    const y = 31 + row * 6
    const t = (y - 26) / 53
    const left = Math.round(32 - t * 20)
    const right = Math.round(104 + t * 20)
    const mid = Math.round((left + right) / 2)
    p.rect(left, y, mid - left, 1, P.roofHi)
    p.rect(mid, y, right - mid, 1, P.roofLit)
    p.rect(left - 1, y + 4, right - left + 2, 1, P.roofDeep)
    for (let x = left + (row % 2) * 4; x < right - 2; x += 8) {
      p.rect(x, y + 1, 1, 3, x > 100 ? P.roofOut : P.roofDeep)
    }
  }
  // Warm terracotta-gold ridge beam + carved eave fascia trim
  p.rect(30, 24, 76, 4, P.roofOut)
  p.rect(31, 25, 74, 2, P.ridgeHi)
  for (let x = 33; x < 103; x += 6) p.rect(x, 25, 3, 1, P.roofHi)
  p.rect(10, 79, 116, 4, P.woodDark)
  p.rect(11, 80, 114, 2, P.woodLit)
  for (let x = 13; x < 123; x += 6) p.rect(x, 82, 2, 1, P.woodOut)
  // Left roof round starlight skylight balancing the right chimney
  p.ellipse(30, 52, 6, 6, P.woodOut)
  p.ellipse(30, 52, 5, 5, P.woodMid)
  p.ellipse(29, 51, 4, 4, P.woodHi)
  p.ellipse(30, 52, 3, 3, P.glassMid)
  p.rect(28, 50, 2, 2, P.glassHi)
  p.rect(30, 49, 1, 7, P.woodDark)
  p.rect(27, 52, 7, 1, P.woodDark)
}

function drawAtticGable(p: PixelArt): void {
  // Cast shadows onto main roof behind the protruding second-story loft gable
  p.rect(91, 41, 5, 33, P.roofOut)
  p.rect(43, 72, 51, 4, P.roofOut)
  // Timber-framed cream-stucco loft facade (x=45..91, y=38..71)
  p.rect(44, 38, 48, 34, P.woodOut)
  p.rect(46, 39, 44, 32, P.wallHi)
  p.rect(84, 39, 6, 32, P.wallBase)
  p.rect(46, 41, 44, 2, P.wallShade)
  p.rect(46, 39, 3, 32, P.woodDark)
  p.rect(47, 39, 1, 32, P.woodLit)
  p.rect(87, 39, 3, 32, P.woodDark)
  p.rect(46, 39, 44, 2, P.woodDark)
  // Steep shingled attic gable roof + bargeboards + brass star finial
  p.polygon([[36, 41], [68, 15], [100, 41], [100, 44], [36, 44]], P.roofOut)
  p.polygon([[39, 40], [68, 17], [97, 40]], P.roofMid)
  p.polygon([[41, 40], [68, 18], [68, 40]], P.roofLit)
  // Crisp roof shingle highlight accents along the attic gable eaves
  for (let i = 0; i < 4; i++) {
    const sy = 22 + i * 5
    const sxL = 62 - i * 6
    const sxR = 72 + i * 6
    p.rect(sxL, sy, 4, 1, P.roofHi)
    p.rect(sxR, sy, 4, 1, P.roofDeep)
  }
  p.polygon([[45, 41], [68, 22], [91, 41]], P.woodOut)
  p.polygon([[47, 40], [68, 24], [89, 40]], P.wallHi)
  // Exposed gable king-post, collar beam & tiny golden star emblem
  p.rect(67, 24, 2, 16, P.woodDark)
  p.rect(55, 34, 26, 2, P.woodDark)
  p.rect(66, 29, 4, 4, P.woodDark)
  p.rect(67, 30, 2, 2, P.warm)
  // Brass star finial atop attic peak
  p.rect(67, 10, 2, 6, P.woodOut)
  p.rect(67, 11, 2, 4, P.warm)
  p.rect(66, 12, 4, 1, P.warm)
  // Wide panoramic 3-bay attic study window (glass x=55..81, y=45..59)
  p.rect(52, 43, 32, 19, P.woodOut)
  p.rect(53, 44, 30, 17, P.woodMid)
  p.rect(53, 44, 30, 1, P.woodHi)
  p.rect(55, 45, 26, 14, P.glassMid)
  p.rect(55, 45, 26, 2, P.glassDeep)
  p.rect(57, 46, 4, 10, P.glassHi)
  p.rect(66, 46, 3, 9, P.glassHi)
  // Soft cream study curtains tucked in upper corners
  p.rect(55, 45, 4, 6, P.curtain)
  p.rect(55, 51, 2, 3, P.curtain)
  p.rect(77, 45, 4, 6, P.curtain)
  p.rect(79, 51, 2, 3, P.curtain)
  // 3-bay oak mullions & sill
  p.rect(63, 45, 1, 14, P.woodDark)
  p.rect(72, 45, 1, 14, P.woodDark)
  p.rect(55, 51, 26, 1, P.woodDark)
  p.rect(50, 60, 36, 3, P.woodOut)
  p.rect(51, 60, 34, 1, P.woodHi)
  // Carved-oak Juliet balcony deck, corbels, balusters & corner blooms
  p.rect(42, 69, 52, 4, P.woodOut)
  p.rect(43, 70, 50, 2, P.woodMid)
  p.rect(43, 69, 50, 1, P.woodHi)
  for (const bx of [46, 67, 88]) {
    p.rect(bx, 73, 3, 3, P.woodOut)
    p.rect(bx + 1, 73, 1, 2, P.woodLit)
  }
  p.rect(43, 63, 50, 2, P.woodOut)
  p.rect(44, 63, 48, 1, P.woodHi)
  for (let x = 44; x <= 92; x += 6) {
    p.rect(x, 65, 2, 5, P.woodDark)
    p.rect(x, 65, 1, 4, P.woodLit)
  }
  blossom(p, 47, 63, P.rose)
  blossom(p, 89, 63, P.cream)
}

/**
 * 16-bit Stardew Two-Story Starlight Attic Cottage (136x134, anchor y=122):
 * - Ground floor: cobblestone plinth, clapboard timber walls, shuttered flowerbox windows,
 *   gabled entry porch with HOME_ATLAS oak door & brass sconce, climbing ivy & terracotta pots.
 * - Second floor: steep shingled roof, tall brick fireplace chimney, round starlight skylight,
 *   and grand timber-framed attic study gable with panoramic 3-bay window & carved oak balcony.
 */
export function buildCottageArt(scene: Phaser.Scene): void {
  const p = new PixelArt(COTTAGE_META.width, COTTAGE_META.height)

  drawChimney(p)

  // 1F walls & cobblestone foundation (x=20..116, y=82..122)
  p.rect(19, 82, 98, 41, P.woodOut)
  p.rect(20, 83, 96, 31, P.wallBase)
  p.rect(105, 83, 11, 31, P.wallShade)
  for (let y = 89; y < 114; y += 6) {
    p.rect(20, y, 85, 1, P.wallShade)
    p.rect(105, y, 11, 1, P.wallDeep)
    p.rect(21, y + 1, 83, 1, P.wallHi)
  }
  p.rect(20, 83, 96, 3, P.wallDeep)
  // Corner carved-oak pilasters
  p.rect(20, 83, 4, 31, P.woodDark); p.rect(21, 83, 1, 31, P.woodLit)
  p.rect(112, 83, 4, 31, P.woodDark); p.rect(113, 83, 1, 31, P.woodMid)
  // Weathered cobblestone foundation plinth (y=114..122)
  p.rect(19, 114, 98, 9, P.stoneDark)
  p.rect(20, 114, 56, 2, P.stoneHi)
  p.rect(76, 114, 40, 2, P.stoneLight)
  for (let row = 0; row < 2; row++) {
    const sy = 116 + row * 3
    for (let sx = 20 + row * 5; sx < 114; sx += 10) {
      p.rect(sx, sy, 9, 2, (sx + row) % 3 === 0 ? P.stoneMid : P.stoneLight)
    }
  }
  // Two stepped stone porch tiers (y=122..130)
  p.rect(49, 122, 38, 4, P.stoneDark); p.rect(50, 122, 36, 2, P.stoneHi)
  p.rect(46, 126, 44, 5, P.stoneDark); p.rect(47, 126, 42, 3, P.stoneLight); p.rect(47, 126, 42, 1, P.stoneHi)
  p.rect(61, 127, 1, 3, P.stoneDark); p.rect(77, 127, 1, 3, P.stoneDark)

  // Ground-floor windows + climbing garden ivy on left corner
  drawGroundWindow(p, 27, 92)
  drawGroundWindow(p, 93, 92)
  for (const [ix, iy] of [[19, 88], [21, 93], [18, 99], [20, 105], [19, 111], [21, 116]]) {
    p.rect(ix, iy, 3, 3, P.leafDark)
    p.rect(ix + 1, iy, 2, 2, P.leafLit)
  }

  // Main pitched roof + grand 2F Starlight Attic Study gable & balcony
  drawMainRoof(p)
  drawAtticGable(p)

  // Front porch columns, miniature entry pediment & hanging brass sconce
  for (const px of [49, 84]) {
    p.rect(px, 86, 4, 36, P.woodOut)
    p.rect(px + 1, 86, 2, 33, P.woodMid)
    p.rect(px + 1, 86, 1, 33, P.woodHi)
    p.rect(px, 119, 4, 3, P.stoneLight)
  }
  p.polygon([[45, 86], [68, 76], [91, 86], [91, 89], [45, 89]], P.roofOut)
  p.polygon([[48, 85], [68, 78], [88, 85]], P.roofLit)
  p.rect(53, 82, 14, 1, P.roofHi)
  p.rect(69, 82, 14, 1, P.roofMid)
  p.polygon([[55, 86], [68, 80], [81, 86]], P.wallHi)
  p.rect(47, 86, 42, 2, P.woodLit)
  // Hanging brass sconce mounted cleanly on the right porch post
  p.rect(84, 95, 4, 5, P.woodOut)
  p.rect(85, 96, 2, 3, P.warm)

  // Terracotta flowerpots flanking the front steps + tucked grass tufts
  for (const px of [36, 92]) {
    p.rect(px, 119, 8, 7, P.terra)
    p.rect(px - 1, 118, 10, 2, P.terraHi)
    p.rect(px + 1, 116, 6, 2, P.leafMid)
    blossom(p, px + 4, 115, px === 36 ? P.cream : P.rose)
  }
  for (const [gx, gy] of [[16, 122], [25, 123], [108, 123], [116, 122]]) {
    p.rect(gx, gy, 4, 2, P.leafDark)
    p.rect(gx + 1, gy - 1, 2, 2, P.leafLit)
    p.rect(gx + 2, gy - 2, 1, 2, P.leafHi)
  }

  p.texture(scene, COTTAGE_KEY)

  // Stamp crisp ART-02 oak entrance door (30x40) flush onto porch threshold
  const frame = scene.textures.getFrame(HOME_ATLAS, 'door-day')
  const texture = scene.textures.get(COTTAGE_KEY) as Phaser.Textures.CanvasTexture
  const ctx = texture.getContext()
  ctx.save()
  ctx.beginPath()
  ctx.rect(53, 88, 30, 35)
  ctx.clip()
  ctx.drawImage(
    frame.source.image as HTMLImageElement,
    frame.cutX,
    frame.cutY,
    frame.width,
    frame.height,
    53,
    84,
    frame.width,
    frame.height,
  )
  ctx.restore()
  texture.refresh()
}
