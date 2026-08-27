import Phaser from 'phaser'
import { eventBus, type Phase } from '../EventBus'
import { BEAR_PALETTE, BEAR_ROWS, makeTexture } from '../pixels'

/** ─── 世界规格（M1 换 Tiled 地图后此处常量仅作占位）────────────────── */
const TILE = 16
const MAP_W = 64
const MAP_H = 48
const WORLD_W = MAP_W * TILE
const WORLD_H = MAP_H * TILE

// 岛屿椭圆（椭圆内的草地/沙滩可以走，海不可走）
const ISLAND = { cx: 512, cy: 380, rx: 330, ry: 225 }
// 南侧码头（矩形例外区）
const DOCK = { x1: 486, x2: 538, y2: ISLAND.cy + ISLAND.ry + 92 }
const SPAWN = { x: 512, y: DOCK.y2 - 24 }

const SPEED = 85 // world px / s

/** ─── 调色板（与 DESIGN.md 锁定值一致）────────────────────────────── */
const C = {
  sea: 0x3f6f9e,
  seaLight: 0x7fb6d9,
  seaDark: 0x2c5478,
  sand: 0xf0d9a8,
  sandWet: 0xd9b97f,
  grass: 0x7cb860,
  grassDark: 0x5a944a,
  grassLight: 0x9ed177,
  dirt: 0x8a5a38,
  dirtDark: 0x6e4529,
  wood: 0xe8c48f,
  roof: 0xc96f5a,
  beam: 0x8a5a38,
  warm: 0xffd98a,
  ink: 0x2b1b45,
  heart: 0xe8637c,
}

interface Interactable {
  x: number
  y: number
  r: number
  label: string
  event: 'OPEN_MAILBOX' | 'OPEN_CALENDAR'
}

/** 昼夜 tint 关键帧：小时 → 乘法混合色 */
const TINT_KEYS: Array<{ h: number; c: number }> = [
  { h: 0, c: 0x6a6f9e }, // 深夜
  { h: 5, c: 0x6a6f9e },
  { h: 6.5, c: 0xe8b4c8 }, // 黎明粉
  { h: 8, c: 0xffffff }, // 白天（不染色）
  { h: 16, c: 0xffffff },
  { h: 18, c: 0xe8a577 }, // 黄昏橙（品牌基调）
  { h: 20, c: 0x6a6f9e },
  { h: 24, c: 0x6a6f9e },
]

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (g << 8) | bl
}

function tintAtHour(h: number): number {
  for (let i = 0; i < TINT_KEYS.length - 1; i++) {
    const k0 = TINT_KEYS[i]
    const k1 = TINT_KEYS[i + 1]
    if (h >= k0.h && h <= k1.h) {
      const t = k1.h === k0.h ? 0 : (h - k0.h) / (k1.h - k0.h)
      return lerpColor(k0.c, k1.c, t)
    }
  }
  return 0xffffff
}

function phaseAtHour(h: number): Phase {
  if (h < 5 || h >= 20) return 'night'
  if (h < 8) return 'dawn'
  if (h < 16) return 'day'
  return 'dusk'
}

// 8×10 漂流瓶
const BOTTLE_ROWS = [
  '...cc...',
  '...cc...',
  '..gggg..',
  '.gGGGGg.',
  '.gGGGGg.',
  '.gGGGGg.',
  '.gGGGGg.',
  '..gggg..',
]
const BOTTLE_PALETTE: Record<string, string> = {
  c: '#d9b97f', // 软木塞
  g: '#5f93a8', // 玻璃深
  G: '#a8d4e0', // 玻璃亮
}

