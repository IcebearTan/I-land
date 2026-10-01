import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import ts from 'typescript'

const bus = new EventEmitter()
const reducedMotion = { matches: false }
globalThis.window = { matchMedia: () => reducedMotion }
globalThis.__navigationTestBus = bus

class Camera extends EventEmitter {
  fades = []
  fadeEffect = { reset: () => { this.resets = (this.resets ?? 0) + 1 } }
  fadeOut(duration) { this.fades.push(duration) }
  finish() { this.emit('fadeoutcomplete') }
}

function manager() {
  const timers = [], queue = [], starts = [], scenes = new Map()
  const visual = key => {
    const scene = { key, active: key === 'Login', cameras: { main: new Camera() } }
    scene.scene = {
      isActive: () => scene.active,
      start: (target, data) => { const request = { from: key, target, data }; starts.push(request); queue.push(request) },
    }
    return scene
  }
  for (const key of ['Login', 'Island', 'Seaside']) scenes.set(key, visual(key))
  return {
    timers, starts, scenes,
    plugin: {
      get: key => scenes.get(key),
      isActive: key => scenes.get(key)?.active ?? false,
      launch: (target, data) => { const request = { from: 'Navigation', target, data }; starts.push(request); queue.push(request) },
    },
    clock: { delayedCall: (delay, callback) => {
      const timer = { delay, callback, active: true, remove: () => { timer.active = false } }
      timers.push(timer); return timer
    } },
    flush: () => { for (const timer of timers.splice(0)) if (timer.active) { timer.active = false; timer.callback() } },
    commit: () => { for (const { from, target } of queue.splice(0)) {
      if (scenes.has(from)) scenes.get(from).active = false
      scenes.get(target).active = true
    } },
    active: key => { for (const scene of scenes.values()) scene.active = scene.key === key },
  }
}

