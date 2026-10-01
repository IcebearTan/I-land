import Phaser from 'phaser'
import { eventBus, type IslandIdentity, type SeasideState } from '../EventBus'
import { createSeasideArt, paintSeaside, seasideLayout, SEASIDE_BACKDROP, SEASIDE_MAX } from '../art/seaside'
import { LocalSceneryClock, type SceneryClock } from '../../seaside/clock'

const PREVIEW_HOUR: Record<string, number> = { day: 12, dawn: 6.3, dusk: 18, night: 22 }

/** 静静坐着看海。景色时钟可替换，人物/声音速度保持真实时间。 */
export class SeasideScene extends Phaser.Scene {
  private identity: IslandIdentity = { character: 'bear', display: '小熊' }
  private clock!: SceneryClock
  private backdrop!: Phaser.GameObjects.Image
  private actor!: Phaser.GameObjects.Image
  private pose: SeasideState['pose'] = 'arriving'
  private panelOpen = false
  private travelling = false
  private width = 0
  private height = 0
  private elapsed = 0
  private paintTimer = 0
  private stateTimer = 0
  private visualHour = 0
  private resetBlend?: { from: number; at: number }
  private arrivalTween?: Phaser.Tweens.Tween
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  constructor() { super('Seaside') }

  init(identity: IslandIdentity): void {
    this.identity = { ...identity }
    const preview = new URLSearchParams(window.location.search).get('phase')
    this.clock = new LocalSceneryClock(Date.now(), performance.now(), preview ? PREVIEW_HOUR[preview] : undefined)
    this.pose = 'arriving'; this.panelOpen = false; this.travelling = false
    this.elapsed = 0; this.paintTimer = 0; this.stateTimer = 0
    this.resetBlend = undefined
    this.visualHour = this.clock.read(performance.now()).hour
  }

