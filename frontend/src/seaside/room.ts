import { isRoomSelf, isRoomSnapshot } from './types'
import type { RoomAccount, RoomClockAction, RoomPose, RoomSnapshot, RoomTiming, RoomView } from './types'

const ROOT = '/api/rooms/seaside'
const HEARTBEAT_MS = 10_000
const REQUEST_TIMEOUT_MS = 8_000
type Timer = ReturnType<typeof globalThis.setTimeout>

export interface RoomSocket {
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  close(code?: number, reason?: string): void
}

/** 注入网络、单调时间与生命周期，测试不依赖真人账号或真实数据库。 */
export interface RoomClientEnvironment {
  fetch: typeof globalThis.fetch
  socket: (url: string) => RoomSocket
  socketUrl: (leaseId: string) => string
  now: () => number
  uuid: () => string
  setTimeout: (callback: () => void, delay: number) => Timer
  clearTimeout: (timer: Timer) => void
  visible: () => boolean
  onVisibility: (callback: (visible: boolean) => void) => () => void
  onPageHide: (callback: () => void) => () => void
}

export interface RoomClientOptions {
  account: RoomAccount
  onStatus: (view: RoomView) => void
  onSnapshot: (snapshot: RoomSnapshot, timing: RoomTiming) => void
  environment?: Partial<RoomClientEnvironment>
}

function browserEnvironment(): RoomClientEnvironment {
  return {
    fetch: (...args) => globalThis.fetch(...args),
    socket: url => new WebSocket(url),
    socketUrl: leaseId => {
      const url = new URL(`${ROOT}/events`, window.location.href)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.searchParams.set('lease_id', leaseId)
      return url.href
    },
    now: () => performance.now(), uuid: () => {
      if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
      // 手机访问局域网 HTTP 时 randomUUID 未必可用；页面 ID 仍保持 RFC 4122 v4 格式。
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    },
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: timer => globalThis.clearTimeout(timer),
    visible: () => document.visibilityState !== 'hidden',
    onVisibility: callback => {
      const listener = () => callback(document.visibilityState !== 'hidden')
      document.addEventListener('visibilitychange', listener)
      window.addEventListener('pageshow', listener)
      return () => {
        document.removeEventListener('visibilitychange', listener)
        window.removeEventListener('pageshow', listener)
      }
    },
    onPageHide: callback => {
      window.addEventListener('pagehide', callback)
      return () => window.removeEventListener('pagehide', callback)
    },
  }
}

class RoomRequestError extends Error {
  constructor(readonly status: number, readonly detail: { code?: string; reason?: string; message?: string; snapshot?: unknown }) {
    super(detail.message ?? `房间请求失败（${status}）`)
  }
}

/** 每次海边进场创建一份，退出销毁。只有 WS 全量首帧确认后才称为连接成功。 */
export class RoomClient {
  private readonly env: RoomClientEnvironment
  private clientId: string
  private view: RoomView = { state: 'joining', pending: false }
  private started = false
  private disposed = false
  private generation = 0
  private leaseId?: string
  private socket?: RoomSocket
  private retryAttempt = 0
  private retryTimer?: Timer
  private heartbeatTimer?: Timer
  private socketTimer?: Timer
  private controllers = new Set<AbortController>()
  private disposers: (() => void)[] = []
  private lastSnapshot?: RoomSnapshot
  private retiredEpochs = new Set<string>()
  private deferredLeaves = new Set<string>()
  private cleanup: Promise<void> = Promise.resolve()
  private overdueLeaves = new Set<string>()

  constructor(private readonly options: RoomClientOptions) {
    this.env = { ...browserEnvironment(), ...options.environment }
    this.clientId = this.env.uuid()
  }

  get status(): RoomView { return this.view }

  start(): void {
    if (this.disposed || this.started) return
    this.started = true
    this.disposers = [this.env.onVisibility(visible => this.visibility(visible)), this.env.onPageHide(() => this.suspend())]
    if (this.env.visible()) void this.connect(false)
    else this.publish({ state: 'away', pending: false, message: '回来时，会重新确认海边的位置。' })
  }

