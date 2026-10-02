import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const audioUrl = moduleUrl(compile('../src/audio/types.ts'))
const typesUrl = moduleUrl(compile('../src/seaside/types.ts'))
const roomUrl = moduleUrl(compile('../src/seaside/room.ts').replace(/from ['"]\.\/types['"]/g, `from '${typesUrl}'`))
const clockUrl = moduleUrl(compile('../src/seaside/roomClock.ts')
  .replace(/from ['"]\.\.\/audio\/types['"]/g, `from '${audioUrl}'`)
  .replace(/from ['"]\.\/types['"]/g, `from '${typesUrl}'`))
const { RoomClient } = await import(roomUrl)
const { SharedSceneryClock } = await import(clockUrl)
const { isRoomSnapshot } = await import(typesUrl)

const epoch = Date.parse('2026-10-02T10:00:00.000Z')
const member = (account = 'bear', display = account === 'bear' ? '小熊' : '她') => ({
  user_id: account === 'bear' ? 1 : 2, account, display, sprite: account,
  seat: account === 'bear' ? 0 : 1, pose: 'seated',
})
const snapshot = (patch = {}) => ({
  room: 'seaside', epoch: 'server-a', revision: 1, server_now_ms: epoch,
  clock: { virtual_base_ms: epoch, real_anchor_utc_ms: epoch, rate: 1, version: 1,
    following_real: true, time_zone: 'Asia/Shanghai', changed_by: null },
  members: [member()], ...patch,
})
const joined = (lease_id, value = snapshot(), account = 'bear') => ({
  lease_id, snapshot: value, self: { user_id: account === 'bear' ? 1 : 2, account },
})
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data })
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

class Socket {
  onopen = null; onmessage = null; onclose = null; onerror = null
  closed = []
  constructor(url) { this.url = url }
  frame(data) { this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }) }
  close(code, reason) { this.closed.push({ code, reason }) }
  serverClose(code) { this.onclose?.({ code }) }
}

function harness({ account = 'bear', visible = true, fetcher } = {}) {
  let mono = 0, uuidIndex = 0, timerIndex = 0, visibilityCallback, pageHideCallback
  const timers = new Map(), requests = [], sockets = [], views = [], frames = [], order = []
  const env = {
    fetch: async (url, init) => {
      const request = { url, init, body: JSON.parse(init.body), at: mono }
      requests.push(request)
      if (fetcher) return fetcher(request)
      if (url.endsWith('/join')) return response(joined(`lease-${requests.filter(row => row.url.endsWith('/join')).length}`))
      return response({ snapshot: snapshot({ server_now_ms: epoch + mono }) })
    },
    socket: url => { const socket = new Socket(url); sockets.push(socket); return socket },
    socketUrl: lease => `wss://island.test/api/rooms/seaside/events?lease_id=${lease}`,
    now: () => mono, uuid: () => `page-${++uuidIndex}`,
    setTimeout: (callback, delay) => { const id = ++timerIndex; timers.set(id, { callback, at: mono + delay }); return id },
    clearTimeout: id => timers.delete(id), visible: () => visible,
    onVisibility: callback => { visibilityCallback = callback; return () => { visibilityCallback = undefined } },
    onPageHide: callback => { pageHideCallback = callback; return () => { pageHideCallback = undefined } },
  }
  const client = new RoomClient({ account, environment: env,
    onStatus: view => { views.push(view); order.push(`status:${view.state}`) },
    onSnapshot: (value, timing) => { frames.push({ value, timing }); order.push(`snapshot:${value.revision}`) },
  })
  const advance = async ms => {
    const end = mono + ms
    while (true) {
      const row = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!row) break
      timers.delete(row[0]); mono = row[1].at; row[1].callback(); await flush()
    }
    mono = end; await flush()
  }
  const connect = async (value = snapshot()) => {
    client.start(); await flush(); sockets.at(-1).onopen?.({}); sockets.at(-1).frame(value); await flush()
  }
  return { client, env, requests, sockets, views, frames, order, timers, advance, connect,
    visibility: value => { visible = value; visibilityCallback?.(value) },
    pageHide: () => pageHideCallback?.(),
    listeners: () => [!!visibilityCallback, !!pageHideCallback],
  }
}

test('room validates complete identities, seats, poses and clock state before rendering', () => {
  assert.equal(isRoomSnapshot(snapshot({ members: [member(), member('her')] })), true)
  for (const patch of [
    { members: [member(), member()] }, { members: [member(), { ...member('her'), seat: 0 }] },
    { members: [{ ...member(), account: 'stranger' }] }, { members: [{ ...member(), sprite: 'her' }] },
    { members: [{ ...member(), pose: 'dancing' }] }, { server_now_ms: Infinity },
    { clock: { ...snapshot().clock, rate: 2 } }, { clock: { ...snapshot().clock, time_zone: 'UTC' } },
  ]) assert.equal(isRoomSnapshot(snapshot(patch)), false)
})

test('HTTP LAN browsers without randomUUID still generate a valid per-page v4 client ID', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const h = harness()
  const environment = { ...h.env }
  delete environment.uuid
  let client
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
      getRandomValues: bytes => { for (let index = 0; index < bytes.length; index++) bytes[index] = index; return bytes },
    } })
    client = new RoomClient({ account: 'bear', environment, onStatus: () => {}, onSnapshot: () => {} })
    client.start(); await flush()
    assert.match(h.requests[0].body.client_id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
    assert.equal(h.requests[0].body.client_id, '00010203-0405-4607-8809-0a0b0c0d0e0f')
  } finally {
    client?.dispose(); await flush()
    if (original) Object.defineProperty(globalThis, 'crypto', original)
    else delete globalThis.crypto
  }
})

