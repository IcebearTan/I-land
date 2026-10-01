import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'

const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const audioUrl = moduleUrl(compile('../src/audio/types.ts'))
const clockUrl = moduleUrl(compile('../src/seaside/clock.ts')
  .replace(/from ['"]\.\.\/audio\/types['"]/, `from '${audioUrl}'`))
const { LocalSceneryClock, SCENERY_RATES } = await import(clockUrl)
const { nightWeight } = await import(audioUrl)
const hourMs = 3_600_000
const realStart = Date.parse('2026-10-01T16:00:00.000Z') // 沪时 10 月 2 日零点

test('default rate follows real time, uses Shanghai time and crosses midnight continuously', () => {
  assert.deepEqual(SCENERY_RATES, [0, 1, 30, 120])
  const start = Date.parse('2026-10-01T15:59:59.500Z')
  const clock = new LocalSceneryClock(start, 100)
  assert.deepEqual(clock.read(100), {
    virtualMs: start, hour: 23 + 59 / 60 + 59.5 / 3600,
    time: '23:59', phase: 'night', night: 1, rate: 1, followingReal: true,
  })
  const next = clock.read(600)
  assert.equal(next.virtualMs, realStart)
  assert.equal(next.hour, 0)
  assert.equal(next.time, '00:00')
  assert.equal(next.followingReal, true)
  assert.equal(clock.read(600).virtualMs, next.virtualMs)
})

test('day phases use island boundaries and the same continuous audio night weight', () => {
  const examples = [
    [5.499, 'night'], [5.5, 'dawn'], [7.999, 'dawn'], [8, 'day'],
    [16.499, 'day'], [16.5, 'dusk'], [19.999, 'dusk'], [20, 'night'],
  ]
  for (const [hour, phase] of examples) {
    const value = new LocalSceneryClock(realStart, 0, hour).read(0)
    assert.equal(value.phase, phase)
    assert.equal(value.night, nightWeight(value.hour))
    assert.equal(value.followingReal, false)
  }
  const dawn = new LocalSceneryClock(realStart, 0, 6.5).read(0)
  const dusk = new LocalSceneryClock(realStart, 0, 18.5).read(0)
  assert.equal(dawn.night, .5)
  assert.equal(dusk.night, .5)
})

test('pause holds the current instant across repeated reads and a long background interval', () => {
  const clock = new LocalSceneryClock(realStart, 100)
  clock.setRate(0, 1100)
  for (const stamp of [1100, 2100, 50_000, 7 * 24 * hourMs]) {
    const value = clock.read(stamp)
    assert.equal(value.virtualMs, realStart + 1000)
    assert.equal(value.rate, 0)
    assert.equal(value.followingReal, false)
  }
})

test('each speed change keeps the virtual instant continuous, including normal speed after acceleration', () => {
  const clock = new LocalSceneryClock(realStart, 0)
  clock.setRate(1, 1000)
  assert.equal(clock.read(1000).followingReal, true)
  let expected = realStart + 1000
  let stamp = 1000
  for (const [rate, elapsed] of [[30, 2000], [120, 3000], [0, 4000], [1, 5000], [30, 6000]]) {
    assert.equal(clock.read(stamp).virtualMs, expected)
    clock.setRate(rate, stamp)
    assert.equal(clock.read(stamp).virtualMs, expected)
    stamp += elapsed
    expected += rate * elapsed
    const value = clock.read(stamp)
    assert.equal(value.virtualMs, expected)
    assert.equal(value.rate, rate)
    assert.equal(value.followingReal, false)
  }
})

test('only resetting to a new real epoch restores real-time following', () => {
  const clock = new LocalSceneryClock(realStart, 0, 18.5)
  clock.setRate(120, 100)
  clock.setRate(1, 10_000)
  assert.equal(clock.read(10_000).followingReal, false)
  const realNow = Date.parse('2026-10-02T00:12:00.000Z')
  clock.reset(realNow, 10_000)
  assert.deepEqual(clock.read(10_000), {
    virtualMs: realNow, hour: 8.2, time: '08:12', phase: 'day', night: 0, rate: 1, followingReal: true,
  })
  assert.equal(clock.read(11_000).virtualMs, realNow + 1000)
})

test('time presentation remains Shanghai time under different system timezones', () => {
  const script = `const { LocalSceneryClock } = await import(${JSON.stringify(clockUrl)}); console.log(JSON.stringify(new LocalSceneryClock(${realStart}, 0).read(12.25 * 3600000)));`
  for (const timezone of ['UTC', 'America/Los_Angeles', 'Europe/Berlin', 'Asia/Tokyo']) {
    const actual = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: timezone }, encoding: 'utf8',
    }))
    assert.equal(actual.time, '12:15')
    assert.equal(actual.hour, 12.25)
    assert.equal(actual.phase, 'day')
    assert.equal(actual.virtualMs, realStart + 12.25 * hourMs)
  }
})

