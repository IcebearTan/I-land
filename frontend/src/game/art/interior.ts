import type Phaser from 'phaser'
import { HOME_ATLAS } from '../../visual/artV2'
import { PixelArt } from './island'

import { HOME_LAYERS } from '../../interior/layout'
export { HOME_LAYOUT } from '../../interior/layout'

const C = { ink: '#4a3b55', cream: '#f5eee2', warm: '#ffd98a', sky: '#7fb6d9', sea: '#3f6f9e', sand: '#f0d9a8', leaf: '#5a944a' }
export function interiorNight(hour: number): number {
  const h = ((hour % 24) + 24) % 24
  return h < 5 || h >= 20 ? 1 : h < 8 ? 1 - (h - 5) / 3 : h < 17 ? 0 : (h - 17) / 3
}

/** 日夜家具已经带受光；只在同尺寸夜版上渐变，不能再整屋乘色。 */
export function paintInteriorBackdrop(scene: Phaser.Scene, hour: number): void {
  const night = interiorNight(hour)
  for (const child of scene.children.list) {
    const image = child as Phaser.GameObjects.Image
    if (image.getData?.('home-night-layer')) image.setAlpha(night)
  }
}

/** 27×20 原生节目，逐像素重新构图；不缩放旧 48×28 纹理。 */
export function paintInteriorTV(scene: Phaser.Scene, channel: number, timeMs: number, reducedMotion: boolean, enabled: boolean): void {
  const p = new PixelArt(27, 20)
  const phase = reducedMotion ? .25 : (Math.max(0, Number.isFinite(timeMs) ? timeMs : 0) % 24000) / 24000
  if (!enabled) {
    p.rect(0, 0, 27, 20, '#29333b'); p.rect(2, 2, 23, 16, '#303d43')
    p.polygon([[3, 3], [12, 3], [3, 10]], '#3b4a4e')
  } else if (channel === 0) {
    p.rect(0, 0, 27, 10, C.sky); p.rect(0, 10, 27, 10, C.sea)
    const cloud = Math.round(3 + Math.sin(phase * Math.PI * 2) * 2)
    p.rect(cloud, 3, 7, 1, C.cream); p.rect(cloud + 2, 2, 3, 1, C.cream)
    p.ellipse(19, 11, 5, 2, C.sand); p.ellipse(19, 10, 4, 1, C.leaf)
    p.rect(18, 6, 1, 4, '#6e4529'); p.ellipse(18, 5, 2, 2, '#7cb860')
    for (let row = 0; row < 3; row++) {
      const drift = Math.round(Math.sin(phase * Math.PI * 4 + row) * 2)
      p.rect(3 + row * 5 + drift, 14 + row * 2, 5, 1, C.sky)
    }
    const gull = Math.round(-3 + phase * 33)
    p.rect(gull, 7, 1, 1, C.ink); p.rect(gull + 1, 8, 1, 1, C.ink); p.rect(gull + 2, 7, 1, 1, C.ink)
  } else if (channel === 1) {
    p.rect(0, 0, 27, 11, '#2b1b45'); p.rect(0, 11, 27, 9, '#354869')
    for (const [x, y] of [[3, 3], [8, 5], [23, 4], [5, 9]]) p.rect(x, y, 1, 1, '#b6bfce')
    p.ellipse(17, 5, 3, 3, C.cream); p.ellipse(19, 4, 2, 2, '#2b1b45')
    for (let row = 0; row < 4; row++) {
      const drift = Math.round(Math.sin(phase * Math.PI * 4 + row) * 1.5)
      p.rect(16 - row + drift, 12 + row * 2, 2 + row * 2, 1, row % 2 ? '#a9bcc4' : '#d6d4c4')
    }
  } else {
    p.rect(0, 0, 27, 20, '#e3cfad'); p.rect(19, 1, 7, 10, '#a57951'); p.rect(20, 2, 5, 8, C.sky)
    p.rect(22, 2, 1, 8, C.cream); p.rect(20, 6, 5, 1, C.cream); p.rect(0, 15, 27, 5, '#b58a61')
    p.ellipse(13, 17, 9, 2, '#d99175')
    const breath = phase > .42 && phase < .64 ? 1 : 0
    p.ellipse(14, 13 - breath, 6, 3, '#20222e'); p.ellipse(15, 12 - breath, 4, 1, '#393946')
    p.rect(7, 10, 6, 6, '#20222e'); p.polygon([[7, 11], [7, 7], [10, 11]], '#20222e'); p.polygon([[10, 11], [12, 7], [13, 11]], '#20222e')
    const awake = phase > .13 && phase < .36
    p.rect(8, 12, 1, awake ? 2 : 1, C.warm); p.rect(11, 12, 1, awake ? 2 : 1, C.warm)
    p.rect(19, 13, 4, 2, '#20222e'); p.rect(22, 11 + Math.round(Math.sin(phase * Math.PI * 2)), 2, 3, '#393946')
  }
  for (const [x, y] of [[0, 0], [26, 0], [0, 19], [26, 19]]) p.rect(x, y, 1, 1, '#3d4141')
  p.texture(scene, 'home-tv')
}

