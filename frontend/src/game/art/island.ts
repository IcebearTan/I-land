import Phaser from 'phaser'
import { hash2 } from '../art'
import { makeTexture } from '../pixels'
import { HOME_ATLAS } from '../../visual/artV2'
import { buildIslandSceneryArt } from './scenery'

export const WORLD = { width: 640, height: 480, cx: 320, cy: 236, rx: 252, ry: 167 }
export const HOME = { x: 266, y: 230 }
export const TOWER = { x: 471, y: 253 }
export const DOCK = { left: 302, right: 338, top: 361, bottom: 439 }
export const SPAWN = { x: 320, y: 369 }
export const MAIL = { x: 316, y: 244 }
export const BOTTLE = { x: 432, y: 355 }
export const SEASIDE_ENTRY = { x: 360, y: 376 }
export const SEASIDE_RETURN = { x: 360, y: 338 }
export type Obstacle = { x: number; y: number; w: number; h: number }

// 原创占位像素资产：所有绘制先落到字符网格，再统一交给 makeTexture。
// 禁止抗锯齿、随机噪点填充和运行中替换纹理对象。
export class PixelArt {
  private rows: string[][]
  private colors: Record<string, string> = {}
  private symbols = new Map<string, string>()
  constructor(readonly width: number, readonly height: number) {
    this.rows = Array.from({ length: height }, () => Array(width).fill('.'))
  }
  rect(x: number, y: number, w: number, h: number, color: string): void {
    let symbol = this.symbols.get(color)
    if (!symbol) {
      symbol = String.fromCharCode(0x100 + this.symbols.size)
      this.symbols.set(color, symbol)
      this.colors[symbol] = color
    }
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.height, Math.ceil(y + h)); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.width, Math.ceil(x + w)); px++) this.rows[py][px] = symbol
    }
  }
  ellipse(x: number, y: number, rx: number, ry: number, color: string): void {
    for (let dy = -ry; dy <= ry; dy++) {
      const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry))))
      this.rect(x - half, y + dy, half * 2 + 1, 1, color)
    }
  }
  polygon(points: number[][], color: string): void {
    const minY = Math.min(...points.map(p => p[1]))
    const maxY = Math.max(...points.map(p => p[1]))
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = []
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length]
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
      }
      xs.sort((a, b) => a - b)
      for (let i = 0; i < xs.length - 1; i += 2) this.rect(Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, color)
    }
  }
  texture(scene: Phaser.Scene, key: string): void {
    makeTexture(scene, key, this.rows.map(row => row.join('')), this.colors)
  }
}
const C = {
  ink: '#4a3b55', wood: '#8a5a38', woodDark: '#6e4529', board: '#c79a65', cream: '#fdf6e9',
  sand: '#f0d9a8', grass: '#7cb860', leaf: '#5a944a', leafDark: '#427445', leafShade: '#345b40',
  light: '#b2ce78', sea: '#3f6f9e', shallow: '#7fb6d9', rose: '#e8637c', warm: '#ffd98a',
}

