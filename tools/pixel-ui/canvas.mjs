import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

/** Stardew-inspired warm oak & parchment palette aligned with I-land STYLE.md */
export const PAL = {
  _: [0, 0, 0, 0],
  // Warm carved oak frame (Stardew warm mahogany-oak outline, never harsh black)
  K: [0x59, 0x30, 0x1b, 255], // Warm dark mahogany outline
  D: [0x78, 0x41, 0x22, 255], // Dark wood recess
  W: [0x9e, 0x5b, 0x2b, 255], // Mid oak body
  M: [0xbd, 0x76, 0x3b, 255], // Warm oak lit face
  L: [0xe6, 0xb2, 0x67, 255], // Oak bevel highlight
  H: [0xf7, 0xd7, 0x94, 255], // Bright wood specular
  // Brass rivets
  G: [0xff, 0xe0, 0x82, 255], // Brass gleam
  B: [0xc7, 0x82, 0x2c, 255], // Brass mid
  // Aged parchment fill (warm Stardew cream, never sterile white)
  P: [0xf8, 0xe1, 0xb8, 255], // Parchment base
  Q: [0xf1, 0xd1, 0x99, 255], // Parchment warm grain
  S: [0xdf, 0xb6, 0x78, 255], // Inner bevel shadow
  C: [0xff, 0xf2, 0xd4, 255], // Parchment top highlight
  // Teal-jade primary action (matches I-land hero teal)
  T0: [0x1c, 0x38, 0x3e, 255],
  T1: [0x24, 0x4f, 0x4c, 255],
  T2: [0x32, 0x6c, 0x62, 255],
  T3: [0x45, 0x91, 0x84, 255],
  T4: [0x7c, 0xc7, 0xb4, 255],
  // Night-sky frame
  N0: [0x0f, 0x132 & 0xff, 0x26, 255],
  N1: [0x1c, 0x24, 0x45, 255],
  N2: [0x31, 0x40, 0x6e, 255],
  N3: [0x5d, 0x76, 0xb0, 255],
  N4: [0x9b, 0xb8, 0xe8, 255],
  // Foliage, sea, hearth, heart accents
  F0: [0x2f, 0x5c, 0x30, 255],
  F1: [0x53, 0x90, 0x46, 255],
  F2: [0x82, 0xc0, 0x63, 255],
  F3: [0xb8, 0xdf, 0x8a, 255],
  A0: [0x2b, 0x52, 0x78, 255],
  A1: [0x46, 0x82, 0xb4, 255],
  A2: [0x82, 0xbe, 0xdf, 255],
  A3: [0xd2, 0xee, 0xf7, 255],
  R0: [0x78, 0x28, 0x39, 255],
  R1: [0xc2, 0x46, 0x5b, 255],
  R2: [0xeb, 0x75, 0x88, 255],
  R3: [0xff, 0xc2, 0xcc, 255],
  Y0: [0xc9, 0x7c, 0x20, 255],
  Y1: [0xf2, 0xb3, 0x41, 255],
  Y2: [0xff, 0xdf, 0x78, 255],
  Y3: [0xff, 0xf6, 0xc7, 255],
  I: [0x4a, 0x32, 0x28, 255], // Deep warm ink
  U: [0xff, 0xfa, 0xf0, 255], // Crisp white
  SH: [0x2b, 0x18, 0x12, 92], // Hard pixel drop shadow
}
PAL.N0 = [0x0f, 0x13, 0x26, 255]

export class PixelCanvas {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.data = new Uint8Array(w * h * 4)
  }

  px(x, y, rgba) {
    if (!rgba || rgba[3] === 0) return
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return
    const idx = (iy * this.w + ix) * 4
    const a = rgba[3] / 255
    if (a >= 1) {
      this.data[idx] = rgba[0]
      this.data[idx + 1] = rgba[1]
      this.data[idx + 2] = rgba[2]
      this.data[idx + 3] = 255
      return
    }
    const dstA = this.data[idx + 3] / 255
    const outA = a + dstA * (1 - a)
    if (outA <= 0) return
    this.data[idx] = Math.round((rgba[0] * a + this.data[idx] * dstA * (1 - a)) / outA)
    this.data[idx + 1] = Math.round((rgba[1] * a + this.data[idx + 1] * dstA * (1 - a)) / outA)
    this.data[idx + 2] = Math.round((rgba[2] * a + this.data[idx + 2] * dstA * (1 - a)) / outA)
    this.data[idx + 3] = Math.round(outA * 255)
  }

  rect(x, y, w, h, rgba) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) this.px(x + dx, y + dy, rgba)
    }
  }

  hline(x, y, len, rgba) {
    for (let dx = 0; dx < len; dx++) this.px(x + dx, y, rgba)
  }

  vline(x, y, len, rgba) {
    for (let dy = 0; dy < len; dy++) this.px(x, y + dy, rgba)
  }

  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4
        if (src.data[i + 3] > 0) {
          this.px(ox + x, oy + y, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]])
        }
      }
    }
  }

  scale(factor) {
    const out = new PixelCanvas(this.w * factor, this.h * factor)
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4
        if (this.data[i + 3] === 0) continue
        const c = [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]
        out.rect(x * factor, y * factor, factor, factor, c)
      }
    }
    return out
  }

  toPngBuffer() {
    const stride = this.w * 4 + 1
    const raw = Buffer.alloc(stride * this.h)
    for (let y = 0; y < this.h; y++) {
      raw[y * stride] = 0
      raw.set(this.data.subarray(y * this.w * 4, (y + 1) * this.w * 4), y * stride + 1)
    }
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(this.w, 0)
    ihdr.writeUInt32BE(this.h, 4)
    ihdr[8] = 8
    ihdr[9] = 6
    const idat = zlib.deflateSync(raw, { level: 9 })
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
  }

  savePng(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, this.toPngBuffer())
  }
}

export function drawAsciiGrid(rows, map) {
  const h = rows.length
  const w = rows[0].length
  const c = new PixelCanvas(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x]
      if (ch !== '.' && map[ch]) c.px(x, y, map[ch])
    }
  }
  return c
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}
