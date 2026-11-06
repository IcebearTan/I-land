import { useEffect, useState } from 'react'
import { eventBus, type Phase, type SeasideState } from '../game/EventBus'
import { SCENERY_RATES } from '../seaside/clock'
import { CharacterPortrait } from './CharacterPortrait'

const PHASE_COPY: Record<Phase, { label: string; title: string; note: string }> = {
  dawn: { label: '晨光初醒', title: '等一场日出', note: '第一束光，会慢慢来到我们身边。' },
  day: { label: '海风晴朗', title: '把时间留给海', note: '什么也不用做，就这样坐一会儿。' },
  dusk: { label: '日落温柔', title: '陪海慢慢变晚', note: '把今天，慢慢交给海风。' },
  night: { label: '月光作伴', title: '听海，也等你', note: '留一个位置，等风，也等你。' },
}

function ShoreIcon({ kind }: { kind: 'wave' | 'clock' | 'return' | 'seat' | 'lean' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'wave' && <><path d="M3 10c3-5 6 5 9 0s6 5 9 0M3 16c3-5 6 5 9 0s6 5 9 0" /></>}
    {kind === 'clock' && <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>}
    {kind === 'return' && <><path d="m9 6-6 6 6 6M3 12h17" /></>}
    {kind === 'seat' && <><path d="M5 12V6h14v6M3 12h18v4H3zM6 16v4M18 16v4" /></>}
    {kind === 'lean' && <><path d="M12 20S3 14 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z" /></>}
  </svg>
}

