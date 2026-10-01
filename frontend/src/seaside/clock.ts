import { nightWeight } from '../audio/types'

export const SCENERY_RATES = [0, 1, 30, 120] as const
export type SceneryRate = typeof SCENERY_RATES[number]

export interface SceneryTime {
  virtualMs: number
  hour: number
  time: string
  phase: 'dawn' | 'day' | 'dusk' | 'night'
  night: number
  rate: SceneryRate
  followingReal: boolean
}

/** 海边只消费此接口；双人版可用房间锚点替换本地时钟。 */
export interface SceneryClock {
  read(monotonicMs: number): SceneryTime
  setRate(rate: SceneryRate, monotonicMs: number): void
  reset(realNowMs: number, monotonicMs: number): void
}

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const SHANGHAI_OFFSET_MS = 8 * HOUR_MS
const DATE_LIMIT_MS = 8_640_000_000_000_000

const dayPosition = (virtualMs: number) => {
  // 固定 Asia/Shanghai (+8)；不随设备时区或系统时钟调整跳动。
  // 先取余再加时差，保持日期范围边缘的精度。
  return ((virtualMs % DAY_MS + SHANGHAI_OFFSET_MS) % DAY_MS + DAY_MS) % DAY_MS
}

function validEpoch(value: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > DATE_LIMIT_MS) {
    throw new RangeError('景色时间必须是有效的 UTC 毫秒时刻')
  }
}

function validMonotonic(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError('单调时刻必须是有效的非负毫秒数')
  }
}

function phaseAtHour(hour: number): SceneryTime['phase'] {
  if (hour < 5.5 || hour >= 20) return 'night'
  if (hour < 8) return 'dawn'
  if (hour < 16.5) return 'day'
  return 'dusk'
}

/** 第一版只保存在当前页面内存，倍率不影响主岛、日期或音频播放速度。 */
export class LocalSceneryClock implements SceneryClock {
  private virtualAnchor: number
  private monotonicAnchor: number
  private lastMonotonic: number
  private rate: SceneryRate = 1
  private followingReal = true

  constructor(realNowMs: number, monotonicMs: number, previewHour?: number) {
    validEpoch(realNowMs)
    validMonotonic(monotonicMs)
    this.virtualAnchor = realNowMs
    this.monotonicAnchor = monotonicMs
    this.lastMonotonic = monotonicMs
    if (previewHour !== undefined) {
      if (!Number.isFinite(previewHour) || previewHour < 0 || previewHour >= 24) {
        throw new RangeError('预览小时必须介于 0（含）与 24（不含）之间')
      }
      const previewMs = realNowMs - dayPosition(realNowMs) + previewHour * HOUR_MS
      validEpoch(previewMs)
      this.virtualAnchor = previewMs
      this.followingReal = false
    }
  }

  read(monotonicMs: number): SceneryTime {
    const virtualMs = this.at(monotonicMs)
    this.lastMonotonic = monotonicMs
    const position = dayPosition(virtualMs)
    const hour = position / HOUR_MS
    const hours = Math.floor(hour)
    const minutes = Math.floor(position / 60_000) % 60
    return {
      virtualMs,
      hour,
      time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      phase: phaseAtHour(hour),
      night: nightWeight(hour),
      rate: this.rate,
      followingReal: this.followingReal,
    }
  }

  setRate(rate: SceneryRate, monotonicMs: number): void {
    if (!SCENERY_RATES.some(allowed => allowed === rate)) {
      throw new RangeError('景色倍率只能是暂停、1×、30×或 120×')
    }
    const virtualMs = this.at(monotonicMs)
    this.virtualAnchor = virtualMs
    this.monotonicAnchor = monotonicMs
    this.lastMonotonic = monotonicMs
    this.rate = rate
    if (rate !== 1) this.followingReal = false
  }

  reset(realNowMs: number, monotonicMs: number): void {
    validEpoch(realNowMs)
    this.checkMonotonic(monotonicMs)
    this.virtualAnchor = realNowMs
    this.monotonicAnchor = monotonicMs
    this.lastMonotonic = monotonicMs
    this.rate = 1
    this.followingReal = true
  }

  private checkMonotonic(monotonicMs: number): void {
    validMonotonic(monotonicMs)
    if (monotonicMs < this.lastMonotonic) {
      throw new RangeError('单调时刻不能倒退')
    }
  }

  private at(monotonicMs: number): number {
    this.checkMonotonic(monotonicMs)
    const virtualMs = this.virtualAnchor + (monotonicMs - this.monotonicAnchor) * this.rate
    validEpoch(virtualMs)
    return virtualMs
  }
}
