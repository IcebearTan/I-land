import Phaser from 'phaser'
import { worldZoom } from '../../visual/layout'
import { CHARACTER_ATLAS, CHARACTER_ORIGIN, actorFrame } from '../../visual/artV2'
import { eventBus, type GameEvents, type IslandIdentity, type SeasideState } from '../EventBus'
import { createSeasideArt, paintSeaside, seasideLayout, seasideActorPosition, SEASIDE_BACKDROP } from '../art/seaside'
import { LocalSceneryClock, type SceneryClock } from '../../seaside/clock'
import { RoomClient } from '../rooms/SeasideClient'
import { SharedSceneryClock } from '../../seaside/roomClock'
import type { RoomAccount, RoomMember, RoomSnapshot, RoomTiming, RoomView } from '../../seaside/types'

interface ActorVisual {
  member: RoomMember
  image: Phaser.GameObjects.Image
  arriving: boolean
  generation: number
  tween?: Phaser.Tweens.Tween
}

/** 房间事实来自服务器；景色、入座与依靠仍由独立 canvas 绘制。 */
export class SeasideScene extends Phaser.Scene {
  private identity: IslandIdentity = { character: 'bear', display: '小熊' }
  private clock!: Pick<SceneryClock, 'read'>
  private sharedClock!: SharedSceneryClock
  private room?: RoomClient
  private connection: RoomView = { state: 'joining', pending: false }
  private members: RoomMember[] = []
  private actors = new Map<RoomAccount, ActorVisual>()
  private snapshot?: RoomSnapshot
  private backdrop!: Phaser.GameObjects.Image
  private panelOpen = false
  private travelling = false
  private disposed = false
  private lifetime = 0
  private width = 0
  private height = 0
  private elapsed = 0
  private paintTimer = 0
  private stateTimer = 0
  private visualHour = 0
  private resetBlend?: { from: number; at: number }
  private notice?: { text: string; until: number }
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  constructor() { super('Seaside') }

  init(identity: IslandIdentity): void {
    this.lifetime++
    this.identity = { ...identity }
    this.clock = new LocalSceneryClock(Date.now(), performance.now())
    this.sharedClock = new SharedSceneryClock()
    this.members = []; this.actors = new Map(); this.snapshot = undefined
    this.connection = { state: 'joining', pending: false }
    this.panelOpen = false; this.travelling = false; this.disposed = false
    this.elapsed = 0; this.paintTimer = 0; this.stateTimer = 0
    this.resetBlend = undefined; this.notice = undefined
    this.visualHour = this.clock.read(performance.now()).hour
  }

