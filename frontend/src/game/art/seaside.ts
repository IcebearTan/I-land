import type Phaser from 'phaser'
import { CHARACTERS, type CharacterId } from '../../characters'
import { colorAt, hash2, lerpRGB, type RGB } from '../art'
import { makeTexture } from '../pixels'
import { PixelArt } from './island'

export const SEASIDE_MAX = 640
const BACKDROP = 'seaside-panorama-v1'
type Mood = { sky: RGB; middle: RGB; horizon: RGB; sea: RGB; near: RGB; sand: RGB; shade: RGB; night: number; warmth: number }
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const hex = (c: RGB) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
const mix = (a: string, b: string, t: number) => hex(lerpRGB(rgb(a), rgb(b), Math.max(0, Math.min(1, t))))
const mood = (sky: string, middle: string, horizon: string, sea: string, near: string, sand: string, shade: string, night: number, warmth: number): Mood =>
  ({ sky: rgb(sky), middle: rgb(middle), horizon: rgb(horizon), sea: rgb(sea), near: rgb(near), sand: rgb(sand), shade: rgb(shade), night, warmth })
const NIGHT = mood('#2b1b45', '#374566', '#777a9e', '#354869', '#587894', '#a49b9c', '#74768a', 1, 0)
const DAWN = mood('#7b759f', '#d6a7b2', '#ffd98a', '#617f9e', '#adc7cf', '#e3c6b0', '#a8a6a3', .25, .75)
const DAY = mood('#7fb6d9', '#bdd9e1', '#f5eee2', '#3f6f9e', '#7fb6d9', '#f0d9a8', '#c6ad88', 0, 0)
const DUSK = mood('#655079', '#cd8c99', '#f4b942', '#756d97', '#d19aa0', '#edc5a0', '#af929a', .15, 1)
const MOODS: Array<[number, Mood]> = [[0, NIGHT], [5, NIGHT], [6.3, DAWN], [8, DAY], [16, DAY], [18, DUSK], [20, NIGHT], [24, NIGHT]]

function moodAt(hour: number): Mood {
  const h = ((hour % 24) + 24) % 24
  const index = MOODS.findIndex(([at]) => at > h)
  const [aHour, a] = MOODS[Math.max(0, index - 1)], [bHour, b] = MOODS[index < 0 ? MOODS.length - 1 : index]
  const t = (h - aHour) / (bHour - aHour)
  return Object.fromEntries(Object.keys(a).map(key => {
    const k = key as keyof Mood, av = a[k], bv = b[k]
    return [k, typeof av === 'number' && typeof bv === 'number' ? av + (bv - av) * t : lerpRGB(av as RGB, bv as RGB, t)]
  })) as unknown as Mood
}

export function seasideLayout(width: number, height: number) {
  const portrait = height > width * 1.1
  const horizon = Math.round(height * (portrait ? .34 : .40))
  const shore = Math.round(height * (portrait ? .59 : .66))
  const seatY = Math.round(height * (portrait ? .70 : .77))
  const center = Math.round(width * .5)
  return { horizon, shore, seatY, center, seats: [center - 14, center + 14], standingY: seatY + 17 }
}

