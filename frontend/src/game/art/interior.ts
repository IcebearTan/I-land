import type Phaser from 'phaser'
import { lerpRGB, type RGB } from '../art'
import { PixelArt } from './island'

type Point = { x: number; y: number }
type Rect = Point & { w: number; h: number }

/** 逻辑像素坐标固定；横竖屏只调整相机，不能移动家具或安全起身点。 */
export const HOME_LAYOUT = {
  width: 320,
  height: 240,
  walkable: { x: 20, y: 104, w: 280, h: 124 } as Rect,
  walls: [
    { x: 0, y: 0, w: 320, h: 104 },
    { x: 0, y: 104, w: 20, h: 136 },
    { x: 300, y: 104, w: 20, h: 136 },
    { x: 20, y: 228, w: 232, h: 12 },
    { x: 292, y: 228, w: 8, h: 12 },
  ] as readonly Rect[],
  furniture: [
    { x: 40, y: 97, w: 66, h: 16 },
    { x: 131, y: 97, w: 67, h: 15 },
    { x: 118, y: 154, w: 106, h: 43 },
  ] as readonly Rect[],
  door: { x: 272, y: 218 } as Point,
  fireplace: { x: 74, y: 124 } as Point,
  tv: { x: 164, y: 123 } as Point,
  // 独立纹理的左上角，显示对象使用 origin(0, 0)。
  fire: { x: 58, y: 77 } as Point,
  tvScreen: { x: 139, y: 61 } as Point,
  // 坐姿纹理使用 origin(.5, 1)，下身留给前方靠背遮挡。
  seats: [{ x: 146, y: 178 }, { x: 184, y: 178 }] as readonly Point[],
  standPoints: [{ x: 146, y: 210 }, { x: 184, y: 210 }] as readonly Point[],
  sofa: { x: 118, y: 154, w: 106, h: 43 } as Rect,
}

const C = {
  ink: '#4a3b55', cream: '#f5eee2', linen: '#fdf6e9', sand: '#f0d9a8', warm: '#ffd98a',
  wood: '#8a5a38', woodDark: '#6e4529', board: '#c79a65', woodLight: '#dfbb89',
  wall: '#dfc5a0', wallShade: '#c5a685', stone: '#dfd1b5', stoneShade: '#b5a48c',
  sofa: '#be7964', sofaLight: '#d99175', sofaShade: '#935c53', sofaDeep: '#75494a',
  teal: '#3f887f', tealLight: '#62b2a2', tealShade: '#326860',
  sea: '#3f6f9e', sky: '#7fb6d9', leaf: '#5a944a', grass: '#7cb860',
} as const
const rgb = (color: string): RGB => [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)]
const mix = (a: string, b: string, amount: number): string => '#' + lerpRGB(rgb(a), rgb(b), Math.max(0, Math.min(1, amount)))
  .map(value => Math.round(value).toString(16).padStart(2, '0')).join('')

function nightAmount(hour: number): number {
  const h = ((hour % 24) + 24) % 24
  if (h < 5 || h >= 20) return 1
  if (h < 8) return 1 - (h - 5) / 3
  if (h < 17) return 0
  return (h - 17) / 3
}