export function coastRadius(angle: number): number {
  return 1 + Math.sin(angle * 3 + .5) * .045 + Math.sin(angle * 7 - .8) * .025 + Math.cos(angle * 11) * .012
}
export function landDistance(x: number, y: number): number {
  const dx = (x - WORLD.cx) / WORLD.rx, dy = (y - WORLD.cy) / WORLD.ry
  return Math.hypot(dx, dy) / coastRadius(Math.atan2(dy, dx))
}
const paths = [
  [[320, 384], [320, 303], [285, 272], [266, 245], [266, 226]],
  [[285, 272], [379, 271], [424, 280], [471, 268], [471, 252]],
  [[281, 271], [197, 280], [173, 282]],
  [[373, 271], [385, 313], [422, 341]],
]
function pathDistance(x: number, y: number): number {
  let distance = Infinity
  for (const path of paths) for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Phaser.Math.Clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1)
    distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t))
  }
  return distance
}
function flower(p: PixelArt, x: number, y: number, color: string): void {
  p.rect(x, y, 1, 5, C.leafDark)
  p.rect(x - 2, y + 2, 2, 1, C.leaf)
  p.rect(x - 1, y - 2, 3, 5, color)
  p.rect(x - 2, y - 1, 5, 3, color)
  p.rect(x, y, 1, 1, C.warm)
}
function fence(p: PixelArt, x: number, y: number, count: number): void {
  p.rect(x, y + 4, count * 12, 3, '#b4875f')
  p.rect(x, y + 10, count * 12, 2, C.wood)
  for (let i = 0; i <= count; i++) {
    p.rect(x + i * 12, y + 1, 4, 15, C.wood)
    p.rect(x + i * 12, y, 3, 13, '#ead0a0')
    p.rect(x + i * 12, y, 1, 12, C.cream)
  }
}

function terrain(scene: Phaser.Scene): void {
  const p = new PixelArt(WORLD.width, WORLD.height)
  p.rect(0, 0, WORLD.width, WORLD.height, C.sea)
  for (let y = 0; y < WORLD.height; y += 2) for (let x = 0; x < WORLD.width; x += 2) {
    const d = landDistance(x, y)
    const grassEdge = .835 + Math.sin(x * .065) * .007 + Math.cos(y * .12) * .006
    let color = C.sea
    if (d < grassEdge) color = C.grass
    else if (d < grassEdge + .018) color = '#5a944a'
    else if (d < grassEdge + .031) color = '#b2bc78'
    else if (d < .968) color = C.sand
    else if (d < 1) color = '#d8c293'
    else if (d < 1.014) color = '#f5eee2'
    else if (d < 1.065) color = C.shallow
    else if (d < 1.15) color = '#629abb'
    else if (d < 1.26) color = '#5288af'
    if (d < .96 && pathDistance(x, y) < 9) color = '#e5ce9b'
    p.rect(x, y, 2, 2, color)
  }
  // 成簇的细节与留白交替；小径保持清晰。
  for (let i = 0; i < 1700; i++) {
    const x = Math.floor(hash2(i, 4) * WORLD.width), y = Math.floor(hash2(i, 8) * WORLD.height)
    const d = landDistance(x, y), pd = pathDistance(x, y)
    if (d < .79 && pd > 14) {
      if (i % 4 === 0) {
        p.rect(x, y, 1, 3, '#659e50'); p.rect(x + 2, y - 1, 1, 3, '#659e50')
        p.rect(x - 1, y + 2, 5, 1, '#8bc16b')
      } else if (i % 11 === 0) flower(p, x, y, i % 3 ? '#f5eee2' : '#e8b4a0')
    } else if (d > .9 && d < .955 && i % 3 === 0) {
      p.rect(x, y, 2, 1, '#d9bd89'); p.rect(x + 2, y + 2, 1, 1, '#faf0cd')
    } else if (d < .85 && pd < 7 && i % 7 === 0) {
      p.rect(x, y, 3, 1, '#c6ac7e')
    } else if (d > 1.1 && i % 7 === 0) {
      p.rect(x, y, 6 + i % 8, 1, '#6aa2c4'); p.rect(x + 3, y + 2, 3, 1, '#568aaf')
    }
  }
  // 小屋前的石板庭院。
  for (let row = 0; row < 4; row++) for (let col = 0; col < 9; col++) {
    const x = 218 + col * 11 + row % 2 * 5, y = 232 + row * 6
    p.rect(x, y, 10, 5, '#b5b097'); p.rect(x, y, 9, 3, '#d3cdb3')
  }
  // 西侧花圃：浅色栅栏、翻好的土地、两排花。
  p.rect(131, 246, 75, 61, '#659e50')
  fence(p, 129, 242, 6); fence(p, 129, 305, 6)
  for (let row = 0; row < 3; row++) {
    p.rect(139, 263 + row * 13, 58, 9, '#8a5a38')
    p.rect(140, 263 + row * 13, 56, 2, '#ab7950')
    for (let col = 0; col < 7; col++) flower(p, 144 + col * 8, 264 + row * 13, [C.rose, C.cream, C.warm][row])
  }
  // 东侧双人野餐角，留出通行空间。
  p.rect(357, 300, 46, 29, '#60974d')
  p.rect(354, 296, 44, 28, '#fff0da')
  for (let y = 0; y < 4; y++) for (let x = 0; x < 7; x++) if ((x + y) % 2 === 0) p.rect(355 + x * 6, 297 + y * 6, 6, 6, '#df9c8d')
  p.rect(363, 301, 12, 8, C.board); p.rect(365, 299, 8, 2, C.wood)
  for (const x of [382, 392]) { p.rect(x, 311, 4, 4, C.cream); p.rect(x + 1, 311, 2, 1, C.wood) }
  // 码头：长度缩短，双侧立柱与系船绳。
  p.rect(DOCK.left + 3, DOCK.top + 4, 38, DOCK.bottom - DOCK.top, '#416c86')
  for (let y = DOCK.top; y < DOCK.bottom; y += 5) {
    p.rect(DOCK.left, y, 36, 5, C.wood)
    p.rect(DOCK.left + 1, y, 34, 4, '#bd9565')
    p.rect(DOCK.left + 1, y, 34, 1, '#e4bf86')
    p.rect(DOCK.left + 8 + y % 3, y + 2, 10, 1, '#ac8256')
    for (const x of [DOCK.left + 3, DOCK.right - 4]) p.rect(x, y + 2, 1, 1, C.woodDark)
  }
  for (const x of [DOCK.left - 2, DOCK.right - 2]) for (const y of [DOCK.top + 3, DOCK.bottom - 8]) {
    p.rect(x, y, 4, 11, C.woodDark); p.rect(x, y - 1, 4, 3, '#ecd0a0'); p.rect(x + 1, y + 2, 1, 7, C.board)
  }
  // 海边石块与贝壳。
  for (const [x, y] of [[105, 304], [111, 310], [509, 310], [488, 338], [230, 372], [401, 378]]) {
    p.ellipse(x, y, 7, 3, '#b6ac91'); p.ellipse(x - 1, y - 2, 6, 3, '#d6cdb0'); p.rect(x - 3, y - 4, 4, 1, C.cream)
  }
  for (const [x, y] of [[244, 370], [415, 365], [450, 342], [203, 342]]) {
    p.rect(x - 2, y, 5, 2, '#d8a997'); p.rect(x - 1, y - 2, 3, 3, '#f7e9d1'); p.rect(x, y - 1, 1, 3, '#e7beab')
  }
  p.texture(scene, 'island-ground-v3')
}

