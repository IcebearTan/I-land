import Phaser from 'phaser'
import { eventBus, type Phase, type IslandIdentity } from '../EventBus'
import { makeTexture } from '../pixels'
import { hash2 } from '../art'
import { createIslandArt, WORLD, HOME, TOWER, MAIL, DOCK, SPAWN, BOTTLE, TREES, LAMPS, OBSTACLES, landDistance } from '../art/island'
import { nightWeight } from '../../audio/types'

const TINT_KEYS: Array<{ h: number; c: number }> = [
  { h: 0, c: 0x8a92c8 },
  { h: 5, c: 0x8a92c8 },
  { h: 6.5, c: 0xe8c4d4 },
  { h: 8, c: 0xffffff },
  { h: 16, c: 0xffffff },
  { h: 18, c: 0xf0c098 },
  { h: 19.5, c: 0xa8aecf },
  { h: 20.5, c: 0x8a92c8 },
  { h: 24, c: 0x8a92c8 },
]


const PHASE_OVERRIDE = new URLSearchParams(window.location.search).get('phase')
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  return ((Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8)) | Math.round(ab + (bb - ab) * t)
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
  if (PHASE_OVERRIDE === 'day' || PHASE_OVERRIDE === 'dusk' || PHASE_OVERRIDE === 'night' || PHASE_OVERRIDE === 'dawn') {
    return PHASE_OVERRIDE
  }
  if (h < 5.5 || h >= 20) return 'night'
  if (h < 8) return 'dawn'
  if (h < 16.5) return 'day'
  return 'dusk'
}

interface Interactable { x: number; y: number; label: string; event: 'mailbox' | 'calendar' | 'bottle' }

export class IslandScene extends Phaser.Scene {
  private identity: IslandIdentity = { character: 'bear', display: '小熊' }
  private moveInput = { x: 0, y: 0 }
  private destination!: Phaser.GameObjects.Graphics
  private interactionLabel: string | null = null
  private player!: Phaser.Physics.Arcade.Sprite
  private shadow!: Phaser.GameObjects.Ellipse
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private tapTarget: Phaser.Math.Vector2 | null = null
  private panelOpen = false
  private secondTimer = 0
  private audioTimer = 0
  private facing = 'front'
  private prompt!: Phaser.GameObjects.Container
  private promptText!: Phaser.GameObjects.Text
  private promptBg!: Phaser.GameObjects.Graphics
  private promptTarget: Interactable | null = null
  private tintOverlay!: Phaser.GameObjects.Rectangle
  private nightLights!: Phaser.GameObjects.Container
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private decorations: Phaser.GameObjects.Image[] = []
  private previous = { x: SPAWN.x, y: SPAWN.y }
  private interactables: Interactable[] = [
    { ...MAIL, label: '小屋信箱', event: 'mailbox' },
    { x: TOWER.x, y: TOWER.y + 8, label: '灯塔 · 记忆日历', event: 'calendar' },
    { ...BOTTLE, label: '海边漂流瓶', event: 'bottle' },
  ]

  constructor() { super('Island') }

  init(identity?: IslandIdentity): void {
    this.identity = identity ?? { character: 'bear', display: '小熊' }
    this.facing = 'front'
    this.moveInput = { x: 0, y: 0 }
    this.interactionLabel = null
  }