test('shared clock uses server UTC plus RTT, regardless of local system-clock offsets', () => {
  const fast = new SharedSceneryClock(), slow = new SharedSceneryClock()
  const value = snapshot({ clock: { ...snapshot().clock, rate: 120, following_real: false } })
  assert.equal(fast.initialized, false)
  assert.throws(() => fast.read(0), /尚未/)
  fast.update(value, { sentMonoMs: 10_000, receivedMonoMs: 10_100 })
  slow.update(value, { sentMonoMs: 200_000, receivedMonoMs: 200_100 })
  assert.equal(fast.read(10_100).virtualMs, epoch + 6000)
  assert.equal(fast.read(11_100).virtualMs, slow.read(201_100).virtualMs)
  const realNow = Date.now
  try {
    Date.now = () => epoch + 48 * 3_600_000
    assert.equal(fast.read(12_100).virtualMs, epoch + 246_000)
    Date.now = () => epoch - 48 * 3_600_000
    assert.equal(fast.read(13_100).virtualMs, epoch + 366_000)
  } finally { Date.now = realNow }
})

test('shared clock preserves pause, Shanghai midnight and normal speed after acceleration', () => {
  const clock = new SharedSceneryClock()
  const midnight = Date.parse('2026-10-02T15:59:59.500Z')
  const initial = snapshot({ server_now_ms: midnight,
    clock: { ...snapshot().clock, virtual_base_ms: midnight, real_anchor_utc_ms: midnight, following_real: false } })
  clock.update(initial, { receivedMonoMs: 0 })
  assert.equal(clock.read(0).time, '23:59')
  assert.equal(clock.read(500).time, '00:00')
  clock.update({ ...initial, revision: 2, server_now_ms: midnight + 500,
    clock: { ...initial.clock, virtual_base_ms: midnight + 500, real_anchor_utc_ms: midnight + 500, rate: 0, version: 2 } }, { receivedMonoMs: 500 })
  assert.equal(clock.read(24 * 3_600_000).virtualMs, midnight + 500)
  const current = snapshot({ revision: 3, server_now_ms: midnight + 24 * 3_600_000,
    clock: { ...initial.clock, virtual_base_ms: midnight + 500, real_anchor_utc_ms: midnight + 24 * 3_600_000, rate: 1, version: 3 } })
  clock.update(current, { receivedMonoMs: 24 * 3_600_000 })
  assert.equal(clock.read(24 * 3_600_000 + 1000).virtualMs, midnight + 1500)
  assert.equal(clock.read(24 * 3_600_000 + 1000).followingReal, false)
})