  /** 接管后只有这个显式动作生成新页面身份，自动重连始终复用旧 ID。 */
  retry(): void {
    if (this.disposed) return
    if (!this.started) { this.start(); return }
    if (this.view.state === 'connected' || this.view.state === 'joining') return
    if (this.view.state === 'expired') return
    if (!this.env.visible()) { this.suspend(); return }
    if (this.view.state === 'taken-over' || this.overdueLeaves.size > 0) {
      this.clientId = this.env.uuid()
      // 显式重入使用新 ID；超时的旧 leave 不能影响新 lease，不需要再等旧请求。
      this.cleanup = Promise.resolve()
      this.overdueLeaves.clear()
    }
    this.invalidate(true)
    this.retryAttempt = 0
    void this.connect(false)
  }

  setPose(pose: RoomPose): Promise<boolean> {
    return this.mutate('pose', { pose })
  }

  setClock(action: RoomClockAction): Promise<boolean> {
    if (!this.view.snapshot) return Promise.resolve(false)
    return this.mutate('clock', { ...action, version: this.view.snapshot.clock.version })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.invalidate(true)
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    this.view = { state: 'away', pending: false }
  }

  private publish(view: RoomView): void {
    if (this.disposed) return
    this.view = view
    this.options.onStatus(view)
  }

  private async connect(reconnecting: boolean): Promise<void> {
    if (this.disposed || !this.env.visible()) return
    const generation = ++this.generation
    this.publish({ state: reconnecting ? 'reconnecting' : 'joining', pending: false,
      message: reconnecting ? '海风还在，正在重新连接。' : '正在走向我们的位置。' })
    try {
      // 同页面后台返回仍用相同 client_id；先让旧 leave 完成，避免它清掉幂等 join 复用的租约。
      await this.cleanup
      if (!this.current(generation)) return
      if (this.overdueLeaves.size > 0) {
        this.terminal('error', '旧连接还在收尾，重新加入就能换一个位置。')
        return
      }
      const { data, timing } = await this.request('join', 'POST', {
        client_id: this.clientId, connection_generation: generation, expected_account: this.options.account,
      })
      const result = data as { lease_id?: unknown; snapshot?: unknown; self?: unknown }
      if (typeof result.lease_id !== 'string' || !result.lease_id || !isRoomSnapshot(result.snapshot)) {
        throw new RoomRequestError(502, { message: '海边状态暂时无法确认，请稍后再试。' })
      }
      if (!this.current(generation)) {
        if (!this.disposed && this.env.visible() && ['joining', 'reconnecting'].includes(this.view.state)) {
          // 更近的一次 join 可能拿到同一幂等租约；等它返回后再决定是否补偿离开。
          this.deferredLeaves.add(result.lease_id)
        } else if (result.lease_id !== this.leaseId) this.leave(result.lease_id)
        return
      }
      if (!isRoomSelf(result.self)) {
        this.leave(result.lease_id)
        throw new RoomRequestError(502, { message: '当前海边身份暂时无法确认，请重新加入。' })
      }
      const self = result.self
      if (self.account !== this.options.account || !result.snapshot.members.some(member =>
        member.account === self.account && member.user_id === self.user_id)) {
        this.leave(result.lease_id)
        this.terminal('expired', '登录身份已改变，请回小岛重新上岛。')
        return
      }
      this.leaseId = result.lease_id
      this.flushDeferredLeaves(this.leaseId)
      const socket = this.env.socket(this.env.socketUrl(this.leaseId))
      this.socket = socket
      // 首包必须是当前租约的完整事实。REST join 到 WS accept 之间另一位可能已加入。
      this.socketTimer = this.env.setTimeout(() => {
        if (this.current(generation) && this.view.state !== 'connected') this.networkLost()
      }, REQUEST_TIMEOUT_MS)
      socket.onopen = () => { /* accept 之后仍等全量首帧 */ }
      socket.onmessage = event => {
        if (!this.current(generation)) return
        let snapshot: unknown
        try { snapshot = JSON.parse(String(event.data)) } catch { this.networkLost(); return }
        if (!isRoomSnapshot(snapshot)) { this.networkLost(); return }
        if (!snapshot.members.some(member => member.account === this.options.account)) { this.networkLost(); return }
        if (!this.accept(snapshot, { receivedMonoMs: this.env.now(),
          roundTripMs: timing.receivedMonoMs - (timing.sentMonoMs ?? timing.receivedMonoMs) })) return
        if (this.socketTimer !== undefined) this.env.clearTimeout(this.socketTimer)
        this.socketTimer = undefined
        this.retryAttempt = 0
        this.scheduleHeartbeat(generation)
      }
      socket.onclose = event => {
        if (!this.current(generation)) return
        if (event.code === 4409) this.terminal('taken-over', '这个页面的座位已结束。想回来时，可以重新加入。')
        else if (event.code === 4410) this.networkLost()
        else if (event.code === 4401) this.terminal('expired', '登录已过期，请回小岛重新登录。')
        else if (event.code === 4403) this.terminal('error', '当前连接无法进入海边，请重新打开小岛。')
        else this.networkLost()
      }
      socket.onerror = () => { if (this.current(generation)) this.networkLost() }
    } catch (error) {
      if (!this.current(generation)) return
      this.flushDeferredLeaves()
      this.handleError(error)
    }
  }