function window(p: PixelArt, hour: number, night: number): void {
  const x = 241, y = 29, w = 43, h = 48
  const dusk = hour >= 16 && hour < 20 ? Math.sin((hour - 16) / 4 * Math.PI) : 0
  p.rect(x - 5, y - 4, w + 10, h + 10, C.woodDark)
  p.rect(x - 3, y - 3, w + 6, h + 7, C.board)
  p.rect(x, y, w, h, mix(C.sky, '#2b1b45', night))
  p.rect(x, y + 25, w, 23, mix('#b9d5db', '#374566', night))
  p.rect(x, y + 38, w, 10, mix(C.sea, '#354869', night))
  p.rect(x + 1, y + 43, 11, 1, mix(C.sky, '#587894', night))
  p.rect(x + 26, y + 45, 15, 1, mix(C.sky, '#587894', night))
  if (dusk > .25) p.rect(x, y + 30, w, 8, mix('#c6bdca', '#e8794f', dusk * .7))
  if (night > .6) {
    p.ellipse(x + 30, y + 12, 4, 4, C.cream)
    p.ellipse(x + 32, y + 10, 3, 3, mix(C.sky, '#2b1b45', night))
    for (const [sx, sy] of [[5, 7], [16, 18], [37, 25], [10, 27]]) p.rect(x + sx, y + sy, 1, 1, '#c4c8d5')
  } else {
    p.rect(x + 3, y + 7, 13, 2, C.cream)
    p.rect(x + 7, y + 5, 5, 2, C.cream)
    p.rect(x + 28, y + 19, 11, 2, '#dce7de')
    p.rect(x + 31, y + 17, 5, 2, '#dce7de')
  }
  p.rect(x + 19, y - 1, 3, h + 2, C.woodLight)
  p.rect(x - 1, y + 26, w + 2, 3, C.woodLight)
  p.rect(x + 20, y, 1, h, C.board)
  p.rect(x, y + 28, w, 1, C.board)
  // 窗帘短而厚；窗外景色保留完整四格。
  p.rect(x - 6, y - 6, w + 12, 2, C.woodDark)
  p.rect(x - 4, y - 4, 7, h + 5, C.tealShade)
  p.rect(x - 3, y - 4, 4, h + 3, C.teal)
  p.rect(x - 2, y - 3, 1, h + 1, C.tealLight)
  p.rect(x + w - 2, y - 4, 7, h + 5, C.tealShade)
  p.rect(x + w - 1, y - 4, 4, h + 3, C.teal)
  p.rect(x + w, y - 3, 1, h + 1, C.tealLight)
  p.rect(x - 7, y + h, w + 14, 4, C.woodDark)
  p.rect(x - 8, y + h, w + 16, 2, C.woodLight)
}

function fireplace(p: PixelArt, night: number): void {
  p.ellipse(72, 111, 37, 6, '#805d47')
  p.rect(41, 48, 63, 59, C.stoneShade)
  p.rect(43, 49, 59, 55, mix(C.stone, '#c9b599', night * .2))
  p.rect(44, 49, 3, 51, '#ede0c5')
  // 石块用错缝而非密集噪点，炉膛边缘保留浅石立体厚度。
  for (let row = 0; row < 6; row++) {
    const y = 51 + row * 9
    p.rect(44, y + 7, 56, 1, C.stoneShade)
    for (let x = 44 + (row % 2 ? 9 : 0); x < 100; x += 18) p.rect(x, y, 1, 7, C.stoneShade)
  }
  p.rect(51, 66, 43, 39, '#91806c')
  p.rect(54, 68, 37, 35, C.woodDark)
  p.rect(57, 71, 31, 31, '#352c36')
  p.rect(57, 72, 2, 29, '#5a3c3b')
  p.rect(55, 101, 35, 3, '#9d7150')
  p.rect(38, 105, 69, 7, '#b3a28a')
  p.rect(37, 103, 71, 4, '#ead6b3')
  p.rect(38, 103, 69, 1, C.linen)
  // 厚炉台、杯子和一幅原创微型风景。
  p.rect(36, 45, 73, 5, C.woodDark)
  p.rect(35, 43, 75, 3, '#d5b98e')
  p.rect(36, 43, 73, 1, C.cream)
  p.rect(47, 30, 22, 13, C.woodDark)
  p.rect(49, 32, 18, 9, C.sky)
  p.rect(49, 37, 18, 4, C.sea)
  p.polygon([[51, 38], [56, 34], [60, 38]], C.leaf)
  p.rect(62, 33, 2, 2, C.warm)
  p.rect(84, 36, 7, 7, C.cream)
  p.rect(85, 36, 5, 1, C.woodDark)
  p.rect(91, 38, 3, 4, C.cream)
  p.rect(91, 39, 2, 2, C.wallShade)
  p.rect(85, 42, 5, 1, '#d8bd96')
  // 两根备用柴只是装饰，没有燃料库存。
  p.rect(30, 109, 7, 10, C.woodDark)
  p.rect(29, 108, 7, 8, '#a57951')
  p.rect(30, 108, 4, 2, C.woodLight)
}