/** 原创海边像素画。大场景只刷新原纹理，坐姿与小物件统一走字符画管线。 */
export function createSeasideArt(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BACKDROP)) {
    makeTexture(scene, BACKDROP, Array(SEASIDE_MAX).fill('.'.repeat(SEASIDE_MAX)), {})
  }
  for (const [id, character] of Object.entries(CHARACTERS)) {
    for (const direction of ['back', 'side'] as const) {
      makeTexture(scene, `seaside-${id}-${direction}`, character.frames[direction], character.palette)
      makeTexture(scene, `seaside-${id}-${direction}-step`, character.steps[direction], character.palette)
    }
  }
  const bear = new PixelArt(22, 23)
  bear.ellipse(5, 5, 3, 3, '#8c999a'); bear.ellipse(16, 5, 3, 3, '#8c999a')
  bear.ellipse(5, 5, 2, 2, '#e6e8e3'); bear.ellipse(16, 5, 2, 2, '#fffaf2')
  bear.ellipse(11, 12, 9, 9, '#8c999a')
  bear.ellipse(11, 11, 8, 8, '#e6e8e3'); bear.ellipse(12, 10, 7, 7, '#fffaf2')
  bear.rect(5, 13, 13, 7, '#e6e8e3'); bear.rect(7, 11, 10, 8, '#fffaf2')
  bear.rect(3, 15, 3, 5, '#fffaf2'); bear.rect(17, 15, 3, 5, '#e6e8e3')
  bear.rect(4, 20, 6, 2, '#8c999a'); bear.rect(12, 20, 6, 2, '#8c999a')
  bear.rect(4, 19, 6, 2, '#e6e8e3'); bear.rect(12, 19, 6, 2, '#fffaf2')
  bear.texture(scene, 'seaside-bear-seated')
  const her = new PixelArt(22, 23)
  her.rect(4, 14, 14, 5, '#3f887f'); her.rect(6, 13, 10, 5, '#62b2a2')
  her.rect(3, 15, 3, 4, '#f0c6a0'); her.rect(16, 15, 3, 4, '#f0c6a0')
  her.rect(5, 19, 5, 3, '#242333'); her.rect(12, 19, 5, 3, '#242333')
  her.rect(5, 21, 5, 1, '#393946'); her.rect(12, 21, 5, 1, '#393946')
  her.ellipse(11, 9, 7, 7, '#20222e'); her.rect(4, 8, 14, 8, '#20222e')
  her.ellipse(12, 8, 5, 6, '#393946'); her.rect(6, 11, 10, 5, '#393946')
  her.rect(5, 15, 3, 2, '#20222e'); her.rect(14, 15, 3, 2, '#20222e')
  her.rect(8, 16, 6, 1, '#20222e')
  her.texture(scene, 'seaside-her-seated')
  for (const step of [false, true]) {
    const bearStanding = new PixelArt(22, 32)
    bearStanding.ellipse(5, 5, 3, 3, '#8c999a'); bearStanding.ellipse(16, 5, 3, 3, '#8c999a')
    bearStanding.ellipse(5, 5, 2, 2, '#e6e8e3'); bearStanding.ellipse(16, 5, 2, 2, '#fffaf2')
    bearStanding.ellipse(11, 10, 9, 8, '#8c999a'); bearStanding.ellipse(11, 10, 8, 7, '#fffaf2')
    bearStanding.ellipse(11, 21, 8, 9, '#8c999a'); bearStanding.ellipse(11, 20, 7, 8, '#e6e8e3')
    bearStanding.rect(7, 15, 9, 13, '#fffaf2'); bearStanding.rect(3, 17, 3, 9, '#e6e8e3')
    bearStanding.rect(16, 17, 3, 9, '#fffaf2')
    bearStanding.rect(5, 28, 5, 3, '#8c999a'); bearStanding.rect(12, step ? 27 : 28, 5, 3, '#8c999a')
    bearStanding.rect(5, 28, 5, 2, '#e6e8e3'); bearStanding.rect(12, step ? 27 : 28, 5, 2, '#fffaf2')
    bearStanding.texture(scene, `seaside-bear-standing${step ? '-step' : ''}`)
    const herStanding = new PixelArt(22, 32)
    herStanding.rect(3, 15, 16, 8, '#3f887f'); herStanding.rect(5, 15, 12, 7, '#62b2a2')
    herStanding.rect(3, 20, 3, 6, '#f0c6a0'); herStanding.rect(16, 20, 3, 6, '#f0c6a0')
    herStanding.rect(5, 23, 5, 7, '#242333'); herStanding.rect(12, 23, 5, step ? 6 : 7, '#242333')
    herStanding.rect(5, 30, 5, 1, '#4a3b55'); herStanding.rect(12, step ? 29 : 30, 5, 1, '#4a3b55')
    herStanding.ellipse(11, 9, 7, 7, '#20222e'); herStanding.rect(4, 8, 14, 12, '#20222e')
    herStanding.ellipse(12, 9, 5, 6, '#393946'); herStanding.rect(6, 11, 10, 9, '#393946')
    herStanding.rect(5, 19, 3, 2, '#20222e'); herStanding.rect(14, 19, 3, 2, '#20222e')
    herStanding.texture(scene, `seaside-her-standing${step ? '-step' : ''}`)
  }
}