test('shared clock rejects obsolete revisions/epochs and eases small corrections without jumping', () => {
  const clock = new SharedSceneryClock()
  clock.update(snapshot(), { sentMonoMs: 0, receivedMonoMs: 100 })
  const before = clock.read(200).virtualMs
  clock.update(snapshot({ server_now_ms: epoch + 190 }), { receivedMonoMs: 200 })
  assert.equal(clock.read(200).virtualMs, before)
  assert.equal(clock.read(1200).virtualMs, epoch + 1240)
  assert.deepEqual(clock.update(snapshot({ revision: 0 }), { receivedMonoMs: 1200 }), { changed: false, reset: false })
  clock.update(snapshot({ epoch: 'server-b', revision: 0, server_now_ms: epoch + 1200 }), { receivedMonoMs: 1200 })
  assert.deepEqual(clock.update(snapshot({ revision: 99 }), { receivedMonoMs: 1200 }), { changed: false, reset: false })
  assert.equal(clock.read(2200).virtualMs, epoch + 2200)
})

test('shared reset is explicit and invalid clock samples cannot corrupt the active anchor', () => {
  const clock = new SharedSceneryClock()
  const old = snapshot({ clock: { ...snapshot().clock, virtual_base_ms: epoch + 7_200_000, following_real: false, rate: 0 } })
  clock.update(old, { receivedMonoMs: 0 })
  assert.deepEqual(clock.update(snapshot({ revision: 2, clock: { ...snapshot().clock, version: 2 } }),
    { receivedMonoMs: 100 }), { changed: true, reset: true })
  assert.equal(clock.read(100).virtualMs, epoch)
  for (const timing of [{ receivedMonoMs: -1 }, { receivedMonoMs: 99 }, { sentMonoMs: 201, receivedMonoMs: 200 },
    { receivedMonoMs: 200, roundTripMs: Infinity }]) assert.throws(() => clock.update(snapshot(), timing), RangeError)
  assert.throws(() => clock.read(99), RangeError)
  assert.equal(clock.read(200).virtualMs, epoch + 100)
})

test('status-triggered rendering before a snapshot callback does not invalidate its recent timing sample', () => {
  const clock = new SharedSceneryClock()
  clock.update(snapshot(), { receivedMonoMs: 0 })
  clock.read(101)
  clock.update(snapshot({ revision: 2, server_now_ms: epoch + 100 }), { sentMonoMs: 100, receivedMonoMs: 100 })
  assert.equal(clock.read(101).virtualMs, epoch + 101)
  assert.equal(clock.read(1101).virtualMs, epoch + 1101)
  assert.throws(() => clock.update(snapshot({ revision: 3 }), { receivedMonoMs: 99 }), RangeError)
})

test('join waits for a WS full frame, emits connected before rendering and carries cookie credentials', async () => {
  const h = harness()
  try {
    h.client.start(); h.client.start(); await flush()
    assert.equal(h.requests.length, 1)
    assert.equal(h.requests[0].init.credentials, 'include')
    assert.deepEqual(h.requests[0].body, { client_id: 'page-1', connection_generation: 1, expected_account: 'bear' })
    assert.equal(h.client.status.state, 'joining')
    assert.equal(h.frames.length, 0)
    assert.equal(h.sockets[0].url, 'wss://island.test/api/rooms/seaside/events?lease_id=lease-1')
    h.sockets[0].onopen({})
    assert.equal(h.client.status.state, 'joining')
    h.sockets[0].frame(snapshot({ members: [member(), member('her')] }))
    assert.equal(h.client.status.state, 'connected')
    assert.deepEqual(h.order.slice(-2), ['status:connected', 'snapshot:1'])
    assert.equal(h.client.status.snapshot.members.length, 2)
  } finally { h.client.dispose() }
})

