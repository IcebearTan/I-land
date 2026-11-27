import { useEffect, useState } from 'react'
import { eventBus, type InteriorState } from '../game/EventBus'
import { IslandControls } from './IslandControls'
import { PixelIcon } from './PixelIcon'
import './interior.css'

const CHANNELS = ['海风小岛', '海上月亮', '猫咪午后'] as const

/** Cozy cabin controls — 16-bit carved wooden buttons; movement stays in Phaser. */
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
    const timer = window.setTimeout(() => setWelcome(false), 3200)
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
  const presence = companion
    ? companion.pose === 'seated'
      ? `${companion.display}在沙发上`
      : `${companion.display}也在屋里`
    : null
  const message =
    notice ||
    state?.connection.message ||
    (state?.pose === 'approaching'
      ? '慢慢坐好…'
      : presence || (state?.television ? `频道 · ${CHANNELS[state.channel]}` : null))

  return (
    <div
      className="interior-ui px-font"
      data-interior-pose={state?.pose}
      data-interior-seat={state?.seat ?? 'none'}
      data-interior-tv={state?.television}
      data-interior-channel={state?.channel}
      data-interior-near-tv={state?.nearTelevision}
      data-room-state={state?.connection.state}
      data-home-members={state?.members.length ?? 0}
      data-companion-pose={companion?.pose ?? 'none'}
      data-phase={state?.phase}
      data-transitioning={transitioning}
    >
      <button
        type="button"
        className="room-back px-btn"
        disabled={transitioning}
        onClick={() => eventBus.emit('TRAVEL_REQUEST', { from: 'interior', to: 'island' })}
      >
        <PixelIcon name="back" size={18} />
        <span className="room-label-wide">回到小岛</span>
        <span className="room-label-short">回岛</span>
      </button>

      {welcome && !televisionNearby && !sofaNearby && (
        <p className="room-welcome px-panel-dark px-pop" role="status">
          进屋，炉火还暖着。
        </p>
      )}

      {state?.pose === 'walking' && !transitioning && <IslandControls />}

      {(showActions || message || retry) && (
        <div
          className={`room-bottom${seated ? ' is-seated' : ''}${televisionNearby ? ' is-near-tv' : ''}${sofaNearby ? ' is-near-sofa' : ''}`}
        >
          {message && (
            <p className="room-status px-panel-dark" role="status">
              {message}
            </p>
          )}
          {retry && (
            <button
              type="button"
              className="px-btn px-btn-accent room-reconnect"
              onClick={() => eventBus.emit('INTERIOR_ACTION', { action: 'reconnect' })}
            >
              重新加入客厅
            </button>
          )}
          {state && sofaNearby && (
            <section className="room-actions room-actions-pair px-panel-compact" aria-label="选择沙发座位">
              {([0, 1] as const).map((seat) => {
                const occupied = state.members.some(
                  (member) => member.account === companion?.account && member.seat === seat,
                )
                return (
                  <button
                    key={seat}
                    type="button"
                    className="px-btn"
                    disabled={busy || occupied}
                    onClick={() =>
                      eventBus.emit('INTERIOR_ACTION', {
                        action: seat === 0 ? 'sit-left' : 'sit-right',
                      })
                    }
                  >
                    <PixelIcon name="sofa" size={18} />
                    <span>
                      {occupied ? (seat === 0 ? '左边有人' : '右边有人') : seat === 0 ? '坐左边' : '坐右边'}
                    </span>
                  </button>
                )
              })}
            </section>
          )}
          {state && (seated || televisionNearby) && (
            <section
              className={`room-actions px-panel-compact${televisionNearby ? ' room-actions-pair' : ''}`}
              aria-label={seated ? '沙发与电视' : '电视'}
            >
              {seated && (
                <button
                  type="button"
                  className="px-btn"
                  disabled={busy}
                  onClick={() => eventBus.emit('INTERIOR_ACTION', { action: 'stand' })}
                >
                  <PixelIcon name="sofa" size={18} />
                  <span>起身</span>
                </button>
              )}
              <button
                type="button"
                className={`px-btn${state.television ? ' px-btn-accent' : ''}`}
                disabled={busy}
                aria-pressed={state.television}
                onClick={() => eventBus.emit('INTERIOR_ACTION', { action: 'tv-toggle' })}
              >
                <PixelIcon name="tv" size={18} />
                <span>{state.television ? '关电视' : '开电视'}</span>
              </button>
              <button
                type="button"
                className="px-btn"
                disabled={busy || !state.television}
                aria-label={`换台，当前${CHANNELS[state.channel]}`}
                onClick={() => eventBus.emit('INTERIOR_ACTION', { action: 'tv-next' })}
              >
                <PixelIcon name="next" size={18} />
                <span>换台</span>
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
