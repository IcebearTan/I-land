import { useEffect, useId, useRef } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { CocoaCupIcon } from './CocoaCupIcon'
import type { CocoaAction, CocoaCupChoice, CocoaCupResult, CocoaIngredient, CocoaPanelProps, CocoaPanelState, CocoaRecipe, CocoaStation } from './types'
import './cocoa.css'

const INGREDIENTS: readonly { id: CocoaIngredient; label: string; note: string }[] = [
  { id: 'marshmallow', label: '棉花糖', note: '软软的一朵' },
  { id: 'cocoa', label: '可可粉', note: '更浓一点' },
  { id: 'cinnamon', label: '肉桂', note: '暖暖的香气' },
]
const PHASES = { idle: '一起做热可可', preparing: '挑一只喜欢的杯子', brewing: '慢慢煮，轻轻搅', paused: '让这一锅等一等', pouring: '把温暖分成两杯', complete: '热可可做好了' }
const STATIONS: readonly { id: CocoaStation; label: string; note: string }[] = [
  { id: 'heat', label: '控温', note: '把温度留在适宜区' },
  { id: 'stir', label: '搅拌', note: '轻搅让可可融合，也会降温' },
]
const CONNECTIONS = {
  connecting: '正在和料理台联系…', connected: '', reconnecting: '连接中断了，正在重新联系。已确认的进度会留着。',
  offline: '暂时连不上料理台。恢复连接后，再接着做。', 'taken-over': '这次操作已在另一页接续，可以在这里重新加入。', expired: '登录已过期，重新上岛后再接着做。',
}
const ingredientsText = (cup: CocoaCupChoice) => cup.ingredients.length ? cup.ingredients.map(id => INGREDIENTS.find(item => item.id === id)?.label ?? id).join('、') : '原味热可可'
const displayNumber = (value: number | null) => value !== null && Number.isFinite(value) ? Math.round(value) : null

function Meter({ temperature, idealRange, progress }: Pick<CocoaPanelState, 'temperature' | 'idealRange' | 'progress'>) {
  const temp = displayNumber(temperature), amount = displayNumber(progress)
  const min = Math.min(...idealRange), max = Math.max(...idealRange)
  const inRange = temp !== null && temp >= min && temp <= max
  const hint = temp === null ? '等料理台确认温度…' : temp < min ? '再暖一点，就能慢慢融合。' : temp > max ? '先关小火或关火，搅一搅降温。进度不会倒退。' : '温度刚刚好，轻搅就会继续融合。'
  return <section className="cocoa-pot" aria-label="锅里的温度与制作进度">
    <div className="cocoa-temperature-heading"><span>锅里的温度</span><strong>{temp === null ? '—' : temp}<small> °C</small></strong></div>
    <div className="cocoa-temperature-track" role="meter" aria-label="锅中温度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={temp === null ? undefined : Math.max(0, Math.min(100, temp))} aria-valuetext={temp === null ? '等待温度' : `${temp} 摄氏度，适宜 ${min} 到 ${max} 度`}>
      <span className="cocoa-ideal-band" style={{ left: `${Math.max(0, min)}%`, width: `${Math.max(0, Math.min(100, max) - Math.max(0, min))}%` }} />
      {temp !== null && <span className="cocoa-temperature-mark" style={{ left: `${Math.max(0, Math.min(100, temp))}%` }} />}
    </div>
    <p className="cocoa-meter-key">适宜温区 {min}–{max}°C <span className={inRange ? 'is-warm' : ''}>{inRange ? '温度适宜' : '可以慢慢调整'}</span></p>
    <label className="cocoa-progress-label">融合进度 <span>{amount === null ? '等待确认' : `${Math.max(0, Math.min(100, amount))}%`}</span></label>
    {amount === null ? <div className="cocoa-progress-empty" role="progressbar" aria-label="正在读取制作进度" aria-valuemin={0} aria-valuemax={100} aria-valuetext="等待确认" /> : <progress max={100} value={Math.max(0, Math.min(100, amount))} aria-label="融合进度" />}
    <p className="cocoa-pot-hint">{hint}</p>
  </section>
}