test('a Cookie account switch cannot let a stale bear scene control her, even with another bear in the snapshot', async () => {
  const both = snapshot({ members: [member(), member('her')] })
  const h = harness({ fetcher: request => request.url.endsWith('/join')
    ? response(joined('her-lease', both, 'her')) : response({ snapshot: snapshot() }) })
  try {
    h.client.start(); await flush()
    assert.equal(h.client.status.state, 'expired')
    assert.match(h.client.status.message, /身份已改变/)
    assert.equal(h.sockets.length, 0)
    assert.equal(h.frames.length, 0)
    assert.deepEqual(h.requests.find(row => row.url.endsWith('/leave')).body, { lease_id: 'her-lease' })
    assert.equal(await h.client.setPose('standing'), false)
    h.visibility(false); h.visibility(true); h.client.retry(); await h.advance(60_000)
    assert.equal(h.requests.filter(row => row.url.endsWith('/join')).length, 1)
  } finally { h.client.dispose(); await flush() }
})

test('expected account lets the server reject a Cookie identity change before touching either seat', async () => {
  const h = harness({ fetcher: request => {
    assert.equal(request.body.expected_account, 'bear')
    return response({ detail: { code: 'identity_changed', message: '登录身份已改变，请重新上岛' } }, 401)
  } })
  try {
    h.client.start(); await flush()
    assert.equal(h.client.status.state, 'expired')
    assert.match(h.client.status.message, /身份已改变/)
    assert.equal(h.client.status.snapshot, undefined)
    assert.equal(h.sockets.length, 0)
    assert.equal(h.frames.length, 0)
    assert.equal(h.requests.filter(row => row.url.endsWith('/leave')).length, 0)
    h.client.retry(); h.visibility(false); h.visibility(true); await h.advance(60_000)
    assert.equal(h.requests.length, 1)
  } finally { h.client.dispose(); await flush() }
})

test('join self must match the user ID of the expected member, not merely an account label', async () => {
  const h = harness({ fetcher: request => request.url.endsWith('/join')
    ? response({ ...joined('unknown-owner'), self: { user_id: 999, account: 'bear' } })
    : response({ snapshot: snapshot() }) })
  try {
    h.client.start(); await flush()
    assert.equal(h.client.status.state, 'expired')
    assert.equal(h.sockets.length, 0)
    assert.equal(h.frames.length, 0)
    assert.deepEqual(h.requests.at(-1).body, { lease_id: 'unknown-owner' })
  } finally { h.client.dispose(); await flush() }
})

test('delayed REST results cannot overwrite newer WS state; clock conflicts adopt full latest state', async () => {
  const pending = deferred()
  const h = harness({ fetcher: request => {
    if (request.url.endsWith('/join')) return response(joined('lease-1'))
    if (request.url.endsWith('/pose')) return pending.promise
    if (request.url.endsWith('/clock')) return response({ detail: { code: 'clock_conflict', snapshot: snapshot({ revision: 5,
      clock: { ...snapshot().clock, version: 3, rate: 30, following_real: false } }) } }, 409)
    return response({ snapshot: snapshot() })
  } })
  try {
    await h.connect()
    const action = h.client.setPose('standing')
    assert.equal(h.client.status.pending, true)
    assert.equal(await h.client.setPose('seated'), false)
    h.sockets[0].frame(snapshot({ revision: 4, members: [{ ...member(), pose: 'standing' }] }))
    pending.resolve(response({ snapshot: snapshot({ revision: 2 }) }))
    assert.equal(await action, true)
    assert.equal(h.client.status.snapshot.revision, 4)
    assert.equal(h.client.status.snapshot.members[0].pose, 'standing')
    assert.equal(await h.client.setClock({ action: 'rate', rate: 120 }), false)
    assert.equal(h.client.status.snapshot.clock.rate, 30)
    assert.match(h.client.status.message, /最新/)
    assert.equal(h.client.status.pending, false)
  } finally { h.client.dispose() }
})

