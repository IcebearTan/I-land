import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import ts from 'typescript'

const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const typesUrl = moduleUrl(compile('../src/audio/types.ts'))
const { audioMix, nightWeight, DEFAULT_AUDIO } = await import(typesUrl)

test('personal mute and toggles; smooth day/night mix; scene weights stay independent', () => {
  const silence = { dayMusic: 0, nightMusic: 0, birds: 0, crickets: 0, waves: 0 }
  assert.deepEqual(audioMix({ ...DEFAULT_AUDIO, muted: true }, { scene: 'island' }), silence)
  const prefs = { ...DEFAULT_AUDIO }
  const inland = audioMix(prefs, { scene: 'island', shore: 0, grove: 1, night: 0 })
  const shore = audioMix(prefs, { scene: 'island', shore: 1, grove: 0, night: 0 })
  assert.ok(inland.birds > shore.birds && inland.waves < shore.waves && inland.dayMusic > shore.dayMusic)
  const night = audioMix(prefs, { scene: 'island', grove: 1, night: 1 })
  assert.equal(night.birds, 0); assert.ok(night.crickets > 0 && night.nightMusic > 0 && night.dayMusic < .0001)
  const noMusic = audioMix({ ...prefs, music_enabled: false }, { scene: 'island' })
  assert.equal(noMusic.dayMusic, 0); assert.equal(noMusic.nightMusic, 0)
  const noNature = audioMix({ ...prefs, ambience_enabled: false }, { scene: 'island', night: .5 })
  assert.equal(noNature.birds + noNature.crickets + noNature.waves, 0)
  const indoors = audioMix(prefs, { scene: 'interior', night: 0 })
  assert.equal(indoors.dayMusic, prefs.music_volume * .8)
  assert.equal(indoors.birds + indoors.crickets + indoors.waves, 0)
  const login = audioMix(prefs, { scene: 'login', night: 0 })
  assert.ok(login.dayMusic > 0 && login.dayMusic < inland.dayMusic)
  assert.equal(login.birds + login.crickets + login.waves, 0)
  for (const [hour, expected] of [[0, 1], [5.5, 1], [6.5, .5], [7.5, 0], [12, 0], [17, 0], [18.5, .5], [20, 1], [24, 1]]) {
    assert.equal(nightWeight(hour), expected)
  }
  assert.ok(Math.abs(nightWeight(19.999) - nightWeight(20.001)) < .001)
  const middle = audioMix(prefs, { scene: 'island', night: .5 })
  assert.ok(middle.dayMusic > 0 && middle.nightMusic > 0 && middle.birds > 0 && middle.crickets > 0)
})

