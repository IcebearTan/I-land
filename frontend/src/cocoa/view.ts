import type { CocoaGameView, CocoaRecipe as SavedRecipe } from './types'
import type { CocoaPanelState, CocoaRecipe, CocoaAction, CocoaCupAction, CocoaPerson } from './ui/types'
import type { RoomAccount } from '../seaside/types'

export interface CocoaLocalView {
  selectedCup: RoomAccount; choicesOpen: boolean; recipeName: string; view: 'activity' | 'collection'; selectedRecipe: string | null
  collectionStatus: 'loading' | 'ready' | 'error'; collection: SavedRecipe[]; collectionError?: string
}
/** 展示权限只来自确认成员/杯子；预留给两人的选择不等同于两位参与者。 */
export function cocoaPanelState(game: CocoaGameView | null, account: RoomAccount, names: Record<RoomAccount, string>, local: CocoaLocalView): CocoaPanelState {
  const cocoa = game?.cocoa, run = cocoa?.run, members = game?.members ?? []
  const me = members.find(m => m.account === account), joined = !!me?.station
  const ready = game?.connection.state === 'connected'
  const person = (id: RoomAccount): CocoaPerson => ({ account: id, display: members.find(m => m.account === id)?.display ?? names[id] })
  const phase = run?.phase ?? 'idle', busy = !!game?.connection.pending || !!game?.approaching
  const other = members.find(m => m.account !== account && m.station)
  const allowed: CocoaAction['type'][] = ['refresh']
  if (ready) {
    if (phase === 'idle' || phase === 'complete') allowed.push('start')
    if (run && !joined) allowed.push('join')
    if (joined) {
      allowed.push('leave','choose-station')
      if (phase !== 'complete') allowed.push('set-cup','set-ingredients')
      if (phase === 'preparing') allowed.push('begin')
      if (phase === 'brewing') allowed.push('set-input','pause')
      if (phase === 'paused') allowed.push('resume')
      if (phase === 'pouring') allowed.push('portion')
      if (other && ['preparing','brewing','paused'].includes(phase)) allowed.push('swap-stations')
      if (other?.held_cup_id && me?.held_cup_id && cocoa?.recipe?.cups.some(c => c.id === me.held_cup_id)
        && cocoa.recipe.cups.some(c => c.id === other.held_cup_id) && !cocoa.offers.some(o => o.kind === 'cheers')) allowed.push('toast')
    }
  }
  function recipe(value: SavedRecipe, live = false): CocoaRecipe {
    return {
      id: String(value.run_id), name: value.name,
      createdAtLabel: new Date(value.created_at).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }),
      makers: value.makers.map(p => ({ account: p.account, display: p.display })),
      cups: value.cups.map(cup => {
        const holder = members.find(m => m.held_cup_id === cup.id)
        const offer = cocoa?.offers.find(o => o.kind === 'pass' && o.cup_id === cup.id)
        const actions: CocoaCupAction[] = []
        if (ready && joined && phase !== 'brewing') {
          if (cup.recipient_account === account && !holder) actions.push('claim')
          if (offer?.to_account === account) actions.push('accept-offer','decline-offer')
          if (offer?.from_account === account) actions.push('cancel-offer')
          if (live && cup.recipient_account !== account && !cup.claimed && other && !offer) actions.push('offer')
        }
        return { id: String(cup.id), owner: { account: cup.recipient_account, display: cup.recipient_display },
          style: cup.cup_type, ingredients: cup.ingredients, claimed: cup.claimed,
          heldBy: holder ? person(holder.account) : null,
          offer: offer ? { id: offer.id, from: person(offer.from_account), to: person(offer.to_account) } : null,
          allowedActions: actions }
      }),
    }
  }
  const message = game?.connection.message
  return {
    sessionId: game?.sessionId ?? null, phase,
    connection: game?.connection.state === 'joining' ? 'connecting' : game?.connection.state === 'away' ? 'offline'
      : game?.connection.state === 'error' ? 'offline' : game?.connection.state ?? 'connecting',
    self: person(account), participants: members.filter(m => m.station).map(m => ({ ...person(m.account), presence: 'here', station: m.station ?? null })),
    choices: (['bear','her'] as const).map(id => ({ owner: person(id), style: run?.choices[id].cup_type ?? 'cream', ingredients: run?.choices[id].ingredients ?? [] })),
    selectedCup: local.selectedCup, editableCups: joined && phase !== 'complete' ? [account] : [], choicesOpen: local.choicesOpen,
    temperature: run?.temperature ?? null, progress: run?.progress ?? null, idealRange: [42,68], inputMode: game?.inputMode ?? 'stop',
    invitations: (cocoa?.offers ?? []).filter(o => o.kind !== 'pass').map(o => ({ id: o.id, kind: o.kind as 'swap' | 'cheers',
      from: person(o.from_account), to: person(o.to_account), allowedActions: o.from_account === account ? ['cancel'] : o.to_account === account ? ['accept','decline'] : [] })),
    recipeNameDraft: local.recipeName, allowedActions: allowed, pending: busy,
    issue: message ? { kind: 'info', message } : run?.phase === 'paused' && run.reason ? { kind: 'info', message: run.reason } : undefined,
    toastFeedback: cocoa?.cheers ? '杯子轻轻碰在一起，这一刻是真的一起完成的。' : undefined,
    result: cocoa?.recipe ? recipe(cocoa.recipe, true) : null,
    view: local.view, selectedRecipeId: local.selectedRecipe,
    collection: { status: local.collectionStatus, items: local.collection.map(r => recipe(r)), message: local.collectionError },
  }
}