export function paintSeaside(scene: Phaser.Scene, width: number, height: number, hour: number, motion: number, character: CharacterId): void {
  const p = new PixelArt(width, height), m = moodAt(hour)
  const { horizon, shore, seatY, center, seats } = seasideLayout(width, height)
  const skyStops: Array<[number, RGB]> = [[0, m.sky], [.55, m.middle], [1, m.horizon]]
  // 宽阔而安静的天空，低分辨率色阶而非满屏颗粒。
  for (let y = 0; y < horizon; y++) p.rect(0, y, width, 1, hex(colorAt(skyStops, Math.round(y / horizon * 48) / 48)))
  const cloudColor = mix(hex(m.middle), '#f5eee2', .36 - m.night * .19)
  const cloud = (x: number, y: number, length: number) => {
    p.rect(x + 10, y, length - 24, 2, cloudColor); p.rect(x + 4, y + 2, length - 8, 3, cloudColor)
    p.rect(x, y + 5, length, 2, cloudColor); p.rect(x + 7, y + 7, length - 13, 1, mix(cloudColor, hex(m.middle), .5))
  }
  cloud(Math.round(width * .07), Math.round(horizon * .42), Math.round(width * .21))
  cloud(Math.round(width * .53), Math.round(horizon * .26), Math.round(width * .26))
  cloud(Math.round(width * .71), Math.round(horizon * .76), Math.round(width * .19))
  if (m.night > .4) {
    for (let i = 0; i < Math.round(width / 9); i++) {
      const x = Math.floor(hash2(i, 149) * width), y = 12 + Math.floor(hash2(i, 157) * (horizon - 30))
      const star = mix(hex(colorAt(skyStops, y / horizon)), '#f5eee2', .8 * (m.night - .4) / .6)
      p.rect(x, y, 1, 1, star)
      if (i % 11 === 0) { p.rect(x - 1, y, 3, 1, star); p.rect(x, y - 1, 1, 3, star) }
    }
    // 很小的心形星座，只在夜空留一点两个人的记号。
    const sx = Math.round(width * .73), sy = Math.round(horizon * .55)
    const star = mix(hex(colorAt(skyStops, sy / horizon)), '#f5eee2', .8 * (m.night - .4) / .6)
    for (const [dx, dy] of [[-5, -2], [-2, -4], [1, -2], [4, -4], [7, -2], [5, 2], [1, 6], [-3, 2]]) p.rect(sx + dx, sy + dy, 1, 1, mix(star, '#e8b4c1', .4))
  }
  const isSun = hour >= 6 && hour <= 18.8
  const progress = isSun ? (hour - 6) / 12 : ((hour - 18 + 24) % 24) / 12
  const celestialX = Math.round(width * (.16 + .68 * progress))
  const elevation = Math.sin(Math.PI * progress)
  const celestialY = Math.round(horizon - elevation * horizon * .74)
  const light = isSun ? '#ffd98a' : '#f5eee2'
  if (celestialY < horizon + 9) {
    const radius = isSun ? 9 : 7
    for (let r = radius + 10; r > radius; r -= 3) p.ellipse(celestialX, celestialY, r, r, mix(hex(colorAt(skyStops, celestialY / horizon)), light, (radius + 11 - r) * .018))
    p.ellipse(celestialX, celestialY, radius, radius, light)
    p.ellipse(celestialX - 1, celestialY - 1, radius - 2, radius - 2, isSun ? '#fff0c2' : '#fffbec')
    if (!isSun) { p.rect(celestialX + 2, celestialY - 2, 2, 2, '#dedbd4'); p.rect(celestialX - 3, celestialY + 2, 2, 1, '#dedbd4') }
  }
  // 海面渐变及横向水纹，远处疏细、近处宽缓。
  const waterHeight = shore - horizon
  for (let y = horizon; y < height; y++) p.rect(0, y, width, 1, hex(lerpRGB(m.sea, m.near, Math.min(1, (y - horizon) / waterHeight))))
  p.rect(0, horizon, width, 1, mix(hex(m.horizon), hex(m.sea), .55))
  for (let i = 0; i < Math.round(width * .36); i++) {
    const depth = hash2(i, 175), y = horizon + 3 + Math.floor(depth * (waterHeight - 4))
    const x = Math.round(hash2(i, 187) * width + Math.sin(motion / 2500 + i) * (1 + depth * 2))
    const length = 2 + Math.floor(depth * 14 + hash2(i, 199) * 12)
    const base = hex(lerpRGB(m.sea, m.near, depth))
    p.rect(x, y, length, 1, mix(base, '#f5eee2', .08 + depth * .09))
  }
  if (celestialY < horizon + 9) for (let y = horizon + 2; y < shore; y += 3) {
    const t = (y - horizon) / waterHeight
    const spread = 3 + t * 19
    const x = celestialX + (center - celestialX) * t * .18 + Math.sin(y * .7 + motion / 1400) * spread * .22
    const length = spread * (.65 + hash2(y, 213) * .8)
    const base = hex(lerpRGB(m.sea, m.near, t))
    p.rect(Math.round(x - length / 2), y, Math.round(length), 1 + Number(t > .75), mix(base, light, (isSun ? .48 + m.warmth * .28 : .45) * (1 - t * .4)))
    if (y % 2 === 0) p.rect(Math.round(x + spread), y + 1, 2, 1, mix(base, light, .32))
  }
  // 两端遥远的岛影与灯塔，给开阔海面一点归属感。
  const far = mix(hex(m.sea), hex(m.horizon), .36)
  p.polygon([[0, horizon - 4], [width * .04, horizon - 10], [width * .08, horizon - 6], [width * .14, horizon + 2], [0, horizon + 2]], far)
  p.polygon([[width * .87, horizon + 1], [width * .93, horizon - 5], [width, horizon - 2], [width, horizon + 2]], far)
  const towerX = Math.round(width * .95)
  p.rect(towerX, horizon - 15, 3, 11, mix(far, '#f5eee2', .28)); p.rect(towerX - 1, horizon - 17, 5, 2, far)
  p.rect(towerX, horizon - 15, 2, 1, m.night > .2 ? '#ffd98a' : '#f5eee2')
  if (m.night < .3) for (let i = 0; i < 2; i++) {
    const x = Math.round(width * (.28 + i * .13)), y = Math.round(horizon * (.7 + i * .05))
    p.rect(x, y, 1, 1, far); p.rect(x + 1, y + 1, 1, 1, far); p.rect(x + 2, y, 1, 1, far)
  }
  const sand = hex(m.sand), shade = hex(m.shade)
  for (let x = 0; x < width; x++) {
    const curve = Math.round(4 * Math.sin(x / width * Math.PI) + 2 * Math.sin(x / 53))
    const edge = shore + curve
    const wave = Math.round(Math.sin(motion / 1900) * 2)
    p.rect(x, edge, 1, height - edge, sand)
    p.rect(x, edge, 1, 5, mix(sand, hex(m.near), .24))
    p.rect(x, edge - 2 + wave, 1, 2, mix('#f5eee2', hex(m.near), .25))
    if (x % 13 < 5) p.rect(x, edge + 6, 1, 1, mix(sand, '#f5eee2', .45))
  }
  for (let i = 0; i < Math.round(width / 3); i++) {
    const x = Math.round(hash2(i, 271) * width), y = shore + 16 + Math.round(hash2(i, 281) * (height - shore - 16))
    if (Math.abs(x - center) < 58 && Math.abs(y - seatY) < 26) continue
    p.rect(x, y, 2, 1, mix(sand, shade, .35))
    if (i % 7 === 0) p.rect(x + 2, y - 1, 2, 1, mix(sand, '#f5eee2', .25))
  }
  // 一小块并排的木台，两处坐席；另一处始终空着，不绘制假同伴。
  p.ellipse(center, seatY + 7, 46, 8, mix(sand, shade, .45))
  const wood = mix('#c79a65', shade, m.night * .4)
  p.polygon([[center - 46, seatY - 2], [center + 43, seatY - 2], [center + 48, seatY + 9], [center - 49, seatY + 9]], '#8a5a38')
  for (let i = 0; i < 5; i++) {
    p.rect(center - 45 - Math.floor(i / 2), seatY - 1 + i * 2, 89 + i, 1, wood)
    p.rect(center - 33 + i * 9, seatY - 1 + i * 2, 12, 1, mix(wood, '#f0d9a8', .22))
  }
  for (const [i, x] of seats.entries()) {
    p.ellipse(x, seatY + 1, 11, 4, mix(wood, '#6e4529', .3))
    p.rect(x - 10, seatY - 4, 20, 6, i ? mix('#7fb6b0', shade, m.night * .3) : mix('#f5eee2', shade, m.night * .3))
    p.rect(x - 8, seatY - 4, 16, 1, mix('#f5eee2', sand, .1))
    p.rect(x - 9, seatY + 1, 18, 1, i ? '#547e7d' : '#c6ad88')
  }
  const lx = center - 57, ly = seatY + 5
  if (m.night > .1) for (let r = 22; r > 3; r -= 3) p.ellipse(lx, ly - 4, r, r * .55, mix(sand, '#ffd98a', (.4 - r / 60) * m.night))
  p.rect(lx - 3, ly - 10, 7, 10, '#6e4529'); p.rect(lx - 2, ly - 9, 5, 7, '#ffd98a')
  p.rect(lx, ly - 9, 1, 7, '#c79a65'); p.rect(lx - 2, ly - 13, 5, 2, '#8a5a38'); p.rect(lx - 3, ly - 1, 7, 2, '#8a5a38')
  const cupX = center + 35
  p.rect(cupX, seatY - 1, 5, 5, '#f5eee2'); p.rect(cupX + 5, seatY, 2, 3, '#d8c293'); p.rect(cupX + 1, seatY - 1, 3, 1, '#8a5a38')
  // 脚印属于本次入场的角色，不代表对方在线。
  const actorX = seats[character === 'bear' ? 0 : 1]
  for (let i = 0; i < 4; i++) {
    const x = actorX + 5 + i * 3, y = seatY + 20 + i * 9
    p.rect(x, y, character === 'bear' ? 3 : 2, 2, mix(sand, shade, .42)); p.rect(x + 5, y + 4, 2, 2, mix(sand, shade, .42))
  }
  // 低低的沙丘与草叶收住画面；中心留白给人和海。
  const green = mix('#5a944a', '#345b40', m.night * .7)
  const grass = (x: number, y: number, size: number) => {
    p.rect(x, y - size, 1, size, green); p.rect(x - 2, y - size + 3, 1, size - 3, green); p.rect(x + 2, y - size + 2, 1, size - 2, green)
    p.rect(x - 3, y - 3, 7, 2, mix(green, '#7cb860', .4))
  }
  for (let side = 0; side < 2; side++) {
    const base = side ? width : 0
    p.polygon([[base, height], [base, height - 38], [base + (side ? -50 : 40), height - 26], [base + (side ? -76 : 68), height]], mix(sand, shade, .18))
    for (let i = 0; i < 12; i++) grass(Math.round(base + (side ? -1 : 1) * (6 + hash2(i, 397) * 52)), height - 4 - Math.round(hash2(i, 409) * 27), 6 + i % 7)
    for (let i = 0; i < 3; i++) {
      const x = Math.round(base + (side ? -1 : 1) * (14 + i * 12)), y = height - 20 + i * 3
      p.rect(x, y, 3, 2, mix('#f5eee2', sand, m.night * .25)); p.rect(x + 1, y - 1, 1, 4, '#e8b4a0')
    }
  }
  // 两枚小贝壳与一块暖灰的石头，避免装饰堆满沙地。
  p.ellipse(center + 65, seatY + 30, 5, 3, mix('#b5b097', shade, .35)); p.rect(center + 62, seatY + 28, 5, 1, mix('#f5eee2', shade, .45))
  for (const [x, y] of [[center - 35, seatY + 31], [center + 19, seatY + 47]]) {
    p.rect(x, y, 4, 2, '#e8b4a0'); p.rect(x + 1, y - 1, 2, 1, '#f5eee2')
  }
  p.texture(scene, BACKDROP)
}

export const SEASIDE_BACKDROP = BACKDROP
