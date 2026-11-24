import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const compile = p => ts.transpileModule(fs.readFileSync(new URL(p, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const url = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64')
const types = url(compile('../src/seaside/types.ts'))
const entry = url(compile('../src/game/rooms/entry.ts'))
const shared = url(compile('../src/game/rooms/SharedRoomClient.ts').replace(/from ['"]\.\.\/\.\.\/seaside\/types['"]/g, `from '${types}'`))
const cocoaTypes = url(compile('../src/cocoa/types.ts'))
const home = url(compile('../src/interior/room.ts').replace(/from ['"]\.\.\/cocoa\/types['"]/g, `from '${cocoaTypes}'`).replace(/from ['"]\.\.\/game\/rooms\/SharedRoomClient['"]/g, `from '${shared}'`).replace(/from ['"]\.\.\/game\/rooms\/entry['"]/g, `from '${entry}'`))
const { HomeRoomClient, SharedProgramClock, isHomeSnapshot } = await import(home)
const { roomEntryFetch } = await import(entry)
const stamp = 1_800_000_000_000
const member = (account = 'bear', seat = null) => ({ user_id: account === 'bear' ? 1 : 2, account, sprite: account, display: account, pose: seat === null ? 'standing' : 'seated', seat })
const snapshot = (patch = {}) => ({ room: 'interior', epoch: 'server', revision: 1, server_now_ms: stamp, members: [member()], television: { powered: false, channel: 0, position_ms: 0, anchor_utc_ms: stamp, version: 1, changed_by: null }, ...patch })
const reply = (data, status = 200) => ({ ok: status === 200, status, json: async () => data })
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }
function harness() {
  const sockets = [], requests = [], states = [], frames = [], timers = new Map()
  let sequence = 0
  const h = { response: undefined, data: snapshot() }
  const client = new HomeRoomClient({ account: 'bear', onStatus: v => states.push(v), onSnapshot: s => frames.push(s), environment: {
    fetch: async (url, init) => {
      const body = JSON.parse(init.body); requests.push({ url, body })
      if (url.endsWith('/join')) return reply({ lease_id: 'lease', self: { account: 'bear', user_id: 1 }, snapshot: h.data })
      if (h.response) return h.response()
      return reply({ snapshot: h.data })
    },
    socket: () => { const socket = { close() {}, onopen: null, onmessage: null, onclose: null, onerror: null }; sockets.push(socket); return socket },
    socketUrl: lease => `wss://test/${lease}`, now: () => 100, uuid: () => `client-${++sequence}`,
    visible: () => true, onVisibility: () => () => {}, onPageHide: () => () => {},
    setTimeout: cb => { const id = ++sequence; timers.set(id, cb); return id }, clearTimeout: id => timers.delete(id),
  } })
  const deliver = value => sockets.at(-1).onmessage({ data: JSON.stringify(value) })
  return { h, client, sockets, requests, states, frames, deliver, timers }
}

test('home accepts standing members without seats and rejects duplicate or inconsistent seats', () => {
  assert.ok(isHomeSnapshot(snapshot({ members: [member(), member('her')] })))
  assert.ok(isHomeSnapshot(snapshot({ members: [member('bear', 1), member('her', 0)] })))
  for (const members of [[member(), member()], [member('bear', 0), member('her', 0)], [{ ...member(), seat: 0 }], [{ ...member(), pose: 'leaning' }], [{ ...member(), sprite: 'her' }]]) {
    assert.equal(isHomeSnapshot(snapshot({ members })), false)
  }
  for (const television of [{ ...snapshot().television, version: 0 }, { ...snapshot().television, channel: 3 }, { ...snapshot().television, position_ms: 24000 }, { ...snapshot().television, powered: 'true' }]) {
    assert.equal(isHomeSnapshot(snapshot({ television })), false)
  }
})

test('home waits for a complete WS frame and commands use owned lease and latest TV version', async () => {
  const t = harness()
  try {
    t.client.start(); await flush()
    assert.equal(t.client.status.state, 'joining'); assert.equal(t.frames.length, 0)
    assert.match(t.requests[0].url, /interior\/join$/)
    t.deliver(t.h.data); assert.equal(t.client.status.state, 'connected')
    await t.client.setSeat(1); assert.deepEqual(t.requests.at(-1).body, { seat: 1, lease_id: 'lease' })
    await t.client.setTelevision('toggle'); assert.deepEqual(t.requests.at(-1).body, { action: 'toggle', version: 1, lease_id: 'lease' })
    assert.equal(t.client.status.snapshot.television.powered, false, 'no optimistic TV state')
  } finally { t.client.dispose() }
})

test('TV CAS and seat conflict adopt full current state and preserve retryable connection', async () => {
  const t = harness()
  try {
    t.client.start(); await flush(); t.deliver(t.h.data)
    const newest = snapshot({ revision: 4, members: [member(), member('her', 0)], television: { ...t.h.data.television, powered: true, version: 3 } })
    for (const code of ['television_conflict', 'seat_occupied']) {
      t.h.response = () => reply({ detail: { code, message: '状态已更新', snapshot: newest } }, 409)
      assert.equal(await (code === 'seat_occupied' ? t.client.setSeat(0) : t.client.setTelevision('toggle')), false)
      assert.equal(t.client.status.state, 'connected'); assert.equal(t.client.status.pending, false)
      assert.equal(t.client.status.snapshot.television.version, 3)
      assert.equal(t.client.status.message, '状态已更新')
    }
  } finally { t.client.dispose() }
})

test('late home responses cannot overwrite newer WS television or seats', async () => {
  const t = harness(); let resolve
  try {
    t.client.start(); await flush(); t.deliver(t.h.data)
    t.h.response = () => new Promise(r => { resolve = r })
    const pending = t.client.setSeat(0); await flush()
    const newest = snapshot({ revision: 6, members: [member('bear', 1)] })
    t.deliver(newest); resolve(reply({ snapshot: snapshot({ revision: 2, members: [member('bear', 0)] }) }))
    await pending; assert.equal(t.client.status.snapshot.members[0].seat, 1)
    t.sockets[0].onclose({ code: 1006 })
    assert.equal(t.client.status.state, 'reconnecting'); assert.equal(t.client.status.snapshot, undefined)
    assert.equal(await t.client.setSeat(0), false)
  } finally { t.client.dispose() }
})

test('home rejects wrong-room frames and takeover does not silently reacquire a seat', async () => {
  const t = harness()
  try {
    t.client.start(); await flush(); t.deliver(t.h.data)
    t.sockets[0].onclose({ code: 4409 })
    assert.equal(t.client.status.state, 'taken-over'); assert.equal(t.client.status.snapshot, undefined)
    t.client.retry(); await flush(); t.deliver({ ...t.h.data, room: 'seaside' })
    assert.equal(t.client.status.state, 'reconnecting')
  } finally { t.client.dispose() }
})

test('shared programme uses real monotonic milliseconds, half RTT and 24-second loops', () => {
  const clock = new SharedProgramClock()
  const powered = snapshot({ server_now_ms: stamp + 5000, television: { ...snapshot().television, powered: true, position_ms: 1000 } })
  clock.update(powered, { sentMonoMs: 100, receivedMonoMs: 300 })
  assert.equal(clock.read(300), 6100); assert.equal(clock.read(1300), 7100)
  assert.equal(clock.read(24300), 6100)
  clock.update(snapshot({ television: { ...powered.television, powered: false, position_ms: 9100 } }), { receivedMonoMs: 25000 })
  assert.equal(clock.read(100000), 9100)
  assert.throws(() => clock.update({ ...powered, room: 'seaside' }, { receivedMonoMs: 300 }))
})

test('cross-room entry sequence stays stable for reconnect and advances on travel and explicit retry', async () => {
  const requests = [], fetcher = async (url, init) => { requests.push(JSON.parse(init.body)); return reply({}) }
  const first = roomEntryFetch(fetcher), second = roomEntryFetch(fetcher)
  const join = (f, client_id) => f('/api/rooms/interior/join', { body: JSON.stringify({ client_id }) })
  await join(first, 'old'); await join(first, 'old'); await join(second, 'new')
  assert.equal(requests[0].page_id, requests[2].page_id)
  assert.equal(requests[0].entry_generation, requests[1].entry_generation)
  assert.ok(requests[2].entry_generation > requests[0].entry_generation)
  await join(first, 'old'); assert.equal(requests[3].entry_generation, requests[0].entry_generation, 'late old reconnect remains stale')
  await join(first, 'explicit-retry'); assert.ok(requests[4].entry_generation > requests[2].entry_generation)
})
