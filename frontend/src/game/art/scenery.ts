import type Phaser from 'phaser'
import { PixelArt } from './island'

const P = {
  ink: '#4a3b55',
  stoneDark: '#7a7568',
  stoneMid: '#a9a28d',
  stoneLight: '#d4ccb0',
  stoneHi: '#efe7cc',
  woodOut: '#523221',
  woodDark: '#6e4529',
  woodMid: '#99643d',
  woodLit: '#c28b58',
  woodHi: '#dfb47c',
  iron: '#454b57',
  brass: '#ffd98a',
  cream: '#fdf6e9',
  grassDark: '#3d6b41',
  grassMid: '#5a944a',
  grassLit: '#7cb860',
  grassHi: '#afd073',
}

/**
 * Stardew-inspired seaside lighthouse (56x116):
 * - Weathered cobblestone foundation + tucked coastal grass tufts & pebbles
 * - Smooth cylindrical red/cream masonry with rounded shading
 * - Proportional arched oak doorway (12x19) in a stone arch + brass sconce + stone steps
 * - Upper brass porthole, corbeled gallery railing, glowing lantern room & copper dome
 */
export function buildLighthouseArt(scene: Phaser.Scene): void {
  const p = new PixelArt(56, 116)

  // Cobblestone foundation pedestal + coastal pebbles & grass tufts
  p.ellipse(28, 108, 25, 6, P.stoneDark)
  p.ellipse(28, 105, 24, 6, P.stoneMid)
  p.ellipse(27, 103, 22, 4, P.stoneLight)
  p.rect(11, 103, 14, 1, P.stoneHi)
  for (const x of [12, 20, 35, 43]) p.rect(x, 104, 1, 4, P.stoneDark)
  // Tucked coastal grass tufts & pebbles around stone foot
  for (const [gx, gy] of [[6, 107], [11, 110], [43, 109], [48, 106]]) {
    p.rect(gx, gy, 4, 2, P.grassDark)
    p.rect(gx + 1, gy - 1, 2, 2, P.grassLit)
    p.rect(gx + 2, gy - 2, 1, 2, P.grassHi)
  }
  p.rect(9, 109, 3, 2, P.stoneLight)
  p.rect(45, 108, 3, 2, P.stoneMid)

  // Tapered cylindrical tower body (y=36..102)
  p.polygon([[12, 102], [19, 36], [37, 36], [44, 102]], '#5e4f55')
  for (let y = 37; y < 102; y++) {
    const half = 8 + Math.floor((y - 37) / 8.2)
    const red = Math.floor((y - 37) / 14) % 2 === 0
    const base = red ? '#c66559' : '#f1e1be'
    const lit = red ? '#e18b73' : P.cream
    const shade = red ? '#9a4948' : '#c9b698'
    const deep = red ? '#7c3a40' : '#a99781'
    p.rect(28 - half, y, half * 2, 1, base)
    p.rect(29 - half, y, 3, 1, lit)
    p.rect(25 + half - 3, y, 3, 1, shade)
    p.rect(28 + half - 2, y, 2, 1, deep)
    // Subtle masonry stone seam every 7px
    if ((y - 37) % 7 === 0) {
      p.rect(28 - half + 2, y, half * 2 - 4, 1, red ? '#b0554d' : '#decba6')
    }
  }
  // Stone plinth ring at tower foot
  p.rect(12, 99, 32, 3, P.stoneDark)
  p.rect(13, 99, 24, 2, P.stoneLight)

  // Petite arched stone doorway (x=21..34, y=80..100) — proportional & cozy!
  p.rect(23, 79, 10, 2, P.stoneDark)
  p.rect(22, 80, 12, 2, P.stoneDark)
  p.rect(21, 82, 14, 18, P.stoneDark)
  p.rect(23, 80, 10, 2, P.stoneLight)
  p.rect(22, 82, 12, 18, P.stoneLight)
  p.rect(22, 82, 2, 18, P.stoneHi)
  // Recessed arched walnut plank door (x=23..32, y=82..99)
  p.rect(24, 82, 8, 2, P.woodOut)
  p.rect(23, 84, 10, 16, P.woodOut)
  p.rect(25, 83, 6, 1, P.woodMid)
  p.rect(24, 84, 8, 15, P.woodMid)
  p.rect(24, 84, 2, 15, P.woodLit)
  p.rect(27, 84, 1, 15, P.woodDark)
  p.rect(30, 84, 1, 15, P.woodDark)
  // Tiny arched porthole pane + iron hinge straps + brass knob
  p.rect(26, 86, 4, 4, P.woodOut)
  p.rect(27, 87, 2, 2, '#9ad0d6')
  p.rect(24, 92, 3, 1, P.iron)
  p.rect(24, 96, 3, 1, P.iron)
  p.rect(30, 93, 2, 2, P.brass)
  // Two neat stone steps leading to the doorway
  p.rect(20, 100, 16, 3, P.stoneDark)
  p.rect(21, 100, 14, 2, P.stoneHi)
  p.rect(19, 103, 18, 3, P.stoneDark)
  p.rect(20, 103, 16, 2, P.stoneLight)
  // Small mounted brass sconce lantern right of doorway
  p.rect(36, 84, 3, 4, P.iron)
  p.rect(37, 85, 1, 2, P.brass)

  // Upper round brass porthole window (x=25..30, y=54..61)
  p.rect(25, 54, 6, 8, P.iron)
  p.rect(26, 55, 4, 6, '#5c8396')
  p.rect(26, 55, 2, 4, '#b8dce0')
  p.rect(25, 62, 6, 1, P.stoneLight)

  // Corbeled gallery balcony + iron railing (y=26..37)
  p.rect(12, 36, 32, 2, P.stoneDark)
  p.rect(10, 33, 36, 4, P.iron)
  p.rect(11, 33, 34, 2, '#d6b485')
  p.rect(11, 27, 34, 1, P.iron)
  for (let x = 11; x <= 44; x += 5) p.rect(x, 27, 1, 7, P.iron)

  // Lantern glass house (y=15..32) + conical red-copper roof + golden finial
  p.rect(19, 15, 18, 18, P.iron)
  p.rect(21, 16, 14, 16, '#8fc7cf')
  p.rect(22, 17, 4, 13, '#e2eed8')
  p.rect(27, 16, 2, 16, P.iron)
  p.rect(21, 24, 14, 1, '#5d7c86')
  p.polygon([[13, 15], [28, 3], [43, 15]], '#9e4f49')
  p.polygon([[16, 14], [28, 4], [38, 14]], '#c66559')
  p.polygon([[18, 14], [27, 5], [25, 14]], '#e18b73')
  p.rect(15, 14, 26, 2, '#e6ae89')
  p.rect(27, 0, 2, 5, P.brass)
  p.rect(26, 2, 4, 1, P.brass)

  p.texture(scene, 'lighthouse-v3')
}