function television(p: PixelArt): void {
  // 承托家具占地放在 y97..112；上方外壳与画面均不阻碍走动。
  p.rect(133, 106, 4, 8, C.woodDark)
  p.rect(193, 106, 4, 8, C.woodDark)
  p.rect(129, 96, 72, 13, C.woodDark)
  p.rect(132, 98, 66, 8, '#a67850')
  p.rect(135, 99, 26, 5, C.wood)
  p.rect(166, 99, 28, 5, C.wood)
  p.rect(145, 100, 6, 1, C.woodLight)
  p.rect(177, 100, 6, 1, C.woodLight)
  p.rect(128, 94, 74, 3, C.board)
  p.rect(130, 94, 70, 1, C.woodLight)
  p.rect(145, 91, 4, 3, C.woodDark)
  p.rect(184, 91, 4, 3, C.woodDark)
  p.rect(133, 54, 67, 38, C.woodDark)
  p.rect(135, 55, 63, 35, '#b58b60')
  p.rect(135, 55, 63, 2, C.woodLight)
  p.rect(137, 58, 52, 33, '#624a43')
  p.rect(138, 60, 50, 30, '#b0baa9')
  p.rect(139, 61, 48, 28, '#29333b')
  p.rect(191, 62, 5, 5, C.woodDark)
  p.rect(192, 62, 3, 3, C.woodLight)
  p.rect(193, 62, 1, 3, C.cream)
  p.rect(191, 72, 5, 5, C.woodDark)
  p.rect(192, 72, 3, 3, C.board)
  for (let y = 81; y < 87; y += 2) p.rect(192, y, 4, 1, C.woodDark)
  p.rect(191, 88, 1, 1, '#70604d')
}

function rug(p: PixelArt, night: number): void {
  p.rect(106, 136, 130, 70, '#936f51')
  p.rect(108, 136, 126, 68, '#dac49a')
  p.rect(111, 139, 120, 62, mix(C.linen, '#d5c09b', night * .18))
  p.rect(115, 143, 112, 54, '#f0dfb9')
  p.rect(117, 145, 108, 50, mix(C.linen, C.sand, .25 + night * .12))
  for (let x = 114; x < 229; x += 8) {
    p.rect(x, 141, 2, 1, '#b69878')
    p.rect(x, 198, 2, 1, '#b69878')
  }
  for (let y = 148; y < 195; y += 8) {
    p.rect(113, y, 1, 2, '#b69878')
    p.rect(228, y, 1, 2, '#b69878')
  }
  for (let x = 111; x < 232; x += 4) {
    p.rect(x, 134, 1, 3, '#d5bd94')
    p.rect(x, 204, 1, 3, '#d5bd94')
  }
}

function sofaBase(p: PixelArt): void {
  p.ellipse(171, 195, 57, 7, '#bfa781')
  p.rect(121, 192, 7, 7, C.woodDark)
  p.rect(211, 192, 7, 7, C.woodDark)
  p.rect(118, 158, 106, 35, C.sofaDeep)
  p.rect(121, 154, 100, 35, C.sofaShade)
  p.rect(123, 154, 96, 4, C.sofaLight)
  p.rect(129, 159, 37, 19, C.sofa)
  p.rect(169, 159, 40, 19, C.sofa)
  p.rect(130, 159, 35, 2, '#e5a184')
  p.rect(170, 159, 38, 2, '#e5a184')
  p.rect(129, 176, 37, 2, C.sofaShade)
  p.rect(169, 176, 40, 2, C.sofaShade)
  // 向电视一侧的软扶手与底座；最靠近镜头的靠背另画。
  p.rect(118, 157, 9, 30, C.sofaShade)
  p.rect(119, 155, 8, 5, C.sofaLight)
  p.rect(120, 160, 2, 21, '#ce8a70')
  p.rect(214, 155, 10, 32, C.sofaShade)
  p.rect(214, 155, 9, 5, C.sofaLight)
  // 空座上的小靠枕，人物坐下后自然遮住一部分。
  p.rect(131, 161, 12, 8, '#e6ae8f')
  p.rect(132, 161, 10, 1, '#f0c6a0')
  p.rect(199, 161, 12, 8, '#ce8a70')
}