// 用公开声音/场景接口的替身验证生命周期，不启动浏览器或真实扬声器。
class Context extends EventTarget {
  state = 'suspended'
  resumes = 0
  refuse = true
  resume() {
    this.resumes++
    if (this.refuse) return Promise.reject(new Error('gesture required'))
    this.state = 'running'
    this.dispatchEvent(new Event('statechange'))
    return Promise.resolve()
  }
}
class Loop {
  volume = 0; isPlaying = false; isPaused = false; starts = 0; destroyed = false
  setVolume(value) { this.volume = value; return this }
  play() { this.isPlaying = true; this.isPaused = false; this.starts++; return true }
  pause() { this.isPlaying = false; this.isPaused = true; return true }
  resume() { this.isPlaying = true; this.isPaused = false; return true }
  stop() { this.isPlaying = false; this.isPaused = false; return true }
  destroy() { this.stop(); this.destroyed = true }
}
class WebManager {
  context = new Context(); sounds = []; locked = true
  add(key) { const loop = new Loop(); loop.key = key; this.sounds.push(loop); return loop }
}
class NoManager {}
class Scene {
  constructor() {
    this.events = new EventEmitter()
    this.sound = new WebManager()
    const cached = new Set()
    this.cache = { audio: { exists: key => cached.has(key) } }
    this.load = new EventEmitter()
    this.load.queued = []; this.load.starts = 0; this.load.fail = false
    this.load.audio = key => this.load.queued.push(key)
    this.load.start = () => {
      this.load.starts++
      queueMicrotask(() => {
        for (const key of this.load.queued.splice(0)) {
          if (this.load.fail) this.load.emit('fileerror')
          else cached.add(key)
        }
        this.load.emit('complete')
      })
    }
  }
}
globalThis.__audioTestPhaser = { Scene, Sound: { WebAudioSoundManager: WebManager, NoAudioSoundManager: NoManager },
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } }, Loader: { Events: { FILE_LOAD_ERROR: 'fileerror', COMPLETE: 'complete' } } }
globalThis.__audioTestBus = new EventEmitter()
globalThis.window = { location: { search: '?phase=day' } }
globalThis.document = new EventTarget()
document.hidden = false
const source = compile('../src/game/scenes/AudioScene.ts')
  .replace(/import Phaser from ['"]phaser['"];?/, 'const Phaser = globalThis.__audioTestPhaser;')
  .replace(/import \{ eventBus \} from ['"]\.\.\/EventBus['"];?/, 'const eventBus = globalThis.__audioTestBus;')
  .replace(/from ['"]\.\.\/\.\.\/audio\/types['"]/, `from '${typesUrl}'`)
const { AudioScene } = await import(moduleUrl(source))
const bus = globalThis.__audioTestBus
const settle = async () => { await Promise.resolve(); await Promise.resolve() }

function setup(fail = false) {
  document.hidden = false
  const scene = new AudioScene()
  scene.load.fail = fail
  const statuses = []
  const listen = status => statuses.push(status.status)
  bus.on('AUDIO_STATUS', listen)
  scene.create()
  bus.emit('AUDIO_SESSION', { active: true })
  bus.emit('AUDIO_SETTINGS', { ...DEFAULT_AUDIO, muted: false })
  bus.emit('AUDIO_CONTEXT', { scene: 'island', phase: 'day', grove: 1 })
  return { scene, statuses, destroy: () => { scene.events.emit('shutdown'); bus.off('AUDIO_STATUS', listen) } }
}

test('default enabled: browser permission is respected, first input unlocks synchronously', async () => {
  const { scene, statuses, destroy } = setup()
  try {
    assert.equal(scene.sound.context.resumes, 1) // 只尝试，拒绝时绝不假装正在播放
    await settle()
    assert.equal(statuses.at(-1), 'blocked')
    assert.ok(scene.sound.sounds.every(loop => !loop.isPlaying))
    scene.sound.context.refuse = false
    document.dispatchEvent(new Event('keydown'))
    assert.equal(scene.sound.context.resumes, 2)
    await settle()
    scene.update(0, 100)
    assert.equal(scene.sound.sounds.length, 5)
    assert.ok(scene.sound.sounds.filter(loop => loop.key !== 'audio-crickets').every(loop => loop.isPlaying))
    assert.equal(statuses.at(-1), 'playing')
  } finally { destroy() }
})

test('day/night shares music phase and gently replaces birds with crickets', async () => {
  const { scene, destroy } = setup()
  try {
    scene.sound.context.refuse = false
    bus.emit('AUDIO_UNLOCK', {}); await settle()
    for (let i = 0; i < 160; i++) scene.update(i * 100, 100)
    const byKey = key => scene.sound.sounds.find(loop => loop.key === `audio-${key}`)
    assert.ok(byKey('birds').volume > 0)
    bus.emit('AUDIO_CONTEXT', { scene: 'island', night: 1, grove: 1 })
    scene.update(16000, 16)
    assert.ok(byKey('birds').volume > 0) // 不是整点硬切
    for (let i = 0; i < 160; i++) scene.update(16000 + i * 100, 100)
    assert.equal(byKey('birds').volume, 0)
    assert.ok(!byKey('birds').isPlaying && byKey('crickets').isPlaying && byKey('crickets').volume > 0)
    assert.ok(byKey('nightMusic').volume > 0 && byKey('dayMusic').volume < .001)
    assert.equal(byKey('dayMusic').starts, 1); assert.equal(byKey('nightMusic').starts, 1)
  } finally { destroy() }
})

test('scene changes, background, mute and repeated login cannot duplicate or revive nature sounds', async () => {
  const { scene, statuses, destroy } = setup()
  try {
    scene.sound.context.refuse = false
    bus.emit('AUDIO_UNLOCK', {}); await settle()
    const loops = scene.sound.sounds
    for (let i = 0; i < 5; i++) {
      bus.emit('AUDIO_CONTEXT', { scene: 'seaside' })
      bus.emit('AUDIO_CONTEXT', { scene: 'interior' })
      bus.emit('AUDIO_CONTEXT', { scene: 'island', night: 0, grove: 1 })
    }
    assert.equal(loops.length, 5)
    assert.ok(loops.every(loop => loop.starts <= 1))
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'))
    assert.ok(loops.every(loop => !loop.isPlaying && loop.volume === 0))
    assert.equal(statuses.at(-1), 'paused')
    bus.emit('AUDIO_SETTINGS', { ...DEFAULT_AUDIO, muted: true })
    const resumes = scene.sound.context.resumes
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); await settle()
    assert.equal(scene.sound.context.resumes, resumes)
    assert.ok(loops.every(loop => !loop.isPlaying))
    bus.emit('AUDIO_SETTINGS', { ...DEFAULT_AUDIO, muted: false })
    for (let i = 0; i < 5; i++) {
      bus.emit('AUDIO_SESSION', { active: false })
      assert.ok(loops.filter(loop => !loop.key.includes('Music')).every(loop => !loop.isPlaying && !loop.isPaused))
      assert.ok(loops.filter(loop => loop.key.includes('Music')).every(loop => loop.isPlaying))
      bus.emit('AUDIO_SESSION', { active: true })
      bus.emit('AUDIO_CONTEXT', { scene: 'island', night: 0, grove: 1 })
    }
    assert.equal(scene.sound.sounds.length, 5)
    assert.equal(scene.load.starts, 2) // 登录只加载音乐，登岛再加载环境声
    assert.ok(loops.filter(loop => loop.key.includes('Music')).every(loop => loop.starts === 1))
  } finally { destroy() }
  assert.ok(scene.sound.sounds.every(loop => loop.destroyed))
  assert.equal(bus.listenerCount('AUDIO_UNLOCK'), 0)
})

test('load failure stays quiet and can retry without partial or duplicate playback', async () => {
  const { scene, statuses, destroy } = setup(true)
  try {
    await settle()
    assert.equal(statuses.at(-1), 'error')
    assert.equal(scene.sound.sounds.length, 0)
    scene.load.fail = false
    scene.sound.context.refuse = false
    bus.emit('AUDIO_UNLOCK', {}); await settle()
    assert.equal(statuses.at(-1), 'playing')
    assert.equal(scene.sound.sounds.length, 5)
  } finally { destroy() }
})

test('late resume cannot override manual mute or play island ambience after logout', async () => {
  const { scene, statuses, destroy } = setup()
  try {
    await settle()
    assert.equal(statuses.at(-1), 'blocked')
    scene.sound.context.refuse = false
    bus.emit('AUDIO_UNLOCK', {})
    bus.emit('AUDIO_SESSION', { active: false })
    bus.emit('AUDIO_SETTINGS', { ...DEFAULT_AUDIO, muted: true })
    await settle()
    assert.equal(statuses.at(-1), 'off')
    assert.ok(scene.sound.sounds.every(loop => !loop.isPlaying))
  } finally { destroy() }
})

test('direct game destruction removes gesture/bus listeners and destroys every loop once', async () => {
  const { scene, destroy } = setup()
  await settle()
  scene.events.emit('destroy')
  const resumes = scene.sound.context.resumes
  document.dispatchEvent(new Event('pointerdown'))
  bus.emit('AUDIO_UNLOCK', {})
  assert.equal(scene.sound.context.resumes, resumes)
  assert.ok(scene.sound.sounds.every(loop => loop.destroyed))
  assert.equal(bus.listenerCount('AUDIO_SESSION'), 0)
  destroy() // shutdown 晚于 destroy 也不会重复操作已销毁声音
})

test('new UI listener receives current audio snapshot even if settings did not change', async () => {
  const { scene, destroy } = setup()
  const snapshots = []
  const listener = value => snapshots.push(value)
  try {
    scene.sound.context.refuse = false
    bus.emit('AUDIO_UNLOCK', {}); await settle()
    for (let i = 0; i < 120; i++) scene.update(i * 100, 100)
    bus.emit('AUDIO_SESSION', { active: false })
    bus.on('AUDIO_STATUS', listener)
    bus.emit('AUDIO_REQUEST_STATE', {})
    assert.equal(snapshots.length, 1)
    assert.equal(snapshots[0].availableTracks, 5)
    assert.ok(snapshots[0].playingLayers.every(key => key.endsWith('Music')))
  } finally { bus.off('AUDIO_STATUS', listener); destroy() }
})

test('music off fades both arrangements then pauses together, preserving their shared beat', async () => {
  const { scene, destroy } = setup()
  try {
    scene.sound.context.refuse = false
    bus.emit('AUDIO_UNLOCK', {}); await settle()
    for (let i = 0; i < 120; i++) scene.update(i * 100, 100)
    const music = scene.sound.sounds.filter(loop => loop.key.endsWith('Music'))
    bus.emit('AUDIO_SETTINGS', { ...DEFAULT_AUDIO, music_enabled: false })
    for (let i = 0; i < 120; i++) {
      scene.update(i * 100, 100)
      assert.equal(music[0].isPlaying, music[1].isPlaying)
    }
    assert.ok(music.every(loop => loop.isPaused))
    bus.emit('AUDIO_SETTINGS', { ...DEFAULT_AUDIO })
    assert.ok(music.every(loop => loop.isPlaying && loop.starts === 1))
  } finally { destroy() }
})
