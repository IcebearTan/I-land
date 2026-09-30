import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { eventBus } from '../game/EventBus'

/** DOM 只发方向与互动意图，位移与碰撞全部由 Phaser 负责。 */
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
    const onInteraction = ({ label }: { label: string | null }) => setLabel(label)
    const onOpen = () => { setPanelOpen(true); stop() }
    const onClose = () => setPanelOpen(false)
    const onVisibility = () => { if (document.hidden) stop() }
    eventBus.on('INTERACTION_CHANGED', onInteraction)
    eventBus.on('PANEL_OPENED', onOpen)
    eventBus.on('PANEL_CLOSED', onClose)
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
    const x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2
    const distance = Math.hypot(x, y), scale = distance > 28 ? 28 / distance : 1
    setStick({ x: x * scale, y: y * scale })
    eventBus.emit('MOVE_INPUT', distance < 5 ? { x: 0, y: 0 } : { x: x * scale / 28, y: y * scale / 28 })
  }
  if (panelOpen) return null
  return <div className="island-controls">
    <div className="joystick-wrap">
      <button className="joystick" aria-label="移动摇杆，拖动控制方向" onPointerDown={e => {
        if (pointer.current !== null) return
        pointer.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      }} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
        onKeyDown={e => {
          const direction: Record<string, { x: number; y: number }> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } }
          if (direction[e.key]) { e.preventDefault(); eventBus.emit('MOVE_INPUT', direction[e.key]) }
        }} onKeyUp={stop} onBlur={stop}>
        <span className="joystick-cross" aria-hidden="true">＋</span>
        <span className="joystick-thumb" style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} />
      </button>
      <span>拖动漫步</span>
    </div>
    <button className="island-interact" disabled={!label} onClick={() => eventBus.emit('INTERACT', {})}>
      <span aria-hidden="true">{label ? '✦' : '◇'}</span>{label ?? '走近后互动'}
    </button>
  </div>
}
