import Phaser from 'phaser'
import { nightWeight } from '../../audio/types'
import { CHARACTER_ATLAS, CHARACTER_ORIGIN } from '../../visual/artV2'
import { worldZoom } from '../../visual/layout'
import { PIXEL_FONT_FAMILY, SCREEN_LABEL_PX, screenTextScale } from '../../visual/screenText'
import { makeTexture } from '../pixels'
import { eventBus, type IslandIdentity, type LighthouseSignal, type Phase } from '../EventBus'
import { createStudyArt, paintStudyAttic, studyLayout, STUDY_BACKDROP } from '../art/study'
import { StudyRoomClient, type StudyRoomView } from '../../study/StudyRoomClient'
import type {
  StudyAccount,
  StudyAudioMode,
  StudyMember,
  StudyNudgeEvent,
  StudyNudgeKind,
  StudySnapshot,
  StudyTimer,
} from '../../study/types'

const IDLE_TIMER = (account: StudyAccount): StudyTimer => ({
  account,
  phase: 'idle',
  focus_minutes: 25,
  break_minutes: 5,
  started_at_ms: 0,
  ends_at_ms: 0,
  goal_text: '',
  synced_with: '',
  version: 1,
})

function ensureNudgeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('study-nudge-pat')) return
  makeTexture(scene, 'study-nudge-pat', [
    '.rr.rr.',
    'rrrrrrr',
    'rrrrrrr',
    '.rrrrr.',
    '..rrr..',
    '...r...',
  ], { r: '#e8637c' })
  makeTexture(scene, 'study-nudge-tea', [
    '..w.w..',
    '.w...w.',
    'bbbbbb.',
    'bccccbb',
    'bccccb.',
    '.bbbb..',
  ], { w: '#fffaf0', b: '#8a5a38', c: '#ffd98a' })
  makeTexture(scene, 'study-nudge-flower', [
    '..rrr..',
    '.rryrr.',
    '..rrr..',
    '...g...',
    '..ggg..',
    '...g...',
  ], { r: '#ff9f8c', y: '#ffd98a', g: '#5a944a' })
  makeTexture(scene, 'study-nudge-poke', [
    '...y...',
    '..yyy..',
    'yyyyyyy',
    '..yyy..',
    '...y...',
  ], { y: '#ffd98a' })
}

/** 二楼星光阁楼书房：零物理引擎、900ms 脏帧节拍更新、左右/上下响应式视口自适应。 */
export class StudyScene extends Phaser.Scene {
  private identity: IslandIdentity = { character: 'bear', display: '小熊' }
  private room?: StudyRoomClient
  private connection: StudyRoomView = { state: 'joining', pending: false }
  private members: StudyMember[] = []
  private timers: { bear: StudyTimer; her: StudyTimer } = { bear: IDLE_TIMER('bear'), her: IDLE_TIMER('her') }
  private latestMessageId = 0
  private lastNudge: StudyNudgeEvent | null = null
  private seenNudgeSeq: number | null = null
  private serverOffsetMs = 0
  private audioMode: StudyAudioMode = 'whitenoise'
  private lighthouseHex = '#ffd98a'
  private backdrop!: Phaser.GameObjects.Image
  private chairBacks!: Phaser.GameObjects.Graphics
  private actors = new Map<StudyAccount, Phaser.GameObjects.Image>()
  private goalTags = new Map<StudyAccount, Phaser.GameObjects.Text>()
  private width = 240
  private height = 200
  private beat = 0
  private beatTimer = 0
  private clockTimer = 0
  private dirty = true
  private travelling = false
  private disposed = false
  private lifetime = 0
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  constructor() { super('Study') }

  init(identity?: IslandIdentity): void {
    this.lifetime++
    this.identity = identity ? { ...identity } : { character: 'bear', display: '小熊' }
    this.members = []
    this.timers = { bear: IDLE_TIMER('bear'), her: IDLE_TIMER('her') }
    this.latestMessageId = 0
    this.lastNudge = null
    this.seenNudgeSeq = null
    this.serverOffsetMs = 0
    this.connection = { state: 'joining', pending: false }
    this.beat = 0; this.beatTimer = 0; this.clockTimer = 0
    this.dirty = true; this.travelling = false; this.disposed = false
  }

