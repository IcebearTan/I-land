import Phaser from 'phaser'
import { eventBus } from '../EventBus'
import { audioMix, nightWeight, DEFAULT_AUDIO, type AudioContextInfo, type AudioSettings, type AudioStatus, type AudioMix } from '../../audio/types'

type Track = keyof AudioMix
type Loop = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound
const FILES: Record<Track, string> = { dayMusic: 'little-island', nightMusic: 'night-on-island', birds: 'birds', crickets: 'night-insects', waves: 'waves', fireplace: 'fireplace' }
const isMusic = (track: Track) => track === 'dayMusic' || track === 'nightMusic'

/** 非视觉常驻场景。循环只在这里创建；登录/主岛/室内不拥有播放器。 */
export class AudioScene extends Phaser.Scene {
  private settings: AudioSettings = { ...DEFAULT_AUDIO }
  private contextInfo: AudioContextInfo = { scene: 'login' }
  private loops = new Map<Track, Loop>()
  private activeSession = false
  private unlocked = false
  private loading = false
  private failure = ''
  private epoch = 0
  private lastStatus = ''
  private webContext?: AudioContext
  private clockTimer = 0

  constructor() { super('Audio') }

  create(): void {
    // Phaser 默认失焦恢复可能越过手动静音，由本场景统一处理页面可见性。
    this.sound.pauseOnBlur = false
    if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) this.webContext = this.sound.context
    const session = ({ active }: { active: boolean }) => {
      if (active === this.activeSession) return
      this.activeSession = active
      this.epoch++
      this.failure = ''
      if (!active) {
        this.contextInfo = this.loginContext()
        // 下岛停止户外声，回登录页的旋律延续；本页交互解锁不因登录而丢失。
        for (const [track, loop] of this.loops) if (!isMusic(track)) { loop.setVolume(0); loop.stop() }
      }
      this.sync()
    }
    const settings = (value: AudioSettings) => { this.settings = { ...value }; this.sync(); if (this.unlocked && !this.failure && !value.muted) this.loadLoops() }
    const context = (value: AudioContextInfo) => {
      this.contextInfo = !this.activeSession || value.scene === 'login' ? this.loginContext() : value
      this.sync()
      if (this.unlocked && !this.failure && !this.settings.muted) this.loadLoops()
    }
    const unlock = () => this.unlockFromClick()
    const firstGesture = () => { if (!this.unlocked || (this.webContext && this.webContext.state !== 'running')) this.unlockFromClick() }
    const state = () => {
      eventBus.emit('AUDIO_READY', {})
      this.lastStatus = '' // 新监听者必须收到快照，不能被上一次账号的去重吞掉。
      this.publish()
    }
    const visibility = () => {
      this.sync()
      if (!document.hidden && this.unlocked && !this.settings.muted) {
        // 只尝试恢复本页已经手动开启的声音；拒绝时 publish 留下继续播放入口。
        void this.webContext?.resume().then(() => this.sync()).catch(() => this.publish())
      }
    }
    const contextState = () => this.sync()
    eventBus.on('AUDIO_SESSION', session)
    eventBus.on('AUDIO_SETTINGS', settings)
    eventBus.on('AUDIO_CONTEXT', context)
    eventBus.on('AUDIO_UNLOCK', unlock)
    eventBus.on('AUDIO_REQUEST_STATE', state)
    document.addEventListener('visibilitychange', visibility)
    // 默认开启：浏览器允许时直接播放，否则首次点击/输入即解锁（早于登录请求）。
    document.addEventListener('pointerdown', firstGesture, { capture: true })
    document.addEventListener('keydown', firstGesture, { capture: true })
    this.webContext?.addEventListener('statechange', contextState)
    let disposed = false
    const cleanup = () => {
      if (disposed) return
      disposed = true
      this.epoch++
      eventBus.off('AUDIO_SESSION', session)
      eventBus.off('AUDIO_SETTINGS', settings)
      eventBus.off('AUDIO_CONTEXT', context)
      eventBus.off('AUDIO_UNLOCK', unlock)
      eventBus.off('AUDIO_REQUEST_STATE', state)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('pointerdown', firstGesture, { capture: true })
      document.removeEventListener('keydown', firstGesture, { capture: true })
      this.webContext?.removeEventListener('statechange', contextState)
      this.load.removeAllListeners()
      for (const loop of this.loops.values()) loop.destroy()
      this.loops.clear()
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
    this.contextInfo = this.loginContext()
    state()
    this.unlockFromClick()
  }

  private loginContext(): AudioContextInfo {
    const now = new Date(), h = now.getHours() + now.getMinutes() / 60
    const phase = new URLSearchParams(window.location.search).get('phase')
    const preview = phase === 'day' ? 0 : phase === 'night' ? 1 : phase === 'dawn' ? .5 : phase === 'dusk' ? .4 : undefined
    return { scene: 'login', night: preview ?? nightWeight(h) }
  }