function CupResult({ cup, enabled, onAction }: { cup: CocoaCupResult; enabled: boolean; onAction: CocoaPanelProps['onAction'] }) {
  const actions = cup.allowedActions
  const labels = { claim: cup.claimed ? '拿起这杯' : '领取这杯', offer: '递给对方', 'accept-offer': '接过来', 'decline-offer': '先放桌上', 'cancel-offer': '先放回桌上' }
  return <article className="cocoa-result-cup">
    <CocoaCupIcon style={cup.style} size={48} />
    <div className="cocoa-cup-copy"><h4>{cup.owner.display}的这杯</h4><p>{cup.style === 'cream' ? '奶油杯' : '青绿杯'} · {ingredientsText(cup)}</p>
      <p className="cocoa-cup-location">{cup.heldBy ? `${cup.heldBy.display}拿着这杯。` : cup.offer ? `${cup.offer.from.display}正在递杯，等${cup.offer.to.display}回应。` : cup.claimed ? `${cup.owner.display}已领取，作品留在这里。` : '留在桌上，随时可以来拿。'}</p>
    </div>
    {actions.length > 0 && <div className="cocoa-cup-actions">{actions.map(action => <button type="button" key={action} className={`cocoa-button${action === 'claim' || action === 'accept-offer' ? ' is-primary' : ''}`} disabled={!enabled}
      onClick={() => onAction({ type: action, cupId: cup.id, ...(cup.offer ? { offerId: cup.offer.id } : {}) })}>{labels[action]}</button>)}</div>}
  </article>
}

function Recipe({ recipe, enabled, onAction }: { recipe: CocoaRecipe; enabled: boolean; onAction: CocoaPanelProps['onAction'] }) {
  return <section className="cocoa-recipe" aria-label="这次制作的作品">
    <div className="cocoa-recipe-title"><span className="cocoa-eyebrow">这一锅的名字</span><h3>{recipe.name}</h3><p>{recipe.createdAtLabel}</p></div>
    <p className="cocoa-makers">{recipe.makers.length ? `${recipe.makers.map(person => person.display).join('、')}${recipe.makers.length > 1 ? '一起' : ''}做的` : '制作人信息待确认'}</p>
    <div className="cocoa-result-cups">{recipe.cups.map(cup => <CupResult key={cup.id} cup={cup} enabled={enabled} onAction={onAction} />)}</div>
  </section>
}