test('network loss clears unverified companions and reconnects with the same page ID in real time', async () => {
  const h = harness()
  try {
    await h.connect(snapshot({ members: [member(), member('her')], clock: { ...snapshot().clock, rate: 120, following_real: false } }))
    const lateFrame = h.sockets[0].onmessage
    h.sockets[0].serverClose(1006)
    assert.equal(h.client.status.state, 'reconnecting')
    assert.equal(h.client.status.snapshot, undefined)
    assert.equal(await h.client.setClock({ action: 'reset' }), false)
    lateFrame({ data: JSON.stringify(snapshot({ revision: 99 })) })
    assert.equal(h.client.status.state, 'reconnecting')
    await h.advance(499)
    assert.equal(h.requests.filter(row => row.url.endsWith('/join')).length, 1)
    await h.advance(1)
    assert.equal(h.requests.filter(row => row.url.endsWith('/join')).length, 2)
    assert.equal(h.requests.at(-1).body.client_id, 'page-1')
    h.sockets.at(-1).frame(snapshot({ epoch: 'server-b', revision: 0 }))
    assert.equal(h.client.status.state, 'connected')
    h.sockets.at(-1).frame(snapshot({ revision: 100 }))
    assert.equal(h.client.status.snapshot.epoch, 'server-b')
  } finally { h.client.dispose() }
})

test('taken-over stops automatic retries and explicit retry alone creates a fresh client identity', async () => {
  const h = harness()
  try {
    await h.connect()
    h.sockets[0].serverClose(4409)
    assert.equal(h.client.status.state, 'taken-over')
    assert.equal(h.client.status.snapshot, undefined)
    h.visibility(false); h.visibility(true)
    await h.advance(60_000)
    assert.equal(h.requests.filter(row => row.url.endsWith('/join')).length, 1)
    h.client.retry(); await flush()
    assert.equal(h.requests.at(-1).body.client_id, 'page-2')
    h.sockets.at(-1).frame(snapshot({ revision: 2 }))
    assert.equal(h.client.status.state, 'connected')
  } finally { h.client.dispose() }
})

test('ordinary lease expiry 4410 reconnects automatically with a higher generation and fresh lease', async () => {
  const h = harness()
  try {
    await h.connect()
    const oldFrame = h.sockets[0].onmessage
    h.sockets[0].serverClose(4410)
    assert.equal(h.client.status.state, 'reconnecting')
    await h.advance(500)
    const joins = h.requests.filter(row => row.url.endsWith('/join'))
    assert.equal(joins.length, 2)
    assert.equal(joins[1].body.client_id, joins[0].body.client_id)
    assert.ok(joins[1].body.connection_generation > joins[0].body.connection_generation)
    assert.equal(h.sockets[1].url, 'wss://island.test/api/rooms/seaside/events?lease_id=lease-2')
    h.sockets[1].frame(snapshot({ revision: 3 }))
    oldFrame({ data: JSON.stringify(snapshot({ revision: 100, members: [member(), member('her')] })) })
    assert.equal(h.client.status.state, 'connected')
    assert.equal(h.client.status.snapshot.revision, 3)
  } finally { h.client.dispose() }
})

