import Phaser from 'phaser'
import { eventBus, type GameEvents, type IslandEntry, type IslandIdentity, type SceneId } from '../EventBus'

const SCENE_KEYS: Record<SceneId, string> = { login: 'Login', island: 'Island', seaside: 'Seaside', interior: 'Interior' }
const SAFE_RETURN = { x: 360, y: 338 }
const HOME_RETURN = { x: 266, y: 246 }

/** 常驻的导航状态；视觉场景负责自己的显示与输入，导航只安排交接。 */
export class NavigationScene extends Phaser.Scene {
  private current: SceneId = 'login'
  private identity: IslandIdentity | undefined
  private returnPoint = { ...SAFE_RETURN }
  private transitioning = false
  private exitRequested = false
  private epoch = 0
  private disposed = false
  private pending?: Phaser.Time.TimerEvent
  private fadeCamera?: Phaser.Cameras.Scene2D.Camera
  private fadeDone?: () => void
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  constructor() { super('Navigation') }

  create(): void {
    this.current = 'login'; this.identity = undefined; this.returnPoint = { ...SAFE_RETURN }
    this.transitioning = false; this.exitRequested = false; this.disposed = false
    const enter = (identity: IslandIdentity) => {
      if (this.exitRequested || this.current !== 'login' || this.transitioning) return
      this.identity = { ...identity }
      this.begin('island')
    }
    const identity = (value: IslandIdentity) => {
      if (!this.exitRequested) this.identity = { ...value }
    }
    const ready = ({ scene, identity: value }: GameEvents['SCENE_READY']) => {
      this.current = scene
      // start() 被 Phaser 排队之后发生下岛，迟到的就绪也不能重新进入海边。
      if (this.exitRequested && scene !== 'login') { this.begin('login'); return }
      this.cancelPending()
      if (value) this.identity = { ...value }
      if (scene === 'login') this.exitRequested = false
      this.transitioning = false
      this.publish()
    }
    const travel = ({ from, to, returnPoint }: GameEvents['TRAVEL_REQUEST']) => {
      if (this.exitRequested || this.transitioning || !this.identity || from !== this.current || from === to) return
      if (from === 'island' && (to === 'seaside' || to === 'interior')) {
        this.returnPoint = returnPoint && Number.isFinite(returnPoint.x) && Number.isFinite(returnPoint.y)
          ? { ...returnPoint } : { ...(to === 'interior' ? HOME_RETURN : SAFE_RETURN) }
      } else if ((from !== 'seaside' && from !== 'interior') || to !== 'island') return
      this.begin(to)
    }
    const exit = () => {
      this.identity = undefined
      this.exitRequested = true
      this.begin('login')
    }
    const state = () => this.publish()
    eventBus.on('ENTER_ISLAND', enter); eventBus.on('IDENTITY_CHANGED', identity)
    eventBus.on('SCENE_READY', ready); eventBus.on('TRAVEL_REQUEST', travel)
    eventBus.on('EXIT_TO_LOGIN', exit); eventBus.on('SCENE_REQUEST_STATE', state)
    const cleanup = () => {
      if (this.disposed) return
      this.disposed = true; this.epoch++
      this.cancelPending()
      eventBus.off('ENTER_ISLAND', enter); eventBus.off('IDENTITY_CHANGED', identity)
      eventBus.off('SCENE_READY', ready); eventBus.off('TRAVEL_REQUEST', travel)
      eventBus.off('EXIT_TO_LOGIN', exit); eventBus.off('SCENE_REQUEST_STATE', state)
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup)
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup)
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
    this.publish()
  }

  private publish(): void {
    eventBus.emit('SCENE_CHANGED', { scene: this.current, transitioning: this.transitioning })
  }

  private cancelPending(): void {
    this.pending?.remove(false); this.pending = undefined
    if (this.fadeCamera && this.fadeDone) {
      this.fadeCamera.off(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, this.fadeDone)
      this.fadeCamera.fadeEffect.reset()
    }
    this.fadeCamera = undefined; this.fadeDone = undefined
  }

  private begin(target: SceneId): void {
    this.cancelPending()
    const epoch = ++this.epoch
    this.transitioning = true
    this.publish()
    eventBus.emit('MOVE_INPUT', { x: 0, y: 0 })
    eventBus.emit('INTERACTION_CHANGED', { label: null })
    const source = this.scene.get(SCENE_KEYS[this.current])
    const commit = () => {
      // 跨一帧开始新视觉场景，旧 WebGL 批次完成后再刷新共享纹理。
      this.pending = this.time.delayedCall(16, () => {
        this.pending = undefined
        if (this.disposed || epoch !== this.epoch || (this.exitRequested && target !== 'login')) return
        const active = this.scene.isActive(SCENE_KEYS[this.current])
          ? this.scene.get(SCENE_KEYS[this.current])
          : Object.values(SCENE_KEYS).map(key => this.scene.get(key)).find(scene => scene.scene.isActive())
        let data: IslandEntry | undefined
        if (this.identity) data = target === 'island'
          ? { ...this.identity, ...(this.current === 'seaside' || this.current === 'interior' ? { returnPoint: { ...this.returnPoint } } : {}) }
          : { ...this.identity }
        if (active) active.scene.start(SCENE_KEYS[target], data)
        else this.scene.launch(SCENE_KEYS[target], data)
      })
    }
    // 退出抢先取消旧转场；减少动态模式也不等待相机补间事件。
    if (target === 'login' || this.reducedMotion.matches || !source?.scene.isActive()) { commit(); return }
    const camera = source.cameras.main
    camera.fadeEffect.reset()
    this.fadeCamera = camera
    this.fadeDone = () => {
      this.fadeCamera = undefined; this.fadeDone = undefined
      if (epoch === this.epoch && !this.disposed) commit()
    }
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, this.fadeDone)
    camera.fadeOut(250, 0, 0, 0)
  }
}
