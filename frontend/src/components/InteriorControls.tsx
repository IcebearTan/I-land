import { useEffect, useState } from 'react'
import { eventBus, type InteriorState } from '../game/EventBus'
import { IslandControls } from './IslandControls'
import './interior.css'

const CHANNELS = ['海风小岛', '海上月亮', '猫咪午后'] as const

function RoomIcon({ kind }: { kind: 'return' | 'stand' | 'tv' | 'next' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'return' && <path d="m9 6-6 6 6 6M3 12h17" />}
    {kind === 'stand' && <><path d="M5 13V7h14v6M3 13h18v4H3zM6 17v3M18 17v3M12 3v7m-3-4 3-3 3 3" /></>}
    {kind === 'tv' && <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="m8 2 4 4 4-4M8 22h8M17 10v5" /><rect x="6" y="9" width="8" height="7" rx="1" /></>}
    {kind === 'next' && <><path d="m4 6 8 6-8 6V6Zm9 0 8 6-8 6V6Z" /></>}
  </svg>
}

/** 只显示独立小屋房间确认的成员与电视；走动仍留在 Phaser。 */
export function InteriorControls({ transitioning }: { transitioning: boolean }) {
  const [state, setState] = useState<InteriorState | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [welcome, setWelcome] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const onState = (value: InteriorState) => setState(value)
    const onOpen = () => setPanelOpen(true)
    const onClose = () => {
      setPanelOpen(false)
      eventBus.emit('INTERIOR_REQUEST_STATE', {})
    }
    eventBus.on('INTERIOR_STATE', onState)
    eventBus.on('PANEL_OPENED', onOpen)
    eventBus.on('PANEL_CLOSED', onClose)
    eventBus.emit('INTERIOR_REQUEST_STATE', {})
    const timer = window.setTimeout(() => setWelcome(false), 3600)
    return () => {
      window.clearTimeout(timer)
      eventBus.off('INTERIOR_STATE', onState)
      eventBus.off('PANEL_OPENED', onOpen)
      eventBus.off('PANEL_CLOSED', onClose)
      eventBus.emit('MOVE_INPUT', { x: 0, y: 0 })
    }
  }, [])

  const sceneNotice = state?.notice
  useEffect(() => {
    setNotice(sceneNotice || null)
    if (!sceneNotice) return
    const timer = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(timer)
  }, [sceneNotice])

  if (panelOpen) return null
  const seated = state?.pose === 'seated'
  const connected = state?.connection.state === 'connected'
  const busy = transitioning || !connected || state?.connection.pending
  const retry = state && ['taken-over', 'error'].includes(state.connection.state)
  const televisionNearby = state?.pose === 'walking' && state.nearTelevision && !transitioning
  const sofaNearby = state?.pose === 'walking' && state.nearSofa && !televisionNearby && !transitioning
  const showActions = seated || televisionNearby || sofaNearby
  const companion = state?.companion
  const presence = companion?.station ? `${companion.display}在料理台${companion.station === 'heat' ? '控温' : '轻搅'}。` : companion ? (companion.pose === 'seated' ? `${companion.display}在沙发上。` : `${companion.display}也在屋里，暂时没坐下。`) : null
  const message = notice || state?.connection.message || (state?.pose === 'approaching' ? '慢慢坐好，或起身走走…' : presence || (state?.television ? CHANNELS[state.channel] : null))

  return <div className="interior-ui" data-interior-pose={state?.pose} data-interior-seat={state?.seat ?? 'none'}
    data-interior-tv={state?.television} data-interior-channel={state?.channel} data-interior-near-tv={state?.nearTelevision}
    data-room-state={state?.connection.state} data-home-members={state?.members.length ?? 0} data-companion-pose={companion?.pose ?? 'none'} data-phase={state?.phase} data-transitioning={transitioning}>
    <button className="room-back room-button" disabled={transitioning} onClick={() => eventBus.emit('TRAVEL_REQUEST', { from: 'interior', to: 'island' })}>
      <RoomIcon kind="return" /><span className="room-label-wide">回到小岛</span><span className="room-label-short">回岛</span>
    </button>
    {welcome && !televisionNearby && !sofaNearby && <p className="room-welcome" role="status">进屋，火还暖着。</p>}
    {state?.pose === 'walking' && !transitioning && <IslandControls />}
    {(showActions || message || retry) && <div className={`room-bottom${seated ? ' is-seated' : ''}${televisionNearby ? ' is-near-tv' : ''}${sofaNearby ? ' is-near-sofa' : ''}`}>
      {message && <p className="room-status" role="status">{message}</p>}
      {retry && <button className="room-button room-reconnect" onClick={() => eventBus.emit('INTERIOR_ACTION', { action: 'reconnect' })}>重新加入客厅</button>}
      {state && sofaNearby && <section className="room-actions room-actions-tv" aria-label="选择沙发座位">{([0, 1] as const).map(seat => {
        const occupied = state.members.some(member => member.account === companion?.account && member.seat === seat)
        return <button key={seat} className="room-button" disabled={busy || occupied} onClick={() => eventBus.emit('INTERIOR_ACTION', { action: seat === 0 ? 'sit-left' : 'sit-right' })}>
          <RoomIcon kind="stand" /><span>{occupied ? (seat === 0 ? '左边有人' : '右边有人') : (seat === 0 ? '坐左边' : '坐右边')}</span>
        </button>
      })}</section>}
      {state && (seated || televisionNearby) && <section className={`room-actions${televisionNearby ? ' room-actions-tv' : ''}`} aria-label={seated ? '沙发与电视' : '电视'}>
        {seated && <button className="room-button" disabled={busy} onClick={() => eventBus.emit('INTERIOR_ACTION', { action: 'stand' })}>
          <RoomIcon kind="stand" /><span>起身</span>
        </button>}
        <button className={`room-button${state.television ? ' is-on' : ''}`} disabled={busy} aria-pressed={state.television}
          aria-label={state.television ? '关闭电视' : '打开电视'} onClick={() => eventBus.emit('INTERIOR_ACTION', { action: 'tv-toggle' })}>
          <RoomIcon kind="tv" /><span>{state.television ? '关电视' : '开电视'}</span>
        </button>
        <button className="room-button" disabled={busy || !state.television}
          aria-label={`换到下一个频道，当前${CHANNELS[state.channel]}`} onClick={() => eventBus.emit('INTERIOR_ACTION', { action: 'tv-next' })}>
          <RoomIcon kind="next" /><span>换台</span>
        </button>
      </section>}
    </div>}
  </div>
}
