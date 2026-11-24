import type { CocoaMode, CocoaPhase, CocoaStation } from './types'
interface Transport { readonly leaseKey: string | undefined; sendIntent(path: string, body: Record<string, unknown>): Promise<boolean> }
interface Context { runId: number | null; phase: CocoaPhase | null; station: CocoaStation | null }
type Timer = ReturnType<typeof setTimeout>
let controllerId = 0
/** 只续期自己的操作意图；离线、旧作用域、工位/阶段变化立即取消。 */
export class CocoaInputController {
  private context: Context = { runId: null, phase: null, station: null }
  private lease?: string
  private serial = 0
  private readonly id = ++controllerId
  private seq = 0
  private generation = 0
  private timer?: Timer
  private intent: CocoaMode = 'stop'
  private disposed = false
  constructor(private readonly transport: Transport, private readonly changed: () => void,
    private readonly timers = { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (timer: Timer) => clearTimeout(timer) }) {}
  get mode(): CocoaMode { return this.intent }
  get scope(): string | null { return this.lease && this.context.runId ? `cocoa-${this.id}-${this.serial}` : null }
  synchronize(context: Context): void {
    const lease = this.transport.leaseKey
    const differentLease = lease !== this.lease
    const differentRun = context.runId !== this.context.runId
    if (differentLease || differentRun) {
      this.clear(); this.intent = 'stop'; this.generation++; this.serial++
      if (differentLease) this.seq = 0
      this.lease = lease; this.context = context; this.changed(); return
    }
    const changedStation = context.station !== this.context.station
    this.context = context
    if (!lease || context.phase !== 'brewing' || changedStation) this.set('stop')
  }
  set(mode: CocoaMode, capturedScope = this.scope): void {
    if (this.disposed || capturedScope !== this.scope) return
    if (mode !== 'stop' && (!this.lease || this.context.phase !== 'brewing'
      || (mode === 'stir' ? this.context.station !== 'stir' : this.context.station !== 'heat'))) return
    this.clear()
    if (mode === 'stop' && this.intent === 'stop') return
    this.intent = mode; this.generation++; this.serial++; this.changed()
    this.send(mode)
    if (mode !== 'stop') this.schedule()
  }
  suspend(): void {
    this.clear(); this.intent = 'stop'; this.generation++; this.serial++; this.lease = undefined; this.seq = 0; this.changed()
  }
  dispose(): void { this.set('stop'); this.disposed = true; this.clear(); this.generation++ }
  private clear(): void { if (this.timer !== undefined) this.timers.clear(this.timer); this.timer = undefined }
  private schedule(): void {
    const generation = this.generation
    this.timer = this.timers.set(() => {
      this.timer = undefined
      if (this.disposed || generation !== this.generation || this.intent === 'stop') return
      this.send(this.intent); this.schedule()
    }, 500)
  }
  private send(mode: CocoaMode): void {
    if (!this.lease || this.transport.leaseKey !== this.lease || this.context.runId === null) return
    const generation = this.generation, scope = this.scope
    void this.transport.sendIntent('cocoa/action', { action: 'input', run_id: this.context.runId, seq: ++this.seq, mode }).then(ok => {
      if (!ok && !this.disposed && generation === this.generation && scope === this.scope && mode !== 'stop') this.set('stop')
    })
  }
}
