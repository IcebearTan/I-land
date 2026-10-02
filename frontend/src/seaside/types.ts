import type { SceneryRate } from './clock'

export type RoomAccount = 'bear' | 'her'
export type RoomPose = 'seated' | 'standing' | 'leaning'
export type RoomClockAction = { action: 'rate'; rate: SceneryRate } | { action: 'reset' }

export interface RoomClockState {
  virtual_base_ms: number
  real_anchor_utc_ms: number
  rate: SceneryRate
  version: number
  following_real: boolean
  time_zone: 'Asia/Shanghai'
  changed_by: RoomAccount | null
}

export interface RoomMember {
  user_id: number
  account: RoomAccount
  display: string
  sprite: RoomAccount
  seat: 0 | 1
  pose: RoomPose
}

export interface RoomSnapshot {
  room: 'seaside'
  epoch: string
  revision: number
  server_now_ms: number
  clock: RoomClockState
  members: RoomMember[]
}

export interface RoomSelf { user_id: number; account: RoomAccount }
export interface RoomJoinResult { snapshot: RoomSnapshot; lease_id: string; self: RoomSelf }

export function isRoomSelf(value: unknown): value is RoomSelf {
  if (!value || typeof value !== 'object') return false
  const self = value as Partial<RoomSelf>
  return integer(self.user_id) && self.user_id > 0 && account(self.account)
}

export interface RoomTiming { sentMonoMs?: number; receivedMonoMs: number; roundTripMs?: number }
export type RoomConnectionState = 'joining' | 'connected' | 'reconnecting' | 'away' | 'taken-over' | 'expired' | 'error'
export interface RoomView {
  state: RoomConnectionState
  pending: boolean
  snapshot?: RoomSnapshot
  message?: string
}

const finiteEpoch = (value: unknown): value is number => typeof value === 'number'
  && Number.isFinite(value) && Math.abs(value) <= 8_640_000_000_000_000
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const account = (value: unknown): value is RoomAccount => value === 'bear' || value === 'her'

/** 完整快照是唯一可绘制的房间事实；拒绝损坏、重复座位和未知姿势。 */
export function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<RoomSnapshot>
  const clock = data.clock
  if (data.room !== 'seaside' || typeof data.epoch !== 'string' || !data.epoch
    || !integer(data.revision) || !finiteEpoch(data.server_now_ms) || !clock
    || !finiteEpoch(clock.virtual_base_ms) || !finiteEpoch(clock.real_anchor_utc_ms)
    || ![0, 1, 30, 120].includes(clock.rate) || !integer(clock.version)
    || typeof clock.following_real !== 'boolean' || clock.time_zone !== 'Asia/Shanghai'
    || !(clock.changed_by === null || account(clock.changed_by))
    || !Array.isArray(data.members) || data.members.length > 2) return false
  const ids = new Set<number>(), identities = new Set<RoomAccount>(), seats = new Set<number>()
  for (const member of data.members) {
    if (!member || !integer(member.user_id) || member.user_id < 1 || !account(member.account)
      || !account(member.sprite) || member.sprite !== member.account
      || typeof member.display !== 'string' || !member.display.trim()
      || !(member.seat === 0 || member.seat === 1)
      || !['seated', 'standing', 'leaning'].includes(member.pose)
      || ids.has(member.user_id) || identities.has(member.account) || seats.has(member.seat)) return false
    ids.add(member.user_id); identities.add(member.account); seats.add(member.seat)
  }
  return true
}