  private async mutate(path: 'pose' | 'clock', body: Record<string, unknown>): Promise<boolean> {
    if (this.disposed || this.view.state !== 'connected' || this.view.pending || !this.leaseId) return false
    const generation = this.generation
    this.publish({ ...this.view, pending: true, message: undefined })
    try {
      const { data, timing } = await this.request(path, 'PUT', { ...body, lease_id: this.leaseId })
      if (!this.current(generation)) return false
      const snapshot = (data as { snapshot?: unknown }).snapshot
      if (!isRoomSnapshot(snapshot)) throw new RoomRequestError(502, { message: '海边状态暂时无法确认。' })
      this.accept(snapshot, timing)
      return true
    } catch (error) {
      if (!this.current(generation)) return false
      if (error instanceof RoomRequestError && error.status === 409 && error.detail.code === 'clock_conflict'
        && isRoomSnapshot(error.detail.snapshot)) {
        this.accept(error.detail.snapshot, { receivedMonoMs: this.env.now() })
        this.publish({ ...this.view, message: '景色时间刚刚被调整，已经跟上最新的海风。' })
      } else if (error instanceof RoomRequestError && error.status === 409 && error.detail.code !== 'lease_lost') {
        this.publish({ ...this.view, message: error.message })
      } else this.handleError(error)
      return false
    } finally {
      if (this.current(generation) && this.view.state === 'connected') this.publish({ ...this.view, pending: false })
    }
  }

  private accept(snapshot: RoomSnapshot, timing: RoomTiming): boolean {
    const previous = this.lastSnapshot
    if (this.retiredEpochs.has(snapshot.epoch) || (previous?.epoch === snapshot.epoch
      && (snapshot.revision < previous.revision || snapshot.clock.version < previous.clock.version
        || (snapshot.revision === previous.revision && snapshot.server_now_ms < previous.server_now_ms)))) return false
    if (previous && previous.epoch !== snapshot.epoch) this.retiredEpochs.add(previous.epoch)
    this.lastSnapshot = snapshot
    this.publish({ state: 'connected', pending: this.view.pending, snapshot })
    this.options.onSnapshot(snapshot, timing)
    return true
  }

  private scheduleHeartbeat(generation: number): void {
    if (this.heartbeatTimer !== undefined) return
    this.heartbeatTimer = this.env.setTimeout(() => {
      this.heartbeatTimer = undefined
      if (this.current(generation)) void this.heartbeat(generation)
    }, HEARTBEAT_MS)
  }

  private async heartbeat(generation: number): Promise<void> {
    if (!this.leaseId || this.view.state !== 'connected') return
    try {
      const { data, timing } = await this.request('heartbeat', 'POST', { lease_id: this.leaseId })
      if (!this.current(generation)) return
      const snapshot = (data as { snapshot?: unknown }).snapshot
      if (!isRoomSnapshot(snapshot)) throw new RoomRequestError(502, { message: '海边状态暂时无法确认。' })
      this.accept(snapshot, timing)
      this.scheduleHeartbeat(generation)
    } catch (error) { if (this.current(generation)) this.handleError(error) }
  }

