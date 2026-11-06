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

export function createInteriorArt(scene: Phaser.Scene): void {
  paintInteriorTV(scene, 0, 0, true, false)
  for (const [key, x, y, depth] of HOME_LAYERS) {
    scene.add.image(x, y, HOME_ATLAS, `${key}-day`).setOrigin(0).setDepth(depth)
    scene.add.image(x, y, HOME_ATLAS, `${key}-night`).setOrigin(0).setDepth(depth + .01).setData('home-night-layer', true)
  }
}
