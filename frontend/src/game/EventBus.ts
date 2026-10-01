import mitt from 'mitt'
import type { CharacterId } from '../characters'
import type { AudioContextInfo, AudioSettings, AudioStatus } from '../audio/types'
import type { SceneryRate, SceneryTime } from '../seaside/clock'

export interface IslandIdentity { character: CharacterId; display: string }
export type SceneId = 'login' | 'island' | 'seaside'
export interface IslandEntry extends IslandIdentity { returnPoint?: { x: number; y: number } }
export interface SceneState { scene: SceneId; transitioning: boolean }
export interface SeasideState { pose: 'arriving' | 'seated' | 'standing'; clock: SceneryTime }

/**
 * 游戏层（Phaser）与 UI 层（React）之间唯一允许的通信通道。
 * 规则：Phaser 不知道 React 存在，React 不碰 canvas。
 */
export type PanelName = 'mailbox' | 'calendar' | 'bottle' | 'settings'

export interface DayTick {
  time: string
  phase: Phase
}

export type GameEvents = {
  /** 游戏每秒发出：现实时间与岛上时段（昼夜 tint 依据） */
  DAY_TICK: DayTick
  /** Phaser 场景就绪（App 收到后按登录态决定停在哪） */
  GAME_READY: Record<string, never>
  /** React → 游戏：登录成功/已登录，上岛 */
  ENTER_ISLAND: IslandIdentity
  /** 登录之后的改名/形象更新不承担导航。 */
  IDENTITY_CHANGED: IslandIdentity
  /** 场景就绪独立于登录 GAME_READY；常驻导航场景持有可重取快照。 */
  SCENE_READY: { scene: SceneId; identity?: IslandIdentity }
  SCENE_CHANGED: SceneState
  SCENE_REQUEST_STATE: Record<string, never>
  TRAVEL_REQUEST: { from: 'island' | 'seaside'; to: 'island' | 'seaside'; returnPoint?: { x: number; y: number } }
  SEASIDE_STATE: SeasideState
  SEASIDE_REQUEST_STATE: Record<string, never>
  SEASIDE_ACTION: { action: 'sit' | 'stand' }
  SEASIDE_CLOCK_REQUEST: { action: 'rate'; rate: SceneryRate } | { action: 'reset' }
  /** React → 游戏：下岛回登录 */
  EXIT_TO_LOGIN: Record<string, never>
  MOVE_INPUT: { x: number; y: number }
  INTERACT: Record<string, never>
  INTERACTION_CHANGED: { label: string | null }
  OPEN_MAILBOX: { unread: number }
  OPEN_CALENDAR: Record<string, never>
  OPEN_BOTTLE: { id: string }
  OPEN_SETTINGS: Record<string, never>
  /** 声音场景启动/重建后，UI 重发当前账号与偏好快照 */
  AUDIO_READY: Record<string, never>
  AUDIO_REQUEST_STATE: Record<string, never>
  AUDIO_SESSION: { active: boolean }
  AUDIO_SETTINGS: AudioSettings
  /** 设置中的继续播放入口；同步发出，避免等待保存后错过交互授权 */
  AUDIO_UNLOCK: Record<string, never>
  AUDIO_CONTEXT: AudioContextInfo
  AUDIO_STATUS: AudioStatus
  PANEL_OPENED: { panel: PanelName }
  PANEL_CLOSED: { panel: PanelName }
}

export type Phase = 'dawn' | 'day' | 'dusk' | 'night'

export const eventBus = mitt<GameEvents>()