export class IslandScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keyE!: Phaser.Input.Keyboard.Key
  private keyW!: Phaser.Input.Keyboard.Key
  private keyA!: Phaser.Input.Keyboard.Key
  private keyD!: Phaser.Input.Keyboard.Key
  private keyS!: Phaser.Input.Keyboard.Key
  private tapTarget: Phaser.Math.Vector2 | null = null
  private panelOpen = false
  private tintOverlay!: Phaser.GameObjects.Rectangle
  private prompt!: Phaser.GameObjects.Container
  private promptText!: Phaser.GameObjects.Text
  private promptZone!: Phaser.GameObjects.Zone
  private promptTarget: Interactable | null = null
  private interactables: Interactable[] = []
  private consumedTap = false
  private secondTimer = 0

  constructor() {
    super('Island')
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)

    makeTexture(this, 'bear', BEAR_ROWS, BEAR_PALETTE)
    makeTexture(this, 'bottle', BOTTLE_ROWS, BOTTLE_PALETTE)

    this.paintTerrain()
    this.paintBuildings()
    this.placeInteractables()
    this.spawnBottles()

    // ── 玩家 ────────────────────────────────────────────────
    this.player = this.physics.add.sprite(SPAWN.x, SPAWN.y, 'bear')
    this.player.setCollideWorldBounds(true)
    this.player.setSize(12, 6).setOffset(2, 10) // 脚底碰撞盒，视觉是全身
    this.player.setDepth(1000)
    // 待机呼吸：只 tween scaleY（位置 y 归物理引擎管，别的写入者会和它打架）
    this.tweens.add({
      targets: this.player,
      scaleY: 0.94,
      duration: 550,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    })

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.fitZoom()

    // ── 输入 ────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys()
    const kb = this.input.keyboard!
    this.keyE = kb.addKey('E')
    this.keyW = kb.addKey('W')
    this.keyA = kb.addKey('A')
    this.keyD = kb.addKey('D')
    this.keyS = kb.addKey('S')
    kb.on('keydown', () => {
      this.tapTarget = null // 键盘一按就取消点地目标
    })

    // 点地行走（移动端 tap-first）
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.panelOpen) return
      if (this.consumedTap) {
        this.consumedTap = false
        return
      }
      const world = this.cameras.main.getWorldPoint(ptr.x, ptr.y)
      this.tapTarget = new Phaser.Math.Vector2(world.x, world.y)
    })

    // 交互气泡（既是提示也是移动端点击热区）
    this.prompt = this.add.container(0, 0).setDepth(2000).setVisible(false)
    const bg = this.add.graphics()
    this.promptText = this.add
      .text(0, 0, '', { fontSize: '6px', color: '#fdf6e9', resolution: 3 })
      .setOrigin(0.5, 0.5)
    this.promptZone = this.add
      .zone(0, 0, 60, 26)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true })
    this.promptZone.on('pointerdown', () => {
      this.consumedTap = true
      this.tryInteract()
    })
    this.prompt.add([bg, this.promptText, this.promptZone])

    // ── 昼夜 tint 层 ────────────────────────────────────────
    this.tintOverlay = this.add
      .rectangle(0, 0, WORLD_W, WORLD_H, 0xffffff, 1)
      .setOrigin(0, 0)
      .setDepth(5000)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setScrollFactor(0)

    // ── UI 面板开合 ────────────────────────────────────────
    eventBus.on('PANEL_OPENED', () => {
      this.panelOpen = true
      this.tapTarget = null
      this.player.setVelocity(0, 0)
    })
    eventBus.on('PANEL_CLOSED', () => {
      this.panelOpen = false
    })

    this.scale.on('resize', this.fitZoom, this)
    this.updateDayNight()
    this.cameras.main.fadeIn(400, 0, 0, 0)

    let leaving = false
    const onExit = () => {
      if (leaving) return
      leaving = true
      this.cameras.main.fadeOut(480, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.time.delayedCall(60, () => this.scene.start('Login'))
      })
    }
    eventBus.on('EXIT_TO_LOGIN', onExit)

    this.events.once('shutdown', () => {
      eventBus.off('PANEL_OPENED')
      eventBus.off('PANEL_CLOSED')
      eventBus.off('EXIT_TO_LOGIN', onExit)
      this.scale.off('resize', this.fitZoom, this)
    })
  }

  update(_time: number, delta: number): void {
    if (!this.player.active) return

    if (this.panelOpen) {
      this.player.setVelocity(0, 0)
    } else {
      this.movePlayer(delta)
    }

    this.clampToIsland()
    this.updatePrompt()

    // 每秒：昼夜 tint + DAY_TICK 事件
    this.secondTimer += delta
    if (this.secondTimer >= 1000) {
      this.secondTimer -= 1000
      this.updateDayNight()
    }
  }

  // ─── 移动 ───────────────────────────────────────────────────

  private movePlayer(_delta: number): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body
    let vx = 0
    let vy = 0
    if (this.cursors.left.isDown || this.keyA.isDown) vx = -1
    else if (this.cursors.right.isDown || this.keyD.isDown) vx = 1
    if (this.cursors.up.isDown || this.keyW.isDown) vy = -1
    else if (this.cursors.down.isDown || this.keyS.isDown) vy = 1

    if (vx !== 0 || vy !== 0) {
      this.tapTarget = null
      const norm = Math.hypot(vx, vy) || 1
      body.setVelocity((vx / norm) * SPEED, (vy / norm) * SPEED)
    } else if (this.tapTarget) {
      const dx = this.tapTarget.x - this.player.x
      const dy = this.tapTarget.y - this.player.y
      const dist = Math.hypot(dx, dy)
      if (dist < 4) {
        this.tapTarget = null
        body.setVelocity(0, 0)
      } else {
        body.setVelocity((dx / dist) * SPEED, (dy / dist) * SPEED)
      }
    } else {
      body.setVelocity(0, 0)
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.tryInteract()
  }

  /** 椭圆岛界 + 码头例外：把玩家钳回可走区域 */
  private clampToIsland(): void {
    const p = this.player
    const dx = (p.x - ISLAND.cx) / ISLAND.rx
    const dy = (p.y - ISLAND.cy) / ISLAND.ry
    const d = dx * dx + dy * dy
    const onDock = p.x > DOCK.x1 && p.x < DOCK.x2 && p.y > ISLAND.cy + ISLAND.ry * 0.55
    if (d > 1 && !onDock) {
      const scale = 1 / Math.sqrt(d)
      p.x = ISLAND.cx + (p.x - ISLAND.cx) * scale
      p.y = ISLAND.cy + (p.y - ISLAND.cy) * scale
    }
    if (onDock) {
      p.y = Math.min(p.y, DOCK.y2)
    }
  }

  // ─── 交互 ───────────────────────────────────────────────────

  private updatePrompt(): void {
    let nearest: Interactable | null = null
    let best = Infinity
    for (const it of this.interactables) {
      const dist = Math.hypot(it.x - this.player.x, it.y - this.player.y)
      if (dist < it.r && dist < best) {
        best = dist
        nearest = it
      }
    }
    this.promptTarget = nearest
    if (!nearest) {
      this.prompt.setVisible(false)
      return
    }
    const label = `${nearest.label} · 按 E 或点这里`
    this.promptText.setText(label)
    const tw = this.promptText.width
    const g = this.prompt.list[0] as Phaser.GameObjects.Graphics
    g.clear()
    g.fillStyle(C.ink, 0.82)
    g.fillRoundedRect(-tw / 2 - 5, -10, tw + 10, 20, 4)
    g.fillStyle(C.warm, 1)
    g.fillTriangle(-3, -16, 3, -16, 0, -10)
    this.prompt.setPosition(nearest.x, nearest.y - 26)
    this.promptZone.setSize(Math.max(tw + 10, 50), 22, true)
    this.prompt.setVisible(true)
  }

  private tryInteract(): void {
    if (this.panelOpen || !this.promptTarget) return
    const it = this.promptTarget
    if (it.event === 'OPEN_MAILBOX') {
      eventBus.emit('OPEN_MAILBOX', { unread: 0 })
    } else if (it.event === 'OPEN_CALENDAR') {
      eventBus.emit('OPEN_CALENDAR', {})
    }
  }

  // ─── 昼夜 ───────────────────────────────────────────────────

  private updateDayNight(): void {
    const now = new Date()
    const h = now.getHours() + now.getMinutes() / 60
    this.tintOverlay.fillColor = tintAtHour(h)
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    eventBus.emit('DAY_TICK', { time, phase: phaseAtHour(h) })
  }

  // ─── 占位美术 ───────────────────────────────────────────────

  private fitZoom(): void {
    const w = this.scale.gameSize.width
    const zoom = Phaser.Math.Clamp(w / 460, 2, 3)
    this.cameras.main.setZoom(zoom)
  }

  private paintTerrain(): void {
    const { cx, cy, rx, ry } = ISLAND
    const g = this.add.graphics().setDepth(0)

    // 海
    g.fillStyle(C.sea, 1)
    g.fillRect(0, 0, WORLD_W, WORLD_H)

    // 岛：泥土切面 → 湿沙 → 沙滩 → 草地（2.5D 分层）
    g.fillStyle(C.dirtDark, 1)
    g.fillEllipse(cx, cy + 14, rx * 2, ry * 2)
    g.fillStyle(C.dirt, 1)
    g.fillEllipse(cx, cy + 8, rx * 2, ry * 2)
    g.fillStyle(C.sandWet, 1)
    g.fillEllipse(cx, cy + 4, rx * 1.94, ry * 1.94)
    g.fillStyle(C.sand, 1)
    g.fillEllipse(cx, cy, rx * 1.86, ry * 1.86)
    g.fillStyle(C.grassDark, 1)
    g.fillEllipse(cx, cy - 4, rx * 1.7, ry * 1.7)
    g.fillStyle(C.grass, 1)
    g.fillEllipse(cx, cy - 7, rx * 1.64, ry * 1.64)
    g.fillStyle(C.grassLight, 1)
    g.fillEllipse(cx - rx * 0.2, cy - ry * 0.22, rx * 1.1, ry * 1.05)

    // 波光（两组虚线交替 = 帧动画）
    const waves = this.add.graphics().setDepth(1)
    const paint = (flip: boolean) => {
      waves.clear()
      waves.lineStyle(1.5, C.seaLight, 0.5)
      for (let i = 0; i < 46; i++) {
        const seed = i * 97.13
        const wy = 40 + ((seed * 7.3) % (WORLD_H - 80))
        const wx = ((seed * 13.7) % (WORLD_W - 120)) + 40
        if ((i % 2 === 0) !== flip) continue
        waves.lineBetween(wx, wy, wx + 10, wy)
      }
    }
    let flip = false
    paint(flip)
    this.time.addEvent({
      delay: 450,
      loop: true,
      callback: () => {
        flip = !flip
        paint(flip)
      },
    })

    // 码头（木板）
    const dockY1 = ISLAND.cy + ISLAND.ry * 0.8
    g.fillStyle(C.beam, 1)
    g.fillRect(DOCK.x1, dockY1, DOCK.x2 - DOCK.x1, DOCK.y2 - dockY1)
    g.fillStyle(C.wood, 1)
    for (let y = dockY1; y < DOCK.y2; y += 6) {
      g.fillRect(DOCK.x1 + 1, y + 1, DOCK.x2 - DOCK.x1 - 2, 4)
    }
  }

  private paintBuildings(): void {
    const g = this.add.graphics()

    // 小屋（330,300 附近）
    const hx = 330
    const hy = 300
    g.fillStyle(C.beam, 1)
    g.fillRect(hx - 34, hy - 26, 68, 46) // 墙阴影底
    g.fillStyle(C.wood, 1)
    g.fillRect(hx - 32, hy - 28, 64, 44) // 木墙
    g.fillStyle(C.beam, 1)
    g.fillRect(hx - 32, hy - 28, 64, 3) // 墙顶梁
    g.fillStyle(C.beam, 1)
    g.fillRect(hx - 6, hy - 10, 12, 26) // 门
    g.fillStyle(C.warm, 1)
    g.fillRect(hx - 26, hy - 18, 10, 10) // 窗（夜里会亮）
    g.fillRect(hx + 16, hy - 18, 10, 10)
    g.fillStyle(C.roof, 1)
    g.fillTriangle(hx - 44, hy - 26, hx + 44, hy - 26, hx, hy - 58) // 屋顶
    g.fillStyle(0xa85544, 1)
    g.fillTriangle(hx - 44, hy - 26, hx, hy - 26, hx, hy - 58)

    // 灯塔（680,320）
    const lx = 680
    const ly = 340
    for (let i = 0; i < 5; i++) {
      g.fillStyle(i % 2 === 0 ? C.wood : C.roof, 1)
      const w = 18 - i * 2
      g.fillRect(lx - w / 2, ly - i * 14, w, 14)
    }
    g.fillStyle(C.ink, 1)
    g.fillRect(lx - 7, ly - 76, 14, 10) // 灯室
    g.fillStyle(C.warm, 1)
    g.fillRect(lx - 5, ly - 74, 10, 6)
    g.fillStyle(C.roof, 1)
    g.fillTriangle(lx - 9, ly - 76, lx + 9, ly - 76, lx, ly - 88) // 顶

    // 木牌（码头旁）
    const sx = 560
    const sy = ISLAND.cy + ISLAND.ry * 0.72
    g.fillStyle(C.beam, 1)
    g.fillRect(sx - 1, sy, 3, 14)
    g.fillStyle(C.wood, 1)
    g.fillRoundedRect(sx - 22, sy - 12, 44, 14, 3)

    this.add
      .text(hx, hy - 40, '家', { fontFamily: 'serif', fontSize: '10px', color: '#fdf6e9', resolution: 3 })
      .setOrigin(0.5)
      .setDepth(2)
    this.add
      .text(lx, ly - 96, '灯塔 · 记忆日历', { fontFamily: 'serif', fontSize: '7px', color: '#fdf6e9', resolution: 3 })
      .setOrigin(0.5)
      .setDepth(2)
  }

  private placeInteractables(): void {
    this.interactables = [
      { x: 330, y: 336, r: 40, label: '📮 读信', event: 'OPEN_MAILBOX' },
      { x: 680, y: 356, r: 44, label: '🗓 灯塔日历', event: 'OPEN_CALENDAR' },
    ]
  }

  private spawnBottles(): void {
    const spots = [
      { x: 420, y: 560 },
      { x: 620, y: 540 },
      { x: 260, y: 130 },
    ]
    for (const s of spots) {
      const bottle = this.add.sprite(s.x, s.y, 'bottle').setDepth(s.y)
      this.tweens.add({
        targets: bottle,
        y: s.y - 2,
        duration: 900 + s.x % 400,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inout',
      })
    }
  }
}
