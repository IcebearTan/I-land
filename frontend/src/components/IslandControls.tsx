import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { eventBus } from '../game/EventBus'
import { PixelIcon } from './PixelIcon'

/**
 * Mobile touch D-Pad + contextual Stardew interact bubble.
 * DOM emits direction/interact intent only; Phaser owns movement & collisions.
 */
export function IslandControls() {
  const [label, setLabel] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [stick, setStick] = useState({ x: 0, y: 0 })
  const pointer = useRef<number | null>(null)

  function stop() {
    pointer.current = null
    setStick({ x: 0, y: 0 })
    eventBus.emit('MOVE_INPUT', { x: 0, y: 0 })
  }

  useEffect(() => {
    const onInteraction = ({ label: next }: { label: string | null }) => setLabel(next)
    const onOpen = () => {
      setPanelOpen(true)
      stop()
    }
    const onClose = () => setPanelOpen(false)
    const onVisibility = () => {
      if (document.hidden) stop()
    }
    eventBus.on('INTERACTION_CHANGED', onInteraction)
    eventBus.on('PANEL_OPENED', onOpen)
    eventBus.on('PANEL_CLOSED', onClose)
    eventBus.emit('INTERACTION_REQUEST_STATE', {})
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      eventBus.off('INTERACTION_CHANGED', onInteraction)
      eventBus.off('PANEL_OPENED', onOpen)
      eventBus.off('PANEL_CLOSED', onClose)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', onVisibility)
      eventBus.emit('MOVE_INPUT', { x: 0, y: 0 })
    }
  }, [])

  function move(e: PointerEvent<HTMLButtonElement>) {
    if (pointer.current !== e.pointerId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    const distance = Math.hypot(x, y)
    const maxR = 26
    const scale = distance > maxR ? maxR / distance : 1
    setStick({ x: x * scale, y: y * scale })
    eventBus.emit(
      'MOVE_INPUT',
      distance < 6 ? { x: 0, y: 0 } : { x: (x * scale) / maxR, y: (y * scale) / maxR },
    )
  }

  if (panelOpen) return null

  return (
    <div className="island-controls px-font">
      <div className="dpad-wrap">
        <button
          type="button"
          className="px-dpad"
          aria-label="像素方向键，按住或拖动控制漫步"
          onPointerDown={(e) => {
            if (pointer.current !== null) return
            pointer.current = e.pointerId
            e.currentTarget.setPointerCapture(e.pointerId)
            move(e)
          }}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onKeyDown={(e) => {
            const dir: Record<string, { x: number; y: number }> = {
              ArrowUp: { x: 0, y: -1 },
              ArrowDown: { x: 0, y: 1 },
              ArrowLeft: { x: -1, y: 0 },
              ArrowRight: { x: 1, y: 0 },
            }
            if (dir[e.key]) {
              e.preventDefault()
              eventBus.emit('MOVE_INPUT', dir[e.key])
            }
          }}
          onKeyUp={stop}
          onBlur={stop}
        >
          <span
            className="px-dpad-nub"
            style={{ transform: `translate(${Math.round(stick.x)}px, ${Math.round(stick.y)}px)` }}
          />
        </button>
      </div>

      {/* Only pops up when near an interactive object — never clutters the island */}
      {label && (
        <button
          type="button"
          className="island-interact-bubble px-btn px-btn-accent px-pop"
          onClick={() => eventBus.emit('INTERACT', {})}
        >
          <PixelIcon name="spark" size={20} />
          <span>{label}</span>
        </button>
      )}
    </div>
  )
}