function sofaFront(scene: Phaser.Scene): void {
  const p = new PixelArt(HOME_LAYOUT.width, HOME_LAYOUT.height)
  p.rect(120, 182, 103, 14, C.sofaDeep)
  p.rect(122, 175, 99, 19, C.sofa)
  p.rect(125, 173, 94, 3, C.sofaLight)
  p.rect(126, 176, 91, 1, '#cc886e')
  p.rect(125, 193, 93, 1, C.sofaShade)
  p.rect(121, 181, 2, 12, C.sofaLight)
  for (const x of [143, 170, 197]) {
    p.rect(x, 186, 2, 2, C.sofaShade)
    p.rect(x, 186, 1, 1, '#a66858')
  }
  // 青绿毛毯搭过右扶手与前背，窄条纹只在毯上。
  p.rect(212, 160, 10, 32, C.tealShade)
  p.rect(213, 159, 8, 30, C.teal)
  p.rect(214, 159, 6, 2, '#9ac6ad')
  p.rect(214, 163, 1, 25, C.tealLight)
  for (let y = 165; y < 188; y += 5) p.rect(215, y, 5, 2, C.tealLight)
  for (const x of [214, 217, 220]) p.rect(x, 189, 1, 3, '#a3d0b9')
  p.texture(scene, 'home-sofa-front')
}

/** 窗外真实昼夜；炉光只作用于炉边板材，室内保持明亮可辨。 */
export function paintInteriorBackdrop(scene: Phaser.Scene, hour: number): void {
  const p = new PixelArt(HOME_LAYOUT.width, HOME_LAYOUT.height)
  const h = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 12
  const night = nightAmount(h)
  p.rect(0, 0, 320, 240, '#302b38')
  p.rect(12, 9, 296, 229, '#473931')
  p.rect(16, 13, 288, 221, C.woodDark)
  p.rect(20, 19, 280, 76, mix(C.wall, '#ad9583', night * .25))
  for (let x = 25; x < 298; x += 9) {
    p.rect(x, 21, 1, 69, mix(C.wallShade, '#977f72', night * .2))
    p.rect(x + 1, 21, 1, 69, mix('#ecd5b2', '#c4aa8c', night * .2))
  }
  p.rect(20, 19, 280, 3, C.woodLight)
  p.rect(20, 88, 280, 8, C.woodDark)
  p.rect(20, 88, 280, 3, '#ad8158')
  p.rect(21, 94, 278, 134, mix('#b58a61', '#967451', night * .45))
  // 长短木板错缝，纹理成组留白；暖光以板材颜色表达，不覆盖缝线。
  for (let row = 0; row < 9; row++) {
    const y = 95 + row * 15
    for (let col = -1; col < 6; col++) {
      const x = 20 + col * 56 + row % 2 * 28
      const left = Math.max(21, x), right = Math.min(299, x + 55)
      if (right <= left) continue
      const glow = Math.max(0, 1 - Math.hypot(x + 28 - 72, (y + 7 - 101) * 1.3) / 94)
      const tint = (row + col + 10) % 3
      const board = mix(['#ba8d62', '#bd9168', '#b1865f'][tint], '#997651', night * .4)
      const color = mix(board, C.warm, glow * (.15 + night * .13))
      p.rect(left, y, right - left, 14, color)
      p.rect(left, y, right - left, 1, mix(color, C.sand, .19))
      p.rect(left, y + 13, right - left, 1, mix(color, C.woodDark, .27))
      p.rect(left + 7, y + 4, Math.max(0, Math.min(17, right - left - 12)), 1, mix(color, C.woodDark, .1))
      p.rect(left + 20, y + 9, Math.max(0, Math.min(16, right - left - 24)), 1, mix(color, C.sand, .14))
      if (right - left > 28) {
        p.rect(left + 3, y + 3, 1, 1, mix(color, C.woodDark, .4))
        p.rect(right - 3, y + 10, 1, 1, mix(color, C.woodDark, .4))
      }
    }
  }
  // 阳光收在窗侧，夜晚保留炉火和清楚的行走区。
  if (night < .45) {
    const lit = mix('#bd9168', '#e8ce98', .25 * (1 - night))
    p.polygon([[244, 96], [281, 96], [293, 124], [247, 124]], lit)
    p.rect(264, 97, 2, 25, '#bc946a')
    p.rect(246, 109, 41, 2, '#bc946a')
  }
  p.rect(20, 20, 4, 205, '#ad8158')
  p.rect(296, 20, 4, 205, '#8a6245')
  p.rect(24, 94, 2, 131, '#916b4b')
  p.rect(294, 94, 2, 131, '#7e5941')
  window(p, h, night)
  fireplace(p, night)
  television(p)
  rug(p, night)
  sofaBase(p)
  // 窗边植物、两双拖鞋和门垫只作装饰。
  p.ellipse(280, 117, 10, 3, '#96714f')
  p.rect(275, 105, 10, 12, '#b9825b')
  p.rect(274, 104, 12, 3, C.board)
  p.rect(279, 89, 2, 16, '#427445')
  p.ellipse(276, 92, 4, 2, C.leaf)
  p.ellipse(282, 97, 4, 2, C.grass)
  p.ellipse(280, 86, 3, 4, C.grass)
  p.rect(279, 85, 1, 7, '#b2ce78')
  for (const [x, color] of [[33, C.cream], [49, '#96bfb2']] as const) {
    p.rect(x, 203, 4, 7, '#96714f')
    p.rect(x + 5, 203, 4, 7, '#96714f')
    p.rect(x, 202, 4, 6, color)
    p.rect(x + 5, 202, 4, 6, color)
    p.rect(x, 203, 4, 1, '#cabda3')
    p.rect(x + 5, 203, 4, 1, '#cabda3')
  }
  p.rect(253, 213, 38, 13, '#866c51')
  p.rect(255, 214, 34, 10, '#cfb98e')
  p.rect(258, 216, 28, 6, '#e5d3a9')
  for (let x = 258; x < 286; x += 4) p.rect(x, 219, 2, 1, '#cfb98e')
  // 剖面不画前墙，边梁在门口留完整 40px 开口。
  p.rect(18, 228, 234, 6, '#845b3f')
  p.rect(18, 228, 234, 2, '#c29666')
  p.rect(292, 228, 10, 6, '#845b3f')
  p.rect(292, 228, 10, 2, '#c29666')
  p.rect(251, 227, 42, 3, C.woodDark)
  p.rect(252, 229, 40, 7, '#c5a579')
  p.rect(254, 230, 36, 4, '#e3c7a0')
  p.texture(scene, 'home-backdrop')
}