  create(): void {
    const lifetime = this.lifetime
    this.cameras.main.setBackgroundColor('#241a35')
    createStudyArt(this)
    ensureNudgeTextures(this)
    this.backdrop = this.add.image(0, 0, STUDY_BACKDROP).setOrigin(0).setDepth(0)
    this.chairBacks = this.add.graphics().setDepth(16)
    this.fitViewport()
    this.paintScene()

    const abort = new AbortController()
    fetch('/api/lighthouse', { credentials: 'include', signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const col = data?.signal?.color
        if (typeof col === 'string' && !this.disposed) {
          this.lighthouseHex = col
          this.dirty = true
        }
      })
      .catch(() => {})

    this.room = new StudyRoomClient({
      account: this.account(),
      onStatus: (view) => {
        if (lifetime !== this.lifetime || this.disposed || this.travelling) return
        this.connection = view
        if (view.state === 'expired') eventBus.emit('SESSION_EXPIRED', {})
        if (view.state !== 'connected') {
          this.members = []
          this.dirty = true
        }
        this.publish()
      },
      onSnapshot: (snapshot) => {
        if (lifetime === this.lifetime) this.applySnapshot(snapshot)
      },
    })

    const onSyncSnap = (snapshot: StudySnapshot) => {
      if (!this.disposed && !this.travelling) this.applySnapshot(snapshot)
    }
    const onReconnect = () => {
      if (!this.disposed && !this.travelling) this.room?.retry()
    }
    const onRequestState = () => this.publish()
    const onAudioMode = ({ mode }: { mode: StudyAudioMode }) => {
      this.audioMode = mode
      this.emitAudioAndDay()
      this.publish()
    }
    const onLighthouse = (sig: LighthouseSignal) => {
      if (sig.color) { this.lighthouseHex = sig.color; this.dirty = true }
    }
    const onIdentity = (value: IslandIdentity) => {
      this.identity = { ...value }
      this.publish()
    }
    const onScene = ({ scene, transitioning }: { scene: string; transitioning: boolean }) => {
      if (scene !== 'study' || !transitioning) return
      this.travelling = true
      this.room?.dispose()
    }

    eventBus.on('STUDY_SYNC_SNAPSHOT', onSyncSnap)
    eventBus.on('STUDY_RECONNECT', onReconnect)
    eventBus.on('STUDY_REQUEST_STATE', onRequestState)
    eventBus.on('STUDY_AUDIO_MODE', onAudioMode)
    eventBus.on('LIGHTHOUSE_UPDATED', onLighthouse)
    eventBus.on('IDENTITY_CHANGED', onIdentity)
    eventBus.on('SCENE_CHANGED', onScene)
    this.scale.on('resize', this.onResize, this)

    const cleanup = () => {
      if (this.disposed) return
      this.disposed = true; this.lifetime++
      abort.abort()
      this.room?.dispose(); this.room = undefined
      this.actors.forEach((img) => img.destroy()); this.actors.clear()
      this.goalTags.forEach((txt) => txt.destroy()); this.goalTags.clear()
      eventBus.off('STUDY_SYNC_SNAPSHOT', onSyncSnap)
      eventBus.off('STUDY_RECONNECT', onReconnect)
      eventBus.off('STUDY_REQUEST_STATE', onRequestState)
      eventBus.off('STUDY_AUDIO_MODE', onAudioMode)
      eventBus.off('LIGHTHOUSE_UPDATED', onLighthouse)
      eventBus.off('IDENTITY_CHANGED', onIdentity)
      eventBus.off('SCENE_CHANGED', onScene)
      this.scale.off('resize', this.onResize, this)
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup)
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup)
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)

    this.emitAudioAndDay()
    this.publish()
    if (!this.reducedMotion.matches) this.cameras.main.fadeIn(260)
    eventBus.emit('SCENE_READY', { scene: 'study', identity: { ...this.identity } })
    this.room.start()
  }

  private account(): StudyAccount {
    return this.identity.account ?? this.identity.character
  }

  private fitViewport(): void {
    const { width: fullW, height: fullH } = this.scale.gameSize
    const desktop = fullW > 820
    const viewW = desktop ? Math.max(240, Math.round(fullW * 0.54)) : Math.max(160, fullW)
    const viewH = desktop ? Math.max(200, fullH) : Math.max(116, Math.round(fullH * 0.32))
    const zoom = desktop && viewW >= 660 && viewH >= 440 ? Math.max(3, worldZoom(viewW, viewH)) : 2
    this.width = Math.min(600, Math.max(120, Math.ceil(viewW / zoom)))
    this.height = Math.min(600, Math.max(96, Math.ceil(viewH / zoom)))
    this.cameras.main.setViewport(0, 0, viewW, viewH).setZoom(zoom).centerOn(this.width / 2, this.height / 2)
    this.backdrop?.setCrop(0, 0, this.width, this.height)
    const textScale = screenTextScale(zoom)
    this.goalTags.forEach((tag) => tag.setScale(textScale))
    this.dirty = true
  }

  private onResize(): void {
    if (this.disposed || this.travelling) return
    this.fitViewport()
    this.paintScene()
  }

  private applySnapshot(snapshot: StudySnapshot): void {
    if (this.disposed || this.travelling) return
    this.serverOffsetMs = snapshot.server_now_ms - Date.now()
    this.members = snapshot.members.map((m) => ({ ...m }))
    this.timers = { bear: { ...snapshot.timers.bear }, her: { ...snapshot.timers.her } }
    this.latestMessageId = Math.max(this.latestMessageId, snapshot.latest_message_id)
    if (snapshot.last_nudge) {
      if (this.seenNudgeSeq !== null && snapshot.last_nudge.seq > this.seenNudgeSeq) {
        this.playNudgeFx(snapshot.last_nudge)
      }
      this.seenNudgeSeq = snapshot.last_nudge.seq
      this.lastNudge = snapshot.last_nudge
    } else if (this.seenNudgeSeq === null) {
      this.seenNudgeSeq = 0
    }
    this.dirty = true
    this.paintScene()
    this.publish()
  }

  private playNudgeFx(nudge: StudyNudgeEvent): void {
    if (this.reducedMotion.matches) return
    const targetIdx = nudge.from_account === 'bear' ? 1 : 0
    const L = studyLayout(this.width, this.height)
    const x = L.seats[targetIdx]
    const y = L.deskY - 18
    const keyMap: Record<StudyNudgeKind, string> = {
      pat: 'study-nudge-pat',
      tea: 'study-nudge-tea',
      flower: 'study-nudge-flower',
      poke: 'study-nudge-poke',
    }
    const icon = this.add.image(x, y, keyMap[nudge.kind] || 'study-nudge-pat').setDepth(40)
    this.tweens.add({
      targets: icon,
      y: y - 14,
      alpha: { from: 1, to: 0 },
      duration: 1500,
      ease: 'Sine.easeOut',
      onComplete: () => icon.destroy(),
    })
  }

  private currentHourAndPhase(): { hour: number; phase: Phase } {
    const now = new Date()
    const raw = now.getHours() + now.getMinutes() / 60
    const ov = new URLSearchParams(window.location.search).get('phase')
    const hour = ov === 'day' ? 12 : ov === 'dawn' ? 6.6 : ov === 'dusk' ? 18 : ov === 'night' ? 22 : raw
    const phase: Phase = hour < 5.5 || hour >= 20 ? 'night' : hour < 8 ? 'dawn' : hour < 16.5 ? 'day' : 'dusk'
    return { hour, phase }
  }

  private paintScene(): void {
    this.dirty = false
    const { hour } = this.currentHourAndPhase()
    const presentSet = new Set(this.members.map((m) => m.account))
    const together = presentSet.has('bear') && presentSet.has('her')
    const seats = (['bear', 'her'] as const).map((acc) => ({
      account: acc,
      present: presentSet.has(acc),
      phase: this.timers[acc].phase,
      goalText: this.timers[acc].goal_text,
    })) as [{ account: 'bear'; present: boolean; phase: StudyTimer['phase']; goalText: string }, { account: 'her'; present: boolean; phase: StudyTimer['phase']; goalText: string }]

    paintStudyAttic(this, {
      width: this.width,
      height: this.height,
      hour,
      beat: this.reducedMotion.matches ? 0 : this.beat,
      lighthouseHex: this.lighthouseHex,
      seats,
      together,
    })

    const L = studyLayout(this.width, this.height)
    this.chairBacks.clear()
    const scale = screenTextScale(this.cameras.main.zoom)

    ;(['bear', 'her'] as const).forEach((acc, idx) => {
      const present = presentSet.has(acc)
      let actor = this.actors.get(acc)
      let tag = this.goalTags.get(acc)
      if (!present) {
        actor?.setVisible(false)
        tag?.setVisible(false)
        return
      }
      const sx = L.seats[idx]
      const phase = this.timers[acc].phase
      const bow = !this.reducedMotion.matches && (phase === 'focusing' || phase === 'stopwatch') && (this.beat + idx) % 3 === 0 ? 1 : 0
      if (!actor) {
        actor = this.add.image(sx, L.actorY, CHARACTER_ATLAS, `${acc}-sit-up`).setOrigin(CHARACTER_ORIGIN.x, CHARACTER_ORIGIN.y).setDepth(12)
        this.actors.set(acc, actor)
      }
      actor.setPosition(sx, L.actorY + bow).setTexture(CHARACTER_ATLAS, `${acc}-sit-up`).setVisible(true)
      // 橡木书椅护腰横档（压在坐姿背部下方，形成自然包裹感）
      this.chairBacks.fillStyle(0x6e4529).fillRect(sx - 7, L.deskY + 12, 14, 5)
      this.chairBacks.fillStyle(0x9c6940).fillRect(sx - 6, L.deskY + 13, 12, 3)

      const goal = this.timers[acc].goal_text.trim()
      if ((phase === 'focusing' || phase === 'stopwatch') && goal && !L.compact) {
        if (!tag) {
          tag = this.add.text(sx, L.deskY - 26, '', {
            fontFamily: PIXEL_FONT_FAMILY,
            fontSize: SCREEN_LABEL_PX,
            color: '#3b2117',
            backgroundColor: '#fff4da',
            padding: { x: 4, y: 2 },
            resolution: 3,
          }).setOrigin(0.5, 1).setDepth(30)
          this.goalTags.set(acc, tag)
        }
        tag.setText(goal.length > 8 ? `${goal.slice(0, 8)}…` : goal).setPosition(sx, L.deskY - 24).setScale(scale).setVisible(true)
      } else {
        tag?.setVisible(false)
      }
    })
  }

  private emitAudioAndDay(): void {
    const now = new Date()
    const { hour, phase } = this.currentHourAndPhase()
    eventBus.emit('DAY_TICK', {
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      phase,
    })
    eventBus.emit('AUDIO_CONTEXT', {
      scene: 'study',
      phase,
      night: nightWeight(hour),
      studyAudioMode: this.audioMode,
    })
  }

  private publish(): void {
    if (this.disposed) return
    eventBus.emit('STUDY_STATE', {
      connection: {
        state: this.connection.state,
        pending: this.connection.pending,
        message: this.connection.message,
      },
      members: this.members.map((m) => ({ ...m })),
      timers: { bear: { ...this.timers.bear }, her: { ...this.timers.her } },
      latestMessageId: this.latestMessageId,
      lastNudge: this.lastNudge,
      serverOffsetMs: this.serverOffsetMs,
      audioMode: this.audioMode,
    })
  }

  update(_time: number, delta: number): void {
    if (this.disposed || this.travelling || document.hidden) return
    this.beatTimer += delta
    this.clockTimer += delta
    if (!this.reducedMotion.matches && this.beatTimer >= 900) {
      this.beatTimer = 0
      this.beat = (this.beat + 1) % 240
      this.dirty = true
    }
    if (this.clockTimer >= 15_000) {
      this.clockTimer = 0
      this.emitAudioAndDay()
      this.dirty = true
    }
    if (this.dirty) this.paintScene()
  }
}