function cottage(scene: Phaser.Scene): void {
  const p = new PixelArt(120, 112)
  // 侧墙与正墙：屋顶占建筑的大半，统一左上光源。
  p.rect(16, 57, 88, 42, C.woodDark)
  p.rect(18, 58, 70, 37, '#ead2a0'); p.rect(88, 60, 14, 35, '#bc986d')
  for (let y = 62; y < 94; y += 7) { p.rect(19, y, 67, 1, '#cfb082'); p.rect(89, y, 12, 1, '#a88260') }
  p.rect(18, 94, 86, 6, '#85877a'); p.rect(19, 94, 83, 2, '#b6b69a')
  for (let x = 20; x < 104; x += 12) p.rect(x, 96, 1, 4, '#6f746b')
  // 门廊、实木门、檐柱。
  p.rect(49, 70, 20, 28, C.woodDark); p.rect(52, 72, 14, 24, '#a97853')
  p.rect(54, 74, 10, 8, '#7caaaa'); p.rect(58, 74, 1, 8, C.cream)
  p.rect(54, 85, 10, 1, C.wood); p.rect(62, 86, 2, 2, C.warm)
  p.rect(44, 99, 32, 4, '#b9ae91'); p.rect(42, 103, 36, 4, '#d9c7a0')
  for (const x of [25, 74]) {
    p.rect(x, 69, 15, 18, C.wood); p.rect(x + 2, 71, 11, 12, '#7fb6c5')
    p.rect(x + 3, 71, 3, 10, '#c1d9d1'); p.rect(x + 7, 71, 1, 12, C.cream); p.rect(x + 2, 76, 11, 1, C.cream)
    p.rect(x - 2, 86, 19, 5, '#a97853'); p.rect(x - 2, 86, 19, 1, '#d3aa78')
    flower(p, x + 2, 84, C.rose); flower(p, x + 8, 83, C.cream); flower(p, x + 13, 84, C.rose)
  }
  // 烟囱先画，屋瓦盖住它的下缘。
  p.rect(80, 13, 11, 29, '#846f66'); p.rect(80, 13, 4, 29, '#bdab91')
  for (let y = 15; y < 37; y += 5) p.rect(81, y, 9, 1, '#655b57')
  p.rect(78, 11, 15, 4, '#d1c1a1')
  p.polygon([[8, 59], [30, 22], [91, 22], [113, 59], [113, 65], [8, 65]], '#694b47')
  p.polygon([[10, 57], [31, 23], [87, 23], [100, 58]], '#ad5e51')
  p.polygon([[87, 23], [91, 23], [111, 59], [100, 59]], '#884d48')
  for (let row = 0; row < 6; row++) {
    const y = 28 + row * 6, left = 30 - row * 3
    p.rect(left, y, 60 + row * 5, 1, '#df9671')
    p.rect(left - 1, y + 4, 63 + row * 5, 1, '#904f49')
    for (let x = left + (row % 2) * 5; x < 91 + row * 2; x += 10) p.rect(x, y, 1, 4, '#bf715c')
  }
  p.rect(30, 21, 61, 2, '#edb582'); p.rect(8, 61, 106, 3, '#c58e65')
  // 小阁楼窗打破大屋顶的平面。
  p.polygon([[43, 51], [58, 34], [73, 51]], C.woodDark)
  p.polygon([[46, 50], [58, 37], [70, 50]], '#edcca0')
  p.rect(48, 50, 20, 13, '#edcca0'); p.rect(53, 47, 10, 12, C.wood)
  p.rect(55, 49, 6, 8, C.warm); p.rect(57, 49, 1, 8, C.cream)
  // 门前盆栽。
  for (const x of [31, 83]) { p.rect(x, 97, 8, 7, '#ae7056'); p.rect(x - 1, 96, 10, 2, '#d49870'); flower(p, x + 4, 93, C.cream) }
  p.texture(scene, 'cottage-v3')
  // 扩大门洞为 ART-02 的 22×32，保留屋檐和原入口坐标。
  const frame = scene.textures.getFrame(HOME_ATLAS, 'door-day')
  const texture = scene.textures.get('cottage-v3') as Phaser.Textures.CanvasTexture
  const context = texture.getContext()
  context.save(); context.beginPath(); context.rect(44, 65, 30, 36); context.clip()
  context.drawImage(frame.source.image as HTMLImageElement, frame.cutX, frame.cutY, frame.width, frame.height, 44, 61, frame.width, frame.height)
  context.restore(); texture.refresh()
}