function seatedCharacters(scene: Phaser.Scene): void {
  const bear = new PixelArt(22, 23)
  bear.ellipse(5, 4, 3, 3, '#8c999a'); bear.ellipse(16, 4, 3, 3, '#8c999a')
  bear.ellipse(5, 4, 2, 2, '#e6e8e3'); bear.ellipse(16, 4, 2, 2, '#fffaf2')
  bear.ellipse(11, 10, 9, 8, '#8c999a')
  bear.ellipse(11, 10, 8, 7, '#e6e8e3'); bear.ellipse(12, 9, 7, 6, '#fffaf2')
  bear.rect(4, 12, 15, 8, '#8c999a')
  bear.rect(5, 12, 13, 8, '#e6e8e3'); bear.rect(8, 11, 9, 9, '#fffaf2')
  bear.rect(3, 15, 3, 5, '#e6e8e3'); bear.rect(17, 15, 3, 5, '#fffaf2')
  bear.rect(4, 20, 6, 2, '#8c999a'); bear.rect(12, 20, 6, 2, '#8c999a')
  bear.rect(4, 20, 6, 1, '#e6e8e3'); bear.rect(12, 20, 6, 1, '#fffaf2')
  bear.texture(scene, 'home-bear-seated')
  const her = new PixelArt(22, 23)
  her.rect(4, 13, 14, 7, C.teal)
  her.rect(6, 13, 10, 6, C.tealLight)
  her.rect(3, 15, 3, 5, '#f0c6a0'); her.rect(16, 15, 3, 5, '#f0c6a0')
  her.rect(5, 20, 5, 2, '#242333'); her.rect(12, 20, 5, 2, '#242333')
  her.rect(5, 21, 5, 1, '#393946'); her.rect(12, 21, 5, 1, '#393946')
  her.ellipse(11, 8, 7, 7, '#20222e'); her.rect(4, 8, 14, 7, '#20222e')
  her.ellipse(12, 8, 5, 5, '#393946'); her.rect(6, 10, 10, 5, '#393946')
  her.rect(5, 14, 3, 2, '#20222e'); her.rect(14, 14, 3, 2, '#20222e')
  her.rect(8, 15, 6, 2, '#20222e')
  her.texture(scene, 'home-her-seated')
}

