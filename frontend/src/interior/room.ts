import { isCocoaSnapshot } from '../cocoa/types'
import type { CocoaSnapshot } from '../cocoa/types'
import { SharedRoomClient } from '../game/rooms/SharedRoomClient'
import type { RoomClientOptions, SharedRoomView } from '../game/rooms/SharedRoomClient'
import { roomEntryFetch } from '../game/rooms/entry'
import type { RoomAccount, RoomTiming } from '../seaside/types'

export interface HomeMember {
  user_id: number; account: RoomAccount; display: string; sprite: RoomAccount
  seat: 0 | 1 | null; pose: 'standing' | 'seated'
  station?: 'heat' | 'stir' | null; held_cup_id?: number | null
  cocoa_pose?: 'waiting' | 'working' | 'holding' | 'offering' | 'receiving' | 'cheers' | null
}
export interface Television {
  powered: boolean; channel: 0 | 1 | 2; position_ms: number; anchor_utc_ms: number
  version: number; changed_by: RoomAccount | null
}
export interface HomeSnapshot {
  room: 'interior'; epoch: string; revision: number; server_now_ms: number
  television: Television; members: HomeMember[]; cocoa?: CocoaSnapshot
}
export type HomeView = SharedRoomView<HomeSnapshot>
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const account = (v: unknown): v is RoomAccount => v === 'bear' || v === 'her'
export function isHomeSnapshot(value: unknown): value is HomeSnapshot {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<HomeSnapshot>, tv = s.television
  if (s.room !== 'interior' || typeof s.epoch !== 'string' || !s.epoch || !integer(s.revision)
    || !integer(s.server_now_ms) || !tv || typeof tv.powered !== 'boolean'
    || !integer(tv.channel) || tv.channel > 2 || !integer(tv.position_ms) || tv.position_ms >= 24000
    || !integer(tv.anchor_utc_ms) || !integer(tv.version) || tv.version < 1
    || !(tv.changed_by === null || account(tv.changed_by)) || !Array.isArray(s.members) || s.members.length > 2) return false
  if (s.cocoa !== undefined && !isCocoaSnapshot(s.cocoa)) return false
  const accounts = new Set(), ids = new Set(), seats = new Set(), stations = new Set()
  for (const m of s.members) {
    if (!m || !integer(m.user_id) || m.user_id < 1 || !account(m.account) || m.sprite !== m.account
      || typeof m.display !== 'string' || !m.display.trim() || ids.has(m.user_id) || accounts.has(m.account)
      || !(m.pose === 'standing' && m.seat === null || m.pose === 'seated' && (m.seat === 0 || m.seat === 1))
      || (m.seat !== null && seats.has(m.seat))) return false
    if (m.station != null && (!['heat', 'stir'].includes(m.station) || m.seat !== null || stations.has(m.station))) return false
    if (m.held_cup_id != null && (!integer(m.held_cup_id) || m.held_cup_id < 1 || m.station == null)) return false
    if (m.station != null) stations.add(m.station)
    accounts.add(m.account); ids.add(m.user_id); if (m.seat !== null) seats.add(m.seat)
  }
  if (s.cocoa && (s.cocoa.operators.some(o => !s.members!.some(m => m.account === o.account && m.station === o.station))
    || s.members.some(m => m.station && !s.cocoa!.operators.some(o => o.account === m.account && o.station === m.station))
    || s.members.some(m => m.held_cup_id && !s.cocoa!.visible_cups.some(c => c.id === m.held_cup_id && c.recipient_account === m.account)))) return false
  return true
}

export class HomeRoomClient extends SharedRoomClient<HomeSnapshot> {
  constructor(options: Omit<RoomClientOptions<HomeSnapshot>, 'root' | 'isSnapshot' | 'version'>) {
    super({ ...options, root: '/api/rooms/interior', isSnapshot: isHomeSnapshot, version: s => s.television.version,
      environment: { ...options.environment, fetch: roomEntryFetch(options.environment?.fetch) } })
  }
  setSeat(seat: 0 | 1 | null): Promise<boolean> { return this.command('seat', { seat }) }
  setTelevision(action: 'toggle' | 'next'): Promise<boolean> {
    if (!this.status.snapshot) return Promise.resolve(false)
    return this.command('television', { action, version: this.status.snapshot.television.version })
  }
}

/** 节目永远按真实毫秒播放，与景色倍速、设备 Date.now 无关。 */
export class SharedProgramClock {
  private position = 0
  private mono = 0
  private powered = false
  private bestRtt = Infinity
  update(snapshot: HomeSnapshot, timing: RoomTiming): void {
    if (!isHomeSnapshot(snapshot) || !Number.isFinite(timing.receivedMonoMs)) throw new TypeError('电视快照无效')
    const rtt = timing.sentMonoMs !== undefined ? timing.receivedMonoMs - timing.sentMonoMs : timing.roundTripMs
    if (rtt !== undefined && Number.isFinite(rtt) && rtt >= 0) this.bestRtt = Math.min(this.bestRtt, rtt)
    const tv = snapshot.television, latency = Number.isFinite(this.bestRtt) ? this.bestRtt / 2 : 0
    this.position = (tv.position_ms + (tv.powered ? Math.max(0, snapshot.server_now_ms + latency - tv.anchor_utc_ms) : 0)) % 24000
    this.mono = timing.receivedMonoMs; this.powered = tv.powered
  }
  read(mono: number): number { return (this.position + (this.powered ? Math.max(0, mono - this.mono) : 0)) % 24000 }
}
