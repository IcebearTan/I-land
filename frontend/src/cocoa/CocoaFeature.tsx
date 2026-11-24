import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { eventBus } from '../game/EventBus'
import { useIslanders } from '../islanders'
import type { RoomAccount } from '../seaside/types'
import { CocoaPanel } from './ui'
import type { CocoaAction } from './ui/types'
import { cocoaPanelState, type CocoaLocalView } from './view'
import { isCocoaRecipe, type CocoaCommand, type CocoaGameView, type CocoaRecipe } from './types'

function requestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128
  const h = Array.from(b, n => n.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}
const initial = (account: RoomAccount): CocoaLocalView => ({ selectedCup: account, choicesOpen: false, recipeName: '', view: 'activity', selectedRecipe: null, collectionStatus: 'ready', collection: [] })
export function CocoaFeature({ account }: { account: RoomAccount }) {
  const [open, setOpen] = useState(false), [game, setGame] = useState<CocoaGameView | null>(null)
  const [local, setLocal] = useState(() => initial(account)), [refresh, setRefresh] = useState(0)
  const names = useIslanders(), gameRef = useRef(game), openRef = useRef(open)
  gameRef.current = game; openRef.current = open
  const request = useRef<{ fromRun: number | null; id: string } | null>(null)
  const stop = useCallback((scope = gameRef.current?.sessionId ?? null) => eventBus.emit('COCOA_INPUT', { mode: 'stop', sessionId: scope, account }), [account])
  const close = useCallback(() => {
    if (!openRef.current) return
    stop(); eventBus.emit('COCOA_ACTION', { action: 'leave' })
    openRef.current = false; setOpen(false)
    eventBus.emit('COCOA_LAYOUT', { compact: false }); eventBus.emit('PANEL_CLOSED', { panel: 'cocoa' })
  }, [stop])
  useEffect(() => {
    const onState = (value: CocoaGameView) => { if (value.account === account) setGame(value) }
    const onOpen = () => {
      openRef.current = true; setOpen(true); setLocal(value => ({ ...value, view: 'activity', selectedCup: account }))
      eventBus.emit('PANEL_OPENED', { panel: 'cocoa' }); eventBus.emit('COCOA_REQUEST_STATE', {})
    }
    const onPanel = ({ panel }: { panel: string }) => { if (panel !== 'cocoa') close() }
    const onScene = ({ scene, transitioning }: { scene: string; transitioning: boolean }) => { if (scene !== 'interior' || transitioning) close() }
    const onOperation = (result: { ok: boolean; account: RoomAccount }) => { if (result.ok && result.account === account) setRefresh(n => n + 1) }
    eventBus.on('COCOA_STATE', onState); eventBus.on('OPEN_COCOA', onOpen); eventBus.on('PANEL_OPENED', onPanel)
    eventBus.on('SCENE_CHANGED', onScene); eventBus.on('COCOA_OPERATION', onOperation)
    return () => {
      stop(); eventBus.off('COCOA_STATE', onState); eventBus.off('OPEN_COCOA', onOpen); eventBus.off('PANEL_OPENED', onPanel)
      eventBus.off('SCENE_CHANGED', onScene); eventBus.off('COCOA_OPERATION', onOperation)
    }
  }, [account, close, stop])
  useEffect(() => { setLocal(value => ({ ...value, recipeName: '', choicesOpen: false })) }, [game?.cocoa?.run?.id])
  useEffect(() => {
    const phase = game?.cocoa?.run?.phase
    eventBus.emit('COCOA_LAYOUT', { compact: open && local.view === 'activity' && !!phase && phase !== 'preparing' && !local.choicesOpen })
  }, [open, local.view, local.choicesOpen, game?.cocoa?.run?.phase])
  useEffect(() => {
    if (!open || local.view !== 'collection' || game?.connection.state !== 'connected') return
    const controller = new AbortController()
    setLocal(value => ({ ...value, collectionStatus: 'loading', collectionError: undefined }))
    api<{ recipes: CocoaRecipe[] }>('/api/rooms/interior/cocoa/recipes', { signal: controller.signal }).then(result => {
      if (!Array.isArray(result.recipes) || !result.recipes.every(isCocoaRecipe)) throw new Error('配方信息暂时无法确认，请再取一次。')
      if (!controller.signal.aborted) setLocal(value => ({ ...value, collectionStatus: 'ready', collection: result.recipes }))
    }).catch(error => { if (!controller.signal.aborted) setLocal(value => ({ ...value, collectionStatus: 'error', collectionError: error instanceof Error ? error.message : '暂时无法取回作品。' })) })
    return () => controller.abort()
  }, [open, local.view, game?.connection.state, refresh])

  function action(value: CocoaAction): void {
    const current = gameRef.current, run = current?.cocoa?.run
    const me = current?.members.find(m => m.account === account)
    const send = (command: CocoaCommand) => eventBus.emit('COCOA_ACTION', command)
    if (value.type === 'release-input') { if (value.account === account) stop(value.sessionId); return }
    if (value.type === 'close') { close(); return }
    if (value.type === 'show-collection' || value.type === 'show-activity') { stop(); setLocal(v => ({ ...v, view: value.type === 'show-collection' ? 'collection' : 'activity', selectedRecipe: null })); return }
    if (value.type === 'select-recipe') { setLocal(v => ({ ...v, selectedRecipe: value.recipeId || null })); return }
    if (value.type === 'select-cup') { setLocal(v => ({ ...v, selectedCup: value.owner })); return }
    if (value.type === 'set-choices-open') { if (value.open) stop(); setLocal(v => ({ ...v, choicesOpen: value.open })); return }
    if (value.type === 'change-recipe-name') { setLocal(v => ({ ...v, recipeName: value.value })); return }
    if (value.type === 'refresh') {
      if (current?.connection.state === 'expired') eventBus.emit('SESSION_EXPIRED', {})
      else eventBus.emit('INTERIOR_ACTION', { action: 'reconnect' })
      eventBus.emit('COCOA_REQUEST_STATE', {}); setRefresh(n => n + 1); return
    }
    if (!current || current.connection.state !== 'connected') return
    if (value.type === 'set-input') { eventBus.emit('COCOA_INPUT', { mode: value.mode, sessionId: current.sessionId, account }); return }
    if (value.type === 'leave') { stop(); send({ action: 'leave' }); return }
    if (value.type === 'start') {
      stop(); const id = run?.id ?? null
      if (!request.current || request.current.fromRun !== id) request.current = { fromRun: id, id: requestId() }
      send({ action: 'start', request_id: request.current.id }); return
    }
    if (!run) return
    if (value.type === 'join' || value.type === 'choose-station') {
      stop(); const station = value.type === 'choose-station' ? value.station : current.members.some(m => m.station === 'heat') ? 'stir' : 'heat'
      send({ action: 'station', run_id: run.id, station }); return
    }
    if (value.type === 'set-cup' || value.type === 'set-ingredients') {
      if (value.owner !== account || !me?.station) return
      const choice = run.choices[account]
      send({ action: 'choice', run_id: run.id, version: run.version, cup_type: value.type === 'set-cup' ? value.style : choice.cup_type,
        ingredients: value.type === 'set-ingredients' ? value.ingredients : choice.ingredients }); return
    }
    if (value.type === 'begin' || value.type === 'pause' || value.type === 'resume') { stop(); send({ action: value.type, run_id: run.id, version: run.version }); return }
    if (value.type === 'portion') { stop(); send({ action: 'finish', run_id: run.id, version: run.version, name: value.name }); return }
    if (value.type === 'swap-stations' || value.type === 'toast') { stop(); send({ action: 'offer', run_id: run.id, kind: value.type === 'toast' ? 'cheers' : 'swap' }); return }
    if (value.type === 'respond-invitation') { if (value.accept) stop(); send({ action: 'respond', offer_id: value.offerId, accept: value.accept }); return }
    if (value.type === 'cancel-invitation') { send({ action: 'cancel', offer_id: value.offerId }); return }
    if (value.type === 'claim') { send({ action: 'claim', cup_id: Number(value.cupId) }); return }
    if (value.type === 'offer') { send({ action: 'offer', run_id: run.id, kind: 'pass', cup_id: Number(value.cupId) }); return }
    if (value.type === 'accept-offer' || value.type === 'decline-offer') { if (value.offerId) send({ action: 'respond', offer_id: value.offerId, accept: value.type === 'accept-offer' }); return }
    if (value.type === 'cancel-offer' && value.offerId) send({ action: 'cancel', offer_id: value.offerId })
  }
  const panel = cocoaPanelState(game, account, names, local)
  const compact = open && local.view === 'activity' && !local.choicesOpen && ['brewing','paused','pouring','complete'].includes(panel.phase)
  return <>{compact && <div className="cocoa-stage-status" aria-label="料理台实时温度与进度">{panel.connection !== 'connected'
    ? '正在重新确认料理台…' : panel.phase === 'complete' ? '两杯都留好了。'
    : `${panel.phase === 'paused' ? '已暂停 · ' : ''}温度 ${Math.round(panel.temperature ?? 24)}°C · 融合 ${Math.round(panel.progress ?? 0)}%`}</div>}
    <CocoaPanel open={open} state={panel} onAction={action} /></>

}
