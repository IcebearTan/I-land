import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PixelCanvas } from './pixel-ui/canvas.mjs'
import { buildHerFrames } from './pixel-chars/her.mjs'
import { buildBearFrames } from './pixel-chars/bear.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ART_DIR = path.resolve(__dirname, '../frontend/public/art-v2')
const CHAR_DIR = path.join(ART_DIR, 'characters')
const ATLAS_JSON = path.join(ART_DIR, 'characters-atlas.json')
const ATLAS_PNG = path.join(ART_DIR, 'characters-atlas.png')

const atlasMeta = JSON.parse(fs.readFileSync(ATLAS_JSON, 'utf8'))
const atlas = new PixelCanvas(atlasMeta.meta.size.w, atlasMeta.meta.size.h)

function blitWithExtrude(dst, src, ox, oy) {
  dst.blit(src, ox, oy)
  // 1px edge extrusion prevents WebGL texture bleed at sub-pixel zoom
  for (let x = 0; x < src.w; x++) {
    const top = x * 4
    const bot = ((src.h - 1) * src.w + x) * 4
    if (src.data[top + 3]) dst.px(ox + x, oy - 1, src.data.subarray(top, top + 4))
    if (src.data[bot + 3]) dst.px(ox + x, oy + src.h, src.data.subarray(bot, bot + 4))
  }
  for (let y = 0; y < src.h; y++) {
    const left = (y * src.w) * 4
    const right = (y * src.w + src.w - 1) * 4
    if (src.data[left + 3]) dst.px(ox - 1, oy + y, src.data.subarray(left, left + 4))
    if (src.data[right + 3]) dst.px(ox + src.w, oy + y, src.data.subarray(right, right + 4))
  }
}

const all = {
  bear: buildBearFrames(),
  her: buildHerFrames(),
}

let written = 0
for (const [who, frames] of Object.entries(all)) {
  for (const [pose, canvas] of Object.entries(frames)) {
    const key = `${who}-${pose}`
    const slot = atlasMeta.frames[key]
    if (!slot) throw new Error(`Missing atlas frame definition for ${key}`)
    blitWithExtrude(atlas, canvas, slot.frame.x, slot.frame.y)
    canvas.savePng(path.join(CHAR_DIR, `${key}.png`))
    written++
  }
}

atlas.savePng(ATLAS_PNG)
console.log(`CHARACTERS_OK: wrote ${written} frames + ${ATLAS_PNG}`)

// Optional 6x zoomed proof sheet for visual review
const previewIdx = process.argv.indexOf('--preview')
if (previewIdx >= 0 && process.argv[previewIdx + 1]) {
  const picks = ['idle-down', 'walk-down-0', 'walk-down-2', 'idle-up', 'idle-right', 'walk-right-0', 'walk-right-2', 'sit-down']
  const sheet = new PixelCanvas(picks.length * 36 + 8, 80)
  sheet.rect(0, 0, sheet.w, sheet.h, [0x78, 0xb2, 0x62, 255])
  picks.forEach((p, i) => {
    sheet.blit(all.her[p], 4 + i * 36, 4)
    sheet.blit(all.bear[p], 4 + i * 36, 42)
  })
  sheet.scale(5).savePng(process.argv[previewIdx + 1])
  console.log('CHAR_PREVIEW_WRITTEN:', process.argv[previewIdx + 1])
}