  private async request(path: string, method: string, body: Record<string, unknown>): Promise<{ data: unknown; timing: RoomTiming }> {
    const controller = new AbortController()
    this.controllers.add(controller)
    const sentMonoMs = this.env.now()
    const timer = this.env.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await this.env.fetch(`${ROOT}/${path}`, {
        method, credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal,
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        const detail = (data as { detail?: unknown })?.detail
        throw new RoomRequestError(response.status, detail && typeof detail === 'object'
          ? detail as { code?: string; reason?: string; message?: string; snapshot?: unknown }
          : { message: typeof detail === 'string' ? detail : undefined })
      }
      return { data, timing: { sentMonoMs, receivedMonoMs: this.env.now() } }
    } finally {
      this.env.clearTimeout(timer)
      this.controllers.delete(controller)
    }
  }

  private handleError(error: unknown): void {
    if (error instanceof RoomRequestError) {
      if (error.status === 401) {
        this.terminal('expired', error.detail.code === 'identity_changed' ? error.message : '登录已过期，请回小岛重新登录。')
        return
      }
      if (error.status === 409 && error.detail.code === 'lease_lost') {
        if (error.detail.reason === 'ended') { this.networkLost(); return }
        this.terminal('taken-over', error.detail.message ?? '你已在另一个窗口入座，可以重新加入。'); return
      }
      if (error.status >= 400 && error.status < 500) { this.terminal('error', error.message); return }
    }
    this.networkLost()
  }

  private networkLost(): void {
    this.invalidate(false)
    if (!this.env.visible()) { this.publish({ state: 'away', pending: false }); return }
    this.publish({ state: 'reconnecting', pending: false, message: '海风还在，正在重新连接。' })
    const delay = Math.min(10_000, 500 * 2 ** Math.min(this.retryAttempt++, 5))
    this.retryTimer = this.env.setTimeout(() => {
      this.retryTimer = undefined
      if (!this.disposed && this.env.visible()) void this.connect(true)
    }, delay)
  }

  private terminal(state: 'taken-over' | 'expired' | 'error', message: string): void {
    this.invalidate(false)
    this.publish({ state, pending: false, message })
  }

  private visibility(visible: boolean): void {
    if (this.disposed) return
    if (!visible) { this.suspend(); return }
    if (this.view.state === 'away') void this.connect(true)
  }

  private suspend(): void {
    if (this.disposed || ['taken-over', 'expired', 'error'].includes(this.view.state)) return
    this.invalidate(true)
    this.publish({ state: 'away', pending: false, message: '回来时，会重新确认海边的位置。' })
  }

  private current(generation: number): boolean { return !this.disposed && generation === this.generation }

  private invalidate(release: boolean): void {
    ++this.generation
    for (const controller of this.controllers) controller.abort()
    this.controllers.clear()
    for (const timer of [this.retryTimer, this.heartbeatTimer, this.socketTimer]) {
      if (timer !== undefined) this.env.clearTimeout(timer)
    }
    this.retryTimer = this.heartbeatTimer = this.socketTimer = undefined
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onclose = this.socket.onerror = null
      this.socket.close(1000, 'leaving')
      this.socket = undefined
    }
    const lease = this.leaseId
    this.leaseId = undefined
    if (release && lease) this.leave(lease)
    if (release) this.flushDeferredLeaves()
  }

  private flushDeferredLeaves(keep?: string): void {
    for (const lease of this.deferredLeaves) if (lease !== keep) this.leave(lease)
    this.deferredLeaves.clear()
  }

  private leave(lease: string): void {
    const request = this.env.fetch(`${ROOT}/leave`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lease_id: lease }), keepalive: true,
    }).then(() => undefined).catch(() => { /* 页面关闭时失败的通知由 30 秒租约到期兜底。 */ })
    // 网络完全消失时不无限等待；超时后需显式新 ID，防止旧 leave 清掉幂等复用的 lease。
    const bounded = new Promise<void>(resolve => {
      const timer = this.env.setTimeout(() => { this.overdueLeaves.add(lease); resolve() }, REQUEST_TIMEOUT_MS)
      void request.finally(() => { this.env.clearTimeout(timer); this.overdueLeaves.delete(lease); resolve() })
    })
    this.cleanup = Promise.all([this.cleanup, bounded]).then(() => undefined)
  }
}