  create(): void {
    const lifetime = this.lifetime
    createSeasideArt(this); this.fit(); this.paint()
    this.backdrop = this.add.image(0, 0, SEASIDE_BACKDROP).setOrigin(0).setCrop(0, 0, this.width, this.height)
    this.room = new RoomClient({ account: this.account(), onStatus: view => {
      if (lifetime !== this.lifetime || this.disposed || this.travelling) return
      this.connection = view
      // accept() 紧接着交出此包的校时戳；不能先推进旧时钟，再拿更早的戳校时。
      if (view.state === 'connected' && view.snapshot && view.snapshot !== this.snapshot) return
      if (view.state !== 'connected') this.clearActors()
      this.paint(); this.publish()
    }, onSnapshot: (snapshot, timing) => { if (lifetime === this.lifetime) this.receive(snapshot, timing) } })
    const onAction = ({ action }: GameEvents['SEASIDE_ACTION']) => {
      if (!this.canAct() || this.pose() === 'arriving') return
      const pose = action === 'stand' ? 'standing' : action === 'lean' ? 'leaning' : 'seated'
      void this.room?.setPose(pose)
    }
    const onClock = (request: GameEvents['SEASIDE_CLOCK_REQUEST']) => { if (this.canAct()) void this.room?.setClock(request) }
    const retry = () => { if (!this.panelOpen && !this.travelling && !this.disposed) this.room?.retry() }
    const onOpen = () => { this.panelOpen = true; this.input.keyboard!.resetKeys(); this.input.keyboard!.enabled = false; this.input.keyboard!.disableGlobalCapture() }
    const onClose = () => { this.panelOpen = false; this.input.keyboard!.enabled = true }
    const onIdentity = (identity: IslandIdentity) => { this.identity = { ...identity }; this.publish() }
    const onScene = ({ scene, transitioning }: { scene: string; transitioning: boolean }) => {
      if (scene !== 'seaside' || !transitioning) return
      this.travelling = true; this.stopAnimations(); this.input.keyboard!.resetKeys()
      this.room?.dispose()
    }
    const onMotion = () => {
      if (this.travelling || this.disposed) return
      if (this.reducedMotion.matches) { this.stopAnimations(); this.actors.forEach(actor => { actor.arriving = false; this.place(actor) }) }
      this.paint(); this.publish()
    }
    const keys = this.input.keyboard!.addKeys('E,SPACE,ESC', false) as Record<string, Phaser.Input.Keyboard.Key>
    this.input.keyboard!.enabled = true; this.input.keyboard!.disableGlobalCapture()
    const onKey = (event: KeyboardEvent) => {
      if (this.panelOpen || this.travelling) return
      if (event.target instanceof HTMLElement && event.target.closest('button,input,textarea,select,[contenteditable]')) return
      if (event.code === 'Escape') eventBus.emit('TRAVEL_REQUEST', { from: 'seaside', to: 'island' })
      if (event.code === 'Space' || event.code === 'KeyE') onAction({ action: this.pose() === 'standing' ? 'sit' : 'stand' })
    }
    const onBlur = () => this.input.keyboard!.resetKeys()
    const requestState = () => this.publish()
    eventBus.on('SEASIDE_ACTION', onAction); eventBus.on('SEASIDE_CLOCK_REQUEST', onClock)
    eventBus.on('SEASIDE_RECONNECT', retry); eventBus.on('SEASIDE_REQUEST_STATE', requestState)
    eventBus.on('IDENTITY_CHANGED', onIdentity); eventBus.on('PANEL_OPENED', onOpen)
    eventBus.on('PANEL_CLOSED', onClose); eventBus.on('SCENE_CHANGED', onScene)
    this.input.keyboard!.on('keydown', onKey); this.game.events.on('blur', onBlur)
    this.scale.on('resize', this.resize, this); this.reducedMotion.addEventListener('change', onMotion)
    const cleanup = () => {
      if (this.disposed) return
      this.disposed = true; this.lifetime++; this.room?.dispose(); this.room = undefined; this.clearActors()
      eventBus.off('SEASIDE_ACTION', onAction); eventBus.off('SEASIDE_CLOCK_REQUEST', onClock)
      eventBus.off('SEASIDE_RECONNECT', retry); eventBus.off('SEASIDE_REQUEST_STATE', requestState)
      eventBus.off('IDENTITY_CHANGED', onIdentity); eventBus.off('PANEL_OPENED', onOpen)
      eventBus.off('PANEL_CLOSED', onClose); eventBus.off('SCENE_CHANGED', onScene)
      this.input.keyboard!.off('keydown', onKey); this.input.keyboard!.resetKeys(); this.input.keyboard!.disableGlobalCapture()
      Object.values(keys).forEach(key => this.input.keyboard!.removeKey(key, true, true))
      this.game.events.off('blur', onBlur); this.scale.off('resize', this.resize, this)
      this.reducedMotion.removeEventListener('change', onMotion)
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup); this.events.off(Phaser.Scenes.Events.DESTROY, cleanup)
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup); this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
    if (!this.reducedMotion.matches) this.cameras.main.fadeIn(350)
    this.publish(); eventBus.emit('SCENE_READY', { scene: 'seaside', identity: this.identity }); this.room.start()
  }

  private account(): RoomAccount { return this.identity.account ?? this.identity.character }
  private pose(): SeasideState['pose'] {
    const actor = this.actors.get(this.account())
    return actor?.arriving ? 'arriving' : actor?.member.pose ?? 'standing'
  }
  private canAct(): boolean { return !this.disposed && !this.panelOpen && !this.travelling && this.connection.state === 'connected' && !this.connection.pending && this.members.some(member => member.account === this.account()) }

  private receive(snapshot: RoomSnapshot, timing: RoomTiming): void {
    if (this.disposed || this.travelling) return
    const previous = this.snapshot, mono = performance.now()
    const result = this.sharedClock.update(snapshot, timing)
    this.clock = this.sharedClock
    const hour = this.clock.read(mono).hour
    const distance = ((hour - this.visualHour + 36) % 24) - 12
    if (!this.reducedMotion.matches && ((result.reset && previous) || (!previous && Math.abs(distance) > .15))) this.resetBlend = { from: this.visualHour, at: mono }
    if (previous && previous.clock.version !== snapshot.clock.version && snapshot.clock.changed_by !== this.account()) {
      const name = snapshot.members.find(member => member.account === snapshot.clock.changed_by)?.display ?? '对方'
      this.notice = { text: `${name}调整了景色时间，我们看同一片海。`, until: mono + 6000 }
    }
    const previousMembers = this.members
    this.snapshot = snapshot; this.members = snapshot.members.map(member => ({ ...member }))
    const present = new Set(this.members.map(member => member.account))
    for (const [account, actor] of this.actors) if (!present.has(account)) { this.stopActor(actor); actor.image.destroy(); this.actors.delete(account) }
    for (const member of this.members) {
      let actor = this.actors.get(member.account)
      const oldPose = actor?.member.pose, oldSeat = actor?.member.seat
      const companionChanged = previousMembers.find(other => other.account !== member.account)?.pose !== this.members.find(other => other.account !== member.account)?.pose
      if (!actor) {
        const layout = seasideLayout(this.width, this.height)
        actor = { member, arriving: false, generation: 0, image: this.add.image(layout.seats[member.seat] + 22, layout.seatY + 46, CHARACTER_ATLAS, actorFrame(member.sprite, 'up')).setOrigin(CHARACTER_ORIGIN.x, CHARACTER_ORIGIN.y).setDepth(10 + member.seat) }
        this.actors.set(member.account, actor)
        if (member.pose === 'seated' && !this.reducedMotion.matches) { this.arrive(actor, 1400); continue }
      }
      actor.member = member
      if (oldPose !== member.pose || oldSeat !== member.seat || (member.pose === 'leaning' && companionChanged)) {
        if (oldPose === 'standing' && member.pose === 'seated' && !this.reducedMotion.matches) this.arrive(actor, 500)
        else { this.stopActor(actor); actor.arriving = false; this.place(actor, true) }
      } else if (!actor.arriving && !actor.tween?.isPlaying()) this.place(actor)
    }
    for (const actor of this.actors.values()) if (!actor.arriving && !actor.tween?.isPlaying()) this.place(actor)
    this.paint(); this.publish()
  }

  private stopActor(actor: ActorVisual): void { actor.generation++; actor.tween?.stop(); actor.tween = undefined }
  private stopAnimations(): void { this.actors.forEach(actor => this.stopActor(actor)) }
  private clearActors(): void { this.stopAnimations(); this.actors.forEach(actor => actor.image.destroy()); this.actors.clear(); this.members = [] }

  private fit(): void {
    const { width, height } = this.scale.gameSize
    const zoom = worldZoom(width, height)
    this.width = Math.max(1, Math.ceil(width / zoom)); this.height = Math.max(1, Math.ceil(height / zoom))
    this.cameras.main.setZoom(zoom).centerOn(this.width / 2, this.height / 2)
  }
  private resize(): void {
    this.stopAnimations(); this.fit(); this.actors.forEach(actor => { actor.arriving = false; this.place(actor) })
    this.paint(); this.backdrop.setCrop(0, 0, this.width, this.height); this.publish()
  }
  private place(actor: ActorVisual, animate = false): void {
    const companion = this.members.find(member => member.account !== actor.member.account)
    const { x, y } = seasideActorPosition(this.width, this.height, actor.member.seat, actor.member.pose, companion?.pose)
    const texture = actor.member.pose === 'leaning' ? `${actor.member.sprite}-lean-${actor.member.seat === 0 ? 'right' : 'left'}-1` : actor.member.pose === 'seated' ? `${actor.member.sprite}-sit-up` : actorFrame(actor.member.sprite, 'up')
    if (animate && !this.reducedMotion.matches) {
      const generation = actor.generation
      actor.image.setTexture(CHARACTER_ATLAS, actor.member.pose === 'leaning' ? texture.replace(/-1$/, '-0') : texture)
      actor.tween = this.tweens.add({ targets: actor.image, x, y, duration: 420, ease: 'Sine.easeInOut', onComplete: () => {
        if (generation !== actor.generation || this.disposed || this.travelling || this.actors.get(actor.member.account) !== actor) return
        actor.tween = undefined; actor.image.setTexture(CHARACTER_ATLAS, texture)
      } })
    } else actor.image.setPosition(x, y).setTexture(CHARACTER_ATLAS, texture)
  }
  private arrive(actor: ActorVisual, duration: number): void {
    this.stopActor(actor); actor.arriving = true
    const generation = actor.generation
    const { x, y } = seasideActorPosition(this.width, this.height, actor.member.seat, 'standing')
    actor.tween = this.tweens.add({ targets: actor.image, x, y, duration, ease: 'Sine.easeInOut', onComplete: () => {
      if (generation !== actor.generation || this.disposed || this.travelling || this.actors.get(actor.member.account) !== actor) return
      actor.tween = undefined; actor.arriving = false; this.place(actor); this.publish()
    } })
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
    paintSeaside(this, this.width, this.height, this.visualHour, this.reducedMotion.matches ? 0 : this.elapsed,
      this.members.map(member => ({ character: member.sprite, seat: member.seat, pose: member.pose })))
  }
  private publish(): void {
    if (this.disposed) return
    const clock = this.clock.read(performance.now())
    eventBus.emit('SEASIDE_STATE', { pose: this.pose(), clock, connection: { state: this.connection.state, pending: this.connection.pending, message: this.connection.message },
      members: this.members.map(member => ({ ...member })), companion: this.members.find(member => member.account !== this.account()),
      notice: this.notice && this.notice.until > performance.now() ? this.notice.text : undefined })
    eventBus.emit('AUDIO_CONTEXT', { scene: 'seaside', night: clock.night, phase: clock.phase })
  }
  update(_time: number, delta: number): void {
    this.elapsed += Math.min(delta, 100)
    for (const actor of this.actors.values()) if (actor.arriving && !this.reducedMotion.matches) actor.image.setTexture(CHARACTER_ATLAS, actorFrame(actor.member.sprite, 'up', true, this.elapsed))
    this.paintTimer += delta; this.stateTimer += delta
    if (this.paintTimer > (this.reducedMotion.matches ? 3000 : 500)) { this.paintTimer = 0; this.paint() }
    if (this.stateTimer > 500) { this.stateTimer = 0; this.publish() }
  }
}