/**
 * Split tree assets for authentic grounded roots + sea-breeze swaying canopy:
 * - `${prefix}-trunk-v4` (50x66): organic bark grooves, 3 flared roots, grass tufts & pebbles
 * - `${prefix}-canopy-v4` (54x48): rich 4-tone Stardew leafy clusters (sways independently!)
 */
function buildTreePair(scene: Phaser.Scene, prefix: string, autumn = false): void {
  // 1. Grounded trunk + organic flared roots + tucked grass & moss
  const t = new PixelArt(50, 66)
  // Root underside shadow blending into meadow
  t.ellipse(25, 62, 12, 3, '#39613b')
  // Left, center & right organic flared roots
  t.polygon([[15, 62], [20, 56], [23, 55], [22, 62]], P.woodOut)
  t.polygon([[16, 61], [21, 56], [23, 56], [21, 61]], P.woodMid)
  t.rect(18, 59, 3, 2, P.woodLit)
  t.polygon([[28, 55], [31, 56], [36, 62], [29, 62]], P.woodOut)
  t.polygon([[28, 56], [30, 57], [34, 61], [29, 61]], P.woodDark)
  t.rect(29, 57, 2, 3, P.woodMid)
  // Textured bark trunk (tapers slightly wider toward roots)
  t.rect(21, 36, 9, 25, P.woodOut)
  t.rect(22, 36, 7, 24, P.woodMid)
  t.rect(22, 37, 3, 22, P.woodLit)
  t.rect(23, 40, 1, 16, P.woodHi)
  t.rect(27, 37, 2, 23, P.woodDark)
  // Bark grain grooves + cozy wood knot
  t.rect(25, 41, 1, 5, P.woodDark)
  t.rect(24, 51, 1, 4, P.woodDark)
  t.rect(26, 48, 2, 2, P.woodOut)
  t.rect(26, 48, 1, 1, P.woodLit)
  // Center front root toe
  t.rect(23, 59, 5, 4, P.woodOut)
  t.rect(24, 59, 3, 3, P.woodMid)
  t.rect(24, 59, 1, 2, P.woodLit)
  // Lush grass blades, moss flecks & tiny pebble wrapping over root tips
  const blades = [[14, 62], [17, 63], [21, 63], [27, 63], [32, 62], [35, 62]]
  for (const [bx, by] of blades) {
    t.rect(bx, by, 3, 2, P.grassDark)
    t.rect(bx, by - 1, 2, 2, P.grassMid)
    t.rect(bx + 1, by - 2, 1, 2, P.grassLit)
  }
  t.rect(19, 61, 2, 1, P.grassHi)
  t.rect(30, 61, 2, 1, P.grassLit)
  t.rect(13, 63, 2, 1, P.stoneLight)
  if (autumn) {
    t.rect(29, 62, 2, 1, '#d8b768')
    t.rect(16, 62, 2, 1, '#c9975a')
  }
  t.texture(scene, `${prefix}-trunk-v4`)

  // 2. Layered lush canopy (54x48)
  const c = new PixelArt(54, 48)
  const pal = autumn
    ? ['#625638', '#7f8745', '#a6ac58', '#c9cf77', '#e0e397']
    : ['#2e543d', '#407044', '#5a944a', '#86bc5e', '#b3d478']
  for (const [x, y, rx, ry] of [[27, 17, 17, 14], [15, 29, 13, 13], [38, 29, 13, 13], [27, 35, 19, 11]]) {
    c.ellipse(x, y, rx, ry, pal[0])
  }
  for (const [x, y, rx, ry] of [[26, 15, 15, 12], [14, 27, 12, 11], [37, 27, 12, 11], [26, 33, 17, 10]]) {
    c.ellipse(x, y, rx, ry, pal[1])
  }
  for (const [x, y, rx, ry] of [[24, 12, 11, 8], [13, 24, 9, 7], [33, 24, 11, 8], [23, 33, 11, 5]]) {
    c.ellipse(x, y, rx, ry, pal[2])
  }
  for (const [x, y] of [[18, 7], [13, 12], [9, 22], [23, 19], [32, 18], [18, 30], [31, 28], [24, 10]]) {
    c.rect(x, y, 5, 2, pal[3])
    c.rect(x - 1, y + 2, 3, 1, pal[3])
  }
  for (const [x, y] of [[19, 7], [11, 21], [24, 18], [33, 18]]) {
    c.rect(x, y, 2, 1, pal[4])
  }
  c.texture(scene, `${prefix}-canopy-v4`)
}

export function buildIslandSceneryArt(scene: Phaser.Scene): void {
  buildLighthouseArt(scene)
  buildTreePair(scene, 'oak', false)
  buildTreePair(scene, 'olive', true)
  const leaf = new PixelArt(4, 3)
  leaf.rect(1, 0, 2, 1, '#b3d478')
  leaf.rect(0, 1, 3, 1, '#7cb860')
  leaf.rect(1, 2, 2, 1, '#5a944a')
  leaf.texture(scene, 'wind-leaf-v4')
}
