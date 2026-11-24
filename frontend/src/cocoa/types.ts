import type { RoomAccount } from '../seaside/types'
import type { RoomConnectionState } from '../seaside/types'
import type { HomeMember } from '../interior/room'
export type CocoaStation = 'heat' | 'stir'
export type CocoaMode = 'gentle' | 'heat' | 'stir' | 'stop'
export type CocoaPhase = 'preparing' | 'brewing' | 'paused' | 'pouring' | 'complete'
export type CupType = 'cream' | 'teal'
export type Ingredient = 'marshmallow' | 'cocoa' | 'cinnamon'
export interface CocoaChoice { cup_type: CupType; ingredients: Ingredient[] }
export interface CocoaRun {
  id: number; phase: CocoaPhase; version: number; temperature: number; progress: number
  choices: Record<RoomAccount, CocoaChoice>; maker_accounts: RoomAccount[]; reason: string; created_at: string
}
export interface CocoaPerson { user_id: number; account: RoomAccount; display: string }
export interface CocoaCup {
  id: number; recipient_id: number; recipient_account: RoomAccount; recipient_display: string
  cup_type: CupType; ingredients: Ingredient[]; claimed: boolean
}
export interface CocoaRecipe {
  run_id: number; name: string; created_at: string; makers: CocoaPerson[]; cups: CocoaCup[]; cheered_at: string | null
}
export interface CocoaOffer {
  id: string; kind: 'swap' | 'pass' | 'cheers'; run_id: number; from_account: RoomAccount; to_account: RoomAccount; cup_id: number | null
}
export interface VisibleCup { id: number; run_id: number; recipient_account: RoomAccount; cup_type: CupType; ingredients: Ingredient[] }
export interface CocoaSnapshot {
  run: CocoaRun | null
  operators: { account: RoomAccount; station: CocoaStation; intent: Exclude<CocoaMode, 'stop'> | null }[]
  offers: CocoaOffer[]; recipe: CocoaRecipe | null; visible_cups: VisibleCup[]
  cheers: { id: string; run_id: number; until_ms: number } | null
}
export interface CocoaGameView {
  account: RoomAccount; display: string; members: HomeMember[]; cocoa: CocoaSnapshot | null
  connection: { state: RoomConnectionState; pending: boolean; message?: string }
  inputMode: CocoaMode; sessionId: string | null; approaching: boolean
}
export type CocoaCommand =
  | { action: 'start'; request_id: string }
  | { action: 'station'; run_id: number; station: CocoaStation }
  | { action: 'leave' }
  | { action: 'choice'; run_id: number; version: number; cup_type: CupType; ingredients: Ingredient[] }
  | { action: 'begin' | 'pause' | 'resume'; run_id: number; version: number }
  | { action: 'finish'; run_id: number; version: number; name: string }
  | { action: 'claim'; cup_id: number }
  | { action: 'offer'; run_id: number; kind: 'swap' | 'pass' | 'cheers'; cup_id?: number }
  | { action: 'respond'; offer_id: string; accept: boolean }
  | { action: 'cancel'; offer_id: string }

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const account = (v: unknown): v is RoomAccount => v === 'bear' || v === 'her'
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const choice = (v: unknown): v is CocoaChoice => object(v) && ['cream', 'teal'].includes(String(v.cup_type))
  && Array.isArray(v.ingredients) && v.ingredients.length <= 3 && new Set(v.ingredients).size === v.ingredients.length
  && v.ingredients.every(item => ['marshmallow', 'cocoa', 'cinnamon'].includes(item))
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
export function isCocoaRecipe(v: unknown): v is CocoaRecipe {
  if (!object(v) || !integer(v.run_id) || !text(v.name) || !date(v.created_at)
    || !(v.cheered_at === null || date(v.cheered_at)) || !Array.isArray(v.makers) || v.makers.length < 1 || v.makers.length > 2
    || !Array.isArray(v.cups) || v.cups.length !== 2) return false
  return v.makers.every(m => object(m) && integer(m.user_id) && account(m.account) && text(m.display))
    && new Set(v.makers.map(m => m.account)).size === v.makers.length
    && v.cups.every(c => object(c) && integer(c.id) && integer(c.recipient_id) && account(c.recipient_account)
      && text(c.recipient_display) && choice(c) && typeof c.claimed === 'boolean')
    && new Set(v.cups.map(c => c.id)).size === 2 && new Set(v.cups.map(c => c.recipient_account)).size === 2
}
export function isCocoaSnapshot(v: unknown): v is CocoaSnapshot {
  if (!object(v) || !Array.isArray(v.operators) || v.operators.length > 2 || !Array.isArray(v.offers)
    || !Array.isArray(v.visible_cups) || !(v.recipe === null || isCocoaRecipe(v.recipe))) return false
  if (v.run !== null) {
    const r = v.run
    if (!object(r) || !integer(r.id) || !integer(r.version) || !['preparing','brewing','paused','pouring','complete'].includes(String(r.phase))
      || typeof r.temperature !== 'number' || !Number.isFinite(r.temperature) || r.temperature < 20 || r.temperature > 85
      || typeof r.progress !== 'number' || !Number.isFinite(r.progress) || r.progress < 0 || r.progress > 100
      || !object(r.choices) || !choice(r.choices.bear) || !choice(r.choices.her) || !Array.isArray(r.maker_accounts)
      || r.maker_accounts.length > 2 || !r.maker_accounts.every(account) || typeof r.reason !== 'string' || !date(r.created_at)) return false
  }
  if (v.cheers !== null && (!object(v.cheers) || !text(v.cheers.id) || !integer(v.cheers.run_id) || !integer(v.cheers.until_ms))) return false
  return v.operators.every(o => object(o) && account(o.account) && ['heat','stir'].includes(String(o.station))
    && (o.intent === null || ['gentle','heat','stir'].includes(String(o.intent))))
    && new Set(v.operators.map(o => o.account)).size === v.operators.length && new Set(v.operators.map(o => o.station)).size === v.operators.length
    && v.offers.every(o => object(o) && text(o.id) && integer(o.run_id) && ['swap','pass','cheers'].includes(String(o.kind))
      && account(o.from_account) && account(o.to_account) && o.from_account !== o.to_account && (o.kind === 'pass' ? integer(o.cup_id) : o.cup_id === null))
    && v.visible_cups.every(c => object(c) && integer(c.id) && integer(c.run_id) && account(c.recipient_account) && choice(c))
}