function fireFrames(scene: Phaser.Scene): void {
  for (let frame = 0; frame < 4; frame++) {
    const p = new PixelArt(30, 30)
    // 所有帧保留同一稳定亮芯，只变焰尖，不闪灭整团火。
    p.rect(3, 23, 23, 3, '#503c37')
    p.polygon([[4, 21], [25, 25], [24, 28], [3, 24]], '#8a5a38')
    p.polygon([[6, 27], [24, 21], [26, 23], [8, 29]], '#a97853')
    p.rect(5, 24, 3, 2, '#c79a65')
    p.polygon([[6, 24], [6, 17], [10, 14], [9 + frame % 2, 6 + frame], [14, 12], [18, 3 + (frame + 1) % 3], [20, 15], [24, 12 + frame % 2], [25, 24]], '#e8794f')
    p.polygon([[8, 24], [9, 16], [13, 18], [15, 10 + frame % 2], [18, 17], [22, 15], [23, 24]], '#f4b942')
    p.polygon([[11, 24], [11, 19], [14, 14 + frame % 2], [17, 19], [20, 18], [20, 24]], C.warm)
    p.rect(13, 20, 4, 5, '#fff0c2')
    p.rect(7, 26, 2, 1, '#e8794f'); p.rect(22, 26, 2, 1, '#f4b942')
    p.texture(scene, `home-fire-${frame}`)
  }
}

function tvIsland(p: PixelArt, phase: number): void {
  p.rect(0, 0, 48, 15, C.sky)
  p.rect(0, 15, 48, 13, C.sea)
  p.rect(0, 15, 48, 1, '#b4d5de')
  const cloudX = Math.round(7 + Math.sin(phase * Math.PI * 2) * 6)
  p.rect(cloudX, 6, 12, 2, C.cream)
  p.rect(cloudX + 3, 4, 6, 2, C.cream)
  p.rect(33 - Math.round(Math.sin(phase * Math.PI * 2) * 3), 9, 8, 2, '#d6e4dd')
  p.ellipse(32, 15, 8, 3, C.sand)
  p.ellipse(32, 14, 6, 2, C.leaf)
  p.rect(30, 9, 1, 5, C.woodDark)
  p.ellipse(30, 8, 3, 2, C.grass)
  for (let row = 0; row < 4; row++) {
    const y = 19 + row * 3
    const shift = Math.round(Math.sin(phase * Math.PI * 4 + row * .8) * 2)
    for (const x of [3, 19, 38]) p.rect(x + shift + row % 2 * 4, y, 6 + row % 2 * 2, 1, C.sky)
  }
  const gull = Math.round(-4 + phase * 56)
  p.rect(gull, 11, 1, 1, C.ink); p.rect(gull + 1, 12, 1, 1, C.ink); p.rect(gull + 2, 11, 1, 1, C.ink)
}

function tvMoon(p: PixelArt, phase: number): void {
  p.rect(0, 0, 48, 16, '#2b1b45')
  p.rect(0, 16, 48, 12, '#354869')
  for (const [x, y] of [[6, 5], [16, 3], [39, 5], [12, 11], [43, 12]]) p.rect(x, y, 1, 1, '#b6bfce')
  p.ellipse(28, 8, 4, 4, C.cream)
  p.ellipse(30, 6, 3, 3, '#2b1b45')
  p.rect(0, 16, 48, 1, '#587894')
  for (let row = 0; row < 5; row++) {
    const drift = Math.round(Math.sin(phase * Math.PI * 4 + row * .6) * (1 + row * .4))
    p.rect(27 - row + drift, 18 + row * 2, 3 + row * 2, 1, row % 2 ? '#a9bcc4' : '#d6d4c4')
    p.rect(3 + row * 3 - drift, 20 + row, 4, 1, '#587894')
  }
  // 一颗低频划过的小流星，节目其余时段不闪烁。
  if (phase > .69 && phase < .82) {
    const progress = (phase - .69) / .13
    const x = Math.round(8 + progress * 9), y = Math.round(4 + progress * 4)
    p.rect(x - 2, y - 1, 2, 1, '#8c91ac'); p.rect(x, y, 1, 1, C.cream)
  }
}

