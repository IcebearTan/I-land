import type Phaser from 'phaser'
import { colorAt, hash2, lerpRGB, type RGB } from '../art'
import type { StudyAccount, StudyPhase } from '../../study/types'

export const STUDY_MAX = 640
export const STUDY_BACKDROP = 'study-attic-v1'

export interface StudySeatVisual {
  account: StudyAccount
  present: boolean
  phase: StudyPhase
  goalText: string
}

export interface StudyPaintParams {
  width: number
  height: number
  hour: number
  beat: number
  lighthouseHex: string
  seats: [StudySeatVisual, StudySeatVisual]
  together: boolean
}

type Mood = { sky: RGB; mid: RGB; horizon: RGB; sea: RGB; night: number }
const rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const hex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const mix = (a: string, b: string, t: number) => hex(lerpRGB(rgb(a), rgb(b), Math.max(0, Math.min(1, t))))

const NIGHT: Mood = { sky: rgb('#1d1936'), mid: rgb('#2c3959'), horizon: rgb('#5e678c'), sea: rgb('#293c5c'), night: 1 }
const DAWN: Mood = { sky: rgb('#746e99'), mid: rgb('#d4a3b0'), horizon: rgb('#ffd98a'), sea: rgb('#5c7c9c'), night: 0.28 }
const DAY: Mood = { sky: rgb('#7fb6d9'), mid: rgb('#bdd9e1'), horizon: rgb('#f5eee2'), sea: rgb('#3f6f9e'), night: 0 }
const DUSK: Mood = { sky: rgb('#5e4973'), mid: rgb('#cc8996'), horizon: rgb('#f2b646'), sea: rgb('#6e6791'), night: 0.22 }
const MOODS: Array<[number, Mood]> = [[0, NIGHT], [5, NIGHT], [6.4, DAWN], [8, DAY], [16.2, DAY], [18, DUSK], [20, NIGHT], [24, NIGHT]]

function moodAt(hour: number): Mood {
  const h = ((hour % 24) + 24) % 24
  const idx = MOODS.findIndex(([at]) => at > h)
  const [ah, a] = MOODS[Math.max(0, idx - 1)]
  const [bh, b] = MOODS[idx < 0 ? MOODS.length - 1 : idx]
  const t = bh === ah ? 0 : (h - ah) / (bh - ah)
  return {
    sky: lerpRGB(a.sky, b.sky, t),
    mid: lerpRGB(a.mid, b.mid, t),
    horizon: lerpRGB(a.horizon, b.horizon, t),
    sea: lerpRGB(a.sea, b.sea, t),
    night: a.night + (b.night - a.night) * t,
  }
}

export function studyLayout(width: number, height: number) {
  const compact = height < 175
  const cx = Math.round(width * 0.5)
  const deskY = compact ? height - 30 : Math.min(height - 46, Math.round(height * 0.68))
  const deskW = Math.min(144, Math.max(112, width - 38))
  const winW = Math.min(112, Math.max(84, deskW - 22))
  const winH = compact ? Math.max(44, deskY - 30) : Math.min(82, Math.max(54, deskY - 46))
  const winY = Math.max(10, deskY - 16 - winH)
  const winX = cx - Math.round(winW * 0.5)
  const seatOffset = Math.min(28, Math.round(deskW * 0.22))
  return {
    compact,
    cx,
    deskY,
    deskW,
    winX,
    winY,
    winW,
    winH,
    seats: [cx - seatOffset, cx + seatOffset] as [number, number],
    actorY: deskY + 17,
  }
}

export function createStudyArt(scene: Phaser.Scene): void {
  if (!scene.textures.exists(STUDY_BACKDROP)) {
    scene.textures.createCanvas(STUDY_BACKDROP, STUDY_MAX, STUDY_MAX)
  }
}

