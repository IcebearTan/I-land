import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const load = async file => import(moduleUrl(compile(fs.readFileSync(new URL(file, import.meta.url), 'utf8'))))
const { homeWalkable, homeSegmentClear, homeRoute } = await load('../src/interior/navigation.ts')

// 直接读取运行时 Tiled 数据；独立几何断言不复制一套家具坐标。
const mapText = fs.readFileSync(new URL('../public/art-v2/home-room.tmj', import.meta.url), 'utf8')
const mapCode = compile(fs.readFileSync(new URL('../src/interior/layout.ts', import.meta.url), 'utf8')).replace(/import tiledRoom from ['"][^'"]+['"];?/, `const tiledRoom = ${JSON.stringify(mapText)};`)
const { HOME_LAYOUT } = await import(moduleUrl(mapCode))

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

// 独立连续几何检查：将家具扩为脚底禁止区，求线段进入开矩形的区间。
// 它可发现采样漏掉的细小穿角，不依赖寻路器的网格或安全判断实现。
function interiorInterval(a, b, low, high) {
  if (a === b) return a > low && a < high ? [-Infinity, Infinity] : null
  const first = (low - a) / (b - a), last = (high - a) / (b - a)
  return [Math.min(first, last), Math.max(first, last)]
}
function assertSafeSegment(room, a, b) {
  const area = room.walkable
  for (const point of [a, b]) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), 'route coordinates are finite')
    assert.ok(point.x - 4 >= area.x && point.x + 4 <= area.x + area.w && point.y - 4 >= area.y && point.y <= area.y + area.h, 'the complete feet footprint stays in the floor bounds')
  }
  for (const obstacle of [...room.walls, ...room.furniture]) {
    const horizontal = interiorInterval(a.x, b.x, obstacle.x - 4, obstacle.x + obstacle.w + 4)
    const vertical = interiorInterval(a.y, b.y, obstacle.y, obstacle.y + obstacle.h + 4)
    if (!horizontal || !vertical) continue
    const entry = Math.max(0, horizontal[0], vertical[0]), exit = Math.min(1, horizontal[1], vertical[1])
    assert.ok(entry >= exit - 1e-9, `route segment enters furniture/wall ${JSON.stringify(obstacle)}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`)
  }
}
function assertSafeRoute(room, start, target, route) {
  assert.ok(route?.length, 'the destination has a route')
  assert.deepEqual(route.at(-1), target, 'route reaches the requested destination exactly')
  let previous = start
  for (const waypoint of route) {
    assertSafeSegment(room, previous, waypoint)
    previous = waypoint
  }
}

for (const [name, target] of [
  ['television', HOME_LAYOUT.tv],
  ['fireplace', HOME_LAYOUT.fireplace],
  ['left sofa stand point', HOME_LAYOUT.standPoints[0]],
  ['right sofa stand point', HOME_LAYOUT.standPoints[1]],
]) {
  test(`door can reach ${name} and return with safe feet throughout`, () => {
    assertSafeRoute(HOME_LAYOUT, HOME_LAYOUT.door, target, homeRoute(HOME_LAYOUT, HOME_LAYOUT.door, target))
    assertSafeRoute(HOME_LAYOUT, target, HOME_LAYOUT.door, homeRoute(HOME_LAYOUT, target, HOME_LAYOUT.door))
  })
}

test('walking from below the sofa to its front takes a real detour', () => {
  const start = HOME_LAYOUT.standPoints[0]
  const target = { x: start.x, y: HOME_LAYOUT.sofa.y - 8 }
  assert.equal(homeSegmentClear(HOME_LAYOUT, start, target), false, 'the sofa blocks the direct segment')
  const route = homeRoute(HOME_LAYOUT, start, target)
  assertSafeRoute(HOME_LAYOUT, start, target, route)
  assert.ok(route.some(point => point.x <= HOME_LAYOUT.sofa.x - 4 || point.x >= HOME_LAYOUT.sofa.x + HOME_LAYOUT.sofa.w + 4), 'at least one waypoint goes around an outer side of the sofa')
  let previous = start, length = 0
  for (const point of route) { length += distance(previous, point); previous = point }
  assert.ok(length > distance(start, target) + 20, 'the route does not smooth away the furniture detour')
})

