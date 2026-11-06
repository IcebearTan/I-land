import Phaser from 'phaser'
import { CHARACTERS } from '../../characters'
import { nightWeight } from '../../audio/types'
import { homeRoute, homeSegmentClear, homeWalkable, type Point, type Rect } from '../../interior/navigation'
import { eventBus, type GameEvents, type InteriorState, type IslandIdentity, type Phase, type SceneState } from '../EventBus'
import { makeTexture } from '../pixels'
import { createInteriorArt, HOME_LAYOUT, paintInteriorBackdrop, paintInteriorTV } from '../art/interior'

type Interaction = { point: Point; label: string; kind: 'fireplace' | 'tv' | 'sofa' | 'door'; seat?: 0 | 1 }
const CHANNELS = ['海风小岛', '海上月亮', '猫咪午后'] as const
const contains = (rect: Rect, p: Point) => p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const inUI = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('button, input, textarea, select, a, [contenteditable="true"], [role="button"]')

/** 首版客厅：位置与家具留在 Phaser，只经事件总线报告自己的坐姿和电视。 */
export class InteriorScene extends Phaser.Scene {
  private identity: IslandIdentity = { character: 'bear', display: '小熊' }
  private player!: Phaser.GameObjects.Sprite
  private shadow!: Phaser.GameObjects.Ellipse
  private fire!: Phaser.GameObjects.Image
  private screen!: Phaser.GameObjects.Image
  private fireGlow!: Phaser.GameObjects.Ellipse
  private destination!: Phaser.GameObjects.Graphics
  private prompt!: Phaser.GameObjects.Container
  private promptText!: Phaser.GameObjects.Text
  private promptBg!: Phaser.GameObjects.Graphics
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private pose: InteriorState['pose'] = 'walking'
  private seat: 0 | 1 | null = null
  private television = false
  private channel: InteriorState['channel'] = 0
  private phase: Phase = 'day'
  private hour = 12
  private panelOpen = false
  private leaving = false
  private disposed = false
  private moveInput = { x: 0, y: 0 }
  private path: Point[] = []
  private arrival?: () => void
  private facing: 'front' | 'back' | 'side' = 'front'
  private flip = false
  private interaction: Interaction | null = null
  private lastLabel: string | null = null
  private nearTV = false
  private notice?: string
  private noticeTimer?: Phaser.Time.TimerEvent
  private noticeEpoch = 0
  private seatTween?: Phaser.Tweens.Tween
  private finishMotion?: () => void
  private motionReturn?: Point
  private tvTween?: Phaser.Tweens.Tween
  private actionEpoch = 0
  private tvEpoch = 0
  private clockTimer = 0
  private tvTimer = 0
  private backdropKey = -1
  private elapsed = 0
  private programStart = 0
  private fireBoostUntil = 0
  private cameraCenter: Point = { x: 160, y: 120 }
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  constructor() { super('Interior') }

  init(identity?: IslandIdentity): void {
    this.identity = identity ? { ...identity } : { character: 'bear', display: '小熊' }
  }