/** 完全受控。数值、成员、成功/保存/领取反馈只来自 props，不发 HTTP、不读 canvas。 */
export function CocoaPanel({ open, state, onAction, mode = 'live' }: CocoaPanelProps) {
  const titleId = useId(), nameId = useId(), actionRef = useRef(onAction)
  actionRef.current = onAction
  const closePanel = () => {
    actionRef.current({ type: 'release-input', sessionId: state.sessionId, account: state.self.account, reason: 'close' })
    actionRef.current({ type: 'close' })
  }
  const dialog = useDialogFocus(open, closePanel)
  useEffect(() => {
    if (!open) return
    const sessionId = state.sessionId, account = state.self.account
    const blur = () => actionRef.current({ type: 'release-input', sessionId, account, reason: 'blur' })
    const visibility = () => { if (document.hidden) actionRef.current({ type: 'release-input', sessionId, account, reason: 'hidden' }) }
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', visibility)
      actionRef.current({ type: 'release-input', sessionId, account, reason: 'unmount' })
    }
  }, [open, state.sessionId, state.self.account, state.view])
  if (!open) return null
  const enabled = state.connection === 'connected' && !state.pending
  const can = (type: CocoaAction['type']) => enabled && state.allowedActions.includes(type)
  const own = state.participants.find(person => person.account === state.self.account)
  const joined = !!own && own.presence === 'here'
  const selectedCup = state.choices.find(cup => cup.owner.account === state.selectedCup)
  const editable = !!selectedCup && joined && enabled && state.editableCups.includes(selectedCup.owner.account) && ['preparing', 'brewing', 'paused', 'pouring'].includes(state.phase)
  const savedRecipe = state.selectedRecipeId ? state.collection.items.find(item => item.id === state.selectedRecipeId) : null
  const canInput = state.connection === 'connected' && joined && state.phase === 'brewing' && state.allowedActions.includes('set-input')
  const title = state.view === 'collection' ? '做过的暖饮' : PHASES[state.phase]
  const button = (action: CocoaAction, label: string, primary = false, disabled = false) => <button type="button" className={`cocoa-button${primary ? ' is-primary' : ''}`} disabled={disabled || !can(action.type)} onClick={() => onAction(action)}>{label}</button>

  const compact = state.view === 'activity' && !state.choicesOpen && ['brewing', 'paused', 'pouring', 'complete'].includes(state.phase)
  return <div className={`cocoa-mask${compact ? ' is-compact' : ''}`} onClick={closePanel}>
    <div className="cocoa-panel" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} data-cocoa-phase={state.phase} data-cocoa-mode={mode} onClick={event => event.stopPropagation()}>
      <header className="cocoa-header"><div><p className="cocoa-eyebrow">料理台 · 一锅两杯</p><h2 id={titleId}>{title}</h2></div>
        <button type="button" className="cocoa-button cocoa-close" aria-label="合上热可可面板" onClick={closePanel}>合上</button>
      </header>
      {mode === 'prototype' && <p className="cocoa-prototype" role="note">规则原型 · 仅本机演示，成员与进度均为模拟，不会保存真实作品。</p>}
      <nav className="cocoa-tabs" aria-label="热可可页面">
        <button type="button" className="cocoa-button" aria-current={state.view === 'activity' ? 'page' : undefined} onClick={() => onAction({ type: 'show-activity' })}>这一锅</button>
        <button type="button" className="cocoa-button" aria-current={state.view === 'collection' ? 'page' : undefined} onClick={() => onAction({ type: 'show-collection' })}>做过的暖饮</button>
      </nav>
      {state.connection !== 'connected' && <section className="cocoa-message" role="status"><p>{CONNECTIONS[state.connection]}</p>{state.allowedActions.includes('refresh') && <button type="button" className="cocoa-button" disabled={state.pending} onClick={() => onAction({ type: 'refresh' })}>{state.connection === 'expired' ? '重新上岛' : '重新联系'}</button>}</section>}
      {state.issue && <section className={`cocoa-message is-${state.issue.kind}`} role={state.issue.kind === 'info' ? 'status' : 'alert'}><p>{state.issue.kind === 'conflict' ? `刚刚有了新的变化。${state.issue.message}` : state.issue.message}</p>{button({ type: 'refresh' }, '看看最新状态')}</section>}
      {state.pending && <p className="cocoa-pending" role="status">等料理台确认一下…</p>}
      {state.invitations.map(invitation => <section className="cocoa-invitation" key={invitation.id} role="status">
        <p>{invitation.to.account === state.self.account ? `${invitation.from.display}想${invitation.kind === 'swap' ? '和你交换工位' : '和你轻轻碰杯'}。` : `已发出${invitation.kind === 'swap' ? '交换工位' : '碰杯'}邀请，等${invitation.to.display}回应。`}</p>
        <div>{invitation.allowedActions.map(action => <button type="button" className={`cocoa-button${action === 'accept' ? ' is-primary' : ''}`} key={action} disabled={!enabled} onClick={() => onAction(action === 'cancel' ? { type: 'cancel-invitation', offerId: invitation.id } : { type: 'respond-invitation', offerId: invitation.id, accept: action === 'accept' })}>{action === 'accept' ? '好呀' : action === 'decline' ? '先不了' : '取消邀请'}</button>)}</div>
      </section>)}

      {state.view === 'collection' ? <>
        {savedRecipe ? <><button className="cocoa-button cocoa-back" type="button" onClick={() => onAction({ type: 'select-recipe', recipeId: '' })}>← 所有暖饮</button><Recipe recipe={savedRecipe} enabled={enabled} onAction={onAction} /></> : <>
          {state.collection.status === 'loading' && <p role="status">正在翻看做过的暖饮…</p>}
          {state.collection.status === 'error' && <div className="cocoa-message is-error" role="alert"><p>{state.collection.message ?? '这次没能取到作品，稍后再试。'}</p>{button({ type: 'refresh' }, '再取一次')}</div>}
          {state.collection.status === 'ready' && !state.collection.items.length && <div className="cocoa-empty"><CocoaCupIcon style="cream" size={56} /><p>第一锅热可可，还在等你们。</p><span>真正做好的暖饮，会留在这里。</span></div>}
          <ul className="cocoa-collection">{state.collection.items.map(recipe => <li key={recipe.id}><button type="button" className="cocoa-recipe-link" onClick={() => onAction({ type: 'select-recipe', recipeId: recipe.id })}>
            <CocoaCupIcon style={recipe.cups[0]?.style ?? 'cream'} /><span><strong>{recipe.name}</strong><small>{recipe.createdAtLabel}</small><small>{recipe.makers.map(person => person.display).join('、') || '制作人信息待确认'}</small></span><span aria-hidden="true">↗</span>
          </button></li>)}</ul>
        </>}
      </> : state.phase === 'idle' ? <section className="cocoa-empty"><div className="cocoa-two-cups"><CocoaCupIcon style="cream" size={64} /><CocoaCupIcon style="teal" size={64} /></div><h3>给彼此留一杯温暖</h3><p>一人控温，一人轻搅。自己来也可以依次操作，材料已经备好了。</p>{button({ type: 'start' }, '发起制作', true)}</section> : <>
        {state.phase !== 'complete' && <div className="cocoa-people" aria-label="已确认加入制作的人">
          {state.participants.map(person => <span key={person.account}>{person.display}<small>{person.presence === 'away' ? '暂时离开' : person.station === 'heat' ? '控温' : person.station === 'stir' ? '搅拌' : '已加入'}</small></span>)}
          {!state.participants.length && <span>还没有人加入这次制作</span>}
        </div>}
        {!joined && <div className="cocoa-join"><p>{state.phase === 'complete' ? '给你留的杯子还在，来料理台拿起它吧。' : '这锅还在桌上，想一起做的话，就加入吧。'}</p>{button({ type: 'join' }, state.phase === 'complete' ? '到料理台' : '加入这次制作', true)}</div>}

        {(state.phase === 'preparing' || (state.phase !== 'complete' && state.choicesOpen)) && <>
          <section className="cocoa-choices" aria-label="杯子与配料">
            <div className="cocoa-cup-tabs">{state.choices.map(cup => <button key={cup.owner.account} type="button" className="cocoa-cup-choice" aria-pressed={state.selectedCup === cup.owner.account} onClick={() => onAction({ type: 'select-cup', owner: cup.owner.account })}>
              <CocoaCupIcon style={cup.style} /><span>{cup.owner.display}的这杯<small>{ingredientsText(cup)}</small></span>
            </button>)}</div>
            {selectedCup && <fieldset disabled={!editable} className="cocoa-choice-fields"><legend>{selectedCup.owner.display}的杯子和配料</legend>
              <div className="cocoa-option-row" role="group" aria-label="选择杯型">{(['cream', 'teal'] as const).map(style => <button type="button" className="cocoa-button" key={style} disabled={!can('set-cup')} aria-pressed={selectedCup.style === style} onClick={() => onAction({ type: 'set-cup', owner: selectedCup.owner.account, style })}><CocoaCupIcon style={style} size={28} />{style === 'cream' ? '奶油杯' : '青绿杯'}</button>)}</div>
              <p className="cocoa-subheading">加一点喜欢的味道 <span>可选，也可以原味</span></p>
              <div className="cocoa-ingredients">{INGREDIENTS.map(ingredient => {
                const picked = selectedCup.ingredients.includes(ingredient.id)
                return <button type="button" key={ingredient.id} disabled={!can('set-ingredients')} aria-pressed={picked} onClick={() => onAction({ type: 'set-ingredients', owner: selectedCup.owner.account, ingredients: picked ? selectedCup.ingredients.filter(id => id !== ingredient.id) : [...selectedCup.ingredients, ingredient.id] })}><span>{picked ? '✓ ' : '＋ '}{ingredient.label}</span><small>{ingredient.note}</small></button>
              })}</div>
            </fieldset>}
            {selectedCup && !state.editableCups.includes(selectedCup.owner.account) && <p className="cocoa-note">这杯由{selectedCup.owner.display}来选，你可以先看看。</p>}
          </section>
        </>}

        {(state.phase === 'preparing' || state.phase === 'brewing' || state.phase === 'paused') && <>
          {state.phase !== 'preparing' && <Meter temperature={state.temperature} idealRange={state.idealRange} progress={state.progress} />}
          {state.phase === 'paused' && <p className="cocoa-pause-note">先歇一会儿，进度会等你。准备好了再继续，不补算离开的时间。</p>}

          {joined && state.phase === 'brewing' && own?.station === 'heat' && <section className="cocoa-work" aria-label="调节温度"><p>选小火或中火加热，想停时点关火。把温度留在绿色区域。</p><div className="cocoa-heat-options">{(['stop', 'gentle', 'heat'] as const).map(input => <button type="button" className="cocoa-button" key={input} disabled={!canInput} aria-pressed={state.inputMode === input} onClick={() => onAction({ type: 'set-input', mode: state.inputMode === input ? 'stop' : input })}>{input === 'heat' ? '中火' : input === 'gentle' ? '小火' : '关火'}</button>)}</div></section>}
          {joined && state.phase === 'brewing' && own?.station === 'stir' && <section className="cocoa-work" aria-label="轻轻搅拌"><p>点一次开始轻搅，想歇歇时点停下，不用一直按着。</p><div className="cocoa-option-row"><button type="button" className="cocoa-button is-primary" disabled={!canInput} aria-pressed={state.inputMode === 'stir'} onClick={() => onAction({ type: 'set-input', mode: 'stir' })}>轻搅</button><button type="button" className="cocoa-button" disabled={!canInput} onClick={() => onAction({ type: 'set-input', mode: 'stop' })}>停下</button></div></section>}
          <section className="cocoa-stations" aria-label="两个制作工位">{STATIONS.map(station => {
            const person = state.participants.find(item => item.station === station.id && item.presence === 'here'), mine = person?.account === state.self.account
            return <article key={station.id} className={`cocoa-station${mine ? ' is-mine' : ''}`}><div><h3>{station.label}</h3><p>{person ? `${person.display}${mine ? '（你）' : ''}` : '工位空着'}</p><small>{station.note}</small></div>
              {!mine && !person && button({ type: 'choose-station', station: station.id }, `到${station.label}工位`, false, !!person || !joined)}
              {mine && <span className="cocoa-station-marker">你的工位</span>}
            </article>
          })}</section>
          <p className="cocoa-note">只有自己时，可以先加热到约 65°C，再换到搅拌工位。离开页面会停止操作。</p>
          <div className="cocoa-main-actions">
            {state.phase === 'preparing' && button({ type: 'begin' }, '开始煮这一锅', true, !joined)}
            {state.phase === 'brewing' && button({ type: 'pause' }, '暂停一下')}
            {state.phase === 'paused' && button({ type: 'resume' }, '继续这一锅', true)}
            {state.participants.filter(person => person.presence === 'here' && person.station).length === 2 && button({ type: 'swap-stations' }, '交换工位')}
          </div>
        </>}

        {state.phase === 'pouring' && <section className="cocoa-portion"><div className="cocoa-two-cups"><CocoaCupIcon style={state.choices[0]?.style ?? 'cream'} size={56} /><CocoaCupIcon style={state.choices[1]?.style ?? 'teal'} size={56} /></div><p>可可已经融合好了。给这一锅起个名字，再分成两杯。</p>
          <form onSubmit={event => { event.preventDefault(); if (can('portion') && state.recipeNameDraft.trim()) onAction({ type: 'portion', name: state.recipeNameDraft.trim() }) }}>
            <label htmlFor={nameId}>这锅的名字</label><input id={nameId} value={state.recipeNameDraft} maxLength={40} disabled={!enabled || !state.allowedActions.includes('portion')} placeholder="例如：壁炉边的第一杯" onChange={event => onAction({ type: 'change-recipe-name', value: event.target.value })} />
            <button type="submit" className="cocoa-button is-primary" disabled={!can('portion') || !state.recipeNameDraft.trim()}>分成两杯，记住这次配方</button>
          </form><p className="cocoa-note">以料理台确认的结果为准；只记录实际参与制作的人。</p>
        </section>}
        {state.phase === 'complete' && <>
          {state.result ? <Recipe recipe={state.result} enabled={enabled} onAction={onAction} /> : <p role="status">正在取回这次的两杯热可可…</p>}
          <div className="cocoa-toast">{button({ type: 'toast' }, '轻轻碰杯', true)}<p className="cocoa-note">两人都在工位拿到杯子后，可以邀请碰杯。</p>{state.toastFeedback && <p className="cocoa-toast-feedback" role="status">{state.toastFeedback}</p>}</div>
          {state.allowedActions.includes('start') && <div className="cocoa-main-actions">{button({ type: 'start' }, '再做一锅')}</div>}
        </>}
        {state.phase !== 'preparing' && state.phase !== 'complete' && <button type="button" className="cocoa-button cocoa-choice-toggle" aria-expanded={state.choicesOpen} onClick={() => onAction({ type: 'set-choices-open', open: !state.choicesOpen })}>{state.choicesOpen ? '收起杯子选择' : '查看 / 调整我的杯子'}</button>}
        {joined && state.phase !== 'complete' && state.allowedActions.includes('leave') && <footer className="cocoa-footer">{button({ type: 'leave' }, '先离开工位')}<span>这一锅的进度会留下。</span></footer>}
      </>}
    </div>
  </div>
}