test('120x advances through days after a long background interval without frame dependence', () => {
  const clock = new LocalSceneryClock(realStart, 500)
  clock.setRate(120, 500)
  const oneDay = 24 * hourMs
  const value = clock.read(500 + oneDay + 30_000)
  assert.equal(value.virtualMs, realStart + (oneDay + 30_000) * 120)
  assert.equal(value.time, '01:00')
  assert.equal(value.hour, 1)
  assert.equal(value.phase, 'night')
})

test('invalid rates and timestamps are rejected without consuming or corrupting the clock', () => {
  const clock = new LocalSceneryClock(realStart, 100)
  for (const rate of [-1, .5, 2, 121, Infinity, -Infinity, NaN, '30', undefined, null]) {
    assert.throws(() => clock.setRate(rate, 2000), RangeError)
  }
  assert.equal(clock.read(100).virtualMs, realStart)
  for (const stamp of [-1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null]) {
    assert.throws(() => clock.read(stamp), RangeError)
    assert.throws(() => clock.setRate(30, stamp), RangeError)
    assert.throws(() => clock.reset(realStart, stamp), RangeError)
  }
  clock.read(200)
  for (const operation of [
    () => clock.read(199), () => clock.setRate(30, 199), () => clock.reset(realStart, 199),
  ]) assert.throws(operation, RangeError)
  assert.equal(clock.read(200).virtualMs, realStart + 100)
  assert.equal(clock.read(200).rate, 1)
  assert.equal(clock.read(200).followingReal, true)
})

test('constructor, preview and reset reject invalid epochs and preview ranges; past epochs work', () => {
  for (const epoch of [NaN, Infinity, -Infinity, 8_640_000_000_000_001, -8_640_000_000_000_001, '0', null]) {
    assert.throws(() => new LocalSceneryClock(epoch, 0), RangeError)
    const clock = new LocalSceneryClock(realStart, 0)
    assert.throws(() => clock.reset(epoch, 1000), RangeError)
    assert.equal(clock.read(0).virtualMs, realStart)
  }
  for (const stamp of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => new LocalSceneryClock(realStart, stamp), RangeError)
  }
  for (const hour of [-1, 24, NaN, Infinity, -Infinity, '12', null]) {
    assert.throws(() => new LocalSceneryClock(realStart, 0, hour), RangeError)
  }
  const past = new LocalSceneryClock(-1, 0).read(0)
  assert.equal(past.time, '07:59')
  assert.equal(past.phase, 'dawn')
})

test('date-range overflow is rejected, and reset can recover without reading an invalid old time', () => {
  const clock = new LocalSceneryClock(8_640_000_000_000_000, 0)
  assert.throws(() => clock.read(1), RangeError)
  assert.throws(() => clock.setRate(120, 1), RangeError)
  clock.reset(realStart, 1)
  assert.equal(clock.read(1).virtualMs, realStart)
  assert.equal(clock.read(1).followingReal, true)
})