test('feet cannot diagonally cut the lower sofa corner', () => {
  const sofa = HOME_LAYOUT.sofa
  const start = { x: sofa.x - 4, y: sofa.y + sofa.h }
  const target = { x: sofa.x + 8, y: sofa.y + sofa.h + 4 }
  assert.equal(homeWalkable(HOME_LAYOUT, start.x, start.y), true)
  assert.equal(homeWalkable(HOME_LAYOUT, target.x, target.y), true)
  assert.equal(homeSegmentClear(HOME_LAYOUT, start, target), false)
  assertSafeRoute(HOME_LAYOUT, start, target, homeRoute(HOME_LAYOUT, start, target))
})

test('a short fractional movement cannot slip between collision samples at the sofa corner', () => {
  const sofa = HOME_LAYOUT.sofa
  const corner = { x: sofa.x - 4, y: sofa.y + sofa.h + 4 }
  const start = { x: corner.x - .9, y: corner.y - .9 }
  const target = { x: corner.x + .5, y: corner.y + .3 }
  assert.equal(homeWalkable(HOME_LAYOUT, start.x, start.y), true)
  assert.equal(homeWalkable(HOME_LAYOUT, target.x, target.y), true)
  assert.equal(homeSegmentClear(HOME_LAYOUT, start, target), false, 'the interior of the movement segment clips the sofa despite safe endpoints')
  assertSafeRoute(HOME_LAYOUT, start, target, homeRoute(HOME_LAYOUT, start, target))
})

test('furniture, walls and a foot over the room boundary cannot become destinations', () => {
  const area = HOME_LAYOUT.walkable
  const invalid = [
    ...HOME_LAYOUT.furniture.map(rect => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })),
    ...HOME_LAYOUT.walls.map(rect => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })),
    { x: area.x + 3, y: HOME_LAYOUT.door.y },
    { x: area.x + area.w - 3, y: HOME_LAYOUT.door.y },
    { x: HOME_LAYOUT.door.x, y: area.y + 3 },
    { x: HOME_LAYOUT.door.x, y: area.y + area.h + 1 },
  ]
  for (const point of invalid) {
    assert.equal(homeWalkable(HOME_LAYOUT, point.x, point.y), false, JSON.stringify(point))
    assert.equal(homeRoute(HOME_LAYOUT, HOME_LAYOUT.door, point), null, 'reject an unsafe destination')
    assert.equal(homeRoute(HOME_LAYOUT, point, HOME_LAYOUT.door), null, 'reject an unsafe starting position')
  }
})

test('nonfinite coordinates are rejected by every navigation entry point', () => {
  for (const value of [NaN, Infinity, -Infinity]) for (const axis of ['x', 'y']) {
    const point = { ...HOME_LAYOUT.door, [axis]: value }
    assert.equal(homeWalkable(HOME_LAYOUT, point.x, point.y), false)
    assert.equal(homeRoute(HOME_LAYOUT, point, HOME_LAYOUT.tv), null)
    assert.equal(homeRoute(HOME_LAYOUT, HOME_LAYOUT.tv, point), null)
    assert.equal(homeSegmentClear(HOME_LAYOUT, point, HOME_LAYOUT.tv), false, `unsafe ${axis} in segment start`)
    assert.equal(homeSegmentClear(HOME_LAYOUT, HOME_LAYOUT.tv, point), false, `unsafe ${axis} in segment end`)
  }
})

test('a full-width partition returns null rather than a path through an unreachable room', () => {
  const area = HOME_LAYOUT.walkable
  const partition = { x: area.x, y: (HOME_LAYOUT.tv.y + HOME_LAYOUT.door.y) / 2, w: area.w, h: 4 }
  const divided = { ...HOME_LAYOUT, furniture: [...HOME_LAYOUT.furniture, partition] }
  assert.equal(homeWalkable(divided, HOME_LAYOUT.door.x, HOME_LAYOUT.door.y), true)
  assert.equal(homeWalkable(divided, HOME_LAYOUT.tv.x, HOME_LAYOUT.tv.y), true)
  assert.equal(homeRoute(divided, HOME_LAYOUT.door, HOME_LAYOUT.tv), null)
  assert.equal(homeRoute(divided, HOME_LAYOUT.tv, HOME_LAYOUT.door), null)
})