  create(): void {
    this.panelOpen = false; this.tapTarget = null; this.secondTimer = 0; this.audioTimer = 0; this.decorations = []; this.previous = { ...SPAWN }
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height)
    createIslandArt(this)
    this.add.image(0, 0, 'island-ground-v3').setOrigin(0).setDepth(0)
    this.placeScenery()
    this.setupLights()
    this.shadow = this.add.ellipse(SPAWN.x, SPAWN.y + 6, 13, 5, 0x345b40, .24).setDepth(1)
    this.player = this.physics.add.sprite(SPAWN.x, SPAWN.y, `islander-${this.identity.character}-front`)
    this.player.setSize(10, 5).setOffset(3, 10).setCollideWorldBounds(true)
    this.cameras.main.startFollow(this.player, true, 1, 1, 0, 65)
    this.fitZoom()
    this.destination = this.add.graphics().setDepth(2).setVisible(false)
    this.destination.lineStyle(1, 0xfdf6e9).strokeEllipse(0, 0, 14, 7).lineStyle(1, 0x8a5a38).strokeEllipse(0, 0, 18, 11)
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE') as Record<string, Phaser.Input.Keyboard.Key>
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
      if (this.panelOpen || objects.length) return
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
      if (!this.walkable(world.x, world.y)) return
      this.tapTarget = new Phaser.Math.Vector2(world.x, world.y)
      this.destination.setPosition(world.x, world.y + 5).setVisible(true)
    })
    this.promptBg = this.add.graphics()
    this.promptText = this.add.text(0, 0, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '8px', color: '#4a3b55', resolution: 3,
    }).setOrigin(.5)
    const zone = this.add.zone(0, 0, 125, 26).setInteractive({ useHandCursor: true })
    zone.on('pointerdown', () => this.tryInteract())
    this.prompt = this.add.container(0, 0, [this.promptBg, this.promptText, zone]).setDepth(9000).setVisible(false)
    this.tintOverlay = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0xffffff)
      .setOrigin(0).setDepth(5000).setBlendMode(Phaser.BlendModes.MULTIPLY)
    const onMove = (input: { x: number; y: number }) => {
      this.moveInput = this.panelOpen ? { x: 0, y: 0 } : input
      if (input.x || input.y) this.tapTarget = null
    }
    const onInteract = () => this.tryInteract()
    const onOpen = () => {
      this.panelOpen = true; this.tapTarget = null; this.moveInput = { x: 0, y: 0 }; this.player.setVelocity(0, 0)
      this.input.keyboard!.resetKeys(); this.input.keyboard!.enabled = false
      this.input.keyboard!.disableGlobalCapture()
    }
    const onClose = () => { this.panelOpen = false; this.input.keyboard!.enabled = true; this.input.keyboard!.enableGlobalCapture() }
    const onBlur = () => { this.moveInput = { x: 0, y: 0 }; this.tapTarget = null; this.input.keyboard!.resetKeys() }
    this.game.events.on('blur', onBlur)
    eventBus.on('MOVE_INPUT', onMove); eventBus.on('INTERACT', onInteract)
    let leaving = false
    const onExit = () => {
      if (leaving) return
      leaving = true
      this.cameras.main.once('camerafadeoutcomplete', () => this.time.delayedCall(16, () => this.scene.start('Login')))
      this.cameras.main.fadeOut(this.reducedMotion.matches ? 0 : 280)
    }
    eventBus.on('PANEL_OPENED', onOpen); eventBus.on('PANEL_CLOSED', onClose); eventBus.on('EXIT_TO_LOGIN', onExit)
    this.scale.on('resize', this.fitZoom, this)
    this.events.once('shutdown', () => {
      eventBus.off('PANEL_OPENED', onOpen); eventBus.off('PANEL_CLOSED', onClose); eventBus.off('EXIT_TO_LOGIN', onExit)
      this.scale.off('resize', this.fitZoom, this)
      this.game.events.off('blur', onBlur)
      eventBus.off('MOVE_INPUT', onMove); eventBus.off('INTERACT', onInteract)
      eventBus.emit('INTERACTION_CHANGED', { label: null })
      this.input.keyboard!.disableGlobalCapture()
    })
    this.updateDayNight()
    this.updateAudioContext()
    if (!this.reducedMotion.matches) this.cameras.main.fadeIn(280)
  }

  private fitZoom(): void {
    // 整数倍清晰像素；手机保持人物可读。
    // 可视区域（视口÷zoom）任一轴超出 640×480 世界纹理，就会在超出侧露出
    // 无波纹的平底背景色 #3f6f9e（看起来是一块突兀的蓝色空白）。
    const { width, height } = this.scale.gameSize
    this.cameras.main.setZoom(Math.max(2, Math.ceil(width / WORLD.width), Math.ceil(height / WORLD.height)))
  }

  private placeScenery(): void {
    const object = (x: number, y: number, key: string, width: number, ox = .5, oy = 1) => {
      this.add.ellipse(x + 5, y + 1, width, 9, 0x345b40, .20).setDepth(1)
      return this.add.image(x, y, key).setOrigin(ox, oy).setDepth(y)
    }
    object(HOME.x, HOME.y, 'cottage-v3', 106, .5, 100 / 112)
    object(TOWER.x, TOWER.y, 'lighthouse-v3', 46, .5, 105 / 113)
    TREES.forEach(([x, y], i) => object(x, y, i % 5 === 0 ? 'olive-v3' : 'oak-v3', 38))
    object(MAIL.x, MAIL.y, 'mailbox-v3', 17)
    object(398, 241, 'bench-v3', 38)
    LAMPS.forEach(([x, y]) => object(x, y, 'lantern-v3', 10))
    makeTexture(this, 'bottle-v3', ['..cc..', '..cc..', '.swws.', '.swgs.', '.sggs.', '.sggs.', '.swws.', '..ss..'], {
      c: '#c79a65', s: '#547e7d', w: '#f5eee2', g: '#9fcdb8',
    })
    object(BOTTLE.x, BOTTLE.y, 'bottle-v3', 8)
    // 位置标识在场景中使用清晰的小字，不烘焙进像素素材。
    for (const [x, y, text] of [[HOME.x, 254, '我们的家'], [164, 324, '慢慢开花'], [TOWER.x, 277, '记忆灯塔']] as const) {
      this.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: '7px', color: '#4a3b55',
        backgroundColor: '#f0d9a8', padding: { x: 4, y: 2 }, resolution: 3 }).setOrigin(.5).setDepth(2)
    }
    makeTexture(this, 'ripple-v3', ['....ww......', '..ww..ww....', 'ww......wwww'], { w: '#b4d7df' })
    for (let i = 0; i < 38; i++) {
      const x = Math.floor(hash2(i, 31) * WORLD.width), y = Math.floor(hash2(i, 34) * WORLD.height)
      if (landDistance(x, y) < 1.07) continue
      this.decorations.push(this.add.image(x, y, 'ripple-v3').setAlpha(.8).setDepth(1))
    }
  }

  private setupLights(): void {
    this.nightLights = this.add.container(0, 0).setDepth(5100)
    // 方形像素光晕，暖窗保持窗棂；避免纯色方块盖住建筑。
    const glow = (x: number, y: number, radius: number) => {
      for (let r = radius; r > 4; r -= 5) this.nightLights.add(this.add.ellipse(x, y, r * 2, r, 0xffd98a, .045))
    }
    for (const [x, y] of LAMPS) {
      glow(x, y - 27, 20)
      this.nightLights.add(this.add.rectangle(x + .5, y - 30.5, 5, 7, 0xffd98a))
    }
    for (const x of [HOME.x - 33, HOME.x + 16]) {
      glow(x + 5, HOME.y - 21, 19)
      this.nightLights.add(this.add.rectangle(x + 5.5, HOME.y - 23, 11, 12, 0xffd98a))
      this.nightLights.add(this.add.rectangle(x + 5.5, HOME.y - 23, 1, 12, 0x8a5a38))
      this.nightLights.add(this.add.rectangle(x + 5.5, HOME.y - 23, 11, 1, 0x8a5a38))
    }
    glow(TOWER.x, TOWER.y - 81, 30)
    this.nightLights.add(this.add.rectangle(TOWER.x, TOWER.y - 81, 14, 14, 0xffd98a))
    this.nightLights.add(this.add.rectangle(TOWER.x, TOWER.y - 81, 1, 14, 0x8a5a38))
  }

  update(time: number, delta: number): void {
    if (!this.player?.active) return
    // 在前一帧位置上执行轴向滑动，树干、房屋墙体不再可以直接穿过。
    this.resolveMovement()
    this.previous = { x: this.player.x, y: this.player.y }
    let dx = 0, dy = 0
    if (!this.panelOpen) {
      dx = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown)
      dy = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown)
      if (!dx && !dy) { dx = this.moveInput.x; dy = this.moveInput.y }
      if (dx || dy) this.tapTarget = null
      else if (this.tapTarget) {
        dx = this.tapTarget.x - this.player.x; dy = this.tapTarget.y - this.player.y
        if (Math.hypot(dx, dy) < 3) { this.tapTarget = null; dx = 0; dy = 0 }
      }
    }
    const norm = Math.hypot(dx, dy)
    this.player.setVelocity(norm ? dx / norm * 72 : 0, norm ? dy / norm * 72 : 0)
    this.player.setDepth(this.player.y + 7)
    if (norm) {
      this.facing = Math.abs(dx) > Math.abs(dy) ? 'side' : dy < 0 ? 'back' : 'front'
      this.player.setFlipX(this.facing === 'side' && dx < 0)
    }
    // 四方向、两帧走路节奏，不拉伸角色；减少动态时保持静态。
    const step = !this.reducedMotion.matches && norm && Math.floor(time / 160) % 2 ? '-step' : ''
    this.player.setTexture(`islander-${this.identity.character}-${this.facing}${step}`)
    this.destination.setVisible(!!this.tapTarget && !this.panelOpen)
    this.shadow.setPosition(this.player.x, this.player.y + 6)
    for (let i = 0; i < this.decorations.length; i++) {
      const water = this.decorations[i]
      water.setAlpha(this.reducedMotion.matches ? .8 : .8 + Math.floor((time + i * 173) / 800) % 2 * .15)
    }
    this.updatePrompt()
    if (Phaser.Input.Keyboard.JustDown(this.keys.E) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.tryInteract()
    this.secondTimer += delta
    if (this.secondTimer > 1000) { this.secondTimer = 0; this.updateDayNight() }
    this.audioTimer += delta
    if (this.audioTimer > 250) { this.audioTimer = 0; this.updateAudioContext() }
  }

  private updateAudioContext(): void {
    const shore = Phaser.Math.Clamp((landDistance(this.player.x, this.player.y) - .62) / .34, 0, 1)
    const nearestTree = Math.min(...TREES.map(([x, y]) => Math.hypot(this.player.x - x, this.player.y - y)))
    const now = new Date(), hour = now.getHours() + now.getMinutes() / 60, phase = phaseAtHour(hour)
    eventBus.emit('AUDIO_CONTEXT', {
      scene: 'island', shore, grove: Phaser.Math.Clamp(1 - nearestTree / 80, 0, 1),
      phase, night: PHASE_OVERRIDE ? ({ day: 0, dawn: .5, dusk: .4, night: 1 }[phase]) : nightWeight(hour),
    })
  }

  private walkable(x: number, y: number): boolean {
    const onDock = x > DOCK.left + 4 && x < DOCK.right - 4 && y >= DOCK.top - 8 && y < DOCK.bottom - 6
    if (!onDock && landDistance(x, y + 5) > .967) return false
    return !OBSTACLES.some(o => x + 4 > o.x && x - 4 < o.x + o.w && y + 6 > o.y && y + 2 < o.y + o.h)
  }
  private resolveMovement(): void {
    const { x, y } = this.player
    if (this.walkable(x, y)) return
    if (this.walkable(x, this.previous.y)) this.player.y = this.previous.y
    else if (this.walkable(this.previous.x, y)) this.player.x = this.previous.x
    else { this.player.setPosition(this.previous.x, this.previous.y); this.tapTarget = null }
  }
  private updatePrompt(): void {
    this.promptTarget = this.interactables.find(it => Math.hypot(it.x - this.player.x, it.y - this.player.y) < 34) ?? null
    const label = this.panelOpen ? null : this.promptTarget?.label ?? null
    if (label !== this.interactionLabel) {
      this.interactionLabel = label
      eventBus.emit('INTERACTION_CHANGED', { label })
    }
    this.prompt.setVisible(!!this.promptTarget && !this.panelOpen)
    if (!this.promptTarget) return
    this.promptText.setText(`${this.promptTarget.label}  ·  E / 轻点`)
    const width = this.promptText.width + 14
    this.promptBg.clear().fillStyle(0x8a5a38).fillRoundedRect(-width / 2 - 1, -11, width + 2, 22, 2)
      .fillStyle(0xfdf6e9).fillRoundedRect(-width / 2, -10, width, 19, 2)
      .fillTriangle(-3, 9, 3, 9, 0, 13)
    this.prompt.setPosition(this.promptTarget.x, this.promptTarget.y - 44)
  }
  private tryInteract(): void {
    if (this.panelOpen || !this.promptTarget) return
    if (this.promptTarget.event === 'mailbox') eventBus.emit('OPEN_MAILBOX', { unread: 0 })
    else if (this.promptTarget.event === 'calendar') eventBus.emit('OPEN_CALENDAR', {})
    else eventBus.emit('OPEN_BOTTLE', { id: 'shore' })
  }
  private updateDayNight(): void {
    const now = new Date(), h = now.getHours() + now.getMinutes() / 60, phase = phaseAtHour(h)
    this.tintOverlay.fillColor = tintAtHour(PHASE_OVERRIDE ? ({ day: 12, dusk: 18, dawn: 6.5, night: 22 }[phase]) : h)
    this.nightLights.setVisible(phase !== 'day')
    eventBus.emit('DAY_TICK', { time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, phase })
  }
}
