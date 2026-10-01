import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import ts from 'typescript'

const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const audioUrl = moduleUrl(compile('../src/audio/types.ts'))
const clockUrl = moduleUrl(compile('../src/seaside/clock.ts')
  .replace(/from ['"]\.\.\/audio\/types['"]/, `from '${audioUrl}'`))

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
  constructor(x, y, texture) { this.x = x; this.y = y; this.texture = texture; this.textures = [texture] }
  setOrigin(...origin) { this.origin = origin; return this }
  setCrop(...crop) { this.crop = crop; return this }
  setDepth(depth) { this.depth = depth; return this }
  setPosition(x, y) { this.x = x; this.y = y; return this }
  setTexture(texture) { this.texture = texture; this.textures.push(texture); return this }
}
class Keyboard extends EventEmitter {
  enabled = true
  captured = false
  resets = 0
  removed = []
  resetKeys() { this.resets++ }
  disableGlobalCapture() { this.captured = false }
  addKeys(names, capture) {
    this.captured = capture
    return Object.fromEntries(names.split(',').map(name => [name, { name }]))
  }
  removeKey(key) { this.removed.push(key.name) }
}
class Scene {
  constructor() {
    this.events = new EventEmitter()
    this.game = { events: new EventEmitter() }
    this.scale = new ContextEmitter()
    this.scale.gameSize = { width: 1120, height: 740 }
    this.input = { keyboard: new Keyboard() }
    this.images = []
    this.add = { image: (x, y, texture) => {
      const image = new Image(x, y, texture); this.images.push(image); return image
    } }
    this.cameras = { main: {
      zoom: 1, center: [], fades: [],
      setZoom(zoom) { this.zoom = zoom; return this },
      centerOn(...center) { this.center = center; return this },
      fadeIn(duration) { this.fades.push(duration) },
    } }
    this.tweens = { items: [], add: config => {
      const tween = { config, stopped: false, stops: 0,
        stop() { this.stopped = true; this.stops++ },
        complete() {
          if (this.stopped) return
          config.targets.setPosition(config.x, config.y)
          config.onComplete()
        },
        lateComplete() { config.onComplete() },
      }
      this.tweens.items.push(tween); return tween
    } }
    // 数值守卫：景色倍率绝不能写到 Phaser 全局时间或播放速度。
    this.time = Object.freeze({ timeScale: 1 })
    this.sound = Object.freeze({ rate: 1 })
    this.paintCalls = []
  }
}
const layout = (width, height) => ({ seatY: height - 38, standingY: height - 20, seats: [width / 2 - 12, width / 2 + 12] })
globalThis.__seasideTestArt = {
  createSeasideArt: scene => { scene.artCreates = (scene.artCreates ?? 0) + 1 },
  paintSeaside: (scene, ...args) => scene.paintCalls.push(args),
  seasideLayout: layout,
  SEASIDE_BACKDROP: 'seaside-backdrop', SEASIDE_MAX: 560,
}
globalThis.__seasideTestPhaser = { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } } }
const source = compile('../src/game/scenes/SeasideScene.ts')
  .replace(/import Phaser from ['"]phaser['"];?/, 'const Phaser = globalThis.__seasideTestPhaser;')
  .replace(/import \{ eventBus \} from ['"]\.\.\/EventBus['"];?/, 'const eventBus = globalThis.__seasideTestBus;')
  .replace(/import \{([^}]+)\} from ['"]\.\.\/art\/seaside['"];?/, 'const {$1} = globalThis.__seasideTestArt;')
  .replace(/from ['"]\.\.\/\.\.\/seaside\/clock['"]/, `from '${clockUrl}'`)
const { SeasideScene } = await import(moduleUrl(source))
const subscribed = ['SEASIDE_ACTION', 'SEASIDE_CLOCK_REQUEST', 'SEASIDE_REQUEST_STATE', 'IDENTITY_CHANGED', 'PANEL_OPENED', 'PANEL_CLOSED', 'SCENE_CHANGED']

function setup({ reduce = false, identity = { character: 'bear', display: '小熊' } } = {}) {
  mono = 100; realNow = baseRealMs; media.matches = reduce; window.location.search = ''
  const scene = new SeasideScene(), states = [], contexts = [], ready = [], days = [], movement = [], travels = []
  const observers = [
    ['SEASIDE_STATE', state => states.push(state)], ['AUDIO_CONTEXT', context => contexts.push(context)],
    ['SCENE_READY', state => ready.push(state)], ['DAY_TICK', tick => days.push(tick)],
    ['MOVE_INPUT', input => movement.push(input)], ['TRAVEL_REQUEST', travel => travels.push(travel)],
  ]
  for (const [name, listener] of observers) bus.on(name, listener)
  scene.init(identity); scene.create()
  const actor = () => scene.images.filter(image => image.texture.startsWith('seaside-') && image.texture !== 'seaside-backdrop').at(-1)
  const advance = delta => { mono += delta; realNow += delta; scene.update(mono, delta) }
  const destroy = () => {
    scene.events.emit('shutdown'); scene.events.emit('destroy')
    for (const [name, listener] of observers) bus.off(name, listener)
  }
  return { scene, states, contexts, ready, days, movement, travels, actor, advance, destroy }
}

test('only the authenticated identity is drawn, with dedicated sitting art and re-readable state', () => {
  const { scene, states, contexts, ready, actor, destroy } = setup({ identity: { character: 'her', display: '小青' } })
  try {
    assert.equal(scene.images.length, 2) // 背景与一个真实角色；空座不画虚假在线人物。
    assert.equal(actor().texture, 'seaside-her-standing')
    assert.equal(states.at(-1).pose, 'arriving')
    scene.tweens.items.at(-1).complete()
    assert.equal(states.at(-1).pose, 'seated')
    assert.equal(actor().texture, 'seaside-her-seated')
    assert.deepEqual(ready, [{ scene: 'seaside', identity: { character: 'her', display: '小青' } }])
    const count = states.length
    bus.emit('SEASIDE_REQUEST_STATE', {})
    assert.equal(states.length, count + 1)
    assert.equal(states.at(-1).pose, 'seated')
    assert.equal(contexts.at(-1).scene, 'seaside')
    bus.emit('IDENTITY_CHANGED', { character: 'her', display: '青' })
    assert.equal(scene.images.length, 2)
    assert.equal(actor().texture, 'seaside-her-seated')
  } finally { destroy() }
})

test('local clock changes affect only scenery and ambience context, never real-date ticks or playback speed', () => {
  const { scene, states, contexts, days, advance, destroy } = setup({ reduce: true })
  try {
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 120 })
    const initial = states.at(-1).clock.virtualMs
    advance(60_000)
    assert.equal(states.at(-1).clock.virtualMs, initial + 7_200_000)
    assert.equal(states.at(-1).clock.time, '20:00')
    assert.equal(contexts.at(-1).night, 1)
    assert.equal(contexts.at(-1).phase, 'night')
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 0 })
    const held = states.at(-1).clock.virtualMs
    advance(60_000)
    assert.equal(states.at(-1).clock.virtualMs, held)
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 1 })
    assert.equal(states.at(-1).clock.followingReal, false)
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'reset' })
    assert.equal(states.at(-1).clock.virtualMs, realNow)
    assert.equal(states.at(-1).clock.followingReal, true)
    assert.equal(scene.time.timeScale, 1)
    assert.equal(scene.sound.rate, 1)
    assert.deepEqual(days, [])
  } finally { destroy() }
})

