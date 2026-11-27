import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PixelCanvas, PAL } from './pixel-ui/canvas.mjs'
import {
  makeWoodPanel,
  makeCompactPanel,
  makeButton,
  makeSlot,
  makeRibbon,
  makeProgressTrack,
  makeProgressFill,
  makeDpad,
  makeTitlePlaque,
} from './pixel-ui/sprites.mjs'
import { buildIcons } from './pixel-ui/icons.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../frontend/public/art-v2/ui')
const ICON_DIR = path.join(OUT_DIR, 'icons')

const sprites = {
  'panel-wood': makeWoodPanel(),
  'panel-wood-compact': makeCompactPanel(false),
  'panel-dark': makeCompactPanel(true),
  'btn-wood': makeButton('wood', 'normal'),
  'btn-wood-hover': makeButton('wood', 'hover'),
  'btn-wood-pressed': makeButton('wood', 'pressed'),
  'btn-accent': makeButton('accent', 'normal'),
  'btn-accent-hover': makeButton('accent', 'hover'),
  'btn-accent-pressed': makeButton('accent', 'pressed'),
  'slot': makeSlot(false),
  'slot-active': makeSlot(true),
  'ribbon-scroll': makeRibbon(),
  'progress-track': makeProgressTrack(),
  'progress-fill': makeProgressFill(),
  'dpad': makeDpad(),
  'title-plaque': makeTitlePlaque(),
}

for (const [name, canvas] of Object.entries(sprites)) {
  canvas.savePng(path.join(OUT_DIR, `${name}.png`))
}

const icons = buildIcons()
for (const [name, canvas] of Object.entries(icons)) {
  canvas.savePng(path.join(ICON_DIR, `${name}.png`))
}

// Optional visual proof sheet when `--preview <path>` is passed
const previewIdx = process.argv.indexOf('--preview')
if (previewIdx >= 0 && process.argv[previewIdx + 1]) {
  const sheet = new PixelCanvas(220, 170)
  // Soft sky-meadow backdrop so pixel outlines pop
  sheet.rect(0, 0, 220, 88, [0x7f, 0xb6, 0xd9, 255])
  sheet.rect(0, 88, 220, 82, [0x5a, 0x94, 0x4a, 255])
  // Title plaque
  sheet.blit(sprites['title-plaque'], 42, 6)
  // Panels & controls row
  sheet.blit(sprites['panel-wood'], 8, 56)
  sheet.blit(sprites['panel-wood-compact'], 38, 59)
  sheet.blit(sprites['panel-dark'], 62, 59)
  sheet.blit(sprites['btn-wood'], 86, 59)
  sheet.blit(sprites['btn-wood-pressed'], 108, 59)
  sheet.blit(sprites['btn-accent'], 130, 59)
  sheet.blit(sprites['slot'], 154, 59)
  sheet.blit(sprites['slot-active'], 176, 59)
  sheet.blit(sprites['ribbon-scroll'], 196 - 4, 60)
  // Progress & D-pad
  sheet.blit(sprites['progress-track'], 8, 92)
  sheet.blit(sprites['progress-fill'], 9, 94)
  sheet.blit(sprites['dpad'], 162, 92)
  // All 16x16 icons in two neat rows
  const iconList = Object.values(icons)
  iconList.forEach((ic, i) => {
    const col = i % 7
    const row = Math.floor(i / 7)
    sheet.blit(sprites['slot'], 8 + col * 21, 108 + row * 21)
    sheet.blit(ic, 9 + col * 21, 109 + row * 21)
  })
  const scaled = sheet.scale(3)
  scaled.savePng(process.argv[previewIdx + 1])
  console.log('PREVIEW_WRITTEN:', process.argv[previewIdx + 1])
}

console.log(`GENERATED_OK: ${Object.keys(sprites).length} UI sprites + ${Object.keys(icons).length} pixel icons -> ${OUT_DIR}`)