test('REST ended leases recover with the same client UUID; actual taken_over leases remain terminal', async () => {
  for (const reason of ['ended', 'taken_over']) {
    let joins = 0
    const h = harness({ fetcher: request => {
      if (request.url.endsWith('/join')) return response(joined(`lease-${++joins}`))
      if (request.url.endsWith('/pose')) return response({ detail: { code: 'lease_lost', reason } }, 409)
      return response({ snapshot: snapshot() })
    } })
    try {
      await h.connect()
      assert.equal(await h.client.setPose('standing'), false)
      assert.equal(h.client.status.state, reason === 'ended' ? 'reconnecting' : 'taken-over')
      await h.advance(500)
      assert.equal(joins, reason === 'ended' ? 2 : 1)
      if (reason === 'ended') {
        assert.equal(h.requests.at(-1).body.client_id, 'page-1')
        h.sockets.at(-1).frame(snapshot({ revision: 2 }))
        assert.equal(h.client.status.state, 'connected')
      }
    } finally { h.client.dispose(); await flush() }
  }
})

test('expired/forbidden sessions do not retry or silently reconnect when visible again', async () => {
  for (const [status, state] of [[401, 'expired'], [403, 'error']]) {
    const h = harness({ fetcher: () => response({ detail: '当前会话不可用' }, status) })
    try {
      h.client.start(); await flush()
      assert.equal(h.client.status.state, state)
      h.visibility(false); h.visibility(true)
      await h.advance(60_000)
      assert.equal(h.requests.length, 1)
      if (status === 401) { h.client.retry(); await flush(); assert.equal(h.requests.length, 1) }
    } finally { h.client.dispose() }
  }
})

test('hidden/pagehide releases only the current lease and visible rejoins without stealing', async () => {
  const h = harness()
  try {
    await h.connect()
    h.visibility(false); h.pageHide(); await flush()
    assert.equal(h.client.status.state, 'away')
    assert.equal(h.client.status.snapshot, undefined)
    const leaves = h.requests.filter(row => row.url.endsWith('/leave'))
    assert.equal(leaves.length, 1)
    assert.equal(leaves[0].init.keepalive, true)
    assert.deepEqual(leaves[0].body, { lease_id: 'lease-1' })
    h.visibility(true); await flush()
    assert.equal(h.requests.at(-1).body.client_id, 'page-1')
    h.sockets.at(-1).frame(snapshot({ revision: 2 }))
    assert.equal(h.client.status.state, 'connected')
  } finally { h.client.dispose() }
  assert.deepEqual(h.listeners(), [false, false])
})

test('rapid exit cancels old generations and compensates a late join even when the fetch ignores abort', async () => {
  const pending = deferred()
  const h = harness({ fetcher: request => request.url.endsWith('/join') ? pending.promise : response({ snapshot: snapshot() }) })
  h.client.start(); await flush()
  h.client.dispose(); h.client.dispose()
  assert.equal(h.requests[0].init.signal.aborted, true)
  const count = h.views.length
  pending.resolve(response(joined('late-lease')))
  await flush()
  assert.equal(h.sockets.length, 0)
  assert.equal(h.views.length, count)
  assert.deepEqual(h.requests.at(-1).body, { lease_id: 'late-lease' })
  assert.equal(h.requests.at(-1).init.keepalive, true)
  assert.equal(h.timers.size, 0)
  assert.deepEqual(h.listeners(), [false, false])
})

test('late hidden join cannot issue a leave against the lease reused by the newer visible join', async () => {
  const first = deferred(), second = deferred()
  let joinIndex = 0
  const h = harness({ fetcher: request => {
    if (request.url.endsWith('/join')) return ++joinIndex === 1 ? first.promise : second.promise
    return response({ snapshot: snapshot() })
  } })
  try {
    h.client.start(); await flush()
    h.visibility(false); h.visibility(true); await flush()
    assert.equal(joinIndex, 2)
    first.resolve(response(joined('same-lease'))); await flush()
    assert.equal(h.requests.filter(row => row.url.endsWith('/leave')).length, 0)
    second.resolve(response(joined('same-lease', snapshot({ revision: 2 })))); await flush()
    h.sockets[0].frame(snapshot({ revision: 2 }))
    assert.equal(h.client.status.state, 'connected')
    assert.equal(h.requests.filter(row => row.url.endsWith('/leave')).length, 0)
  } finally { h.client.dispose(); await flush() }
})

