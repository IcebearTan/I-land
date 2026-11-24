import type { CocoaAction, CocoaAccount, CocoaCupAction, CocoaInputMode, CocoaPanelState, CocoaPerson, CocoaRecipe } from '../../../../frontend/src/cocoa/ui/types'

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> }
/** 本地玩法演示：与 cocoa-protocol-v1.1 的温区/速率对照，但没有网络或持久化。 */
export type DemoState = Mutable<CocoaPanelState> & { madeBy: CocoaPerson[]; sequence: number; inputs: Record<CocoaAccount, CocoaInputMode>; quietSeconds: number }
const PEOPLE: Record<CocoaAccount, CocoaPerson> = { bear: { account: 'bear', display: '演示者 A' }, her: { account: 'her', display: '演示者 B' } }
const STOPPED = { bear: 'stop', her: 'stop' } as const
export function initialDemo(): DemoState {
  return { sessionId: null, phase: 'idle', connection: 'connected', self: PEOPLE.bear, participants: [], choices: [
    { owner: PEOPLE.bear, style: 'cream', ingredients: [] }, { owner: PEOPLE.her, style: 'cream', ingredients: [] },
  ], selectedCup: 'bear', editableCups: [], choicesOpen: false, temperature: 24, idealRange: [42, 68], progress: 0, inputMode: 'stop', invitations: [],
  recipeNameDraft: '壁炉边的第一杯', allowedActions: [], pending: false, result: null, view: 'activity',
  collection: { status: 'ready', items: [] }, selectedRecipeId: null, madeBy: [], sequence: 0, inputs: { ...STOPPED }, quietSeconds: 0 }
}
export function demoView(input: DemoState): DemoState {
  const state = structuredClone(input), self = state.participants.find(p => p.account === state.self.account && p.presence === 'here')
  const live = state.connection === 'connected', allowed: CocoaAction['type'][] = ['refresh']
  if (live) {
    if (state.phase === 'idle' || state.phase === 'complete') allowed.push('start')
    if (!['idle','complete'].includes(state.phase) && !self) allowed.push('join')
    if (self && ['preparing', 'brewing', 'paused', 'pouring'].includes(state.phase)) allowed.push('choose-station', 'leave', 'set-cup', 'set-ingredients')
    if (self && state.phase === 'preparing') allowed.push('begin')
    if (self && state.phase === 'brewing') { allowed.push('pause'); if (self.station) allowed.push('set-input') }
    if (self && state.phase === 'paused') allowed.push('resume')
    if (self && state.phase === 'pouring') allowed.push('portion')
    const bothStations = state.participants.filter(p => p.presence === 'here' && p.station).length === 2
    if (bothStations && !state.invitations.some(i => i.kind === 'swap')) allowed.push('swap-stations')
    if (state.result?.cups.every(c => c.heldBy) && bothStations && !state.invitations.some(i => i.kind === 'cheers')) allowed.push('toast')
  }
  state.allowedActions = allowed
  state.editableCups = self ? [state.self.account] : []
  state.inputMode = state.inputs[state.self.account]
  for (const invitation of state.invitations) invitation.allowedActions = invitation.to.account === state.self.account ? ['accept', 'decline'] : invitation.from.account === state.self.account ? ['cancel'] : []
  if (state.result) for (const cup of state.result.cups) {
    cup.allowedActions = []
    if (!live || cup.heldBy) continue
    if (cup.offer) {
      if (cup.offer.to.account === state.self.account) cup.allowedActions.push('accept-offer', 'decline-offer')
      if (cup.offer.from.account === state.self.account) cup.allowedActions.push('cancel-offer')
    } else if (cup.owner.account === state.self.account) cup.allowedActions.push('claim')
    else if (!cup.claimed && state.participants.some(p => p.account === cup.owner.account && p.presence === 'here')) cup.allowedActions.push('offer')
  }
  const result = state.result
  state.collection.items = state.collection.items.map(recipe => result && recipe.id === result.id ? structuredClone(result) : { ...recipe, cups: recipe.cups.map(cup => ({ ...cup, allowedActions: [] })) })
  return state
}
function contribute(state: DemoState, account: CocoaAccount) { if (!state.madeBy.some(p => p.account === account)) state.madeBy.push({ ...PEOPLE[account] }) }
export function applyDemoAction(input: DemoState, action: CocoaAction): DemoState {
  const state = demoView(input), self = state.participants.find(p => p.account === state.self.account)
  if (action.type === 'close') { state.inputs[state.self.account] = 'stop'; return demoView(state) }
  if (action.type === 'release-input') { if (action.sessionId === state.sessionId) state.inputs[action.account] = 'stop'; return demoView(state) }
  if (action.type === 'show-collection' || action.type === 'show-activity') return { ...state, view: action.type === 'show-collection' ? 'collection' : 'activity', selectedRecipeId: null }
  if (action.type === 'select-recipe') return { ...state, selectedRecipeId: action.recipeId || null }
  if (action.type === 'select-cup') return { ...state, selectedCup: action.owner }
  if (action.type === 'set-choices-open') return { ...state, choicesOpen: action.open }
  if (action.type === 'change-recipe-name') return { ...state, recipeNameDraft: action.value.slice(0, 40) }
  if (action.type === 'refresh') return { ...state, connection: 'connected', issue: undefined }
  if (action.type === 'respond-invitation' || action.type === 'cancel-invitation') {
    const invitation = state.invitations.find(i => i.id === action.offerId)
    const allowed = action.type === 'cancel-invitation' ? 'cancel' : action.accept ? 'accept' : 'decline'
    if (!invitation || !invitation.allowedActions.includes(allowed) || state.connection !== 'connected') return state
    if (action.type === 'respond-invitation' && action.accept) {
      if (invitation.kind === 'swap') { for (const p of state.participants) if (p.station) p.station = p.station === 'heat' ? 'stir' : 'heat'; state.inputs = { ...STOPPED } }
      else state.toastFeedback = `${invitation.from.display}和${invitation.to.display}轻轻碰了杯。（本地演示）`
    }
    state.invitations = state.invitations.filter(i => i.id !== invitation.id)
    return demoView(state)
  }
  if (['claim', 'offer', 'accept-offer', 'decline-offer', 'cancel-offer'].includes(action.type) && 'cupId' in action) {
    const cup = state.result?.cups.find(c => c.id === action.cupId)
    if (!cup || !cup.allowedActions.includes(action.type as CocoaCupAction)) return state
    if (action.type === 'claim') { cup.claimed = true; cup.heldBy = { ...state.self } }
    else if (action.type === 'offer') cup.offer = { id: `demo-offer-${++state.sequence}`, from: { ...state.self }, to: { ...cup.owner } }
    else if (cup.offer?.id === action.offerId) { if (action.type === 'accept-offer') { cup.claimed = true; cup.heldBy = { ...state.self } }; cup.offer = null }
    return demoView(state)
  }
  if (!state.allowedActions.includes(action.type)) return state
  state.issue = undefined
  switch (action.type) {
    case 'start': state.sessionId = `local-demo-${++state.sequence}`; state.phase = 'preparing'; state.participants = [{ ...state.self, presence: 'here', station: null }]; state.temperature = 24; state.progress = 0; state.inputs = { ...STOPPED }; state.madeBy = []; state.result = null; state.invitations = []; state.toastFeedback = undefined; break
    case 'join': if (self) self.presence = 'here'; else state.participants.push({ ...state.self, presence: 'here', station: null }); break
    case 'set-cup': if (state.editableCups.includes(action.owner)) { const cup = state.choices.find(c => c.owner.account === action.owner); if (cup) cup.style = action.style } break
    case 'set-ingredients': if (state.editableCups.includes(action.owner)) { const cup = state.choices.find(c => c.owner.account === action.owner); if (cup) cup.ingredients = [...new Set(action.ingredients.filter(id => ['marshmallow', 'cocoa', 'cinnamon'].includes(id)))] } break
    case 'choose-station':
      if (state.participants.some(p => p.account !== state.self.account && p.presence === 'here' && p.station === action.station)) state.issue = { kind: 'conflict', message: '这个工位有人了，可以邀请交换工位。' }
      else if (self) { state.inputs[state.self.account] = 'stop'; self.station = action.station }
      break
    case 'begin': state.phase = 'brewing'; state.quietSeconds = 0; break
    case 'set-input': if (action.mode === 'stop' || (self?.station === 'stir' ? action.mode === 'stir' : action.mode === 'heat' || action.mode === 'gentle')) state.inputs[state.self.account] = action.mode; break
    case 'swap-stations': case 'toast': {
      const other = state.participants.find(p => p.account !== state.self.account && p.presence === 'here' && p.station)
      if (other) state.invitations.push({ id: `demo-invite-${++state.sequence}`, from: { ...state.self }, to: PEOPLE[other.account], kind: action.type === 'toast' ? 'cheers' : 'swap', allowedActions: [] })
      break
    }
    case 'pause': state.phase = 'paused'; state.inputs = { ...STOPPED }; break
    case 'resume': state.phase = 'brewing'; state.quietSeconds = 0; break
    case 'leave':
      if (self) { self.presence = 'away'; self.station = null }
      state.inputs = { ...STOPPED }; state.invitations = []
      if (state.result) for (const cup of state.result.cups) { cup.offer = null; if (cup.heldBy?.account === state.self.account) cup.heldBy = null }
      if (state.phase === 'brewing') state.phase = 'paused'
      break
    case 'portion': {
      if (!action.name.trim()) break
      const recipe: Mutable<CocoaRecipe> = { id: `demo-recipe-${++state.sequence}`, name: action.name.trim(), createdAtLabel: '本地规则原型 · 不是真实保存记录', makers: [...state.madeBy],
        cups: state.choices.map((cup, i) => ({ ...cup, id: `demo-cup-${state.sequence}-${i}`, claimed: false, heldBy: null, offer: null, allowedActions: [] })) }
      state.result = recipe; state.collection.items = [recipe, ...state.collection.items]; state.phase = 'complete'; break
    }
  }
  return demoView(state)
}
export function stepDemo(input: DemoState, seconds: number): DemoState {
  const state = structuredClone(input)
  if (state.phase !== 'brewing' || state.connection !== 'connected') return state
  if (seconds > 2) { state.phase = 'paused'; state.inputs = { ...STOPPED }; return demoView(state) }
  const dt = Math.max(0, Math.min(.5, seconds))
  const heater = state.participants.find(p => p.presence === 'here' && p.station === 'heat')
  const stirrer = state.participants.find(p => p.presence === 'here' && p.station === 'stir')
  const heatMode = heater ? state.inputs[heater.account] : 'stop', stirring = !!stirrer && state.inputs[stirrer.account] === 'stir'
  const before = state.temperature ?? 24
  const temp = Math.max(20, Math.min(85, before + ((heatMode === 'heat' ? 4 : heatMode === 'gentle' ? 1.8 : -.3) - (stirring ? 1.3 : 0)) * dt))
  state.temperature = temp
  if (heater && heatMode !== 'stop' && temp !== before) contribute(state, heater.account)
  if (stirrer && stirring && temp !== before) contribute(state, stirrer.account)
  if (stirring && temp >= state.idealRange[0] && temp <= state.idealRange[1]) state.progress = Math.min(100, (state.progress ?? 0) + 8 * dt)
  state.quietSeconds = heatMode === 'stop' && !stirring ? state.quietSeconds + dt : 0
  if (state.progress === 100) { state.phase = 'pouring'; state.inputs = { ...STOPPED } }
  else if (state.quietSeconds >= 15) { state.phase = 'paused'; state.inputs = { ...STOPPED } }
  return demoView(state)
}
export function demoScenario(name: string): DemoState {
  let state = initialDemo()
  if (name === 'idle') return demoView(state)
  state = applyDemoAction(state, { type: 'start' }); state = applyDemoAction(state, { type: 'choose-station', station: 'heat' })
  state.participants.push({ ...PEOPLE.her, presence: 'here', station: 'stir' })
  state.choices[0].ingredients = ['marshmallow']; state.choices[1].style = 'teal'; state.choices[1].ingredients = ['cinnamon']
  if (name === 'preparing') return demoView(state)
  state.phase = name === 'paused' ? 'paused' : 'brewing'; state.temperature = 62; state.progress = 46; state.inputs = { bear: 'heat', her: 'stir' }; state.madeBy = [PEOPLE.bear, PEOPLE.her]
  if (name === 'offline') { state.connection = 'offline'; state.inputs = { ...STOPPED } }
  if (['pouring', 'complete', 'offer', 'collection', 'cheers'].includes(name)) { state.phase = 'pouring'; state.progress = 100; state.inputs = { ...STOPPED } }
  if (['complete', 'offer', 'collection', 'cheers'].includes(name)) state = applyDemoAction(state, { type: 'portion', name: '一锅慢慢来的温暖' })
  if (name === 'offer' && state.result) { state.result.cups[1].offer = { id: 'demo-offer-preview', from: PEOPLE.bear, to: PEOPLE.her }; state.self = PEOPLE.her }
  if (name === 'cheers' && state.result) for (const cup of state.result.cups) { cup.claimed = true; cup.heldBy = { ...cup.owner } }
  if (name === 'swap' || name === 'cheers') { state.invitations = [{ id: 'demo-invitation-preview', from: PEOPLE.bear, to: PEOPLE.her, kind: name, allowedActions: [] }]; state.self = PEOPLE.her }
  if (name === 'collection') state.view = 'collection'
  return demoView(state)
}
export function chooseDemoPerson(input: DemoState, account: CocoaAccount): DemoState { return demoView({ ...input, self: PEOPLE[account], selectedCup: account }) }