class Scene {
  constructor() {
    this.events = new EventEmitter()
    this.scene = globalThis.__navigationTestManager.plugin
    this.time = globalThis.__navigationTestManager.clock
  }
}
globalThis.__navigationTestPhaser = { Scene,
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
  Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: 'fadeoutcomplete' } } },
}
const source = ts.transpileModule(fs.readFileSync(new URL('../src/game/scenes/NavigationScene.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace(/import Phaser from ['"]phaser['"];?/, 'const Phaser = globalThis.__navigationTestPhaser;')
  .replace(/import \{ eventBus \} from ['"]\.\.\/EventBus['"];?/, 'const eventBus = globalThis.__navigationTestBus;')
const { NavigationScene } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const identity = { character: 'her', display: '她' }
function setup(reduce = false) {
  reducedMotion.matches = reduce
  const world = manager()
  globalThis.__navigationTestManager = world
  const scene = new NavigationScene(), snapshots = []
  const listen = state => snapshots.push(state)
  bus.on('SCENE_CHANGED', listen)
  scene.create()
  return { scene, world, snapshots, destroy: () => { scene.events.emit('shutdown'); bus.off('SCENE_CHANGED', listen) } }
}
function onIsland(world) {
  world.active('Island')
  bus.emit('SCENE_READY', { scene: 'island', identity })
}

test('login handoff remains on source scene until ready, uses latest identity, keeps navigator alive', () => {
  const { scene, world, snapshots, destroy } = setup()
  try {
    bus.emit('ENTER_ISLAND', identity)
    bus.emit('IDENTITY_CHANGED', { ...identity, display: '小青' })
    bus.emit('ENTER_ISLAND', identity) // 快速登录事件不排第二次转场。
    assert.deepEqual(world.scenes.get('Login').cameras.main.fades, [250])
    assert.deepEqual(snapshots.at(-1), { scene: 'login', transitioning: true })
    world.scenes.get('Login').cameras.main.finish()
    assert.equal(world.starts.length, 0)
    assert.equal(world.timers.at(-1).delay, 16)
    world.flush()
    assert.deepEqual(world.starts, [{ from: 'Login', target: 'Island', data: { character: 'her', display: '小青' } }])
    world.commit(); bus.emit('SCENE_READY', { scene: 'island', identity: { character: 'her', display: '小青' } })
    assert.deepEqual(snapshots.at(-1), { scene: 'island', transitioning: false })
    assert.equal(scene.events.listenerCount('shutdown'), 1)
    const count = snapshots.length
    bus.emit('SCENE_REQUEST_STATE', {})
    assert.equal(snapshots.length, count + 1)
  } finally { destroy() }
})

test('travel validates current source, rejects duplicates, preserves identity and safe return point', () => {
  const { world, destroy } = setup(true)
  try {
    bus.emit('TRAVEL_REQUEST', { from: 'island', to: 'seaside' })
    assert.equal(world.timers.length, 0)
    onIsland(world)
    bus.emit('TRAVEL_REQUEST', { from: 'seaside', to: 'island' })
    bus.emit('TRAVEL_REQUEST', { from: 'island', to: 'island' })
    assert.equal(world.timers.length, 0)
    const point = { x: 360, y: 338 }
    bus.emit('TRAVEL_REQUEST', { from: 'island', to: 'seaside', returnPoint: point })
    point.x = 999 // 导航保存自己的快照，不持有调用方可变对象。
    bus.emit('TRAVEL_REQUEST', { from: 'island', to: 'seaside' })
    world.flush()
    assert.deepEqual(world.starts, [{ from: 'Island', target: 'Seaside', data: identity }])
    world.commit(); bus.emit('SCENE_READY', { scene: 'seaside', identity })
    bus.emit('IDENTITY_CHANGED', { character: 'her', display: '小青' })
    bus.emit('TRAVEL_REQUEST', { from: 'seaside', to: 'island' })
    world.flush()
    assert.deepEqual(world.starts.at(-1), { from: 'Seaside', target: 'Island', data: {
      character: 'her', display: '小青', returnPoint: { x: 360, y: 338 },
    } })
  } finally { destroy() }
})

test('logout cancels an unfinished fade and prevents stale travel from reaching seaside', () => {
  const { world, snapshots, destroy } = setup()
  try {
    onIsland(world)
    bus.emit('TRAVEL_REQUEST', { from: 'island', to: 'seaside' })
    const camera = world.scenes.get('Island').cameras.main
    assert.equal(camera.listenerCount('fadeoutcomplete'), 1)
    bus.emit('EXIT_TO_LOGIN', {})
    assert.equal(camera.listenerCount('fadeoutcomplete'), 0)
    camera.finish()
    bus.emit('TRAVEL_REQUEST', { from: 'island', to: 'seaside' })
    bus.emit('ENTER_ISLAND', identity)
    world.flush()
    assert.deepEqual(world.starts, [{ from: 'Island', target: 'Login', data: undefined }])
    world.commit(); bus.emit('SCENE_READY', { scene: 'login' })
    assert.deepEqual(snapshots.at(-1), { scene: 'login', transitioning: false })
  } finally { destroy() }
})

test('logout after Phaser queued start makes a late seaside ready immediately return to login', () => {
  const { world, snapshots, destroy } = setup(true)
  try {
    onIsland(world)
    bus.emit('TRAVEL_REQUEST', { from: 'island', to: 'seaside' }); world.flush()
    assert.equal(world.starts.at(-1).target, 'Seaside')
    bus.emit('EXIT_TO_LOGIN', {})
    world.commit(); bus.emit('SCENE_READY', { scene: 'seaside', identity })
    assert.deepEqual(snapshots.at(-1), { scene: 'seaside', transitioning: true })
    world.flush()
    assert.equal(world.starts.at(-1).from, 'Seaside')
    assert.equal(world.starts.at(-1).target, 'Login')
    assert.equal(world.starts.at(-1).data, undefined)
    assert.equal(world.starts.filter(item => item.target === 'Login').length, 1)
    world.commit(); bus.emit('SCENE_READY', { scene: 'login' })
    assert.deepEqual(snapshots.at(-1), { scene: 'login', transitioning: false })
  } finally { destroy() }
})

test('destroy during queued handoff cancels timers and unbinds listeners exactly once', () => {
  const { scene, world, destroy } = setup(true)
  onIsland(world)
  bus.emit('TRAVEL_REQUEST', { from: 'island', to: 'seaside' })
  scene.events.emit('destroy')
  scene.events.emit('shutdown')
  world.flush()
  assert.equal(world.starts.length, 0)
  for (const name of ['ENTER_ISLAND', 'IDENTITY_CHANGED', 'SCENE_READY', 'TRAVEL_REQUEST', 'EXIT_TO_LOGIN', 'SCENE_REQUEST_STATE']) {
    assert.equal(bus.listenerCount(name), 0)
  }
  assert.equal(scene.events.listenerCount('shutdown'), 0)
  assert.equal(scene.events.listenerCount('destroy'), 0)
  destroy()
})
