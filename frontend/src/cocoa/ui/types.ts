/** 展示层自有契约。由适配器映射服务端快照/权限；这里不是网络协议。 */
export type CocoaAccount = 'bear' | 'her'
export type CocoaCupStyle = 'cream' | 'teal'
export type CocoaIngredient = 'marshmallow' | 'cocoa' | 'cinnamon'
export type CocoaStation = 'heat' | 'stir'
export type CocoaPhase = 'idle' | 'preparing' | 'brewing' | 'paused' | 'pouring' | 'complete'
export type CocoaInputMode = 'gentle' | 'heat' | 'stir' | 'stop'
export type CocoaConnection = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'taken-over' | 'expired'

export interface CocoaPerson { account: CocoaAccount; display: string }
export interface CocoaParticipant extends CocoaPerson {
  /** 只传实际加入者；here/away 必须来自确认状态，不能从 visits 推断。 */
  presence: 'here' | 'away'
  station: CocoaStation | null
}
export interface CocoaCupChoice {
  owner: CocoaPerson
  style: CocoaCupStyle
  ingredients: readonly CocoaIngredient[]
}
export interface CocoaOffer {
  id: string
  from: CocoaPerson
  to: CocoaPerson
}
export interface CocoaInvitation extends CocoaOffer {
  kind: 'swap' | 'cheers'
  allowedActions: readonly ('accept' | 'decline' | 'cancel')[]
}
export type CocoaCupAction = 'claim' | 'offer' | 'accept-offer' | 'decline-offer' | 'cancel-offer'
export interface CocoaCupResult extends CocoaCupChoice {
  id: string
  claimed: boolean
  /** 当前真实房间确认的手持者；历史领取不等同于当前手持/在线。 */
  heldBy: CocoaPerson | null
  offer: CocoaOffer | null
  /** 服务端条件对应的逐杯权限。历史记录通常传空数组。 */
  allowedActions: readonly CocoaCupAction[]
}
export interface CocoaRecipe {
  id: string
  name: string
  /** 服务端真实制作日期的本地化文案，不传景色时钟日期。 */
  createdAtLabel: string
  makers: readonly CocoaPerson[]
  cups: readonly CocoaCupResult[]
}

export type CocoaAction =
  | { type: 'start' | 'join' | 'begin' | 'swap-stations' | 'pause' | 'resume' | 'toast' | 'refresh' | 'leave' | 'close' }
  | { type: 'show-activity' | 'show-collection' }
  | { type: 'select-recipe'; recipeId: string }
  | { type: 'select-cup'; owner: CocoaAccount }
  | { type: 'set-cup'; owner: CocoaAccount; style: CocoaCupStyle }
  | { type: 'set-ingredients'; owner: CocoaAccount; ingredients: CocoaIngredient[] }
  | { type: 'choose-station'; station: CocoaStation }
  | { type: 'set-input'; mode: CocoaInputMode }
  | { type: 'set-choices-open'; open: boolean }
  | { type: 'respond-invitation'; offerId: string; accept: boolean }
  | { type: 'cancel-invitation'; offerId: string }
  | { type: 'change-recipe-name'; value: string }
  | { type: 'portion'; name: string }
  | { type: CocoaCupAction; cupId: string; offerId?: string }
  | { type: 'release-input'; sessionId: string | null; account: CocoaAccount; reason: 'blur' | 'hidden' | 'unmount' | 'close' }

export interface CocoaPanelState {
  sessionId: string | null
  phase: CocoaPhase
  connection: CocoaConnection
  self: CocoaPerson
  participants: readonly CocoaParticipant[]
  choices: readonly CocoaCupChoice[]
  selectedCup: CocoaAccount
  editableCups: readonly CocoaAccount[]
  choicesOpen: boolean
  /** 仅服务端确认后的数值，组件不自行插值、推进或判定完成。 */
  temperature: number | null
  idealRange: readonly [number, number]
  progress: number | null // 0–100；null 表示尚未确认。
  /** 当前个人输入意图，由控制器管理；不能用它推断服务端进度或制作结果。 */
  inputMode: CocoaInputMode
  invitations: readonly CocoaInvitation[]
  recipeNameDraft: string
  /** 确认状态允许的动作名；不包含本地选页/编辑草稿动作也可以。 */
  allowedActions: readonly CocoaAction['type'][]
  pending: boolean
  issue?: { kind: 'error' | 'conflict' | 'info'; message: string }
  toastFeedback?: string
  result: CocoaRecipe | null
  view: 'activity' | 'collection'
  collection: { status: 'loading' | 'ready' | 'error'; items: readonly CocoaRecipe[]; message?: string }
  selectedRecipeId: string | null
}
export interface CocoaPanelProps {
  open: boolean
  state: CocoaPanelState
  onAction: (action: CocoaAction) => void
  /** 规则原型必须显式设 prototype；正常接入保持 live。 */
  mode?: 'live' | 'prototype'
}
