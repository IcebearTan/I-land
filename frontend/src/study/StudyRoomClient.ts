import { SharedRoomClient, type RoomClientOptions, type SharedRoomView } from '../game/rooms/SharedRoomClient'
import { roomEntryFetch } from '../game/rooms/entry'
import type { StudyAccount, StudyPhase, StudySnapshot, StudyTimer } from './types'

export type StudyRoomView = SharedRoomView<StudySnapshot>

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const isAccount = (v: unknown): v is StudyAccount => v === 'bear' || v === 'her'
const isPhase = (v: unknown): v is StudyPhase =>
  v === 'idle' || v === 'focusing' || v === 'resting' || v === 'stopwatch'

function isStudyTimer(value: unknown, expected: StudyAccount): value is StudyTimer {
  if (!value || typeof value !== 'object') return false
  const t = value as Partial<StudyTimer>
  return (
    t.account === expected &&
    isPhase(t.phase) &&
    isInt(t.focus_minutes) &&
    isInt(t.break_minutes) &&
    isInt(t.started_at_ms) &&
    isInt(t.ends_at_ms) &&
    typeof t.goal_text === 'string' &&
    (t.synced_with === '' || isAccount(t.synced_with)) &&
    isInt(t.version) &&
    t.version >= 1
  )
}

export function isStudySnapshot(value: unknown): value is StudySnapshot {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<StudySnapshot>
  if (
    s.room !== 'study' ||
    typeof s.epoch !== 'string' ||
    !s.epoch ||
    !isInt(s.revision) ||
    !isInt(s.server_now_ms) ||
    !s.timers ||
    !isStudyTimer(s.timers.bear, 'bear') ||
    !isStudyTimer(s.timers.her, 'her') ||
    !isInt(s.latest_message_id) ||
    !Array.isArray(s.members) ||
    s.members.length > 2
  ) {
    return false
  }
  const seen = new Set<string>()
  for (const m of s.members) {
    if (
      !m ||
      !isInt(m.user_id) ||
      !isAccount(m.account) ||
      m.sprite !== m.account ||
      typeof m.display !== 'string' ||
      (m.seat !== 0 && m.seat !== 1) ||
      m.pose !== 'seated' ||
      seen.has(m.account)
    ) {
      return false
    }
    seen.add(m.account)
  }
  return true
}

export class StudyRoomClient extends SharedRoomClient<StudySnapshot> {
  constructor(options: Omit<RoomClientOptions<StudySnapshot>, 'root' | 'isSnapshot' | 'version'>) {
    super({
      ...options,
      root: '/api/rooms/study',
      isSnapshot: isStudySnapshot,
      version: (s) => s.timers.bear.version + s.timers.her.version,
      environment: {
        ...options.environment,
        fetch: roomEntryFetch(options.environment?.fetch),
      },
    })
  }
}

/** 阶段切换时的柔和木琴轻响（零外部音频体积，静音模式不发声）。 */
export function playStudyChime(kind: 'rest' | 'done'): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const notes = kind === 'rest' ? [523.25, 659.25, 783.99] : [659.25, 587.33, 523.25]
    const now = ctx.currentTime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now + idx * 0.14)
      gain.gain.setValueAtTime(0.0001, now + idx * 0.14)
      gain.gain.exponentialRampToValueAtTime(0.09, now + idx * 0.14 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.55)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + idx * 0.14)
      osc.stop(now + idx * 0.14 + 0.58)
    })
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 1200)
  } catch {
    // 浏览器未解锁音频时静默跳过
  }
}