export const WALL_CALENDAR = {
  x: 203,
  y: 44,
  visual: { x: 200, y: 41, w: 26, h: 30 },
  stand: { x: 213, y: 122 },
} as const

export const ATTIC_LADDER = {
  x: 114,
  y: 15,
  visual: { x: 111, y: 14, w: 22, h: 90 },
  stand: { x: 122, y: 122 },
} as const

function buildAtticLadder(scene: Phaser.Scene, key: string, night: boolean): void {
  const p = new PixelArt(18, 88)
  const railDark = night ? '#3c3142' : '#6e4529'
  const railMid = night ? '#5d4b5e' : '#9c6940'
  const railHi = night ? '#7b687d' : '#cfa06e'
  // 顶部二楼阁楼木质天窗盖板与透出的一线暖光
  p.rect(0, 0, 18, 9, railDark)
  p.rect(1, 1, 16, 7, night ? '#272238' : '#4f311e')
  p.rect(2, 2, 14, 2, '#ffd98a')
  // 墙面投影与双侧橡木立柱
  p.rect(4, 9, 2, 79, night ? '#1b1d30' : '#b7a181')
  p.rect(14, 9, 2, 79, night ? '#1b1d30' : '#b7a181')
  for (const lx of [2, 12]) {
    p.rect(lx, 7, 4, 81, railDark)
    p.rect(lx + 1, 7, 2, 80, railMid)
    p.rect(lx + 1, 7, 1, 79, railHi)
  }
  // 7 级踏步横档
  for (let y = 16; y <= 76; y += 10) {
    p.rect(5, y, 8, 3, railDark)
    p.rect(5, y, 8, 2, railMid)
    p.rect(5, y, 8, 1, railHi)
  }
  p.texture(scene, key)
}

function buildWallCalendar(scene: Phaser.Scene, key: string, night: boolean): void {
  const p = new PixelArt(20, 24)
  // Soft wall drop shadow
  p.rect(3, 5, 16, 19, night ? '#1b1d30' : '#b7a181')
  // Hanging brass pin & cord
  p.rect(9, 0, 2, 2, night ? '#a88c5d' : '#e0b35e')
  p.rect(7, 2, 2, 1, night ? '#594a57' : '#8a5a38')
  p.rect(11, 2, 2, 1, night ? '#594a57' : '#8a5a38')
  // Carved oak hanging bar
  p.rect(1, 3, 18, 3, night ? '#3c3142' : '#6e4529')
  p.rect(2, 3, 16, 2, night ? '#5b4b5d' : '#a87246')
  p.rect(3, 3, 12, 1, night ? '#756477' : '#d2a26c')
  // Paper body + warm terracotta month header
  p.rect(2, 6, 16, 17, night ? '#33364f' : '#8a6c56')
  p.rect(3, 6, 14, 4, night ? '#704556' : '#c66559')
  p.rect(4, 7, 10, 2, night ? '#8a586a' : '#df8872')
  p.rect(3, 10, 14, 12, night ? '#8f93aa' : '#f8e9cb')
  p.rect(3, 21, 14, 1, night ? '#6b7089' : '#dec69b')
  // Curled bottom-right page corner
  p.rect(15, 20, 2, 2, night ? '#565c75' : '#ccb083')
  // Crisp miniature date grid + rose-circled anniversary date
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = 4 + col * 3
      const cy = 12 + row * 3
      const mark = row === 1 && col === 2
      p.rect(cx, cy, 2, 2, mark ? (night ? '#c25b74' : '#e8637c') : (night ? '#5e657d' : '#bfa785'))
    }
  }
  p.texture(scene, key)
}

export function createInteriorArt(scene: Phaser.Scene): void {
  paintInteriorTV(scene, 0, 0, true, false)
  buildWallCalendar(scene, 'home-calendar-day', false)
  buildWallCalendar(scene, 'home-calendar-night', true)
  for (const [key, x, y, depth] of HOME_LAYERS) {
    scene.add.image(x, y, HOME_ATLAS, `${key}-day`).setOrigin(0).setDepth(depth)
    scene.add.image(x, y, HOME_ATLAS, `${key}-night`).setOrigin(0).setDepth(depth + .01).setData('home-night-layer', true)
  }
  scene.add.image(WALL_CALENDAR.x, WALL_CALENDAR.y, 'home-calendar-day').setOrigin(0).setDepth(3.5)
  scene.add.image(WALL_CALENDAR.x, WALL_CALENDAR.y, 'home-calendar-night').setOrigin(0).setDepth(3.51).setData('home-night-layer', true)
  buildAtticLadder(scene, 'home-ladder-day', false)
  buildAtticLadder(scene, 'home-ladder-night', true)
  scene.add.image(ATTIC_LADDER.x, ATTIC_LADDER.y, 'home-ladder-day').setOrigin(0).setDepth(3.5)
  scene.add.image(ATTIC_LADDER.x, ATTIC_LADDER.y, 'home-ladder-night').setOrigin(0).setDepth(3.51).setData('home-night-layer', true)
}
