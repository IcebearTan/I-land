/** 全站共享像素画技法：有序抖动量化渐变、确定性噪声（登录页与岛屿共用） */

export type RGB = [number, number, number]

const BAYER: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/** Bayer 4×4 阈值（0..1） */
export function bayer(x: number, y: number): number {
  return BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] / 16
}

export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

/** 多段渐变取色（stops: [t, RGB] 升序） */
export function colorAt(stops: Array<[number, RGB]>, t: number): RGB {
  t = Math.min(Math.max(t, 0), 1)
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]
    const [t1, c1] = stops[i + 1]
    if (t >= t0 && t <= t1) {
      const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
      return lerpRGB(c0, c1, k)
    }
  }
  return stops[stops.length - 1][1]
}

/** 量化 + Bayer 抖动取色：两个颜色之间的平滑像素过渡（levels 越少颗粒越粗） */
export function ditherMix(a: RGB, b: RGB, t: number, x: number, y: number, levels: number): RGB {
  const q = Math.min(Math.max(t, 0), 1) * levels
  const qi = Math.floor(q)
  const up = q - qi > bayer(x, y) ? 1 : 0
  return colorAt(
    [
      [0, a],
      [1, b],
    ],
    (qi + up) / levels,
  )
}

/** 确定性伪随机（装饰颗粒用，重绘不闪烁） */
export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** 在 CanvasTexture 上下文上执行逐像素绘制（ImageData 全量重写） */
export function paintImageData(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pixel: (x: number, y: number) => RGB | null,
): void {
  const img = ctx.createImageData(w, h)
  const data = img.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = pixel(x, y)
      if (!c) continue
      const idx = (y * w + x) * 4
      data[idx] = c[0]
      data[idx + 1] = c[1]
      data[idx + 2] = c[2]
      data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