export function paintStudyAttic(scene: Phaser.Scene, params: StudyPaintParams): void {
  const tex = scene.textures.get(STUDY_BACKDROP) as Phaser.Textures.CanvasTexture | null
  if (!tex) return
  const ctx = tex.getContext()
  const { width: w, height: h, hour, beat, lighthouseHex, seats, together } = params
  const m = moodAt(hour)
  const L = studyLayout(w, h)
  const shade = m.night * 0.32

  const r = (x: number, y: number, rw: number, rh: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(rw), Math.round(rh))
  }

  ctx.clearRect(0, 0, w, h)
  // 1. 阁楼暖橡木护墙板与地板
  const wallBase = mix('#d8b589', '#6e5246', shade)
  const wallLine = mix('#be9668', '#553e38', shade)
  const floorTop = L.deskY + 6
  r(0, 0, w, floorTop, wallBase)
  for (let x = 8; x < w; x += 14) r(x, 0, 1, floorTop, wallLine)
  r(0, floorTop - 4, w, 4, mix('#8a5a38', '#452c22', shade))
  r(0, floorTop, w, h - floorTop, mix('#b88655', '#5b4032', shade))
  for (let y = floorTop + 5; y < h; y += 7) r(0, y, w, 1, mix('#9c6d41', '#483126', shade))

  // 编织暖绒地毯
  const rugW = Math.min(w - 20, L.deskW + 24)
  r(L.cx - rugW / 2, floorTop + 4, rugW, Math.max(16, h - floorTop - 8), mix('#c96f5b', '#754244', shade))
  r(L.cx - rugW / 2 + 3, floorTop + 6, rugW - 6, Math.max(12, h - floorTop - 12), mix('#ebd4ad', '#8f7e72', shade))

  // 斜顶橡木椽梁（营造二楼星光阁楼空间感）
  const beam = mix('#6e4529', '#38231b', shade)
  const beamHi = mix('#9c6940', '#523529', shade)
  for (let i = 0; i < 28; i++) {
    const span = Math.max(0, 28 - i)
    r(0, i, span * 2, 1, beam)
    r(w - span * 2, i, span * 2, 1, beam)
  }
  r(0, 0, w, 5, beam)
  r(0, 5, w, 1, beamHi)

  // 2. 中央宽幅斜顶海景老虎窗 + 远眺灯语信号塔
  r(L.winX - 4, L.winY - 4, L.winW + 8, L.winH + 8, '#6e4529')
  r(L.winX - 2, L.winY - 2, L.winW + 4, L.winH + 4, '#a87246')
  const horizon = L.winY + Math.round(L.winH * 0.62)
  const skyStops: Array<[number, RGB]> = [[0, m.sky], [0.6, m.mid], [1, m.horizon]]
  for (let y = L.winY; y < horizon; y++) {
    r(L.winX, y, L.winW, 1, hex(colorAt(skyStops, (y - L.winY) / Math.max(1, horizon - L.winY))))
  }
  r(L.winX, horizon, L.winW, L.winY + L.winH - horizon, hex(m.sea))
  if (m.night > 0.35) {
    for (let i = 0; i < 14; i++) {
      const sx = L.winX + 4 + Math.floor(hash2(i, 41) * (L.winW - 8))
      const sy = L.winY + 3 + Math.floor(hash2(i, 73) * Math.max(8, horizon - L.winY - 8))
      const twinkle = (i + beat) % 4 === 0 ? '#fff9e6' : '#dcd8e8'
      r(sx, sy, 1, 1, twinkle)
    }
  }
  // 海面微光与远岬灯塔（实时联动 /api/lighthouse 真实灯色）
  for (let i = 0; i < 7; i++) {
    const wy = horizon + 3 + i * 3
    if (wy >= L.winY + L.winH - 1) break
    const wx = L.winX + 8 + ((i * 17 + (beat % 3) * 2) % Math.max(12, L.winW - 24))
    r(wx, wy, 7 + (i % 3) * 3, 1, mix(hex(m.sea), '#f5eee2', 0.24))
  }
  const capeX = L.winX + L.winW - 24
  const capeColor = mix(hex(m.sea), '#2d374d', 0.45)
  r(capeX - 4, horizon - 2, 22, 4, capeColor)
  r(capeX + 5, horizon - 13, 4, 11, mix('#f5eee2', capeColor, m.night * 0.45))
  r(capeX + 4, horizon - 15, 6, 2, '#a84a4a')
  const beaconColor = /^#[0-9a-fA-F]{6}$/.test(lighthouseHex) ? lighthouseHex : '#ffd98a'
  r(capeX + 5, horizon - 13, 4, 2, beaconColor)
  if (m.night > 0.15) {
    ctx.fillStyle = `${beaconColor}44`
    ctx.fillRect(capeX + 1, horizon - 15, 12, 6)
    r(capeX + 4, horizon + 2 + (beat % 2), 6, 1, beaconColor)
  }
  // 十字木窗棂与厚窗台
  const frameCol = mix('#8a5a38', '#4e3324', shade)
  r(L.winX + Math.round(L.winW / 2) - 1, L.winY, 2, L.winH, frameCol)
  r(L.winX, L.winY + Math.round(L.winH * 0.48), L.winW, 2, frameCol)
  r(L.winX - 5, L.winY + L.winH + 2, L.winW + 10, 4, '#6e4529')
  r(L.winX - 4, L.winY + L.winH + 2, L.winW + 8, 2, '#c79a65')

  // 双人同席彩蛋 1：窗台软垫上打盹呼吸的小橘猫
  if (together) {
    const catX = L.winX + L.winW - 18
    const catY = L.winY + L.winH - 2
    const breath = beat % 2
    r(catX - 2, catY + 2, 13, 2, '#e8637c')
    r(catX, catY - 2 + breath, 9, 4 - breath, '#e38b42')
    r(catX + 2, catY - 3 + breath, 5, 1, '#f2ad63')
    r(catX - 2, catY - 3, 4, 4, '#e38b42')
    r(catX - 2, catY - 4, 1, 1, '#b86228')
    r(catX + 1, catY - 4, 1, 1, '#b86228')
    r(catX + 9, catY, 3, 2, '#b86228')
  }

  // 3. 左侧满墙像素橡木书架（仅在宽度充裕时展开完整书柜，窄屏绘制精巧窄书架）
  const shelfW = Math.min(42, Math.max(18, L.winX - 14))
  if (shelfW >= 18) {
    const sx = Math.max(6, L.winX - shelfW - 8)
    const sy = Math.max(18, L.winY)
    const sh = Math.max(36, L.deskY - sy + 2)
    r(sx, sy, shelfW, sh, '#6e4529')
    r(sx + 2, sy + 2, shelfW - 4, sh - 4, '#4f301d')
    const bookColors = ['#c95b5b', '#4d8076', '#d9a44e', '#6378a8', '#b87696', '#7ba368']
    for (let row = 0; row < 3; row++) {
      const ry = sy + 10 + row * 13
      if (ry + 4 >= sy + sh) break
      r(sx + 2, ry + 3, shelfW - 4, 2, '#8a5a38')
      for (let bx = sx + 4, idx = row * 3; bx < sx + shelfW - 5; bx += 4, idx++) {
        const bh = 6 + ((idx + row) % 3)
        r(bx, ry + 3 - bh, 3, bh, bookColors[idx % bookColors.length])
      }
    }
    // 书柜顶小地球仪
    if (sy >= 22) {
      r(sx + 6, sy - 7, 5, 5, '#629abb')
      r(sx + 7, sy - 6, 2, 2, '#7cb860')
      r(sx + 8, sy - 2, 1, 2, '#d9a44e')
      r(sx + 6, sy - 1, 5, 1, '#8a5a38')
    }
  }

  // 4. 右侧挂墙像素番茄钟与暖壁灯
  const rightSpace = w - (L.winX + L.winW)
  if (rightSpace >= 22) {
    const wx = L.winX + L.winW + Math.min(14, Math.floor(rightSpace * 0.35))
    const wy = L.winY + 8
    r(wx, wy, 11, 11, '#6e4529')
    r(wx + 1, wy + 1, 9, 9, '#fdf6e9')
    r(wx + 5, wy + 2, 1, 4, '#3b2117')
    r(wx + 5, wy + 5, 3, 1, '#c95b5b')
    // 暖壁灯
    r(wx + 3, wy + 18, 5, 7, '#6e4529')
    r(wx + 4, wy + 19, 3, 4, '#ffd98a')
  }

  // 5. 双人长橡木书桌、绿罩黄铜台灯、摊开书本、马克杯热气与同席小花
  const dx = L.cx - Math.round(L.deskW / 2)
  r(dx + 4, L.deskY + 6, 5, 16, '#59361f')
  r(dx + L.deskW - 9, L.deskY + 6, 5, 16, '#59361f')
  r(dx, L.deskY - 10, L.deskW, 14, '#6e4529')
  r(dx + 2, L.deskY - 9, L.deskW - 4, 10, '#b98352')
  r(dx + 2, L.deskY - 9, L.deskW - 4, 2, '#d6a472')
  r(dx + 2, L.deskY + 2, L.deskW - 4, 2, '#8a5a38')

  // 中央花瓶（双人同在时自动插上一支小花）
  r(L.cx - 2, L.deskY - 14, 5, 6, '#f5eee2')
  r(L.cx - 1, L.deskY - 15, 3, 1, '#d8c293')
  if (together) {
    r(L.cx, L.deskY - 19, 1, 4, '#4d8a54')
    r(L.cx - 2, L.deskY - 21, 5, 3, '#e8637c')
    r(L.cx - 1, L.deskY - 22, 3, 5, '#e8637c')
    r(L.cx, L.deskY - 20, 1, 1, '#ffd98a')
  }

  // 左右双席桌面物件与绿罩黄铜台灯
  seats.forEach((seat, idx) => {
    const sx = L.seats[idx]
    const dir = idx === 0 ? -1 : 1
    const focusing = seat.phase === 'focusing' || seat.phase === 'stopwatch'
    const resting = seat.phase === 'resting'
    const lampX = sx + dir * 18
    const lampY = L.deskY - 16

    // 台灯暖金光晕（专注时明亮照亮书页，休息时柔和微光）
    if (focusing || (seat.present && m.night > 0.3)) {
      ctx.fillStyle = focusing ? 'rgba(255, 217, 138, 0.28)' : 'rgba(255, 217, 138, 0.12)'
      ctx.fillRect(sx - 18, L.deskY - 18, 36, 18)
    }
    r(lampX, lampY + 5, 3, 4, '#c79a42')
    r(lampX - 1, lampY + 8, 5, 2, '#8a6626')
    r(lampX - 3, lampY + 1, 9, 4, '#2f6e5d')
    r(lampX - 2, lampY, 7, 2, '#48917d')
    if (focusing) r(lampX - 1, lampY + 5, 5, 1, '#fff3bf')

    // 书本状态：专注时摊开翻页，其余合上
    const bookX = sx - 6
    const bookY = L.deskY - 7
    if (focusing) {
      r(bookX - 1, bookY, 14, 6, '#7a4430')
      r(bookX, bookY, 6, 5, '#fff8e8')
      r(bookX + 7, bookY, 6, 5, '#f5ead2')
      const lineShift = (beat + idx) % 2
      r(bookX + 1, bookY + 1 + lineShift, 4, 1, '#b89f82')
      r(bookX + 8, bookY + 2, 4, 1, '#b89f82')
    } else {
      r(bookX + 1, bookY + 1, 10, 5, idx === 0 ? '#46748c' : '#b55b6d')
      r(bookX + 2, bookY + 2, 8, 1, '#f5eee2')
    }

    // 专属茶杯（左席小熊陶杯，右席玫瑰茶盏）+ 休息期 3 帧热气
    const cupX = sx + dir * 11
    const cupY = L.deskY - 6
    r(cupX, cupY, 4, 4, idx === 0 ? '#d9a46c' : '#f7dce0')
    r(cupX + 1, cupY, 2, 1, '#6e4529')
    if (resting) {
      const sFrame = beat % 3
      r(cupX + 1 + (sFrame === 1 ? 1 : 0), cupY - 3 - sFrame, 1, 2, '#fffaf0')
      r(cupX + 2 - (sFrame === 2 ? 1 : 0), cupY - 6 - (sFrame % 2), 1, 2, '#e8e2d8')
    }

    // 木椅底座（若暂未入座，完整露出木椅靠背）
    if (!seat.present) {
      r(sx - 7, L.deskY + 8, 14, 9, '#6e4529')
      r(sx - 6, L.deskY + 9, 12, 6, '#9c6940')
    }
  })

  tex.refresh()
}
