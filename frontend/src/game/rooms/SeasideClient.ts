import { SharedRoomClient } from './SharedRoomClient'
import type { RoomClientOptions as SharedOptions } from './SharedRoomClient'
import { roomEntryFetch } from './entry'
import { isRoomSnapshot } from '../../seaside/types'
import type { RoomSnapshot, RoomPose, RoomClockAction } from '../../seaside/types'

export type RoomClientOptions = Omit<SharedOptions<RoomSnapshot>, 'root' | 'isSnapshot' | 'version'>

export class RoomClient extends SharedRoomClient<RoomSnapshot> {
  constructor(options: RoomClientOptions) {
    super({ ...options, root: '/api/rooms/seaside', isSnapshot: isRoomSnapshot, version: s => s.clock.version,
      environment: { ...options.environment, fetch: roomEntryFetch(options.environment?.fetch) } })
  }
  setPose(pose: RoomPose): Promise<boolean> { return this.command('pose', { pose }) }
  setClock(action: RoomClockAction): Promise<boolean> {
    if (!this.status.snapshot) return Promise.resolve(false)
    return this.command('clock', { ...action, version: this.status.snapshot.clock.version })
  }
}
