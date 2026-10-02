import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import ts from 'typescript'

const compileSource = code => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const compile = path => compileSource(fs.readFileSync(new URL(path, import.meta.url), 'utf8'))
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const audioUrl = moduleUrl(compile('../src/audio/types.ts'))
const clockUrl = moduleUrl(compile('../src/seaside/clock.ts')
  .replace(/from ['"]\.\.\/audio\/types['"]/, `from '${audioUrl}'`))
const typesUrl = moduleUrl(compile('../src/seaside/types.ts'))
const sharedClockUrl = moduleUrl(compile('../src/seaside/roomClock.ts')
  .replace(/from ['"]\.\.\/audio\/types['"]/, `from '${audioUrl}'`)
  .replace(/from ['"]\.\/types['"]/, `from '${typesUrl}'`))

const bus = new EventEmitter()
const baseRealMs = Date.parse('2026-10-02T10:00:00.000Z')
let mono = 100, realNow = baseRealMs
Object.defineProperty(globalThis, 'performance', { value: { now: () => mono }, configurable: true })
Date.now = () => realNow
class MediaQuery extends EventTarget {
  matches = false
  activeListeners = new Set()
  addEventListener(name, listener, options) {
    super.addEventListener(name, listener, options)
    if (name === 'change') this.activeListeners.add(listener)
  }
  removeEventListener(name, listener, options) {
    super.removeEventListener(name, listener, options)
    if (name === 'change') this.activeListeners.delete(listener)
  }
  change(matches) { this.matches = matches; this.dispatchEvent(new Event('change')) }
}
const media = new MediaQuery()
globalThis.window = { location: { search: '' }, matchMedia: () => media }
globalThis.HTMLElement = class HTMLElement {
  constructor(interactive = false) { this.interactive = interactive }
  closest() { return this.interactive ? this : null }
}
globalThis.__seasideTestBus = bus

class ContextEmitter {
  entries = []
  on(name, listener, context) { this.entries.push({ name, listener, context }); return this }
  off(name, listener, context) {
    this.entries = this.entries.filter(item => item.name !== name || item.listener !== listener || item.context !== context)
    return this
  }
  emit(name, ...args) {
    for (const { listener, context } of this.entries.filter(item => item.name === name)) listener.apply(context, args)
  }
  listenerCount(name) { return this.entries.filter(item => item.name === name).length }
}
class Image {
  constructor(x, y, texture) { this.x = x; this.y = y; this.texture = texture; this.textures = [texture]; this.destroyed = false; this.destroys = 0 }
  setOrigin(...origin) { this.origin = origin; return this }
  setCrop(...crop) { this.crop = crop; return this }
  setDepth(depth) { this.depth = depth; return this }
  setPosition(x, y) { this.x = x; this.y = y; return this }
  setTexture(texture) { this.texture = texture; this.textures.push(texture); return this }
  destroy() { this.destroyed = true; this.destroys++ }
}
class Keyboard extends EventEmitter {
  enabled = true
  captured = false
  resets = 0
  removed = []
  resetKeys() { this.resets++ }
  disableGlobalCapture() { this.captured = false }
  addKeys(names, capture) { this.captured = capture; return Object.fromEntries(names.split(',').map(name => [name, { name }])) }
  removeKey(key) { this.removed.push(key.name) }
}
class Scene {
  constructor() {
    this.events = new EventEmitter()
    this.game = { events: new EventEmitter() }
    this.scale = new ContextEmitter(); this.scale.gameSize = { width: 1120, height: 740 }
    this.input = { keyboard: new Keyboard() }
    this.images = []
    this.add = { image: (x, y, texture) => { const image = new Image(x, y, texture); this.images.push(image); return image } }
    this.cameras = { main: {
      zoom: 1, center: [], fades: [],
      setZoom(zoom) { this.zoom = zoom; return this },
      centerOn(...center) { this.center = center; return this },
      fadeIn(duration) { this.fades.push(duration) },
    } }
    this.tweens = { items: [], add: config => {
      const tween = { config, stopped: false, playing: true, stops: 0,
        stop() { this.stopped = true; this.playing = false; this.stops++ },
        isPlaying() { return this.playing },
        complete() {
          if (this.stopped || !this.playing) return
          this.playing = false; config.targets.setPosition(config.x, config.y); config.onComplete()
        },
        lateComplete() { config.onComplete() },
      }
      this.tweens.items.push(tween); return tween
    } }
    // 景色倍率绝不能写到 Phaser 全局时间或播放速度。
    this.time = Object.freeze({ timeScale: 1 }); this.sound = Object.freeze({ rate: 1 })
    this.paintCalls = []
  }
}

const clients = []
class MockRoomClient {
  constructor(options) {
    this.options = options; this.starts = 0; this.retries = 0; this.disposals = 0; this.disposed = false
    this.poseRequests = []; this.clockRequests = []; clients.push(this)
  }
  start() { this.starts++ }
  setPose(pose) { this.poseRequests.push(pose); return Promise.resolve(true) }
  setClock(request) { this.clockRequests.push({ ...request }); return Promise.resolve(true) }
  retry() { this.retries++ }
  dispose() { if (!this.disposed) { this.disposed = true; this.disposals++ } }
  status(state, extra = {}) { this.options.onStatus({ state, pending: false, ...extra }) }
  deliver(snapshot) { this.options.onSnapshot(snapshot, { receivedMonoMs: mono, roundTripMs: 0 }) }
  server(snapshot) { this.status('connected'); this.deliver(snapshot) }
}
globalThis.__seasideTestRoomClient = MockRoomClient

// 使用真实纯布局函数；图形/纹理对象用 mock，测试房间事实如何驱动渲染。
const artSource = fs.readFileSync(new URL('../src/game/art/seaside.ts', import.meta.url), 'utf8')
const layoutSource = artSource.slice(artSource.indexOf('export function seasideLayout'), artSource.indexOf('/** 26×25'))
const { seasideLayout, seasideActorPosition } = await import(moduleUrl(compileSource(layoutSource)))
globalThis.__seasideTestArt = {
  createSeasideArt: scene => { scene.artCreates = (scene.artCreates ?? 0) + 1 },
  paintSeaside: (scene, ...args) => scene.paintCalls.push(args), seasideLayout, seasideActorPosition,
  SEASIDE_BACKDROP: 'seaside-backdrop', SEASIDE_MAX: 640,
}
globalThis.__seasideTestPhaser = { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } } }
const source = compile('../src/game/scenes/SeasideScene.ts')
  .replace(/import Phaser from ['"]phaser['"];?/, 'const Phaser = globalThis.__seasideTestPhaser;')
  .replace(/import \{ eventBus \} from ['"]\.\.\/EventBus['"];?/, 'const eventBus = globalThis.__seasideTestBus;')
  .replace(/import \{([^}]+)\} from ['"]\.\.\/art\/seaside['"];?/, 'const {$1} = globalThis.__seasideTestArt;')
  .replace(/import \{ RoomClient \} from ['"]\.\.\/\.\.\/seaside\/room['"];?/, 'const RoomClient = globalThis.__seasideTestRoomClient;')
  .replace(/from ['"]\.\.\/\.\.\/seaside\/clock['"]/, `from '${clockUrl}'`)
  .replace(/from ['"]\.\.\/\.\.\/seaside\/roomClock['"]/, `from '${sharedClockUrl}'`)
const { SeasideScene } = await import(moduleUrl(source))
const subscribed = ['SEASIDE_ACTION', 'SEASIDE_CLOCK_REQUEST', 'SEASIDE_RECONNECT', 'SEASIDE_REQUEST_STATE', 'IDENTITY_CHANGED', 'PANEL_OPENED', 'PANEL_CLOSED', 'SCENE_CHANGED']
const member = (account, seat, pose = 'seated', display = account === 'bear' ? '小熊' : '她') => ({ user_id: account === 'bear' ? 1 : 2, account, sprite: account, display, seat, pose })
const packet = ({ members = [member('bear', 0)], revision = 1, epoch = 'room-first', rate = 1, version = 1, virtual = baseRealMs, anchor = baseRealMs, followingReal = true, changedBy = null } = {}) => ({
  room: 'seaside', epoch, revision, server_now_ms: realNow, members,
  clock: { virtual_base_ms: virtual, real_anchor_utc_ms: anchor, rate, version, following_real: followingReal, time_zone: 'Asia/Shanghai', changed_by: changedBy },
})
function setup({ reduce = false, identity = { character: 'bear', display: '小熊', account: 'bear' } } = {}) {
  mono = 100; realNow = baseRealMs; media.matches = reduce; window.location.search = '?phase=night'
  const scene = new SeasideScene(), states = [], contexts = [], ready = [], days = [], movement = [], travels = []
  const observers = [
    ['SEASIDE_STATE', state => states.push(state)], ['AUDIO_CONTEXT', context => contexts.push(context)],
    ['SCENE_READY', state => ready.push(state)], ['DAY_TICK', tick => days.push(tick)],
    ['MOVE_INPUT', input => movement.push(input)], ['TRAVEL_REQUEST', travel => travels.push(travel)],
  ]
  for (const [name, listener] of observers) bus.on(name, listener)
  scene.init(identity); scene.create()
  const client = clients.at(-1)
  const actor = account => scene.images.filter(image => !image.destroyed && image.texture.startsWith(`seaside-${account}-`)).at(-1)
  const actors = () => scene.images.filter(image => !image.destroyed && image.texture.startsWith('seaside-') && image.texture !== 'seaside-backdrop')
  const complete = () => { for (const tween of scene.tweens.items) if (tween.isPlaying()) tween.complete() }
  const advance = delta => { mono += delta; realNow += delta; scene.update(mono, delta) }
  const destroy = () => { scene.events.emit('shutdown'); scene.events.emit('destroy'); for (const [name, listener] of observers) bus.off(name, listener) }
  return { scene, client, states, contexts, ready, days, movement, travels, actor, actors, complete, advance, destroy }
}

test('joining leaves both seats empty until a server-confirmed member supplies its seat and identity', () => {
  const t = setup({ reduce: true, identity: { character: 'her', account: 'her', display: '小青' } })
  try {
    assert.equal(t.client.starts, 1); assert.equal(t.client.options.account, 'her')
    assert.deepEqual(t.actors(), []); assert.equal(t.scene.images.length, 1)
    assert.equal(t.states.at(-1).connection.state, 'joining'); assert.deepEqual(t.states.at(-1).members, [])
    assert.deepEqual(t.scene.paintCalls.at(-1)[4], [])
    bus.emit('SEASIDE_ACTION', { action: 'sit' }); bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 120 })
    assert.deepEqual(t.client.poseRequests, []); assert.deepEqual(t.client.clockRequests, [])
    t.client.server(packet({ members: [member('her', 0, 'seated', '小青')] }))
    assert.equal(t.actors().length, 1); assert.equal(t.actor('her').texture, 'seaside-her-seated')
    assert.equal(t.actor('her').x, seasideLayout(560, 370).seats[0]) // 她真实分配在左座，不能按角色硬编码。
    assert.equal(t.states.at(-1).pose, 'seated'); assert.equal(t.states.at(-1).companion, undefined)
    assert.deepEqual(t.ready, [{ scene: 'seaside', identity: { character: 'her', account: 'her', display: '小青' } }])
    const count = t.states.length; bus.emit('SEASIDE_REQUEST_STATE', {}); assert.equal(t.states.length, count + 1)
    bus.emit('IDENTITY_CHANGED', { character: 'her', account: 'her', display: '青' })
    assert.equal(t.actors().length, 1); assert.equal(t.client.starts, 1)
  } finally { t.destroy() }
})

test('two confirmed arrivals use independent actors and animations, including reversed seat assignments', () => {
  const t = setup()
  try {
    t.client.server(packet({ members: [member('bear', 1)] }))
    const bear = t.actor('bear'), first = t.scene.tweens.items[0]
    assert.equal(t.states.at(-1).pose, 'arriving'); assert.equal(first.config.duration, 1400)
    t.client.server(packet({ revision: 2, members: [member('her', 0), member('bear', 1)] }))
    assert.equal(t.actors().length, 2); assert.equal(t.actor('bear'), bear)
    assert.equal(t.scene.tweens.items.length, 2); assert.equal(first.stops, 0)
    assert.equal(t.states.at(-1).companion.account, 'her')
    t.advance(600); assert.ok(bear.texture.startsWith('seaside-bear-standing'))
    t.complete()
    assert.equal(t.states.at(-1).pose, 'seated'); assert.equal(bear.texture, 'seaside-bear-seated')
    assert.equal(bear.x, seasideLayout(560, 370).seats[1]); assert.equal(t.actor('her').x, seasideLayout(560, 370).seats[0])
    assert.deepEqual(t.scene.paintCalls.at(-1)[4].map(item => [item.character, item.seat]), [['her', 0], ['bear', 1]])
    t.client.server(packet({ revision: 3, members: [member('her', 0), member('bear', 1)] }))
    assert.equal(t.scene.tweens.items.length, 2) // 心跳重复快照不能重播入场。
  } finally { t.destroy() }
})

test('pose requests wait for shared server facts and pending requests cannot promise a fake successful action', () => {
  const t = setup({ reduce: true })
  try {
    t.client.server(packet())
    bus.emit('SEASIDE_ACTION', { action: 'stand' })
    assert.deepEqual(t.client.poseRequests, ['standing']); assert.equal(t.states.at(-1).pose, 'seated')
    assert.equal(t.actor('bear').texture, 'seaside-bear-seated')
    t.client.status('connected', { pending: true })
    bus.emit('SEASIDE_ACTION', { action: 'stand' }); bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'reset' })
    assert.deepEqual(t.client.poseRequests, ['standing']); assert.deepEqual(t.client.clockRequests, [])
    assert.equal(t.states.at(-1).connection.pending, true)
    t.client.server(packet({ revision: 2, members: [member('bear', 0, 'standing')] }))
    assert.equal(t.states.at(-1).pose, 'standing'); assert.equal(t.actor('bear').texture, 'seaside-bear-standing')
    bus.emit('SEASIDE_ACTION', { action: 'sit' }); assert.equal(t.states.at(-1).pose, 'standing')
    t.client.server(packet({ revision: 3 }))
    assert.equal(t.states.at(-1).pose, 'seated'); assert.deepEqual(t.client.poseRequests, ['standing', 'seated'])
  } finally { t.destroy() }
})

test('server-confirmed single and mutual leaning use side-specific settling frames and reflow both actors', () => {
  const t = setup()
  try {
    t.client.server(packet({ members: [member('bear', 0), member('her', 1)] })); t.complete()
    bus.emit('SEASIDE_ACTION', { action: 'lean' })
    assert.equal(t.actor('bear').texture, 'seaside-bear-seated'); assert.deepEqual(t.client.poseRequests, ['leaning'])
    t.client.server(packet({ revision: 2, members: [member('bear', 0, 'leaning'), member('her', 1)] }))
    assert.equal(t.actor('bear').texture, 'seaside-bear-leaning-left-settling')
    assert.equal(t.actor('her').texture, 'seaside-her-seated'); t.complete()
    assert.equal(t.actor('bear').texture, 'seaside-bear-leaning-left')
    assert.equal(t.actor('bear').x, seasideActorPosition(560, 370, 0, 'leaning', 'seated').x)
    t.client.server(packet({ revision: 3, members: [member('bear', 0, 'leaning'), member('her', 1, 'leaning')] }))
    assert.equal(t.actor('her').texture, 'seaside-her-leaning-right-settling'); t.complete()
    assert.equal(t.actor('her').texture, 'seaside-her-leaning-right')
    assert.equal(t.actor('bear').x, seasideActorPosition(560, 370, 0, 'leaning', 'leaning').x)
    assert.equal(t.actor('her').x, seasideActorPosition(560, 370, 1, 'leaning', 'leaning').x)
    t.client.server(packet({ revision: 4, members: [member('bear', 0), member('her', 1, 'standing')] })); t.complete()
    assert.equal(t.actor('bear').texture, 'seaside-bear-seated'); assert.equal(t.actor('her').texture, 'seaside-her-standing')
    assert.equal(t.states.at(-1).companion.pose, 'standing')
    t.client.server(packet({ revision: 5, members: [member('bear', 0), member('her', 1)] })); t.complete()
    t.client.server(packet({ revision: 6, members: [member('bear', 0, 'leaning'), member('her', 1)] }))
    const singleLean = t.scene.tweens.items.at(-1)
    t.client.server(packet({ revision: 7, members: [member('bear', 0, 'leaning'), member('her', 1, 'leaning')] }))
    const currentBearTween = t.scene.tweens.items.filter(tween => tween.isPlaying() && tween.config.targets === t.actor('bear')).at(-1)
    assert.equal(currentBearTween.config.x, seasideActorPosition(560, 370, 0, 'leaning', 'leaning').x,
      'a companion leaning during settling must update the active target, not leave a stale single-lean position')
    t.complete(); singleLean.lateComplete()
    assert.equal(t.actor('bear').x, seasideActorPosition(560, 370, 0, 'leaning', 'leaning').x)
    t.client.server(packet({ revision: 8, members: [member('bear', 0, 'leaning'), member('her', 1)] }))
    t.complete()
    assert.equal(t.actor('bear').x, seasideActorPosition(560, 370, 0, 'leaning', 'seated').x)
  } finally { t.destroy() }
})

test('a partner departure clears its actor and footprints, and cannot revive through a late animation callback', () => {
  const t = setup()
  try {
    t.client.server(packet({ members: [member('bear', 0), member('her', 1)] })); t.complete()
    t.client.server(packet({ revision: 2, members: [member('bear', 0, 'leaning'), member('her', 1, 'leaning')] }))
    const her = t.actor('her'), oldTweens = [...t.scene.tweens.items]
    t.client.server(packet({ revision: 3, members: [member('bear', 0)] })); t.complete()
    assert.equal(her.destroyed, true); assert.equal(her.destroys, 1); assert.equal(t.actor('her'), undefined)
    assert.equal(t.actor('bear').texture, 'seaside-bear-seated'); assert.equal(t.states.at(-1).companion, undefined)
    assert.deepEqual(t.scene.paintCalls.at(-1)[4], [{ character: 'bear', seat: 0, pose: 'seated' }])
    const textures = her.textures.length, ownTexture = t.actor('bear').texture
    for (const tween of oldTweens) tween.lateComplete()
    assert.equal(her.textures.length, textures); assert.equal(t.actor('bear').texture, ownTexture)
    assert.equal(t.actors().length, 1)
  } finally { t.destroy() }
})

test('disconnect clears online people, blocks actions, and only explicit retry asks the room to rejoin', () => {
  const t = setup({ reduce: true })
  try {
    t.client.server(packet({ members: [member('bear', 0), member('her', 1)] }))
    const images = t.actors()
    t.client.status('reconnecting', { message: '连接中断' })
    assert.ok(images.every(image => image.destroyed)); assert.deepEqual(t.actors(), [])
    assert.deepEqual(t.states.at(-1).members, []); assert.equal(t.states.at(-1).companion, undefined)
    assert.equal(t.states.at(-1).connection.state, 'reconnecting'); assert.equal(t.states.at(-1).connection.message, '连接中断')
    assert.deepEqual(t.scene.paintCalls.at(-1)[4], [])
    bus.emit('SEASIDE_ACTION', { action: 'lean' }); bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 120 })
    assert.deepEqual(t.client.poseRequests, []); assert.deepEqual(t.client.clockRequests, []); assert.equal(t.client.retries, 0)
    bus.emit('SEASIDE_RECONNECT', {}); assert.equal(t.client.retries, 1)
    t.client.server(packet({ revision: 2, members: [member('bear', 1)] }))
    assert.equal(t.actors().length, 1); assert.equal(t.actor('bear').x, seasideLayout(560, 370).seats[1])
  } finally { t.destroy() }
})

test('panels block pose, scenery, retry and keyboard API calls without restoring island movement or key capture', () => {
  const t = setup({ reduce: true })
  try {
    t.client.server(packet())
    bus.emit('PANEL_OPENED', { panel: 'settings' }); assert.equal(t.scene.input.keyboard.enabled, false)
    bus.emit('SEASIDE_ACTION', { action: 'stand' }); bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 120 })
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'reset' }); bus.emit('SEASIDE_RECONNECT', {})
    t.scene.input.keyboard.emit('keydown', { code: 'Space' }); t.scene.input.keyboard.emit('keydown', { code: 'Escape' })
    assert.deepEqual(t.client.poseRequests, []); assert.deepEqual(t.client.clockRequests, []); assert.equal(t.client.retries, 0)
    assert.deepEqual(t.travels, []); assert.equal(t.actor('bear').texture, 'seaside-bear-seated')
    bus.emit('PANEL_CLOSED', { panel: 'settings' })
    assert.equal(t.scene.input.keyboard.enabled, true); assert.equal(t.scene.input.keyboard.captured, false); assert.deepEqual(t.movement, [])
    bus.emit('SEASIDE_ACTION', { action: 'stand' }); t.client.server(packet({ revision: 2, members: [member('bear', 0, 'standing')] }))
    t.scene.input.keyboard.emit('keydown', { code: 'Space', target: new HTMLElement(true) })
    assert.deepEqual(t.client.poseRequests, ['standing'])
    t.scene.input.keyboard.emit('keydown', { code: 'KeyE', target: new HTMLElement(false) })
    assert.deepEqual(t.client.poseRequests, ['standing', 'seated'])
    t.scene.input.keyboard.emit('keydown', { code: 'Escape' })
    assert.deepEqual(t.travels, [{ from: 'seaside', to: 'island' }])
  } finally { t.destroy() }
})

test('clock controls issue shared API requests and only confirmed anchors affect scenery, never date ticks or playback speed', () => {
  const t = setup({ reduce: true })
  try {
    t.client.server(packet())
    const initial = t.states.at(-1).clock.virtualMs
    assert.equal(t.states.at(-1).clock.time, '18:00') // URL phase=night 不得私自覆盖共享景色。
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 120 })
    assert.deepEqual(t.client.clockRequests, [{ action: 'rate', rate: 120 }]); assert.equal(t.states.at(-1).clock.rate, 1)
    t.client.server(packet({ revision: 2, version: 2, rate: 120, followingReal: false, changedBy: 'bear' })); t.advance(60_000)
    assert.equal(t.states.at(-1).clock.virtualMs, initial + 7_200_000); assert.equal(t.states.at(-1).clock.time, '20:00')
    assert.equal(t.contexts.at(-1).night, 1); assert.equal(t.contexts.at(-1).phase, 'night')
    const held = t.states.at(-1).clock.virtualMs
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 0 })
    assert.equal(t.states.at(-1).clock.rate, 120)
    t.client.server(packet({ revision: 3, version: 3, rate: 0, virtual: held, anchor: realNow, followingReal: false })); t.advance(60_000)
    assert.equal(t.states.at(-1).clock.virtualMs, held)
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'reset' }); assert.equal(t.states.at(-1).clock.virtualMs, held)
    t.client.server(packet({ revision: 4, version: 4, virtual: realNow, anchor: realNow }))
    assert.equal(t.states.at(-1).clock.virtualMs, realNow); assert.equal(t.states.at(-1).clock.followingReal, true)
    const confirmed = t.states.at(-1).clock.virtualMs
    realNow += 6 * 3_600_000; bus.emit('SEASIDE_REQUEST_STATE', {})
    assert.equal(t.states.at(-1).clock.virtualMs, confirmed) // 登录设备系统时间跳变不重写服务端锚点。
    assert.equal(t.scene.time.timeScale, 1); assert.equal(t.scene.sound.rate, 1); assert.deepEqual(t.days, [])
  } finally { t.destroy() }
})

test('resize and reduced motion preserve confirmed members, assigned seats and clock without repeating the join', () => {
  const t = setup({ reduce: true, identity: { character: 'her', display: '她', account: 'her' } })
  try {
    t.client.server(packet({ members: [member('her', 0), member('bear', 1)], rate: 30, followingReal: false })); t.advance(2000)
    const before = t.states.at(-1).clock.virtualMs, her = t.actor('her'), bear = t.actor('bear')
    assert.equal(t.scene.tweens.items.length, 0); assert.deepEqual(t.scene.cameras.main.fades, [])
    t.scene.scale.gameSize = { width: 390, height: 844 }; t.scene.scale.emit('resize')
    assert.equal(t.states.at(-1).clock.virtualMs, before); assert.equal(t.states.at(-1).clock.rate, 30)
    assert.equal(t.actor('her'), her); assert.equal(t.actor('bear'), bear); assert.equal(t.client.starts, 1)
    assert.equal(her.x, seasideLayout(195, 422).seats[0]); assert.equal(her.texture, 'seaside-her-seated')
    t.client.server(packet({ revision: 2, members: [member('her', 0, 'standing'), member('bear', 1)], rate: 30, followingReal: false }))
    t.scene.scale.gameSize = { width: 1000, height: 700 }; t.scene.scale.emit('resize')
    assert.equal(t.states.at(-1).pose, 'standing'); assert.equal(her.texture, 'seaside-her-standing')
    assert.equal(her.y, seasideLayout(500, 350).standingY); assert.equal(t.client.starts, 1)
    assert.ok(t.scene.paintCalls.every(args => args[3] === 0))
  } finally { t.destroy() }
})

test('enabling reduced motion ends only visual arrivals and keeps confirmed seated or leaning facts intact', () => {
  const t = setup()
  try {
    t.client.server(packet({ members: [member('bear', 0), member('her', 1)] })); t.advance(600)
    const arrival = t.scene.tweens.items[0]
    assert.ok(t.scene.paintCalls.some(args => args[3] > 0)); media.change(true)
    assert.equal(arrival.stopped, true); assert.equal(t.states.at(-1).pose, 'seated')
    assert.equal(t.actor('bear').texture, 'seaside-bear-seated'); assert.equal(t.scene.paintCalls.at(-1)[3], 0)
    t.client.server(packet({ revision: 2, members: [member('bear', 0, 'leaning'), member('her', 1)] }))
    assert.equal(t.actor('bear').texture, 'seaside-bear-leaning-left')
    assert.equal(t.scene.tweens.items.length, 2); assert.equal(t.client.starts, 1)
    arrival.lateComplete(); assert.equal(t.actor('bear').texture, 'seaside-bear-leaning-left')
  } finally { t.destroy() }
})

test('shutdown, destroy and same-instance reentry clean up once and reject all callbacks from the previous room lifetime', () => {
  const t = setup()
  try {
    t.client.server(packet({ members: [member('bear', 0), member('her', 1)] }))
    const oldClient = t.client, oldTweens = [...t.scene.tweens.items], keyboard = t.scene.input.keyboard
    assert.equal(media.activeListeners.size, 1); for (const name of subscribed) assert.equal(bus.listenerCount(name), 1)
    const resets = keyboard.resets; t.scene.game.events.emit('blur'); assert.equal(keyboard.resets, resets + 1)
    t.scene.events.emit('shutdown'); t.scene.events.emit('destroy')
    assert.equal(oldClient.disposals, 1); assert.ok(oldTweens.every(tween => tween.stops === 1))
    assert.deepEqual(keyboard.removed, ['E', 'SPACE', 'ESC']); assert.equal(keyboard.listenerCount('keydown'), 0)
    assert.equal(t.scene.game.events.listenerCount('blur'), 0); assert.equal(t.scene.scale.listenerCount('resize'), 0)
    assert.equal(media.activeListeners.size, 0); for (const name of subscribed) assert.equal(bus.listenerCount(name), 0)
    assert.equal(t.scene.events.listenerCount('shutdown'), 0); assert.equal(t.scene.events.listenerCount('destroy'), 0)
    const count = t.states.length; oldClient.server(packet({ revision: 2 })); oldTweens.forEach(tween => tween.lateComplete())
    assert.equal(t.states.length, count); assert.deepEqual(t.actors(), [])
    t.scene.init({ character: 'her', display: '她', account: 'her' }); t.scene.create()
    const newClient = clients.at(-1)
    newClient.server(packet({ epoch: 'room-second', members: [member('her', 0)] })); t.complete()
    const her = t.actor('her'), latest = t.states.at(-1), after = t.states.length
    oldClient.server(packet({ epoch: 'room-first', revision: 99, members: [member('bear', 1)] }))
    oldClient.status('expired'); oldTweens.forEach(tween => tween.lateComplete())
    assert.equal(t.states.length, after); assert.equal(t.states.at(-1), latest); assert.equal(t.actor('her'), her)
    assert.equal(her.destroyed, false); assert.equal(t.actor('bear'), undefined)
    assert.equal(newClient.starts, 1); assert.equal(media.activeListeners.size, 1)
    for (const name of subscribed) assert.equal(bus.listenerCount(name), 1)
    t.scene.events.emit('destroy'); t.scene.events.emit('shutdown')
    assert.equal(newClient.disposals, 1); assert.equal(keyboard.removed.length, 6)
    assert.equal(media.activeListeners.size, 0); for (const name of subscribed) assert.equal(bus.listenerCount(name), 0)
    assert.equal(t.scene.events.listenerCount('shutdown'), 0); assert.equal(t.scene.events.listenerCount('destroy'), 0)
  } finally { t.destroy() }
})

test('rapid travel releases a pending room or active seat and late joins or animations cannot place anyone back', () => {
  const joining = setup()
  try {
    bus.emit('SCENE_CHANGED', { scene: 'island', transitioning: true }); assert.equal(joining.client.disposals, 0)
    bus.emit('SCENE_CHANGED', { scene: 'seaside', transitioning: true }); assert.equal(joining.client.disposals, 1)
    const count = joining.states.length
    joining.client.server(packet({ members: [member('bear', 0), member('her', 1)] }))
    bus.emit('SEASIDE_ACTION', { action: 'stand' }); bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'reset' }); bus.emit('SEASIDE_RECONNECT', {})
    assert.deepEqual(joining.actors(), []); assert.equal(joining.states.length, count)
    assert.deepEqual(joining.client.poseRequests, []); assert.deepEqual(joining.client.clockRequests, []); assert.equal(joining.client.retries, 0)
  } finally { joining.destroy() }
  const active = setup()
  try {
    active.client.server(packet()); const arrival = active.scene.tweens.items[0], actor = active.actor('bear')
    bus.emit('SCENE_CHANGED', { scene: 'seaside', transitioning: true })
    assert.equal(arrival.stopped, true); assert.equal(active.client.disposals, 1)
    const count = active.states.length, texture = actor.texture
    arrival.lateComplete(); media.change(true); active.client.server(packet({ revision: 2, members: [member('bear', 0, 'leaning'), member('her', 1)] }))
    assert.equal(active.states.length, count); assert.equal(actor.texture, texture); assert.equal(active.actor('her'), undefined)
    active.scene.events.emit('shutdown'); assert.deepEqual(active.actors(), []); assert.equal(active.client.disposals, 1)
  } finally { active.destroy() }
})