  create(): void {
    createSeasideArt(this)
    this.fit()
    this.paint()
    this.backdrop = this.add.image(0, 0, SEASIDE_BACKDROP).setOrigin(0).setCrop(0, 0, this.width, this.height)
    const layout = seasideLayout(this.width, this.height), seat = this.seat()
    this.actor = this.add.image(seat + 22, layout.seatY + 46, `seaside-${this.identity.character}-standing`).setOrigin(.5, 1).setDepth(10)
    this.arrive(1400)
    const onAction = ({ action }: { action: 'sit' | 'stand' }) => {
      if (this.panelOpen || this.travelling || this.pose === 'arriving') return
      if (action === 'sit' && this.pose === 'standing') this.arrive(500)
      if (action === 'stand' && this.pose === 'seated') {
        this.pose = 'standing'; this.placeActor(); this.publish()
      }
    }
    const onClock = (request: { action: 'rate'; rate: 0 | 1 | 30 | 120 } | { action: 'reset' }) => {
      if (this.panelOpen || this.travelling) return
      const mono = performance.now()
      if (request.action === 'reset') {
        this.resetBlend = this.reducedMotion.matches ? undefined : { from: this.visualHour, at: mono }
        this.clock.reset(Date.now(), mono)
      }
      else this.clock.setRate(request.rate, mono)
      this.paint(); this.publish()
    }
    const onOpen = () => { this.panelOpen = true; this.input.keyboard!.resetKeys(); this.input.keyboard!.enabled = false; this.input.keyboard!.disableGlobalCapture() }
    const onClose = () => { this.panelOpen = false; this.input.keyboard!.enabled = true }
    const onIdentity = (identity: IslandIdentity) => {
      this.identity = { ...identity }; this.placeActor(); this.paint(); this.publish()
    }
    const onScene = ({ scene, transitioning }: { scene: string; transitioning: boolean }) => {
      if (scene !== 'seaside') return
      this.travelling = transitioning
      if (transitioning) { this.arrivalTween?.stop(); this.input.keyboard!.resetKeys() }
    }
    const onMotion = () => {
      if (!this.travelling && this.reducedMotion.matches && this.pose === 'arriving') { this.arrivalTween?.stop(); this.pose = 'seated'; this.placeActor(); this.publish() }
      this.paint()
    }
    const keys = this.input.keyboard!.addKeys('E,SPACE,ESC', false) as Record<string, Phaser.Input.Keyboard.Key>
    this.input.keyboard!.enabled = true
    this.input.keyboard!.disableGlobalCapture()
    const onKey = (event: KeyboardEvent) => {
      if (this.panelOpen || this.travelling) return
      if (event.target instanceof HTMLElement && event.target.closest('button,input,textarea,select,[contenteditable]')) return
      if (event.code === 'Escape') eventBus.emit('TRAVEL_REQUEST', { from: 'seaside', to: 'island' })
      if (event.code === 'Space' || event.code === 'KeyE') onAction({ action: this.pose === 'seated' ? 'stand' : 'sit' })
    }
    const onBlur = () => this.input.keyboard!.resetKeys()
    const requestState = () => this.publish()
    eventBus.on('SEASIDE_ACTION', onAction); eventBus.on('SEASIDE_CLOCK_REQUEST', onClock)
    eventBus.on('SEASIDE_REQUEST_STATE', requestState); eventBus.on('IDENTITY_CHANGED', onIdentity)
    eventBus.on('PANEL_OPENED', onOpen); eventBus.on('PANEL_CLOSED', onClose); eventBus.on('SCENE_CHANGED', onScene)
    this.input.keyboard!.on('keydown', onKey)
    this.game.events.on('blur', onBlur)
    this.scale.on('resize', this.resize, this)
    this.reducedMotion.addEventListener('change', onMotion)
    let disposed = false
    const cleanup = () => {
      if (disposed) return
      disposed = true
      this.arrivalTween?.stop(); this.arrivalTween = undefined
      eventBus.off('SEASIDE_ACTION', onAction); eventBus.off('SEASIDE_CLOCK_REQUEST', onClock)
      eventBus.off('SEASIDE_REQUEST_STATE', requestState); eventBus.off('IDENTITY_CHANGED', onIdentity)
      eventBus.off('PANEL_OPENED', onOpen); eventBus.off('PANEL_CLOSED', onClose); eventBus.off('SCENE_CHANGED', onScene)
      this.input.keyboard!.off('keydown', onKey); this.input.keyboard!.resetKeys(); this.input.keyboard!.disableGlobalCapture()
      Object.values(keys).forEach(key => this.input.keyboard!.removeKey(key, true, true))
      this.game.events.off('blur', onBlur); this.scale.off('resize', this.resize, this)
      this.reducedMotion.removeEventListener('change', onMotion)
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup)
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup)
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
    if (!this.reducedMotion.matches) this.cameras.main.fadeIn(350)
    this.publish()
    eventBus.emit('SCENE_READY', { scene: 'seaside', identity: this.identity })
  }

  private fit(): void {
    const { width, height } = this.scale.gameSize
    const zoom = Math.max(2, Math.ceil(width / SEASIDE_MAX), Math.ceil(height / SEASIDE_MAX))
    this.width = Math.max(1, Math.ceil(width / zoom)); this.height = Math.max(1, Math.ceil(height / zoom))
    this.cameras.main.setZoom(zoom).centerOn(this.width / 2, this.height / 2)
  }

  private resize(): void {
    const wasArriving = this.pose === 'arriving'
    this.arrivalTween?.stop(); this.fit(); this.paint()
    this.backdrop.setCrop(0, 0, this.width, this.height)
    this.placeActor()
    if (wasArriving && !this.travelling) this.arrive(350)
  }

  private seat(): number { return seasideLayout(this.width, this.height).seats[this.identity.character === 'bear' ? 0 : 1] }

  private placeActor(): void {
    const { seatY, standingY } = seasideLayout(this.width, this.height)
    this.actor.setPosition(this.seat(), this.pose === 'seated' ? seatY + 2 : standingY)
    this.actor.setTexture(`seaside-${this.identity.character}-${this.pose === 'seated' ? 'seated' : 'standing'}`)
  }

  private arrive(duration: number): void {
    this.pose = 'arriving'
    if (this.reducedMotion.matches) { this.pose = 'seated'; this.placeActor(); this.publish(); return }
    const { standingY } = seasideLayout(this.width, this.height)
    this.arrivalTween?.stop()
    this.arrivalTween = this.tweens.add({ targets: this.actor, x: this.seat(), y: standingY, duration, ease: 'Sine.easeInOut', onComplete: () => {
      if (this.travelling) return
      this.pose = 'seated'; this.placeActor(); this.publish()
    } })
    this.publish()
  }

  private paint(): void {
    const mono = performance.now(), clock = this.clock.read(mono)
    this.visualHour = clock.hour
    if (this.resetBlend && !this.reducedMotion.matches) {
      const t = Math.min(1, (mono - this.resetBlend.at) / 1800)
      const distance = ((clock.hour - this.resetBlend.from + 36) % 24) - 12
      this.visualHour = (this.resetBlend.from + distance * (.5 - .5 * Math.cos(Math.PI * t)) + 24) % 24
      if (t === 1) this.resetBlend = undefined
    }
    paintSeaside(this, this.width, this.height, this.visualHour, this.reducedMotion.matches ? 0 : this.elapsed, this.identity.character)
  }

  private publish(): void {
    const clock = this.clock.read(performance.now())
    eventBus.emit('SEASIDE_STATE', { pose: this.pose, clock })
    eventBus.emit('AUDIO_CONTEXT', { scene: 'seaside', night: clock.night, phase: clock.phase })
  }

  update(_time: number, delta: number): void {
    this.elapsed += Math.min(delta, 100)
    if (this.pose === 'arriving' && !this.reducedMotion.matches) this.actor.setTexture(`seaside-${this.identity.character}-standing${Math.floor(this.elapsed / 180) % 2 ? '-step' : ''}`)
    this.paintTimer += delta; this.stateTimer += delta
    if (this.paintTimer > (this.reducedMotion.matches ? 3000 : 500)) { this.paintTimer = 0; this.paint() }
    if (this.stateTimer > 500) { this.stateTimer = 0; this.publish() }
  }
}
