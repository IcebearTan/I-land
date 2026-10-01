import { useEffect, useState } from 'react'
import { eventBus, type Phase, type SeasideState } from '../game/EventBus'
import { SCENERY_RATES } from '../seaside/clock'

const PHASE_COPY: Record<Phase, { label: string; title: string; note: string }> = {
  dawn: { label: '晨光初醒', title: '等一场日出', note: '第一束光，会慢慢来到我们身边。' },
  day: { label: '海风晴朗', title: '把时间留给海', note: '什么也不用做，就这样坐一会儿。' },
  dusk: { label: '日落温柔', title: '陪海慢慢变晚', note: '把今天，慢慢交给海风。' },
  night: { label: '月光作伴', title: '听海，也等你', note: '留一个位置，等风，也等你。' },
}

function ShoreIcon({ kind }: { kind: 'wave' | 'clock' | 'return' | 'seat' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'wave' && <><path d="M3 10c3-5 6 5 9 0s6 5 9 0M3 16c3-5 6 5 9 0s6 5 9 0" /></>}
    {kind === 'clock' && <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>}
    {kind === 'return' && <><path d="m9 6-6 6 6 6M3 12h17" /></>}
    {kind === 'seat' && <><path d="M5 12V6h14v6M3 12h18v4H3zM6 16v4M18 16v4" /></>}
  </svg>
}

/** 只发送纯动作与景色时间请求，不读取 Phaser，也不保存页面内临时时钟。 */
export function SeasideControls({ transitioning }: { transitioning: boolean }) {
  const [state, setState] = useState<SeasideState | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [showTime, setShowTime] = useState(false)
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
  const disabled = transitioning || !state
  const rate = state?.clock.rate ?? 1
  if (panelOpen) return null
  return <div className="seaside-ui" data-phase={state?.clock.phase} data-seaside-pose={state?.pose} data-scenery-rate={state?.clock.rate} data-scenery-time={state?.clock.time}>
    <header className="shore-caption">
      <span className="shore-eyebrow"><ShoreIcon kind="wave" /> 海边 · 一小片安静</span>
      <h1>{copy.title}</h1>
      <p>{copy.note}</p>
    </header>
    <div className="shore-bottom">
      <div className="shore-moment"><span aria-hidden="true">✧</span> {copy.label} <i /> <span className="shore-time-value">{state?.clock.time ?? '—:—'}</span></div>
      <section className="shore-controls" aria-label="看海动作与景色时间">
        <div className="shore-main-actions">
          <button className="shore-button shore-back" disabled={disabled} onClick={() => eventBus.emit('TRAVEL_REQUEST', { from: 'seaside', to: 'island' })}>
            <ShoreIcon kind="return" /><span>回到小岛</span>
          </button>
          <span className="shore-action-divider" />
          <button className="shore-button" disabled={disabled || state?.pose === 'arriving'} onClick={() => eventBus.emit('SEASIDE_ACTION', { action: state?.pose === 'seated' ? 'stand' : 'sit' })}>
            <ShoreIcon kind="seat" /><span>{state?.pose === 'arriving' ? '慢慢走过来…' : state?.pose === 'seated' ? '起身吹风' : '坐下看海'}</span>
          </button>
          <button className={`shore-button shore-clock-toggle${showTime ? ' is-open' : ''}`} disabled={disabled} aria-expanded={showTime} aria-controls="shore-clock-settings" onClick={() => setShowTime(value => !value)}>
            <ShoreIcon kind="clock" /><span>{showTime ? '收起时间' : '景色时间'}</span><span className="shore-rate">{rate === 0 ? '暂停' : `${rate}×`}</span>
          </button>
        </div>
      </section>
      <p className="shore-small-note">海风一直在，想待多久都可以。</p>
    </div>
    {showTime && <section className="shore-clock-settings" id="shore-clock-settings" aria-label="景色时间设置">
          <div className="shore-clock-heading"><span>让景色慢慢流动</span><span>{state?.clock.followingReal ? '跟着此刻 · 上海时间' : '此刻的海边时间'}</span></div>
          <div className="shore-clock-options" role="group" aria-label="景色流速">
            {SCENERY_RATES.map(value => <button key={value} disabled={disabled} aria-pressed={rate === value} onClick={() => eventBus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: value })}>
              {value === 0 ? '暂停' : `${value}×`}<small>{value === 0 ? '留住此刻' : value === 1 ? '正常流动' : value === 30 ? '快一些' : '快很多'}</small>
            </button>)}
          </div>
          <button className="shore-reset" disabled={disabled || state?.clock.followingReal} onClick={() => eventBus.emit('SEASIDE_CLOCK_REQUEST', { action: 'reset' })}>回到现实时间 <span aria-hidden="true">↗</span></button>
        </section>}
  </div>
}
