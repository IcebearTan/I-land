import { useEffect, useState } from 'react'
import { eventBus, type Phase, type SeasideState } from '../game/EventBus'
import { SCENERY_RATES } from '../seaside/clock'
import { CharacterPortrait } from './CharacterPortrait'
import { PixelIcon, type PixelIconName } from './PixelIcon'

const PHASE_LABEL: Record<Phase, string> = {
  dawn: '晨光初醒',
  day: '海风晴朗',
  dusk: '日落温柔',
  night: '月光作伴',
}

/** Seaside pixel overlay — minimal night-sky plaque + Stardew carved action bar. */
export function SeasideControls({ transitioning }: { transitioning: boolean }) {
  const [state, setState] = useState<SeasideState | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [showTime, setShowTime] = useState(false)

  useEffect(() => {
    const onState = (value: SeasideState) => setState(value)
    const onOpen = () => setPanelOpen(true)
    const onClose = () => setPanelOpen(false)
    eventBus.on('SEASIDE_STATE', onState)
    eventBus.on('PANEL_OPENED', onOpen)
    eventBus.on('PANEL_CLOSED', onClose)
    eventBus.emit('SEASIDE_REQUEST_STATE', {})
    return () => {
      eventBus.off('SEASIDE_STATE', onState)
      eventBus.off('PANEL_OPENED', onOpen)
      eventBus.off('PANEL_CLOSED', onClose)
    }
  }, [])

  if (panelOpen) return null

  const phase: Phase = state?.clock.phase ?? 'night'
  const connection = state?.connection.state ?? 'joining'
  const together = connection === 'connected' && (state?.members.length ?? 0) === 2
  const disabled = transitioning || connection !== 'connected' || !!state?.connection.pending
  const leaning = state?.pose === 'leaning'
  const seated = state?.pose === 'seated' || leaning
  const canLean = seated && !!state?.companion && state.companion.pose !== 'standing'
  const rate = state?.clock.rate ?? 1

  const statusLine =
    state?.notice ||
    (connection === 'connected'
      ? together
        ? leaning
          ? '靠一会儿，把心事交给海风。'
          : state?.companion?.pose === 'standing'
            ? `${state.companion.display}在海边吹风`
            : '两个人，一片海。'
        : '身旁的位置，留给你。'
      : connection === 'joining'
        ? '走向海边…'
        : connection === 'taken-over'
          ? '此页座位已结束'
          : connection === 'expired'
            ? '登录已过期'
            : connection === 'reconnecting'
              ? '正在重新连上海边…'
              : state?.connection.message ?? '海边暂时没连上')

  return (
    <div
      className="seaside-ui px-font"
      data-phase={phase}
      data-seaside-pose={state?.pose}
      data-scenery-rate={rate}
      data-scenery-time={state?.clock.time}
      data-room-state={connection}
      data-room-members={state?.members.map((m) => `${m.account}:${m.seat}:${m.pose}`).join(',')}
      data-scenery-virtual-ms={state?.clock.virtualMs}
      data-time-open={showTime}
    >
      <div className="shore-top-left">
        <div className="shore-status-card px-panel-dark" role="status">
          {connection === 'connected' && state && state.members.length > 0 && (
            <span className="shore-avatars">
              {state.members.map((m) => (
                <CharacterPortrait key={m.account} character={m.sprite} size={22} />
              ))}
            </span>
          )}
          <span className="shore-status-text">{statusLine}</span>
          {(connection === 'error' || connection === 'taken-over' || connection === 'reconnecting') && (
            <button
              type="button"
              className="shore-mini-retry px-btn"
              disabled={transitioning}
              onClick={() => eventBus.emit('SEASIDE_RECONNECT', {})}
            >
              重连
            </button>
          )}
          {connection === 'expired' && (
            <button
              type="button"
              className="shore-mini-retry px-btn"
              disabled={transitioning}
              onClick={() => eventBus.emit('SESSION_EXPIRED', {})}
            >
              重登
            </button>
          )}
        </div>
      </div>

      <div className="shore-bottom">
        <div className="shore-moment px-panel-dark">
          <PixelIcon name={phase as PixelIconName} size={18} />
          <span>{PHASE_LABEL[phase]}</span>
          <span className="shore-dot">·</span>
          <span className="shore-time-value">{state?.clock.time ?? '--:--'}</span>
        </div>

        <section className="shore-controls px-panel-compact" aria-label="看海动作与景色时间">
          <div className="shore-main-actions">
            <button
              type="button"
              className="px-btn shore-btn"
              disabled={transitioning}
              onClick={() => eventBus.emit('TRAVEL_REQUEST', { from: 'seaside', to: 'island' })}
            >
              <PixelIcon name="back" size={18} />
              <span className="shore-label-wide">回小岛</span>
              <span className="shore-label-short">回岛</span>
            </button>

            <button
              type="button"
              className="px-btn shore-btn"
              disabled={disabled || state?.pose === 'arriving'}
              onClick={() => eventBus.emit('SEASIDE_ACTION', { action: seated ? 'stand' : 'sit' })}
            >
              <PixelIcon name="sofa" size={18} />
              <span className="shore-label-wide">
                {state?.pose === 'arriving' ? '入座中' : seated ? '起身' : '坐下看海'}
              </span>
              <span className="shore-label-short">
                {state?.pose === 'arriving' ? '入座' : seated ? '起身' : '坐下'}
              </span>
            </button>

            <button
              type="button"
              className={`px-btn shore-btn${leaning ? ' px-btn-accent' : ''}`}
              disabled={disabled || !canLean}
              aria-pressed={leaning}
              title={!canLean ? '两个人都坐下后就能靠一会儿' : undefined}
              onClick={() => eventBus.emit('SEASIDE_ACTION', { action: leaning ? 'unlean' : 'lean' })}
            >
              <PixelIcon name="heart" size={18} />
              <span>{leaning ? '坐好' : '靠一会'}</span>
            </button>

            <button
              type="button"
              className={`px-btn shore-btn${showTime ? ' px-btn-accent' : ''}`}
              disabled={disabled}
              aria-expanded={showTime}
              aria-controls="shore-clock-settings"
              onClick={() => setShowTime((v) => !v)}
            >
              <PixelIcon name="clock" size={18} />
              <span>{rate === 0 ? '暂停' : `${rate}×`}</span>
            </button>
          </div>
        </section>
      </div>

      {showTime && (
        <section
          className="shore-clock-settings px-panel px-pop"
          id="shore-clock-settings"
          aria-label="景色时间设置"
        >
          <div className="shore-clock-heading">
            <span>海边景色流速</span>
            <span>{state?.clock.followingReal ? '现实时间' : '自定流速'}</span>
          </div>
          <div className="shore-clock-options" role="group" aria-label="景色流速">
            {SCENERY_RATES.map((value) => (
              <button
                key={value}
                type="button"
                className={`px-btn${rate === value ? ' px-btn-accent' : ''}`}
                disabled={disabled}
                aria-pressed={rate === value}
                onClick={() => eventBus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: value })}
              >
                <span>{value === 0 ? '暂停' : `${value}×`}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="px-btn shore-reset"
            disabled={disabled || state?.clock.followingReal}
            onClick={() => eventBus.emit('SEASIDE_CLOCK_REQUEST', { action: 'reset' })}
          >
            回到现实时间
          </button>
        </section>
      )}
    </div>
  )
}