/** UI 只发送请求；确认的成员/姿势/共享时间来自事件总线。 */
export function SeasideControls({ transitioning }: { transitioning: boolean }) {
  const [state, setState] = useState<SeasideState | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [showTime, setShowTime] = useState(false)
  const [welcome, setWelcome] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setWelcome(false), 4000)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    const onState = (value: SeasideState) => setState(value)
    const onOpen = () => setPanelOpen(true), onClose = () => setPanelOpen(false)
    eventBus.on('SEASIDE_STATE', onState)
    eventBus.on('PANEL_OPENED', onOpen); eventBus.on('PANEL_CLOSED', onClose)
    eventBus.emit('SEASIDE_REQUEST_STATE', {})
    return () => {
      eventBus.off('SEASIDE_STATE', onState)
      eventBus.off('PANEL_OPENED', onOpen); eventBus.off('PANEL_CLOSED', onClose)
    }
  }, [])
  const copy = PHASE_COPY[state?.clock.phase ?? 'night']
  const connection = state?.connection.state ?? 'joining'
  const together = connection === 'connected' && (state?.members.length ?? 0) === 2
  const disabled = transitioning || connection !== 'connected' || !!state?.connection.pending
  const leaning = state?.pose === 'leaning'
  const seated = state?.pose === 'seated' || leaning
  const canLean = seated && !!state?.companion && state.companion.pose !== 'standing'
  const title = together ? (state?.clock.phase === 'night' ? '和你一起听海' : state?.clock.phase === 'dusk' ? '和你慢慢变晚' : state?.clock.phase === 'dawn' ? '和你等一场日出' : '今天，也有你') : copy.title
  const companyText = connection === 'connected'
    ? together ? (leaning ? '靠一会儿，把心事交给海风。' : state?.companion?.pose === 'standing' ? `${state.companion.display}正在海边吹风。` : '两个人，一片海，慢慢待着就好。') : '身旁的位置，留给你。'
    : connection === 'joining' ? '走向海边，稍等一下…'
    : connection === 'taken-over' ? '这个页面的座位已结束，海风还在等你。'
    : connection === 'expired' ? '登录已过期，重新上岛后再坐一会儿。'
    : connection === 'away' ? '暂时离开海边，回来时再一起坐下。'
    : connection === 'reconnecting' ? '海边暂时连不上，正在重新联系…'
    : state?.connection.message ?? '暂时没连上海边，可以再试一次。'
  const rate = state?.clock.rate ?? 1
  if (panelOpen) return null
  return <div className="seaside-ui" data-welcome={welcome} data-phase={state?.clock.phase} data-seaside-pose={state?.pose} data-scenery-rate={state?.clock.rate} data-scenery-time={state?.clock.time}
    data-room-state={connection} data-room-members={state?.members.map(member => `${member.account}:${member.seat}:${member.pose}`).join(',')} data-scenery-virtual-ms={state?.clock.virtualMs} data-time-open={showTime}>
    <header className="shore-caption">
      <span className="shore-eyebrow"><ShoreIcon kind="wave" /> 海边 · 一小片安静</span>
      <h1>{title}</h1>
      <p>{copy.note}</p>
      <div className={`shore-company${together ? ' is-together' : ''}`} role="status">
        {connection === 'connected' && <span className="shore-company-people">{state?.members.map(member => <span key={member.account} title={member.display}>
          <CharacterPortrait character={member.sprite} size={22} /><span>{member.display}</span>
        </span>)}</span>}
        <span className="shore-company-copy">{companyText}</span>
        {(connection === 'error' || connection === 'taken-over' || connection === 'reconnecting') && <button className="shore-retry" disabled={transitioning} onClick={() => eventBus.emit('SEASIDE_RECONNECT', {})}>{connection === 'taken-over' ? '在这里重新坐下' : '再试一次'}</button>}
        {connection === 'expired' && <button className="shore-retry" disabled={transitioning} onClick={() => eventBus.emit('SESSION_EXPIRED', {})}>重新上岛</button>}
      </div>
    </header>
    <div className="shore-bottom">
      <div className="shore-moment"><span aria-hidden="true">✧</span> {copy.label} <i /> <span className="shore-time-value">{state?.clock.time ?? '—:—'}</span></div>
      <section className="shore-controls" aria-label="看海动作与景色时间">
        <div className="shore-main-actions">
          <button className="shore-button shore-back" disabled={transitioning} onClick={() => eventBus.emit('TRAVEL_REQUEST', { from: 'seaside', to: 'island' })}>
            <ShoreIcon kind="return" /><span className="shore-label-wide">回到小岛</span><span className="shore-label-short">回岛</span>
          </button>
          <span className="shore-action-divider" />
          <button className="shore-button" disabled={disabled || state?.pose === 'arriving'} onClick={() => eventBus.emit('SEASIDE_ACTION', { action: seated ? 'stand' : 'sit' })}>
            <ShoreIcon kind="seat" /><span className="shore-label-wide">{state?.pose === 'arriving' ? '慢慢走过来…' : seated ? '起身吹风' : '坐下看海'}</span><span className="shore-label-short">{state?.pose === 'arriving' ? '入座中' : seated ? '起身' : '坐下'}</span>
          </button>
          <button className={`shore-button shore-lean${leaning ? ' is-open' : ''}`} disabled={disabled || !canLean} aria-pressed={leaning} title={!canLean ? '等两个人都坐下后，就能靠一会儿。' : undefined} onClick={() => eventBus.emit('SEASIDE_ACTION', { action: leaning ? 'unlean' : 'lean' })}>
            <ShoreIcon kind="lean" /><span>{leaning ? '坐好' : '靠一会儿'}</span>
          </button>
          <button className={`shore-button shore-clock-toggle${showTime ? ' is-open' : ''}`} disabled={disabled} aria-expanded={showTime} aria-controls="shore-clock-settings" onClick={() => setShowTime(value => !value)}>
            <ShoreIcon kind="clock" /><span className="shore-label-wide">{showTime ? '收起时间' : '景色时间'}</span><span className="shore-label-short">景色</span><span className="shore-rate">{rate === 0 ? '暂停' : `${rate}×`}</span>
          </button>
        </div>
        {connection === 'connected' && !canLean && <p className="shore-action-hint">两个人都坐下后，就能靠一会儿。</p>}
      </section>
      <p className="shore-small-note" role="status">{state?.notice || state?.connection.message || '海风一直在，想待多久都可以。'}</p>
    </div>
    {showTime && <section className="shore-clock-settings" id="shore-clock-settings" aria-label="景色时间设置">
          <div className="shore-clock-heading"><span>我们共用的海边时间</span><span>{state?.clock.followingReal ? '跟着此刻 · 上海时间' : '此刻的海边时间'}</span></div>
          <div className="shore-clock-options" role="group" aria-label="景色流速">
            {SCENERY_RATES.map(value => <button key={value} disabled={disabled} aria-pressed={rate === value} onClick={() => eventBus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: value })}>
              {value === 0 ? '暂停' : `${value}×`}<small>{value === 0 ? '留住此刻' : value === 1 ? '正常流动' : value === 30 ? '快一些' : '快很多'}</small>
            </button>)}
          </div>
          <button className="shore-reset" disabled={disabled || state?.clock.followingReal} onClick={() => eventBus.emit('SEASIDE_CLOCK_REQUEST', { action: 'reset' })}>回到现实时间 <span aria-hidden="true">↗</span></button>
        </section>}
  </div>
}
