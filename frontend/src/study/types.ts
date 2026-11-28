import type { RoomConnectionState } from '../seaside/types'

export type StudyAccount = 'bear' | 'her'
export type StudyPhase = 'idle' | 'focusing' | 'resting' | 'stopwatch'
export type StudyNudgeKind = 'tea' | 'pat' | 'poke' | 'flower'
export type StudyAudioMode = 'whitenoise' | 'melody' | 'mute'

export interface StudyTimer {
  account: StudyAccount
  phase: StudyPhase
  focus_minutes: number
  break_minutes: number
  started_at_ms: number
  ends_at_ms: number
  goal_text: string
  synced_with: '' | StudyAccount
  version: number
}

export interface StudyMember {
  user_id: number
  account: StudyAccount
  display: string
  sprite: StudyAccount
  seat: 0 | 1
  pose: 'seated'
}

export interface StudyNudgeEvent {
  seq: number
  kind: StudyNudgeKind
  label: string
  from_account: StudyAccount
  from_display: string
  at_ms: number
}

export interface StudySnapshot {
  room: 'study'
  epoch: string
  revision: number
  server_now_ms: number
  timers: { bear: StudyTimer; her: StudyTimer }
  latest_message_id: number
  last_nudge: StudyNudgeEvent | null
  members: StudyMember[]
}

export interface StudyRangeSummary {
  bear_minutes: number
  her_minutes: number
  total_minutes: number
  sessions_count: number
  together_count: number
}

export interface StudyOverview {
  server_now_ms: number
  roof_lit: boolean
  online_count: number
  members: Array<{ account: StudyAccount; display: string; seat: 0 | 1 | null; pose: string }>
  timers: { bear: StudyTimer; her: StudyTimer }
  today: StudyRangeSummary & { date: string }
  week: StudyRangeSummary
  recent_goals: string[]
  latest_message_id: number
}

export interface StudyAttachment {
  id: string
  width: number
  height: number
  original_name: string
  urls: {
    original: string
    display: string
    thumb: string
  }
}

export interface StudyMessageItem {
  id: number
  sender: StudyAccount
  sender_display: string
  body: string
  attachment_id: string
  attachment: StudyAttachment | null
  client_id: string
  created_at: string
}

export interface StudySceneState {
  connection: {
    state: RoomConnectionState
    pending: boolean
    message?: string
  }
  members: StudyMember[]
  timers: { bear: StudyTimer; her: StudyTimer }
  latestMessageId: number
  lastNudge: StudyNudgeEvent | null
  serverOffsetMs: number
  audioMode: StudyAudioMode
}