function props(scene: Phaser.Scene): void {
  const p = new PixelArt(22, 30)
  p.rect(9, 14, 4, 16, C.wood); p.rect(10, 15, 1, 13, C.board)
  p.rect(2, 5, 18, 13, '#994d56'); p.rect(3, 3, 15, 14, C.rose); p.rect(5, 2, 10, 2, '#f1ad9b')
  p.rect(4, 8, 12, 2, '#a24f59'); p.rect(17, 1, 2, 10, C.wood); p.rect(19, 1, 3, 4, C.warm)
  p.rect(8, 12, 5, 3, C.cream); p.rect(7, 11, 2, 2, C.cream); p.rect(12, 11, 2, 2, C.cream)
  p.texture(scene, 'mailbox-v3')
  const b = new PixelArt(42, 25)
  b.rect(3, 18, 3, 7, C.woodDark); b.rect(35, 18, 3, 7, C.woodDark)
  for (const y of [3, 8, 14]) { b.rect(1, y, 39, 4, C.wood); b.rect(2, y, 37, 2, '#d4ae78') }
  b.rect(3, 2, 2, 14, C.wood); b.rect(35, 2, 2, 14, C.wood)
  b.texture(scene, 'bench-v3')
  const lamp = new PixelArt(14, 40)
  lamp.rect(6, 11, 3, 28, C.woodDark); lamp.rect(6, 13, 1, 24, C.board)
  lamp.rect(3, 4, 9, 11, C.woodDark); lamp.rect(5, 6, 5, 7, C.warm); lamp.rect(7, 6, 1, 7, '#b28558')
  lamp.rect(2, 2, 11, 3, '#66706a'); lamp.rect(5, 0, 5, 2, '#66706a'); lamp.rect(4, 38, 7, 2, C.woodDark)
  lamp.texture(scene, 'lantern-v3')
}

