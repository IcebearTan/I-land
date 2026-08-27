import mitt from 'mitt'

/**
 * 游戏层（Phaser）与 UI 层（React）之间唯一允许的通信通道。
 * 规则：Phaser 不知道 React 存在，React 不碰 canvas。
 */
export type PanelName = 'mailbox' | 'calendar' | 'bottle'

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
  ENTER_ISLAND: Record<string, never>
  /** React → 游戏：下岛回登录 */
  EXIT_TO_LOGIN: Record<string, never>
  OPEN_MAILBOX: { unread: number }
  OPEN_CALENDAR: Record<string, never>
  OPEN_BOTTLE: { id: string }
  PANEL_OPENED: { panel: PanelName }
  PANEL_CLOSED: { panel: PanelName }
}

export type Phase = 'dawn' | 'day' | 'dusk' | 'night'

export const eventBus = mitt<GameEvents>()