  create(): void {
    this.disposed = false; this.leaving = false; this.panelOpen = false
    this.pose = 'walking'; this.seat = null; this.television = false; this.channel = 0
    this.path = []; this.arrival = undefined; this.moveInput = { x: 0, y: 0 }
    this.notice = undefined; this.lastLabel = null; this.interaction = null; this.nearTV = false
    this.noticeEpoch++
    this.elapsed = 0; this.programStart = 0; this.fireBoostUntil = 0
    this.clockTimer = 0; this.tvTimer = 0; this.backdropKey = -1; this.facing = 'front'; this.flip = false
    this.seatTween = undefined; this.tvTween = undefined; this.finishMotion = undefined; this.motionReturn = undefined
    this.cameras.main.setBackgroundColor('#2b1b45')
    createInteriorArt(this)
    for (const [id, character] of Object.entries(CHARACTERS)) for (const direction of ['front', 'back', 'side'] as const) {
      makeTexture(this, `islander-${id}-${direction}`, character.frames[direction], character.palette)
      makeTexture(this, `islander-${id}-${direction}-step`, character.steps[direction], character.palette)
    }
    this.readClock()
    this.add.image(0, 0, 'home-backdrop').setOrigin(0).setDepth(0)
    this.add.image(0, 0, 'home-sofa-front').setOrigin(0).setDepth(HOME_LAYOUT.sofa.y + HOME_LAYOUT.sofa.h)
    this.screen = this.add.image(HOME_LAYOUT.tvScreen.x, HOME_LAYOUT.tvScreen.y, 'home-tv').setOrigin(0).setDepth(90)
    this.fire = this.add.image(HOME_LAYOUT.fire.x, HOME_LAYOUT.fire.y, 'home-fire-0').setOrigin(0).setDepth(96)
    this.fireGlow = this.add.ellipse(74, 123, 55, 20, 0xffd98a, .08).setDepth(1)
    this.player = this.add.sprite(HOME_LAYOUT.door.x, HOME_LAYOUT.door.y, `islander-${this.identity.character}-front`).setOrigin(.5, 1)
    this.shadow = this.add.ellipse(this.player.x, this.player.y - 1, 12, 4, 0x4a3b55, .23).setDepth(1)
    this.destination = this.add.graphics().setDepth(2).setVisible(false)
    this.destination.lineStyle(1, 0xfdf6e9).strokeEllipse(0, 0, 12, 5)
    this.promptBg = this.add.graphics()
    this.promptText = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '8px', color: '#4a3b55', resolution: 3 }).setOrigin(.5)
    const promptZone = this.add.zone(0, 0, 126, 24).setInteractive({ useHandCursor: true })
    this.prompt = this.add.container(0, 0, [this.promptBg, this.promptText, promptZone]).setDepth(500).setVisible(false)
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>
    this.input.keyboard!.enabled = true; this.input.keyboard!.disableGlobalCapture(); this.input.keyboard!.resetKeys()

    const onPointer = (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
      if (this.blocked() || objects.length) return
      const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
      const furniture = this.clickedFurniture(p)
      if (furniture) { this.goTo(furniture.point, () => this.interact(furniture), furniture.kind === 'sofa' ? furniture.seat : undefined); return }
      if (!homeWalkable(HOME_LAYOUT, p.x, p.y)) { this.say('沿着空着的木地板走一走吧。'); return }
      if (this.pose === 'seated') this.stand(() => this.goTo(p))
      else this.goTo(p)
    }
    const onPrompt = () => this.tryInteract()
    const onMove = (value: { x: number; y: number }) => {
      if (this.blocked() || this.pose === 'seated') return
      const x = Number.isFinite(value.x) ? Phaser.Math.Clamp(value.x, -1, 1) : 0
      const y = Number.isFinite(value.y) ? Phaser.Math.Clamp(value.y, -1, 1) : 0
      if (x || y) this.cancelAction()
      this.moveInput = { x, y }
    }
    const onInteract = () => this.tryInteract()
    const onState = () => { if (!this.disposed && !this.leaving) { this.publish(); this.updatePrompt(true) } }
    const onInteractionState = () => { if (!this.disposed) this.updatePrompt(true) }
    const onAction = (value: GameEvents['INTERIOR_ACTION']) => {
      if (this.blocked()) return
      if (value.action === 'stand') this.stand()
      else if (this.pose === 'seated' || (this.pose === 'walking' && distance(this.player, HOME_LAYOUT.tv) < 28)) this.changeTV(value.action)
    }
    const onOpen = () => {
      this.panelOpen = true; this.clearInput(); this.cancelAction(); this.updatePrompt(true)
      this.input.keyboard!.enabled = false; this.input.keyboard!.disableGlobalCapture()
    }
    const onClose = () => {
      this.panelOpen = false; this.clearInput()
      if (!this.leaving) { this.input.keyboard!.enabled = true; this.publish(); this.updatePrompt(true) }
    }
    const onBlur = () => { this.clearInput(); this.cancelAction() }
    const onVisibility = () => { if (document.hidden) onBlur() }
    const onIdentity = (value: IslandIdentity) => { this.identity = { ...value }; this.drawPlayer(); this.publish() }
    const onScene = (value: SceneState) => {
      if (value.scene === 'interior' && value.transitioning) {
        this.leaving = true; this.clearInput(); this.stopActivities(); this.updatePrompt(true)
        this.input.keyboard!.enabled = false; this.input.keyboard!.disableGlobalCapture()
      }
    }
    const onKeyboard = (e: KeyboardEvent) => {
      if (this.blocked() || e.repeat || inUI(e.target)) return
      if (e.code === 'Escape') this.returnToIsland()
      if (e.code === 'KeyE' || e.code === 'Space') this.tryInteract()
    }
    const onReduced = () => {
      if (this.reducedMotion.matches) {
        const finish = this.finishMotion; this.seatTween?.stop(); this.seatTween = undefined; finish?.()
        this.tvEpoch++; this.tvTween?.stop(); this.tvTween = undefined; this.screen.setAlpha(1)
        this.fireBoostUntil = 0
      }
      this.drawTV(); this.drawPlayer()
    }
    this.input.on('pointerdown', onPointer); promptZone.on('pointerdown', onPrompt)
    this.input.keyboard!.on('keydown', onKeyboard)
    this.scale.on('resize', this.fitView, this); this.game.events.on('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility); this.reducedMotion.addEventListener('change', onReduced)
    eventBus.on('MOVE_INPUT', onMove); eventBus.on('INTERACT', onInteract)
    eventBus.on('INTERACTION_REQUEST_STATE', onInteractionState)
    eventBus.on('INTERIOR_ACTION', onAction); eventBus.on('INTERIOR_REQUEST_STATE', onState)
    eventBus.on('PANEL_OPENED', onOpen); eventBus.on('PANEL_CLOSED', onClose)
    eventBus.on('IDENTITY_CHANGED', onIdentity); eventBus.on('SCENE_CHANGED', onScene)
    const cleanup = () => {
      if (this.disposed) return
      this.disposed = true; this.leaving = true; this.clearInput(); this.stopActivities()
      this.noticeEpoch++
      this.noticeTimer?.remove(false); this.noticeTimer = undefined
      this.input.off('pointerdown', onPointer); promptZone.off('pointerdown', onPrompt)
      this.input.keyboard!.off('keydown', onKeyboard)
      Object.values(this.keys).forEach(key => this.input.keyboard!.removeKey(key))
      this.input.keyboard!.disableGlobalCapture()
      this.scale.off('resize', this.fitView, this); this.game.events.off('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility); this.reducedMotion.removeEventListener('change', onReduced)
      eventBus.off('MOVE_INPUT', onMove); eventBus.off('INTERACT', onInteract)
      eventBus.off('INTERACTION_REQUEST_STATE', onInteractionState)
      eventBus.off('INTERIOR_ACTION', onAction); eventBus.off('INTERIOR_REQUEST_STATE', onState)
      eventBus.off('PANEL_OPENED', onOpen); eventBus.off('PANEL_CLOSED', onClose)
      eventBus.off('IDENTITY_CHANGED', onIdentity); eventBus.off('SCENE_CHANGED', onScene)
      eventBus.emit('INTERACTION_CHANGED', { label: null })
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup); this.events.off(Phaser.Scenes.Events.DESTROY, cleanup)
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup); this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
    this.fitView(); this.drawTV(); this.drawPlayer(); this.updatePrompt(true); this.publish()
    if (!this.reducedMotion.matches) this.cameras.main.fadeIn(280)
    eventBus.emit('SCENE_READY', { scene: 'interior', identity: { ...this.identity } })
  }

  private blocked(): boolean { return this.disposed || this.leaving || this.panelOpen }
  private clearInput(): void { this.moveInput = { x: 0, y: 0 }; this.input.keyboard?.resetKeys() }

  private stopActivities(): void {
    this.actionEpoch++; this.tvEpoch++; this.path = []; this.arrival = undefined
    this.seatTween?.stop(); this.seatTween = undefined; this.finishMotion = undefined
    this.tvTween?.stop(); this.tvTween = undefined
    this.destination?.setVisible(false)
  }

  private cancelAction(): void {
    this.actionEpoch++; this.path = []; this.arrival = undefined
    this.seatTween?.stop(); this.seatTween = undefined; this.finishMotion = undefined
    if (this.pose === 'approaching') {
      if (this.motionReturn) this.player.setPosition(this.motionReturn.x, this.motionReturn.y)
      // 起身被失焦、面板或方向输入打断后，进度文案也必须随动作结束。
      this.notice = undefined
      this.pose = 'walking'; this.seat = null; this.motionReturn = undefined; this.drawPlayer(); this.publish()
    }
    this.destination?.setVisible(false)
  }

  private goTo(point: Point, action?: () => void, seat?: 0 | 1): void {
    if (this.blocked()) return
    if (this.pose === 'seated') { this.stand(() => this.goTo(point, action, seat)); return }
    this.cancelAction()
    const route = homeRoute(HOME_LAYOUT, this.player, point)
    if (!route) { this.say('这里暂时走不过去，换个空地方试试。'); return }
    this.path = route; this.arrival = action; this.notice = undefined
    if (seat !== undefined) { this.pose = 'approaching'; this.seat = seat; this.publish() }
    this.destination.setPosition(point.x, point.y).setVisible(true)
  }

  private clickedFurniture(point: Point): Interaction | null {
    if (contains(HOME_LAYOUT.sofa, point)) {
      const seat: 0 | 1 = point.x < (HOME_LAYOUT.seats[0].x + HOME_LAYOUT.seats[1].x) / 2 ? 0 : 1
      return { kind: 'sofa', seat, point: HOME_LAYOUT.standPoints[seat], label: '坐一会儿' }
    }
    if (contains({ x: 128, y: 45, w: 74, h: 68 }, point)) return { kind: 'tv', point: HOME_LAYOUT.tv, label: '电视 · 开关' }
    if (contains({ x: 34, y: 30, w: 78, h: 83 }, point)) return { kind: 'fireplace', point: HOME_LAYOUT.fireplace, label: '拨一拨炉火' }
    if (contains({ x: 252, y: 214, w: 40, h: 20 }, point)) return { kind: 'door', point: HOME_LAYOUT.door, label: '回到小岛' }
    return null
  }

  private tryInteract(): void {
    if (this.blocked()) return
    if (this.pose === 'seated') { this.stand(); return }
    if (this.pose === 'approaching') return
    this.updatePrompt()
    if (this.interaction) this.interact(this.interaction)
  }

  private interact(value: Interaction): void {
    if (this.blocked() || distance(this.player, value.point) > 29) return
    this.path = []; this.arrival = undefined; this.destination.setVisible(false)
    if (value.kind === 'door') this.returnToIsland()
    else if (value.kind === 'fireplace') { this.fireBoostUntil = this.elapsed + 1600; this.say('炉火暖了一些，慢慢待着就好。') }
    else if (value.kind === 'tv') this.changeTV('tv-toggle')
    else this.sit(value.seat ?? 0)
  }

  private sit(seat: 0 | 1): void {
    if (this.pose === 'seated') return
    // E 触发也先走到相应起身点，不能隔着家具直接穿进去。
    if (distance(this.player, HOME_LAYOUT.standPoints[seat]) > 2) {
      this.goTo(HOME_LAYOUT.standPoints[seat], () => this.sit(seat), seat); return
    }
    this.clearInput(); this.pose = 'approaching'; this.seat = seat
    this.motionReturn = { ...HOME_LAYOUT.standPoints[seat] }
    const epoch = ++this.actionEpoch, target = HOME_LAYOUT.seats[seat]
    const complete = () => {
      if (this.blocked() || epoch !== this.actionEpoch) return
      this.seatTween = undefined; this.finishMotion = undefined; this.motionReturn = undefined
      this.player.setPosition(target.x, target.y); this.pose = 'seated'; this.drawPlayer(); this.publish(); this.updatePrompt(true)
    }
    this.facing = 'back'; this.flip = false; this.finishMotion = complete; this.publish()
    if (this.reducedMotion.matches) { complete(); return }
    this.seatTween = this.tweens.add({ targets: this.player, x: target.x, y: target.y, duration: 460, ease: 'Sine.easeInOut', onComplete: complete })
  }

  private stand(after?: () => void): void {
    if (this.blocked() || this.pose !== 'seated' || this.seat === null) return
    const target = HOME_LAYOUT.standPoints[this.seat], epoch = ++this.actionEpoch
    this.pose = 'approaching'; this.motionReturn = { ...target }; this.notice = '慢慢起身…'
    const complete = () => {
      if (this.blocked() || epoch !== this.actionEpoch) return
      this.seatTween = undefined; this.finishMotion = undefined; this.motionReturn = undefined
      this.player.setPosition(target.x, target.y); this.pose = 'walking'; this.seat = null; this.notice = undefined
      this.facing = 'front'; this.flip = false; this.drawPlayer(); this.publish(); this.updatePrompt(true); after?.()
    }
    this.finishMotion = complete; this.publish()
    if (this.reducedMotion.matches) { complete(); return }
    this.seatTween = this.tweens.add({ targets: this.player, x: target.x, y: target.y, duration: 350, ease: 'Sine.easeInOut', onComplete: complete })
  }

  private changeTV(action: 'tv-toggle' | 'tv-next'): void {
    if (action === 'tv-next' && !this.television) return
    if (action === 'tv-toggle') this.television = !this.television
    else this.channel = ((this.channel + 1) % CHANNELS.length) as InteriorState['channel']
    this.programStart = this.elapsed
    const epoch = ++this.tvEpoch
    this.tvTween?.stop(); this.tvTween = undefined
    this.say(this.television ? `正在看「${CHANNELS[this.channel]}」。` : '关掉电视，留一会儿炉火声。')
    if (this.reducedMotion.matches || !this.television) { this.screen.setAlpha(1); this.drawTV(); return }
    if (action === 'tv-toggle') {
      this.drawTV(); this.screen.setAlpha(0)
      this.tvTween = this.tweens.add({ targets: this.screen, alpha: 1, duration: 400, onComplete: () => { if (!this.disposed && epoch === this.tvEpoch) this.tvTween = undefined } })
    } else {
      this.screen.setAlpha(1)
      this.tvTween = this.tweens.add({ targets: this.screen, alpha: .75, duration: 100, yoyo: true, onYoyo: () => { if (!this.disposed && epoch === this.tvEpoch) this.drawTV() }, onComplete: () => { if (!this.disposed && epoch === this.tvEpoch) { this.tvTween = undefined; this.screen.setAlpha(1) } } })
    }
    this.publish()
  }

  private say(message: string): void {
    this.noticeTimer?.remove(false); this.notice = message; this.publish()
    const epoch = ++this.noticeEpoch
    this.noticeTimer = this.time.delayedCall(2600, () => {
      if (this.disposed || this.leaving || epoch !== this.noticeEpoch) return
      this.notice = undefined; this.noticeTimer = undefined; this.publish()
    })
  }

  private returnToIsland(): void { if (!this.blocked()) eventBus.emit('TRAVEL_REQUEST', { from: 'interior', to: 'island' }) }

  private publish(): void {
    if (this.disposed || this.leaving) return
    eventBus.emit('INTERIOR_STATE', { pose: this.pose, seat: this.seat, television: this.television, channel: this.channel, phase: this.phase, nearTelevision: !this.panelOpen && this.pose === 'walking' && distance(this.player, HOME_LAYOUT.tv) < 28, notice: this.notice })
  }

  private updatePrompt(force = false): void {
    const options: Interaction[] = [
      { kind: 'fireplace', point: HOME_LAYOUT.fireplace, label: '拨一拨炉火' },
      { kind: 'tv', point: HOME_LAYOUT.tv, label: this.television ? '电视 · 关掉' : '电视 · 打开' },
      { kind: 'sofa', seat: 0, point: HOME_LAYOUT.standPoints[0], label: '沙发 · 坐一会儿' },
      { kind: 'sofa', seat: 1, point: HOME_LAYOUT.standPoints[1], label: '沙发 · 坐一会儿' },
      { kind: 'door', point: HOME_LAYOUT.door, label: '回到小岛' },
    ]
    this.interaction = !this.blocked() && this.pose === 'walking'
      ? options.filter(item => distance(this.player, item.point) < 28).sort((a, b) => distance(this.player, a.point) - distance(this.player, b.point))[0] ?? null : null
    const label = this.interaction?.label ?? null
    if (force || label !== this.lastLabel) { this.lastLabel = label; eventBus.emit('INTERACTION_CHANGED', { label }) }
    this.prompt.setVisible(!!this.interaction)
    if (this.interaction) {
      this.promptText.setText(`${label} · E / 轻点`)
      const width = this.promptText.width + 14
      this.promptBg.clear().fillStyle(0x8a5a38).fillRoundedRect(-width / 2 - 1, -10, width + 2, 22, 2)
        .fillStyle(0xfdf6e9).fillRoundedRect(-width / 2, -9, width, 19, 2).fillTriangle(-3, 9, 3, 9, 0, 12)
      const y = this.interaction.kind === 'fireplace' ? 45 : this.interaction.kind === 'tv' ? 35 : this.interaction.kind === 'sofa' ? 140 : this.interaction.point.y - 34
      // 短竖屏的回岛按钮占据顶部 70–114px；提示底板须完整留在它下方。
      const { width: viewWidth, height: viewHeight } = this.scale.gameSize
      const safeY = viewWidth <= 600 ? this.cameraCenter.y + (138 - viewHeight / 2) / this.cameras.main.zoom : -Infinity
      this.prompt.setPosition(this.interaction.point.x, Math.max(y, safeY))
    }
    const near = !this.blocked() && this.pose === 'walking' && distance(this.player, HOME_LAYOUT.tv) < 28
    if (near !== this.nearTV) { this.nearTV = near; this.publish() }
  }

  private readClock(): void {
    const now = new Date(), hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
    const override = new URLSearchParams(window.location.search).get('phase')
    const previews = { day: 12, dawn: 6.5, dusk: 18, night: 22 }
    this.hour = override && override in previews ? previews[override as keyof typeof previews] : hour
    this.phase = this.hour < 5.5 || this.hour >= 20 ? 'night' : this.hour < 8 ? 'dawn' : this.hour < 16.5 ? 'day' : 'dusk'
    // 地板大纹理每五分钟刷新一次；火焰和电视只刷新各自的小纹理。
    const key = Math.floor(this.hour * 12)
    if (key !== this.backdropKey) { this.backdropKey = key; paintInteriorBackdrop(this, this.hour) }
    eventBus.emit('DAY_TICK', { time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, phase: this.phase })
    eventBus.emit('AUDIO_CONTEXT', { scene: 'interior', phase: this.phase, night: nightWeight(this.hour) })
  }

  private drawTV(): void { paintInteriorTV(this, this.channel, this.elapsed - this.programStart, this.reducedMotion.matches, this.television) }
  private drawPlayer(moving = false): void {
    if (!this.player) return
    const step = moving && !this.reducedMotion.matches && Math.floor(this.elapsed / 170) % 2 ? '-step' : ''
    this.player.setTexture(this.pose === 'seated' ? `home-${this.identity.character}-seated` : `islander-${this.identity.character}-${this.facing}${step}`)
      .setFlipX(this.pose === 'seated' ? false : this.flip).setDepth(this.player.y)
    this.shadow?.setPosition(this.player.x, this.player.y - 1).setVisible(this.pose !== 'seated')
  }

  private viewFocus(): Point {
    const { width, height } = this.scale.gameSize
    const zoom = this.cameras.main.zoom, visible = width / zoom
    // 短竖屏行走时为底部摇杆/互动按钮留出空间，门口人物不能藏在按钮后。
    const y = width <= 600 && this.pose !== 'seated'
      ? Math.max(120, this.player.y - (height / 2 - 150) / zoom) : 120
    if (visible >= HOME_LAYOUT.width) return { x: 160, y }
    const x = this.pose === 'seated' ? 134 : Phaser.Math.Clamp(this.player.x, visible / 2, HOME_LAYOUT.width - visible / 2)
    return { x, y }
  }

  private fitView(): void {
    this.clearInput()
    const { width, height } = this.scale.gameSize
    const zoom = Math.max(2, Math.min(4, Math.floor(width / HOME_LAYOUT.width), Math.floor((height - 96) / HOME_LAYOUT.height)))
    this.cameras.main.setZoom(zoom)
    this.cameraCenter = this.viewFocus(); this.cameras.main.centerOn(this.cameraCenter.x, this.cameraCenter.y)
  }

  update(_time: number, delta: number): void {
    if (!this.player?.active || this.disposed) return
    this.elapsed += delta
    let dx = 0, dy = 0, moving = false
    if (!this.blocked() && this.pose !== 'seated' && !this.seatTween) {
      if (!inUI(document.activeElement)) {
        dx = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown)
        dy = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown)
      }
      if (!dx && !dy) { dx = this.moveInput.x; dy = this.moveInput.y }
      if (dx || dy) this.cancelAction()
      else if (this.path.length) {
        const next = this.path[0], d = distance(this.player, next), step = Math.min(80, delta) / 1000 * 58
        if (d <= step) {
          this.player.setPosition(next.x, next.y); this.path.shift()
          if (!this.path.length) { const action = this.arrival; this.arrival = undefined; this.destination.setVisible(false); action?.() }
        } else { dx = next.x - this.player.x; dy = next.y - this.player.y }
      }
      const length = Math.hypot(dx, dy)
      if (length) {
        const step = Math.min(80, delta) / 1000 * 58, next = { x: this.player.x + dx / length * step, y: this.player.y + dy / length * step }
        if (homeSegmentClear(HOME_LAYOUT, this.player, next)) { this.player.setPosition(next.x, next.y); moving = true }
        else if (homeSegmentClear(HOME_LAYOUT, this.player, { x: next.x, y: this.player.y })) { this.player.x = next.x; moving = true }
        else if (homeSegmentClear(HOME_LAYOUT, this.player, { x: this.player.x, y: next.y })) { this.player.y = next.y; moving = true }
        else if (this.path.length) this.cancelAction()
        this.facing = Math.abs(dx) > Math.abs(dy) ? 'side' : dy < 0 ? 'back' : 'front'; this.flip = this.facing === 'side' && dx < 0
      }
    }
    this.drawPlayer(moving || !!this.seatTween); this.updatePrompt()
    const target = this.viewFocus(), amount = this.reducedMotion.matches ? 1 : Math.min(1, delta / 180)
    this.cameraCenter.x += (target.x - this.cameraCenter.x) * amount; this.cameraCenter.y += (target.y - this.cameraCenter.y) * amount
    this.cameras.main.centerOn(this.cameraCenter.x, this.cameraCenter.y)
    const boosted = !this.reducedMotion.matches && this.elapsed < this.fireBoostUntil
    const frame = this.reducedMotion.matches ? 0 : Math.floor(this.elapsed / (boosted ? 190 : 310)) % 4
    this.fire.setTexture(`home-fire-${frame}`)
    this.fireGlow.setAlpha(this.reducedMotion.matches ? .08 : boosted ? .15 : .075 + Math.sin(this.elapsed / 1600) * .015)
    this.clockTimer += delta; this.tvTimer += delta
    if (this.clockTimer >= 1000) { this.clockTimer = 0; this.readClock(); this.publish() }
    if (this.tvTimer >= 160 && !this.tvTween) { this.tvTimer = 0; if (this.television) this.drawTV() }
  }
}
