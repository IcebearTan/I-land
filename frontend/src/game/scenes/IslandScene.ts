import Phaser from 'phaser'
import { worldZoom } from '../../visual/layout'
import { CHARACTER_ATLAS, CHARACTER_ORIGIN, CHARACTER_FOOT, actorFrame, pickFacing, type Facing } from '../../visual/artV2'
import { PIXEL_FONT_FAMILY, SCREEN_BODY_PX, SCREEN_LABEL_PX, screenTextScale } from '../../visual/screenText'
import { eventBus, type Phase, type IslandIdentity, type IslandEntry, type SceneState, type LighthouseSignal } from '../EventBus'
import { makeTexture } from '../pixels'
import { hash2 } from '../art'
import { createIslandArt, ISLAND_WAVE_FRAMES, WORLD, HOME, TOWER, MAIL, DOCK, SPAWN, BOTTLE, SEASIDE_ENTRY, SEASIDE_RETURN, TREES, LAMPS, OBSTACLES, landDistance } from '../art/island'
import { COTTAGE_KEY, COTTAGE_META } from '../art/cottage'
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

interface Interactable { x: number; y: number; label: string; event: 'mailbox' | 'lighthouse' | 'bottle' | 'seaside' | 'interior' }
interface SwayingCanopy { img: Phaser.GameObjects.Image; baseX: number; phase: number; amp: number }
interface WindLeaf { img: Phaser.GameObjects.Image; originX: number; originY: number; life: number; maxLife: number; drift: number }
interface SmokePuff { img: Phaser.GameObjects.Rectangle; phase: number }
interface WaveRipple { img: Phaser.GameObjects.Image; baseX: number; phase: number; drift: number }

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
  private leaving = false
  private spawn = { ...SPAWN }
  private secondTimer = 0
  private audioTimer = 0
  private facingDir: Facing = 'down'
  private walkClock = 0
  private prompt!: Phaser.GameObjects.Container
  private sceneLabels: Phaser.GameObjects.Text[] = []
  private promptText!: Phaser.GameObjects.Text
  private promptBg!: Phaser.GameObjects.Graphics
  private promptTarget: Interactable | null = null
  private tintOverlay!: Phaser.GameObjects.Rectangle
  private nightLights!: Phaser.GameObjects.Container
  private towerGlowLayers: Phaser.GameObjects.Ellipse[] = []
  private towerGlass!: Phaser.GameObjects.Rectangle
  private towerBeam!: Phaser.GameObjects.Graphics
  private towerColor = 0xffd98a
  private towerDayBeacon!: Phaser.GameObjects.Rectangle
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private shoreWave!: Phaser.GameObjects.Image
  private waveFrame = 0
  private ripples: WaveRipple[] = []
  private mailboxBadge!: Phaser.GameObjects.Image
  private unreadLetters = 0
  private studyDormer!: Phaser.GameObjects.Container
  private studyRoofLit = false
  private studyCompanionNote: string | null = null
  private canopies: SwayingCanopy[] = []
  private windLeaves: WindLeaf[] = []
  private chimneySmoke: SmokePuff[] = []
  private interactables: Interactable[] = [
    { ...MAIL, label: '小屋信箱', event: 'mailbox' },
    { x: TOWER.x, y: TOWER.y + 8, label: '灯塔 · 灯语信号', event: 'lighthouse' },
    { ...BOTTLE, label: '海边漂流瓶', event: 'bottle' },
    { ...SEASIDE_ENTRY, label: '去海边坐一会儿', event: 'seaside' },
    { x: HOME.x, y: HOME.y + 10, label: '回家 · 进屋休息', event: 'interior' },
  ]

  constructor() { super('Island') }

  init(entry?: IslandEntry): void {
    this.identity = entry ? { character: entry.character, display: entry.display, account: entry.account } : { character: 'bear', display: '小熊' }
    this.spawn = entry?.returnPoint && Number.isFinite(entry.returnPoint.x) && Number.isFinite(entry.returnPoint.y)
      && this.walkable(entry.returnPoint.x, entry.returnPoint.y) ? { ...entry.returnPoint } : { ...SPAWN }
    this.facingDir = 'down'
    this.walkClock = 0
    this.moveInput = { x: 0, y: 0 }
    this.interactionLabel = null
    this.promptTarget = null; this.leaving = false
  }

  create(): void {
    this.sceneLabels = []
    this.panelOpen = false; this.tapTarget = null; this.secondTimer = 0; this.audioTimer = 0
    this.ripples = []; this.canopies = []; this.windLeaves = []; this.chimneySmoke = []; this.towerGlowLayers = []; this.waveFrame = 0
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height)
    createIslandArt(this)
    this.add.image(0, 0, 'island-ground-v3').setOrigin(0).setDepth(0)
    this.shoreWave = this.add.image(0, 0, 'island-waves-0').setOrigin(0).setDepth(0.5)
    this.placeScenery()
    this.setupLights()
    this.shadow = this.add.ellipse(this.spawn.x, this.spawn.y - 1, 12, 4, 0x345b40, .24).setDepth(1)
    this.player = this.physics.add.sprite(this.spawn.x, this.spawn.y, CHARACTER_ATLAS, actorFrame(this.identity.character, 'down')).setOrigin(CHARACTER_ORIGIN.x, CHARACTER_ORIGIN.y)
    this.player.setSize(CHARACTER_FOOT.width, CHARACTER_FOOT.height).setOffset(CHARACTER_FOOT.offsetX, CHARACTER_FOOT.offsetY).setCollideWorldBounds(true)
    this.cameras.main.startFollow(this.player, true, 0.18, 0.18, 0, 65)
    this.fitZoom()
    this.destination = this.add.graphics().setDepth(2).setVisible(false)
    this.destination.lineStyle(1, 0xfdf6e9).strokeEllipse(0, 0, 14, 7).lineStyle(1, 0x8a5a38).strokeEllipse(0, 0, 18, 11)
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE') as Record<string, Phaser.Input.Keyboard.Key>
    this.input.keyboard!.enabled = true
    this.input.keyboard!.enableGlobalCapture()
    this.input.keyboard!.resetKeys()
    const onPointer = (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
      if (this.panelOpen || this.leaving || objects.length) return
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
      if (!this.walkable(world.x, world.y)) return
      this.tapTarget = new Phaser.Math.Vector2(world.x, world.y)
      this.destination.setPosition(world.x, world.y + 5).setVisible(true)
    }
    this.input.on('pointerdown', onPointer)
    this.promptBg = this.add.graphics()
    this.promptText = this.add.text(0, 0, '', {
      fontFamily: PIXEL_FONT_FAMILY, fontSize: SCREEN_BODY_PX, color: '#3b2117', resolution: 3,
    }).setOrigin(.5)
    const zone = this.add.zone(0, 0, 170, 44).setInteractive({ useHandCursor: true })
    const onPrompt = () => this.tryInteract()
    zone.on('pointerdown', onPrompt)
    this.prompt = this.add.container(0, 0, [this.promptBg, this.promptText, zone]).setDepth(9000).setVisible(false).setScale(screenTextScale(this.cameras.main.zoom))
    this.tintOverlay = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0xffffff)
      .setOrigin(0).setDepth(5000).setBlendMode(Phaser.BlendModes.MULTIPLY)
    const onMove = (input: { x: number; y: number }) => {
      this.moveInput = this.panelOpen || this.leaving ? { x: 0, y: 0 } : input
      if (input.x || input.y) this.tapTarget = null
    }
    const onInteract = () => this.tryInteract()
    const onInteractionState = () => this.updatePrompt(true)
    const onOpen = () => {
      this.panelOpen = true; this.clearInput(); this.prompt.setVisible(false)
      this.input.keyboard!.enabled = false
      this.input.keyboard!.disableGlobalCapture()
    }
    const onClose = () => {
      this.panelOpen = false; this.clearInput()
      if (!this.leaving) { this.input.keyboard!.enabled = true; this.input.keyboard!.enableGlobalCapture() }
    }
    const onBlur = () => this.clearInput()
    const onVisibility = () => { if (document.hidden) this.clearInput() }
    const onIdentity = (identity: IslandIdentity) => { this.identity = { ...identity } }
    const onLighthouse = (signal: LighthouseSignal) => { this.applyLighthouseColor(signal.color) }
    const onMailboxUnread = ({ count }: { count: number }) => {
      this.unreadLetters = Math.max(0, count)
      this.mailboxBadge?.setVisible(this.unreadLetters > 0)
      this.updatePrompt(true)
    }
    const onStudyRoof = ({ lit, companionFocusing, companionName }: { lit: boolean; companionFocusing?: boolean; companionName?: string }) => {
      this.studyRoofLit = lit
      this.studyCompanionNote = companionFocusing && companionName ? `${companionName}正在阁楼自习` : null
      this.studyDormer?.setVisible(this.studyRoofLit)
      this.updatePrompt(true)
    }
    const onScene = (state: SceneState) => {
      if (state.scene !== 'island' || !state.transitioning) return
      this.leaving = true; this.clearInput(); this.promptTarget = null; this.prompt.setVisible(false)
      this.input.keyboard!.enabled = false; this.input.keyboard!.disableGlobalCapture()
    }
    this.game.events.on('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    eventBus.on('MOVE_INPUT', onMove); eventBus.on('INTERACT', onInteract)
    eventBus.on('INTERACTION_REQUEST_STATE', onInteractionState)
    eventBus.on('PANEL_OPENED', onOpen); eventBus.on('PANEL_CLOSED', onClose)
    eventBus.on('IDENTITY_CHANGED', onIdentity); eventBus.on('SCENE_CHANGED', onScene)
    eventBus.on('LIGHTHOUSE_UPDATED', onLighthouse)
    eventBus.on('MAILBOX_UNREAD_CHANGED', onMailboxUnread)
    eventBus.on('STUDY_ROOF_STATUS', onStudyRoof)
    this.scale.on('resize', this.fitZoom, this)
    let disposed = false
    const cleanup = () => {
      if (disposed) return
      disposed = true; this.leaving = true; this.clearInput()
      eventBus.off('PANEL_OPENED', onOpen); eventBus.off('PANEL_CLOSED', onClose)
      eventBus.off('IDENTITY_CHANGED', onIdentity); eventBus.off('SCENE_CHANGED', onScene)
      eventBus.off('LIGHTHOUSE_UPDATED', onLighthouse)
      eventBus.off('MAILBOX_UNREAD_CHANGED', onMailboxUnread)
      eventBus.off('STUDY_ROOF_STATUS', onStudyRoof)
      this.scale.off('resize', this.fitZoom, this)
      this.game.events.off('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      eventBus.off('MOVE_INPUT', onMove); eventBus.off('INTERACT', onInteract)
      eventBus.off('INTERACTION_REQUEST_STATE', onInteractionState)
      this.input.off('pointerdown', onPointer); zone.off('pointerdown', onPrompt)
      eventBus.emit('INTERACTION_CHANGED', { label: null })
      this.input.keyboard!.removeCapture(Object.values(this.keys).map(key => key.keyCode))
      this.input.keyboard!.disableGlobalCapture()
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup)
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup)
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
    this.updateDayNight()
    this.updateAudioContext()
    if (!this.reducedMotion.matches) this.cameras.main.fadeIn(280)
    eventBus.emit('SCENE_READY', { scene: 'island', identity: { ...this.identity } })
  }

  private clearInput(): void {
    this.moveInput = { x: 0, y: 0 }; this.tapTarget = null
    if (this.player?.active && this.player.body) this.player.setVelocity(0, 0)
    this.destination?.setVisible(false)
    this.input.keyboard?.resetKeys()
  }

  private fitZoom(): void {
    this.clearInput()
    // 整数倍清晰像素；手机保持人物可读。
    // 可视区域（视口÷zoom）任一轴超出 640×480 世界纹理，就会在超出侧露出
    // 无波纹的平底背景色 #3f6f9e（看起来是一块突兀的蓝色空白）。
    const { width, height } = this.scale.gameSize
    this.cameras.main.setZoom(worldZoom(width, height))
    const scale = screenTextScale(this.cameras.main.zoom)
    this.prompt?.setScale(scale); this.sceneLabels.forEach(label => label.setScale(scale))
  }

  private placeScenery(): void {
    const object = (x: number, y: number, key: string, width: number, ox = .5, oy = 1) => {
      this.add.ellipse(x + 5, y + 1, width, 9, 0x345b40, .20).setDepth(1)
      return this.add.image(x, y, key).setOrigin(ox, oy).setDepth(y)
    }
    object(HOME.x, HOME.y, COTTAGE_KEY, 114, .5, COTTAGE_META.anchorY / COTTAGE_META.height)
    for (let i = 0; i < 3; i++) {
      const puff = this.add.rectangle(
        HOME.x + COTTAGE_META.chimneyTop.dx,
        HOME.y + COTTAGE_META.chimneyTop.dy,
        3,
        3,
        0xfdf6e9,
        0,
      ).setDepth(HOME.y + 1)
      this.chimneySmoke.push({ img: puff, phase: i / 3 })
    }
    object(TOWER.x, TOWER.y, 'lighthouse-v3', 48, .5, 108 / 116)
    // Daytime subtle beacon tint inside lighthouse lantern glass
    this.towerDayBeacon = this.add.rectangle(TOWER.x, TOWER.y - 84, 12, 13, this.towerColor, .28).setDepth(TOWER.y + 0.5)
    // Split trees: grounded roots + independently swaying sea-breeze canopies
    TREES.forEach(([x, y], i) => {
      const kind = i % 5 === 0 ? 'olive' : 'oak'
      object(x, y, `${kind}-trunk-v4`, 38)
      const canopy = this.add.image(x, y - 22, `${kind}-canopy-v4`).setOrigin(.5, .86).setDepth(y + 0.2)
      this.canopies.push({ img: canopy, baseX: x, phase: x * 0.022 + y * 0.014 + i * 0.4, amp: 0.028 + (i % 3) * 0.005 })
    })
    // Gentle occasional wind-blown leaves drifting from island trees
    for (let i = 0; i < 6; i++) {
      const [tx, ty] = TREES[(i * 3 + 1) % TREES.length]
      const leaf = this.add.image(tx, ty - 34, 'wind-leaf-v4').setDepth(4200).setAlpha(0)
      this.windLeaves.push({ img: leaf, originX: tx, originY: ty - 34, life: i * 1600, maxLife: 7200 + (i % 3) * 1400, drift: 0.7 + (i % 3) * 0.25 })
    }
    object(MAIL.x, MAIL.y, 'mailbox-v3', 17)
    makeTexture(this, 'mailbox-unread-v1', [
      '.ooooooooooo.',
      'opppppppppppo',
      'opbpppppppbpo',
      'oppbpppppbppo',
      'opppbrrrbpppo',
      'opppprrrppppo',
      'opppppppppppo',
      'opppppppppppo',
      '.ooooooooooo.',
    ], { o: '#4a3b55', p: '#fdf6e9', b: '#c79a65', r: '#e8637c' })
    this.mailboxBadge = this.add.image(MAIL.x, MAIL.y - 33, 'mailbox-unread-v1')
      .setOrigin(0.5, 1)
      .setDepth(MAIL.y + 8)
      .setVisible(this.unreadLetters > 0)
    object(398, 241, 'bench-v3', 38)
    LAMPS.forEach(([x, y]) => object(x, y, 'lantern-v3', 10))
    makeTexture(this, 'bottle-v3', ['..cc..', '..cc..', '.swws.', '.swgs.', '.sggs.', '.sggs.', '.swws.', '..ss..'], {
      c: '#c79a65', s: '#547e7d', w: '#f5eee2', g: '#9fcdb8',
    })
    object(BOTTLE.x, BOTTLE.y, 'bottle-v3', 8)
    object(SEASIDE_ENTRY.x, SEASIDE_ENTRY.y, 'seaside-waymark', 18)
    this.add.image(SEASIDE_ENTRY.x + 17, SEASIDE_ENTRY.y + 2, 'seaside-cushion').setOrigin(.5, 1).setDepth(2)
    this.add.image(SEASIDE_ENTRY.x + 28, SEASIDE_ENTRY.y - 7, 'seaside-shell').setDepth(2)
    this.sceneLabels.push(this.add.text(SEASIDE_ENTRY.x, SEASIDE_ENTRY.y - 11, '看海', {
      fontFamily: PIXEL_FONT_FAMILY, fontSize: SCREEN_LABEL_PX, color: '#fffaf0', resolution: 3,
    }).setOrigin(.5).setDepth(SEASIDE_ENTRY.y + 1))
    // 位置标识统一使用 ArkPixel 像素字，并在字体加载完成后重绘一次确保无回退。
    for (const [x, y, text] of [[HOME.x, 254, '我们的家'], [164, 324, '慢慢开花'], [TOWER.x, 277, '灯语灯塔']] as const) {
      this.sceneLabels.push(this.add.text(x, y, text, { fontFamily: PIXEL_FONT_FAMILY, fontSize: SCREEN_LABEL_PX, color: '#3b2117',
        backgroundColor: '#f8e1b8', padding: { x: 5, y: 2 }, resolution: 3 }).setOrigin(.5).setDepth(2))
    }
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.load('16px ArkPixel').then(() => {
        if (!this.scene.isActive()) return
        this.sceneLabels.forEach((lbl) => lbl.setFontFamily(PIXEL_FONT_FAMILY))
        this.promptText?.setFontFamily(PIXEL_FONT_FAMILY)
      }).catch(() => {})
    }
    makeTexture(this, 'ripple-v4-0', ['....ww......', '..ww..ww....', 'ww......wwww'], { w: '#b4d7df' })
    makeTexture(this, 'ripple-v4-1', ['..ww....ww..', '....wwww....', '..ww........'], { w: '#d6ebf0' })
    makeTexture(this, 'ripple-v4-2', ['......ww....', '....ww..ww..', '........ww..'], { w: '#9ac6d8' })
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(hash2(i, 31) * WORLD.width), y = Math.floor(hash2(i, 34) * WORLD.height)
      if (landDistance(x, y) < 1.14) continue
      const img = this.add.image(x, y, `ripple-v4-${i % 3}`).setAlpha(.72).setDepth(0.8)
      this.ripples.push({ img, baseX: x, phase: i * 0.91, drift: 2.5 + (i % 3) * 1.5 })
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
    for (const win of COTTAGE_META.floorWindows) {
      const wx = HOME.x + win.dx, wy = HOME.y + win.dy
      glow(wx, wy + 2, 19)
      this.nightLights.add(this.add.rectangle(wx, wy, win.w, win.h, 0xffd98a))
      this.nightLights.add(this.add.rectangle(wx, wy, 2, win.h, 0x8a5a38))
      this.nightLights.add(this.add.rectangle(wx, wy, win.w, 2, 0x8a5a38))
    }
    for (const pane of COTTAGE_META.doorPanes) {
      const px = HOME.x + pane.dx, py = HOME.y + pane.dy
      this.nightLights.add(this.add.rectangle(px, py, pane.w, pane.h, 0xffd98a, 0.85))
    }
    const sconceX = HOME.x + COTTAGE_META.porchLamp.dx
    const sconceY = HOME.y + COTTAGE_META.porchLamp.dy
    glow(sconceX, sconceY, 13)
    this.nightLights.add(this.add.rectangle(sconceX, sconceY, 2, 3, 0xfff2c2))
    // 夜晚一楼休息时，二楼阁楼全景窗也保留柔和微光；任一方在自习室则由 studyDormer 全天候明亮照亮
    const aw = COTTAGE_META.atticWindow
    const awX = HOME.x + aw.dx, awY = HOME.y + aw.dy
    glow(awX, awY + 1, 20)
    this.nightLights.add(this.add.rectangle(awX, awY, aw.w, aw.h, 0xffd98a, 0.55))
    for (const mx of aw.mullionsX) this.nightLights.add(this.add.rectangle(awX + mx, awY, 1, aw.h, 0x6e4529))
    this.nightLights.add(this.add.rectangle(awX, HOME.y + aw.transomY, aw.w, 1, 0x6e4529))
    // 二楼星光阁楼全景书房窗 + 圆天窗暖灯（任意一方在书房或专注时全天候透出琥珀暖光与绿罩台灯微光）
    this.studyDormer = this.add.container(0, 0).setDepth(5105).setVisible(this.studyRoofLit)
    for (let r = 28; r > 6; r -= 5) {
      this.studyDormer.add(this.add.ellipse(awX, awY + 2, r * 2.2, r * 1.15, 0xffd98a, 0.06))
    }
    this.studyDormer.add(this.add.rectangle(awX, awY, aw.w, aw.h, 0xffd98a))
    this.studyDormer.add(this.add.rectangle(awX - 7, awY + 3, 5, 4, 0x73c9a2, 0.72))
    this.studyDormer.add(this.add.rectangle(awX + 7, awY + 3, 5, 4, 0x73c9a2, 0.72))
    for (const mx of aw.mullionsX) this.studyDormer.add(this.add.rectangle(awX + mx, awY, 1, aw.h, 0x6e4529))
    this.studyDormer.add(this.add.rectangle(awX, HOME.y + aw.transomY, aw.w, 1, 0x6e4529))
    const skX = HOME.x + COTTAGE_META.skylight.dx, skY = HOME.y + COTTAGE_META.skylight.dy
    this.studyDormer.add(this.add.ellipse(skX, skY, 14, 14, 0xffd98a, 0.14))
    this.studyDormer.add(this.add.ellipse(skX, skY, 6, 6, 0xffd98a))
    this.studyDormer.add(this.add.rectangle(skX, skY, 1, 6, 0x6e4529))
    this.studyDormer.add(this.add.rectangle(skX, skY, 6, 1, 0x6e4529))
    const beamY = TOWER.y - 84
    this.towerBeam = this.add.graphics({ x: TOWER.x, y: beamY })
    this.nightLights.add(this.towerBeam)
    for (let r = 32; r > 4; r -= 5) {
      const e = this.add.ellipse(TOWER.x, beamY, r * 2, r, this.towerColor, .055)
      this.towerGlowLayers.push(e)
      this.nightLights.add(e)
    }
    this.towerGlass = this.add.rectangle(TOWER.x, beamY, 14, 15, this.towerColor)
    this.nightLights.add(this.towerGlass)
    this.nightLights.add(this.add.rectangle(TOWER.x, beamY, 2, 15, 0x454b57))
    this.redrawTowerBeam(0)
  }

  private applyLighthouseColor(hex: string): void {
    const parsed = Number.parseInt(hex.replace('#', ''), 16)
    if (!Number.isFinite(parsed)) return
    this.towerColor = parsed
    this.towerGlass?.setFillStyle(parsed)
    this.towerDayBeacon?.setFillStyle(parsed, .32)
    this.towerGlowLayers.forEach(e => e.setFillStyle(parsed, .055))
  }

  private redrawTowerBeam(angle: number): void {
    if (!this.towerBeam) return
    this.towerBeam.clear()
    const spread = 0.24
    const len = 110
    const x1 = Math.cos(angle - spread) * len
    const y1 = Math.sin(angle - spread) * len * 0.52
    const x2 = Math.cos(angle + spread) * len
    const y2 = Math.sin(angle + spread) * len * 0.52
    this.towerBeam.fillStyle(this.towerColor, 0.11).fillTriangle(0, 0, x1, y1, x2, y2)
    this.towerBeam.fillStyle(this.towerColor, 0.08).fillTriangle(0, 0, x1 * 0.55, y1 * 0.55, x2 * 0.55, y2 * 0.55)
  }

  update(time: number, delta: number): void {
    if (!this.player?.active) return
    let dx = 0, dy = 0
    if (!this.panelOpen && !this.leaving) {
      dx = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown)
      dy = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown)
      if (!dx && !dy) { dx = this.moveInput.x; dy = this.moveInput.y }
      if (dx || dy) this.tapTarget = null
      else if (this.tapTarget) {
        dx = this.tapTarget.x - this.player.x; dy = this.tapTarget.y - this.player.y
        if (Math.hypot(dx, dy) < 2.5) { this.tapTarget = null; dx = 0; dy = 0 }
      }
    }
    this.player.setVelocity(0, 0)
    const norm = Math.hypot(dx, dy)
    let moved = false
    if (norm > 0.01) {
      const dt = Math.min(50, delta) / 1000
      const step = this.tapTarget ? Math.min(norm, 74 * dt) : 74 * dt
      const nx = Phaser.Math.Clamp(this.player.x + (dx / norm) * step, 8, WORLD.width - 8)
      const ny = Phaser.Math.Clamp(this.player.y + (dy / norm) * step, 8, WORLD.height - 8)
      // Predictive axial sliding: glides smoothly along trees/house/shore with zero bounce-back jitter
      if (this.walkable(nx, ny)) {
        this.player.setPosition(nx, ny); moved = true
      } else if (Math.abs(nx - this.player.x) > 0.02 && this.walkable(nx, this.player.y)) {
        this.player.setPosition(nx, this.player.y); moved = true
      } else if (Math.abs(ny - this.player.y) > 0.02 && this.walkable(this.player.x, ny)) {
        this.player.setPosition(this.player.x, ny); moved = true
      } else if (this.tapTarget) {
        this.tapTarget = null
      }
      this.facingDir = pickFacing(this.facingDir, dx, dy)
    }
    if (moved) this.walkClock += Math.min(50, delta)
    else this.walkClock = 0
    this.player.setDepth(this.player.y)
    this.player.setTexture(CHARACTER_ATLAS, actorFrame(this.identity.character, this.facingDir, !this.reducedMotion.matches && moved, this.walkClock)).setFlipX(false)
    this.destination.setVisible(!!this.tapTarget && !this.panelOpen && !this.leaving)
    this.shadow.setPosition(this.player.x, this.player.y - 1)
    if (this.reducedMotion.matches) {
      if (this.waveFrame !== 0) {
        this.waveFrame = 0
        this.shoreWave.setTexture('island-waves-0')
      }
      for (const r of this.ripples) {
        r.img.setX(r.baseX).setAlpha(0.7)
      }
      if (this.mailboxBadge?.visible) this.mailboxBadge.setY(MAIL.y - 33)
    } else {
      const nextWave = Math.floor(time / 270) % ISLAND_WAVE_FRAMES
      if (nextWave !== this.waveFrame) {
        this.waveFrame = nextWave
        this.shoreWave.setTexture(`island-waves-${nextWave}`)
      }
      for (let i = 0; i < this.ripples.length; i++) {
        const r = this.ripples[i]
        const frame = Math.floor((time + i * 211) / 520) % 3
        r.img.setTexture(`ripple-v4-${frame}`)
        r.img.setX(Math.round(r.baseX + Math.sin(time * 0.00095 + r.phase) * r.drift))
        r.img.setAlpha(0.48 + (Math.sin(time * 0.0018 + r.phase) * 0.5 + 0.5) * 0.4)
      }
      if (this.mailboxBadge?.visible) {
        this.mailboxBadge.setY(MAIL.y - 33 - (Math.floor(time / 440) % 2) * 2)
      }
    }
    // Coastal sea-breeze canopy sway + occasional drifting leaves + lighthouse sweep beam
    if (!this.reducedMotion.matches) {
      for (const tree of this.canopies) {
        const wave = Math.sin(time * 0.0015 + tree.phase) + Math.sin(time * 0.0007 + tree.phase * 0.5) * 0.4
        tree.img.setRotation(wave * tree.amp)
        tree.img.setX(tree.baseX + wave * 0.55)
      }
      for (const lf of this.windLeaves) {
        lf.life = (lf.life + delta) % lf.maxLife
        const p = lf.life / lf.maxLife
        if (p < 0.42) {
          const t = p / 0.42
          lf.img.setPosition(lf.originX + t * 28 * lf.drift + Math.sin(t * 7) * 3, lf.originY + t * 24)
          lf.img.setAlpha(Math.sin(t * Math.PI) * 0.85).setRotation(t * 2.4)
        } else {
          lf.img.setAlpha(0)
        }
      }
      if (this.nightLights?.visible) this.redrawTowerBeam(Math.sin(time * 0.00055) * 0.95 + 0.35)
      const cx0 = HOME.x + COTTAGE_META.chimneyTop.dx
      const cy0 = HOME.y + COTTAGE_META.chimneyTop.dy
      for (const puff of this.chimneySmoke) {
        const t = ((time * 0.00016 + puff.phase) % 1 + 1) % 1
        const size = t < 0.45 ? 3 : 4
        puff.img
          .setPosition(Math.round(cx0 + t * 9 + Math.sin(t * 6) * 1.5), Math.round(cy0 - t * 18))
          .setSize(size, size)
          .setAlpha(Math.sin(t * Math.PI) * 0.48)
      }
    } else {
      for (const puff of this.chimneySmoke) puff.img.setAlpha(0)
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
    if (!onDock && landDistance(x, y - 1) > .967) return false
    return !OBSTACLES.some(o => x + 4 > o.x && x - 4 < o.x + o.w && y > o.y && y - 4 < o.y + o.h)
  }
  private updatePrompt(force = false): void {
    this.promptTarget = this.leaving ? null : this.interactables
      .filter(it => Math.hypot(it.x - this.player.x, it.y - this.player.y) < 34)
      .sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y))[0] ?? null
    const label = this.panelOpen
      ? null
      : this.promptTarget
        ? this.promptTarget.event === 'mailbox' && this.unreadLetters > 0
          ? `${this.promptTarget.label} · ${this.unreadLetters} 封未拆`
          : this.promptTarget.event === 'interior' && this.studyCompanionNote
            ? `回家 · ${this.studyCompanionNote}`
            : this.promptTarget.label
        : null
    if (label !== this.interactionLabel || force) {
      this.interactionLabel = label
      eventBus.emit('INTERACTION_CHANGED', { label })
    }
    this.prompt.setVisible(!!this.promptTarget && !this.panelOpen)
    if (!this.promptTarget) return
    this.promptText.setText(`${label ?? this.promptTarget.label}  ·  E / 轻点`)
    const width = this.promptText.width + 20
    this.promptBg.clear().fillStyle(0x8a5a38).fillRoundedRect(-width / 2 - 1, -19, width + 2, 38, 3)
      .fillStyle(0xfdf6e9).fillRoundedRect(-width / 2, -18, width, 36, 3)
      .fillTriangle(-4, 18, 4, 18, 0, 23)
    this.prompt.setPosition(this.promptTarget.x, this.promptTarget.y - 44)
  }
  private tryInteract(): void {
    if (this.panelOpen || this.leaving || !this.promptTarget) return
    if (this.promptTarget.event === 'mailbox') eventBus.emit('OPEN_MAILBOX', { unread: 0 })
    else if (this.promptTarget.event === 'lighthouse') eventBus.emit('OPEN_LIGHTHOUSE', {})
    else if (this.promptTarget.event === 'bottle') eventBus.emit('OPEN_BOTTLE', { id: 'shore' })
    else if (this.promptTarget.event === 'interior') eventBus.emit('TRAVEL_REQUEST', { from: 'island', to: 'interior', returnPoint: { x: HOME.x, y: HOME.y + 16 } })
    else eventBus.emit('TRAVEL_REQUEST', { from: 'island', to: 'seaside', returnPoint: { ...SEASIDE_RETURN } })
  }
  private updateDayNight(): void {
    const now = new Date(), h = now.getHours() + now.getMinutes() / 60, phase = phaseAtHour(h)
    this.tintOverlay.fillColor = tintAtHour(PHASE_OVERRIDE ? ({ day: 12, dusk: 18, dawn: 6.5, night: 22 }[phase]) : h)
    this.nightLights.setVisible(phase !== 'day')
    eventBus.emit('DAY_TICK', { time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, phase })
  }
}