  private unlockFromClick(): void {
    if (this.sound instanceof Phaser.Sound.NoAudioSoundManager) {
      this.failure = '这个浏览器暂时无法播放声音。可以换一个浏览器再试。'
      this.publish()
      return
    }
    this.unlocked = true
    this.failure = ''
    const epoch = this.epoch
    // resume 直接发生在 React 点击 → EventBus 同步链内，不能等网络保存。
    if (this.webContext) {
      void this.webContext.resume().then(() => {
        if (epoch !== this.epoch) return
        this.sync()
      }).catch(() => { if (epoch === this.epoch) this.publish() })
    } else this.sound.unlock()
    this.loadLoops()
    this.sync()
  }

  private loadLoops(): void {
    // 炉火首次进屋才加载；户外不因室内素材增加首屏负担。已加载的循环一直复用。
    const tracks = (Object.keys(FILES) as Track[]).filter(track => isMusic(track)
      || (this.contextInfo.scene === 'interior' ? track === 'fireplace' : this.contextInfo.scene !== 'login' && track !== 'fireplace'))
    if (this.loading || tracks.every(track => this.loops.has(track))) return
    this.loading = true
    let failed = false
    for (const track of tracks) {
      const file = FILES[track]
      const key = `audio-${track}`
      if (!this.cache.audio.exists(key)) this.load.audio(key, `/audio/${file}.wav`, { instances: 1 })
    }
    const error = () => { failed = true }
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, error)
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, error)
      this.loading = false
      for (const track of tracks) {
        const key = `audio-${track}`
        if (this.cache.audio.exists(key) && !this.loops.has(track)) {
          const loop = this.sound.add(key, { loop: true, volume: 0 }) as Loop
          this.loops.set(track, loop)
        }
      }
      this.failure = failed || tracks.some(track => !this.loops.has(track)) ? '声音没加载完整，点一下重新加载。' : ''
      this.sync()
      if (!this.failure && this.unlocked && !this.settings.muted) this.loadLoops()
    })
    this.load.start()
  }

  private canPlay(): boolean {
    return this.unlocked && !document.hidden && !this.failure
      && !this.settings.muted && (this.webContext ? this.webContext.state === 'running' : !this.sound.locked)
  }

  private sync(): void {
    if (!this.canPlay()) {
      for (const loop of this.loops.values()) { loop.setVolume(0); if (loop.isPlaying) loop.pause() }
    } else {
      const mix = audioMix(this.settings, this.contextInfo)
      for (const [track, loop] of this.loops) {
        const keepMusicPhase = isMusic(track) && this.settings.music_enabled && this.settings.music_volume > 0
        if ((mix[track] > 0 || keepMusicPhase) && !loop.isPlaying) {
          loop.setVolume(0)
          const started = loop.isPaused ? loop.resume() : loop.play()
          if (!started) { this.publish({ status: 'blocked' }); return }
        }
      }
    }
    this.publish()
  }

  update(_time: number, delta: number): void {
    this.clockTimer += delta
    if (this.clockTimer > 1000) { this.clockTimer = 0; if (this.contextInfo.scene === 'login') this.contextInfo = this.loginContext() }
    if (!this.canPlay()) return
    const mix = audioMix(this.settings, this.contextInfo)
    // 按真实帧间隔缓缓靠近目标；景色 tick 倍率从不传给音频 rate。
    for (const [track, loop] of this.loops) {
      const blend = 1 - Math.exp(-Math.min(delta, 100) / (isMusic(track) ? 1800 : 1100))
      const volume = loop.volume + (mix[track] - loop.volume) * blend
      loop.setVolume(Math.abs(volume - mix[track]) < .001 ? mix[track] : volume)
      if (!isMusic(track) && mix[track] < .001 && loop.volume === 0 && loop.isPlaying) loop.pause()
    }
    // 音乐开关关闭时，两种编配须一起暂停；逐条停会使无声编配提前停拍。
    const musicLoops = [...this.loops].filter(([track]) => isMusic(track)).map(([, loop]) => loop)
    if ((!this.settings.music_enabled || this.settings.music_volume === 0) && musicLoops.every(loop => loop.volume < .001)) {
      for (const loop of musicLoops) { loop.setVolume(0); if (loop.isPlaying) loop.pause() }
    }
  }

  private publish(override?: AudioStatus): void {
    const status: AudioStatus = override ?? (
      this.failure ? { status: 'error', message: this.failure } :
      !this.unlocked ? { status: 'locked' } :
      this.settings.muted || (!this.settings.music_enabled && !this.settings.ambience_enabled) ? { status: 'off' } :
      document.hidden ? { status: 'paused' } :
      this.loading ? { status: 'loading' } :
      (this.webContext ? this.webContext.state !== 'running' : this.sound.locked) ? { status: 'blocked' } :
      { status: 'playing' }
    )
    const night = this.contextInfo.night ?? (this.contextInfo.phase === 'night' ? 1 : 0)
    status.period = night >= .99 ? 'night' : night <= .01 ? 'day' : 'transition'
    status.availableTracks = this.loops.size
    status.playingLayers = [...this.loops].filter(([, loop]) => loop.isPlaying && loop.volume > .001).map(([track]) => track)
    const key = JSON.stringify(status)
    if (key === this.lastStatus) return
    this.lastStatus = key
    eventBus.emit('AUDIO_STATUS', status)
  }
}