function tvCat(p: PixelArt, phase: number): void {
  p.rect(0, 0, 48, 28, '#e3cfad')
  p.rect(33, 2, 12, 15, '#a57951')
  p.rect(35, 4, 8, 11, C.sky)
  p.rect(38, 4, 1, 11, C.cream); p.rect(35, 9, 8, 1, C.cream)
  p.rect(0, 21, 48, 7, '#b58a61')
  p.rect(0, 25, 48, 1, C.board)
  p.ellipse(23, 23, 16, 3, '#a67850')
  p.ellipse(23, 22, 15, 3, '#d99175')
  const breathe = phase > .42 && phase < .64 ? 1 : 0
  const rolling = phase > .68 && phase < .8
  p.ellipse(23, 18 - breathe, 9, rolling ? 5 : 4, '#20222e')
  p.ellipse(24, 17 - breathe, 7, 2, '#393946')
  p.rect(13, 14, 10, 8, '#20222e')
  p.polygon([[13, 15], [13, 11], [17, 15]], '#20222e')
  p.polygon([[19, 15], [22, 11], [23, 16]], '#20222e')
  p.rect(14, 12, 1, 2, '#a67869'); p.rect(21, 12, 1, 2, '#a67869')
  // 睁眼与闭眼是长时段表情，尾巴只慢慢摆到三处。
  const awake = phase > .13 && phase < .36
  p.rect(15, 17, 2, awake ? 2 : 1, awake ? C.warm : '#8c999a')
  p.rect(20, 17, 2, awake ? 2 : 1, awake ? C.warm : '#8c999a')
  p.rect(18, 19, 1, 1, '#bd8978')
  const tail = Math.round(Math.sin(phase * Math.PI * 2) * 2)
  p.rect(30, 18, 7, 3, '#20222e')
  p.rect(35, 15 + tail, 3, 5 - tail, '#20222e')
  p.rect(33, 14 + tail, 4, 2, '#393946')
  if (rolling) {
    p.rect(23, 12, 2, 4, '#393946')
    p.rect(28, 13, 2, 3, '#393946')
  }
}

/** 24 秒原创节目循环；由场景限频调用，减少动态固定在同一关键帧。 */
export function paintInteriorTV(scene: Phaser.Scene, channel: number, timeMs: number, reducedMotion: boolean, enabled: boolean): void {
  const p = new PixelArt(48, 28)
  if (!enabled) {
    p.rect(0, 0, 48, 28, '#29333b')
    p.rect(3, 3, 41, 20, '#303d43')
    p.polygon([[5, 4], [18, 4], [6, 14]], '#3b4a4e')
    p.rect(5, 24, 38, 1, '#263238')
  } else {
    const safeTime = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0
    const phase = reducedMotion ? .25 : (safeTime % 24_000) / 24_000
    const choice = Number.isFinite(channel) ? ((Math.trunc(channel) % 3) + 3) % 3 : 0
    if (choice === 0) tvIsland(p, phase)
    else if (choice === 1) tvMoon(p, phase)
    else tvCat(p, phase)
    // CRT 圆角只裁一像素，不叠加扫描线或高频闪光。
    for (const [x, y] of [[0, 0], [47, 0], [0, 27], [47, 27]]) p.rect(x, y, 1, 1, '#3d4141')
  }
  p.texture(scene, 'home-tv')
}

/** 先完成所有纹理，再创建显示对象；重进场只刷新原画布，绝不 remove。 */
export function createInteriorArt(scene: Phaser.Scene): void {
  paintInteriorBackdrop(scene, new Date().getHours())
  sofaFront(scene)
  fireFrames(scene)
  seatedCharacters(scene)
  paintInteriorTV(scene, 0, 0, true, false)
}