test('panels block pose/clock/key actions; closing never restores island movement or key capture', () => {
  const { scene, states, travels, movement, actor, destroy } = setup({ reduce: true })
  try {
    const initial = states.at(-1)
    bus.emit('PANEL_OPENED', { panel: 'settings' })
    assert.equal(scene.input.keyboard.enabled, false)
    bus.emit('SEASIDE_ACTION', { action: 'stand' })
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 120 })
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'reset' })
    scene.input.keyboard.emit('keydown', { code: 'Space' })
    scene.input.keyboard.emit('keydown', { code: 'Escape' })
    bus.emit('SEASIDE_REQUEST_STATE', {})
    assert.equal(states.at(-1).pose, initial.pose)
    assert.equal(states.at(-1).clock.rate, 1)
    assert.equal(actor().texture, 'seaside-bear-seated')
    assert.deepEqual(travels, [])
    bus.emit('PANEL_CLOSED', { panel: 'settings' })
    assert.equal(scene.input.keyboard.enabled, true)
    assert.equal(scene.input.keyboard.captured, false)
    assert.deepEqual(movement, [])
    bus.emit('SEASIDE_ACTION', { action: 'stand' })
    assert.equal(states.at(-1).pose, 'standing')
    assert.equal(actor().texture, 'seaside-bear-standing')
    scene.input.keyboard.emit('keydown', { code: 'Space', target: new HTMLElement(true) })
    assert.equal(states.at(-1).pose, 'standing') // 操作 DOM 按钮不同时触发角色。
    scene.input.keyboard.emit('keydown', { code: 'KeyE', target: new HTMLElement(false) })
    assert.equal(states.at(-1).pose, 'seated')
    scene.input.keyboard.emit('keydown', { code: 'Escape' })
    assert.deepEqual(travels, [{ from: 'seaside', to: 'island' }])
  } finally { destroy() }
})

test('resize preserves the clock, identity and sitting/standing pose while relaying out the same actor', () => {
  const { scene, states, actor, advance, destroy } = setup({ reduce: true, identity: { character: 'her', display: '她' } })
  try {
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 30 })
    advance(2000)
    const before = states.at(-1).clock.virtualMs, original = actor()
    scene.scale.gameSize = { width: 390, height: 844 }
    scene.scale.emit('resize')
    bus.emit('SEASIDE_REQUEST_STATE', {})
    assert.equal(states.at(-1).clock.virtualMs, before)
    assert.equal(states.at(-1).clock.rate, 30)
    assert.equal(states.at(-1).pose, 'seated')
    assert.equal(actor(), original)
    assert.equal(actor().texture, 'seaside-her-seated')
    const expected = layout(195, 422)
    assert.equal(actor().x, expected.seats[1])
    assert.equal(actor().y, expected.seatY + 2)
    bus.emit('SEASIDE_ACTION', { action: 'stand' })
    scene.scale.gameSize = { width: 1000, height: 700 }; scene.scale.emit('resize')
    bus.emit('SEASIDE_REQUEST_STATE', {})
    assert.equal(states.at(-1).pose, 'standing')
    assert.equal(states.at(-1).clock.virtualMs, before)
    assert.equal(actor().texture, 'seaside-her-standing')
  } finally { destroy() }
})

