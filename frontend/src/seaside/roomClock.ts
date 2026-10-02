import { nightWeight } from '../audio/types'
import type { SceneryTime } from './clock'
import { isRoomSnapshot } from './types'
import type { RoomSnapshot, RoomTiming } from './types'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const DATE_LIMIT_MS = 8_640_000_000_000_000
const validMono = (value: number) => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER

/** 只读共享时钟：API 更改锚点，客户端以单调时间推进，不信任设备系统时间。 */
export class SharedSceneryClock {
  private snapshot?: RoomSnapshot
  private virtualAnchor = 0
  private monoAnchor = 0
  private lastMono = 0
  private lastReceivedMono = 0
  private correction = 0
  private bestRtt = Infinity
  private retiredEpochs = new Set<string>()

  get initialized(): boolean { return this.snapshot !== undefined }

  update(snapshot: RoomSnapshot, timing: RoomTiming): { changed: boolean; reset: boolean } {
    if (!isRoomSnapshot(snapshot)) throw new TypeError('海边房间快照格式不正确')
    const received = timing.receivedMonoMs
    if (!validMono(received) || received < this.lastReceivedMono || (timing.sentMonoMs !== undefined
      && (!validMono(timing.sentMonoMs) || timing.sentMonoMs > received))
      || (timing.roundTripMs !== undefined && !validMono(timing.roundTripMs))) {
      throw new RangeError('共享时钟校时必须使用连续的单调时刻')
    }
    const previous = this.snapshot
    if (this.retiredEpochs.has(snapshot.epoch) || (previous?.epoch === snapshot.epoch
      && (snapshot.revision < previous.revision || snapshot.clock.version < previous.clock.version))) {
      return { changed: false, reset: false }
    }
    if (previous?.epoch === snapshot.epoch && snapshot.revision === previous.revision
      && snapshot.server_now_ms < previous.server_now_ms) return { changed: false, reset: false }
    const newEpoch = previous !== undefined && previous.epoch !== snapshot.epoch
    if (newEpoch) {
      this.retiredEpochs.add(previous.epoch)
      this.bestRtt = Infinity
    }
    let latency = Number.isFinite(this.bestRtt) ? this.bestRtt / 2 : 0
    if (timing.sentMonoMs !== undefined) {
      const rtt = received - timing.sentMonoMs
      this.bestRtt = Math.min(this.bestRtt, rtt)
      latency = rtt / 2
    } else if (timing.roundTripMs !== undefined) {
      this.bestRtt = Math.min(this.bestRtt, timing.roundTripMs)
      latency = this.bestRtt / 2
    }
    const clock = snapshot.clock
    // onStatus 可先触发画面 read；样本的接收时刻早几毫秒仍合法，把锚点投影到最后已读时刻。
    const appliedMono = Math.max(received, this.lastMono)
    const target = clock.virtual_base_ms + (snapshot.server_now_ms + latency + appliedMono - received - clock.real_anchor_utc_ms) * clock.rate
    if (!Number.isFinite(target) || Math.abs(target) > DATE_LIMIT_MS) throw new RangeError('共享景色时间超出有效范围')
    const changed = !previous || newEpoch || clock.version !== previous.clock.version
    const oldVirtual = previous ? this.at(appliedMono) : target
    const reset = !!previous && changed && clock.following_real
      && (!previous.clock.following_real || Math.abs(oldVirtual - target) > 300_000)
    // 同一版锚点的网络误差用短暂校时收敛；大幅重置由场景做日出/月光过渡。
    this.correction = !changed && Math.abs(oldVirtual - target) < 300_000 ? oldVirtual - target : 0
    this.virtualAnchor = target
    this.monoAnchor = appliedMono
    this.lastMono = appliedMono
    this.lastReceivedMono = received
    this.snapshot = snapshot
    return { changed, reset }
  }

  read(monotonicMs: number): SceneryTime {
    if (!this.snapshot) throw new Error('尚未收到共享景色时间')
    if (!validMono(monotonicMs) || monotonicMs < this.lastMono) throw new RangeError('单调时刻不能倒退')
    const virtualMs = this.at(monotonicMs)
    this.lastMono = monotonicMs
    const position = ((virtualMs % DAY_MS + 8 * HOUR_MS) % DAY_MS + DAY_MS) % DAY_MS
    const hour = position / HOUR_MS
    return {
      virtualMs, hour,
      time: `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor(position / 60_000) % 60).padStart(2, '0')}`,
      phase: hour < 5.5 || hour >= 20 ? 'night' : hour < 8 ? 'dawn' : hour < 16.5 ? 'day' : 'dusk',
      night: nightWeight(hour), rate: this.snapshot.clock.rate, followingReal: this.snapshot.clock.following_real,
    }
  }

  private at(monotonicMs: number): number {
    const elapsed = monotonicMs - this.monoAnchor
    const value = this.virtualAnchor + elapsed * (this.snapshot?.clock.rate ?? 1)
      + this.correction * Math.max(0, 1 - elapsed / 1000)
    if (!Number.isFinite(value) || Math.abs(value) > DATE_LIMIT_MS) throw new RangeError('共享景色时间超出有效范围')
    return value
  }
}
