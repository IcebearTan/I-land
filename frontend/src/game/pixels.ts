import type Phaser from 'phaser'

/**
 * 字符画 → CanvasTexture：全站占位/装饰像素美术的统一生成入口。
 *
 * 幂等：纹理已存在时在原画布上重绘并 refresh，**绝不 remove 重建**——
 * WebGL 渲染批次可能仍引用旧纹理对象，remove 会导致 glTexture null 崩溃
 * （改窗口大小/场景切换时必现）。
 */
export function makeTexture(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  palette: Record<string, string>,
  px = 1,
): void {
  const w = rows[0].length * px
  const h = rows.length * px
  const tex = (
    scene.textures.exists(key) ? scene.textures.get(key) : scene.textures.createCanvas(key, w, h)
  ) as Phaser.Textures.CanvasTexture | null
  if (!tex) return
  const ctx = tex.getContext()
  ctx.clearRect(0, 0, w, h)
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]]
      if (color) {
        ctx.fillStyle = color
        ctx.fillRect(x * px, y * px, px, px)
      }
    }
  })
  tex.refresh()
}

// ─── 小熊（16×16，Island 与 Login 共用）────────────────────────
export const BEAR_ROWS = [
  '..bb........bb..',
  '..bbb......bbb..',
  '..bbbbbbbbbbbb..',
  '.bbbbbbbbbbbbbb.',
  '.bbDDbbbbbbDDbb.',
  '.bbbbbbbbbbbbbb.',
  '.bbbbLLLLLLbbbb.',
  '.bbbbLLnnLLbbbb.',
  '..bbbLLLLLLbbb..',
  '..bbbbbbbbbbbb..',
  '.bbbLLLLLLLLbbb.',
  '.bbbLLLLLLLLbbb.',
  '.bbbLLLLLLLLbbb.',
  '.bbbLLLLLLLLbbb.',
  '..b.bbbbbbbb.b..',
  '..b..bbbbbb..b..',
]

export const BEAR_PALETTE: Record<string, string> = {
  b: '#8a5a38', // 毛色
  L: '#e8c48f', // 口鼻/肚皮
  D: '#2b1b45', // 眼睛
  n: '#3a2418', // 鼻头
}

// ─── 爱心（5×4）──────────────────────────────────────────────
export const HEART_ROWS = ['.H.H.', 'HHHHH', '.HHH.', '..H..']
export const HEART_PALETTE: Record<string, string> = { H: '#e8637c' }

// ─── 太阳（12×12，亮芯 + 金边）───────────────────────────────
export const SUN_ROWS = [
  '....YYYY....',
  '..YYWWWWYY..',
  '.YWWWWWWWWY.',
  'YYWWWWWWWWYY',
  'YYWWWWWWWWYY',
  'YWWWWWWWWWWY',
  'YWWWWWWWWWWY',
  'YYWWWWWWWWYY',
  'YYWWWWWWWWYY',
  '.YWWWWWWWWY.',
  '..YYWWWWYY..',
  '....YYYY....',
]
export const SUN_PALETTE: Record<string, string> = { Y: '#ffe066', W: '#fff6c8' }

// ─── 云（白芯 + 浅蓝体 + 蓝灰描边，三款）──────────────────────
export const CLOUD_PALETTE: Record<string, string> = {
  W: '#ffffff',
  L: '#e4eff8',
  D: '#bcd6e6',
  O: '#93b8cd',
}

export const CLOUD_SMALL = [
  '....OOOO....',
  '..OOLLWWOO..',
  '.OLWWWWWWLO.',
  'OLWWWWWWWWLO',
  'OLLLLLLLLLO.',
  '.OOOO..OOOO.',
]

export const CLOUD_MED = [
  '......OOOOOO......',
  '...OOOLLLLWWOO....',
  '..OLLWWWWWWWWLO...',
  '.OLWWWWWWWWWWWLO..',
  'OLWWWWWWWWWWWWWLO.',
  'OLLLLLLLLLLLLLLLO.',
  '..OOOOO....OOOOO..',
]

export const CLOUD_BIG = [
  '......OOOOOOOO........',
  '...OOOOLLLWWWOOOO.....',
  '..OLLWWWWWWWWWWWLO....',
  '.OLWWWWWWWWWWWWWWWLO..',
  'OLWWWWWWWWWWWWWWWWWLO.',
  'OLWWWWWWWWWWWWWWWWWLO.',
  'OLLLLLLLLLLLLLLLLLLLO.',
  '..OOOOOOO.....OOOOOO..',
]

// ─── 蝴蝶两帧（3×3）─────────────────────────────────────────
export const BUTTERFLY_A = ['W.W', '.B.', 'W.W']
export const BUTTERFLY_B = ['.W.', 'WBW', '.W.']
export const BUTTERFLY_PALETTE: Record<string, string> = { W: '#fff3d6', B: '#5d4632' }

// ─── 海鸟两帧（5×2）─────────────────────────────────────────
export const BIRD_A = ['V...V', '.VVV.']
export const BIRD_B = ['.VVV.', 'V...V']
export const BIRD_PALETTE: Record<string, string> = { V: '#4a5a78' }