test('visible return waits for old leave, and a leave timeout requires explicit fresh-ID retry', async () => {
  const leaving = deferred()
  const h = harness({ fetcher: request => request.url.endsWith('/leave') ? leaving.promise
    : response(joined('lease-1')) })
  try {
    await h.connect()
    h.visibility(false); h.visibility(true); await flush()
    assert.equal(h.requests.filter(row => row.url.endsWith('/join')).length, 1)
    await h.advance(8000)
    assert.equal(h.client.status.state, 'error')
    assert.equal(h.requests.filter(row => row.url.endsWith('/join')).length, 1)
    h.client.retry(); await flush()
    assert.equal(h.requests.at(-1).body.client_id, 'page-2')
    leaving.resolve(response({ snapshot: snapshot() })); await flush()
  } finally { h.client.dispose(); await flush() }
})

test('heartbeat uses real 10-second intervals and stale lease errors stop control', async () => {
  const h = harness({ fetcher: request => request.url.endsWith('/heartbeat')
    ? response({ detail: { code: 'lease_lost', reason: 'taken_over', message: '在另一个窗口入座了' } }, 409)
    : response(joined('lease-1')) })
  try {
    await h.connect(snapshot({ clock: { ...snapshot().clock, rate: 120 } }))
    await h.advance(9000)
    h.sockets[0].frame(snapshot({ revision: 2, members: [member('bear', '白熊')] }))
    assert.equal(h.client.status.snapshot.members[0].display, '白熊')
    await h.advance(999)
    assert.equal(h.requests.filter(row => row.url.endsWith('/heartbeat')).length, 0)
    await h.advance(1)
    assert.equal(h.requests.filter(row => row.url.endsWith('/heartbeat')).length, 1)
    assert.equal(h.client.status.state, 'taken-over')
    assert.equal(await h.client.setPose('leaning'), false)
    await h.advance(60_000)
    assert.equal(h.requests.filter(row => row.url.endsWith('/join')).length, 1)
  } finally { h.client.dispose() }
})

test('reconnect delay increases to a capped interval and missing WS first-frame cannot claim connection', async () => {
  const failures = harness({ fetcher: () => { throw new TypeError('offline') } })
  try {
    failures.client.start(); await flush()
    for (const delay of [500, 1000, 2000, 4000, 8000, 10_000, 10_000]) await failures.advance(delay)
    const attempts = failures.requests.map(row => row.at)
    assert.deepEqual(attempts, [0, 500, 1500, 3500, 7500, 15_500, 25_500, 35_500])
  } finally { failures.client.dispose() }
  const h = harness()
  try {
    h.client.start(); await flush(); h.sockets[0].onopen({})
    await h.advance(7999)
    assert.equal(h.client.status.state, 'joining')
    await h.advance(1)
    assert.equal(h.client.status.state, 'reconnecting')
    assert.equal(h.client.status.snapshot, undefined)
  } finally { h.client.dispose() }
})

test('an initially hidden page joins only on return; malformed or unauthenticated WS clears state', async () => {
  const h = harness({ visible: false })
  try {
    h.client.start(); await flush()
    assert.equal(h.requests.length, 0)
    h.visibility(true); await flush()
    h.sockets[0].frame(snapshot())
    h.sockets[0].frame('{broken')
    assert.equal(h.client.status.state, 'reconnecting')
    await h.advance(500)
    h.sockets.at(-1).frame(snapshot({ revision: 2 }))
    h.sockets.at(-1).serverClose(4401)
    assert.equal(h.client.status.state, 'expired')
    assert.equal(h.client.status.snapshot, undefined)
  } finally { h.client.dispose() }
})