export const TREES = [
  [139, 194], [155, 151], [184, 128], [224, 121], [265, 106], [305, 111], [346, 105], [384, 119], [418, 139],
  [106, 229], [112, 263], [172, 206], [369, 174], [413, 200], [526, 256], [508, 204], [208, 354], [123, 321], [520, 301],
]
export const LAMPS = [[343, 354], [307, 269], [443, 281]]
export const OBSTACLES: Obstacle[] = [
  { x: HOME.x - 44, y: HOME.y - 38, w: 88, h: 38 },
  { x: TOWER.x - 15, y: TOWER.y - 25, w: 30, h: 25 },
  { x: MAIL.x - 8, y: MAIL.y - 8, w: 16, h: 8 },
  ...TREES.map(([x, y]) => ({ x: x - 5, y: y - 5, w: 10, h: 7 })),
]
export function createIslandArt(scene: Phaser.Scene): void {
  terrain(scene); cottage(scene); buildIslandSceneryArt(scene); props(scene)
  // 海边入口独立于漂流瓶：小木牌、青绿坐垫和奶油色贝壳。
  makeTexture(scene, 'seaside-waymark', [
    '..................',
    '.ssssssssssssssss.',
    '.sbbbbbbbbbbbbbbs.',
    '.sbbbbbbbbbbbbbbs.',
    '.sbbbbbbbbbbbbbbs.',
    '.sbbbbbbbbbbbbbbs.',
    '.sbbbbbbbbbbbbbbs.',
    '.sbbbbbbbbbbbbbbs.',
    '.sbbbbbbbbbbbbbbs.',
    '.ssssssssssssssss.',
    '.......wwww.......',
    '.......wbbw.......',
    '.......wbbw.......',
    '.......wbbw.......',
    '.......wbbw.......',
    '.......ssss.......',
  ], { s: '#6e4529', b: '#8a5a38', w: '#c79a65' })
  makeTexture(scene, 'seaside-cushion', [
    '..ssssssssssss..', '.stttttttttttts.', 'stTTTTTTTTTTTTts',
    'stTTttTTTTttTTts', 'stTTTTTTTTTTTTts', '.stttttttttttts.', '..ssssssssssss..',
  ], { s: '#467e79', t: '#62b2a2', T: '#a3d0b9' })
  makeTexture(scene, 'seaside-shell', [
    '..www..', '.wcwcw.', 'wcwcwcw', 'wwcccww', '.wwwww.', '..www..',
  ], { w: '#f5eee2', c: '#d5ac90' })

}