test('repeated sit requests do not duplicate arrival; travel prevents late completion, actions and motion changes', () => {
  const { scene, states, actor, destroy } = setup()
  try {
    const arrival = scene.tweens.items[0]
    bus.emit('SEASIDE_ACTION', { action: 'sit' }); bus.emit('SEASIDE_ACTION', { action: 'stand' })
    assert.equal(scene.tweens.items.length, 1)
    bus.emit('SCENE_CHANGED', { scene: 'island', transitioning: true }) // 无关场景不取消入座。
    assert.equal(arrival.stops, 0)
    bus.emit('SCENE_CHANGED', { scene: 'seaside', transitioning: true })
    assert.equal(arrival.stopped, true)
    const count = states.length
    arrival.lateComplete()
    bus.emit('SEASIDE_ACTION', { action: 'stand' })
    bus.emit('SEASIDE_ACTION', { action: 'sit' })
    bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 120 })
    assert.equal(states.length, count)
    media.change(true)
    bus.emit('SEASIDE_REQUEST_STATE', {})
    assert.equal(states.at(-1).pose, 'arriving')
    assert.equal(states.at(-1).clock.rate, 1)
    assert.equal(actor().texture, 'seaside-bear-standing')
    assert.equal(scene.tweens.items.length, 1)
  } finally { destroy() }
})

test('reduced motion enters directly seated and keeps water animation static; changing the preference cancels walking', () => {
  const direct = setup({ reduce: true })
  try {
    assert.equal(direct.states.at(-1).pose, 'seated')
    assert.equal(direct.scene.tweens.items.length, 0)
    assert.deepEqual(direct.scene.cameras.main.fades, [])
    direct.advance(10_000)
    assert.ok(direct.scene.paintCalls.every(args => args[3] === 0))
  } finally { direct.destroy() }
  const changing = setup()
  try {
    changing.advance(600)
    assert.ok(changing.scene.paintCalls.some(args => args[3] > 0))
    media.change(true)
    assert.equal(changing.scene.tweens.items[0].stopped, true)
    assert.equal(changing.states.at(-1).pose, 'seated')
    assert.equal(changing.actor().texture, 'seaside-bear-seated')
    assert.equal(changing.scene.paintCalls.at(-1)[3], 0)
  } finally { changing.destroy() }
})

test('shutdown/destroy clear listeners and keys exactly once; reentering the same scene cannot accumulate them', () => {
  const { scene, states, destroy } = setup()
  try {
    const keyboard = scene.input.keyboard, tween = scene.tweens.items[0]
    assert.equal(media.activeListeners.size, 1)
    for (const name of subscribed) assert.equal(bus.listenerCount(name), 1)
    const resets = keyboard.resets
    scene.game.events.emit('blur')
    assert.equal(keyboard.resets, resets + 1)
    scene.events.emit('shutdown')
    assert.equal(tween.stops, 1)
    assert.deepEqual(keyboard.removed, ['E', 'SPACE', 'ESC'])
    assert.equal(keyboard.listenerCount('keydown'), 0)
    assert.equal(scene.game.events.listenerCount('blur'), 0)
    assert.equal(scene.scale.listenerCount('resize'), 0)
    assert.equal(media.activeListeners.size, 0)
    for (const name of subscribed) assert.equal(bus.listenerCount(name), 0)
    assert.equal(scene.events.listenerCount('shutdown'), 0)
    assert.equal(scene.events.listenerCount('destroy'), 0)
    const count = states.length
    bus.emit('SEASIDE_REQUEST_STATE', {}); bus.emit('SEASIDE_ACTION', { action: 'stand' })
    assert.equal(states.length, count)
    scene.init({ character: 'her', display: '她' }); scene.create()
    assert.equal(media.activeListeners.size, 1)
    assert.equal(scene.events.listenerCount('shutdown'), 1)
    assert.equal(scene.events.listenerCount('destroy'), 1)
    for (const name of subscribed) assert.equal(bus.listenerCount(name), 1)
    const latest = scene.tweens.items.at(-1)
    scene.events.emit('destroy'); scene.events.emit('shutdown')
    assert.equal(latest.stops, 1)
    assert.equal(keyboard.removed.length, 6)
    assert.equal(media.activeListeners.size, 0)
    for (const name of subscribed) assert.equal(bus.listenerCount(name), 0)
    assert.equal(scene.events.listenerCount('shutdown'), 0)
    assert.equal(scene.events.listenerCount('destroy'), 0)
  } finally { destroy() }
})
