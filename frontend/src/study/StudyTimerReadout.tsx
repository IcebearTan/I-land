import { useEffect, useRef, useState } from 'react'
import type { StudyTimer } from './types'

export function formatStudyClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const mins = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function computeSeconds(timer: StudyTimer, serverOffsetMs: number): number {
  const nowMs = Date.now() + serverOffsetMs
  if (timer.phase === 'focusing' || timer.phase === 'resting') {
    if (timer.ends_at_ms <= 0) return timer.focus_minutes * 60
    return Math.max(0, Math.ceil((timer.ends_at_ms - nowMs) / 1000))
  }
  if (timer.phase === 'stopwatch') {
    if (timer.started_at_ms <= 0) return 0
    return Math.max(0, Math.floor((nowMs - timer.started_at_ms) / 1000))
  }
  return timer.focus_minutes * 60
}

/**
 * 独立高频跳字叶子组件：
 * 每秒仅刷新自身文本节点，绝不触发外层聊天列表或 Phaser 画布重渲染。
 */
export function StudyTimerReadout({
  timer,
  serverOffsetMs = 0,
  className = '',
  onExpire,
}: {
  timer: StudyTimer
  serverOffsetMs?: number
  className?: string
  onExpire?: () => void
}) {
  const [seconds, setSeconds] = useState(() => computeSeconds(timer, serverOffsetMs))
  const firedVersionRef = useRef<number>(-1)

  useEffect(() => {
    const sync = () => {
      const next = computeSeconds(timer, serverOffsetMs)
      setSeconds(next)
      if (
        (timer.phase === 'focusing' || timer.phase === 'resting') &&
        timer.ends_at_ms > 0 &&
        next <= 0 &&
        firedVersionRef.current !== timer.version
      ) {
        firedVersionRef.current = timer.version
        onExpire?.()
      }
    }
    sync()
    if (timer.phase === 'idle') return
    const id = window.setInterval(sync, 1000)
    return () => window.clearInterval(id)
  }, [timer.phase, timer.started_at_ms, timer.ends_at_ms, timer.focus_minutes, timer.version, serverOffsetMs, onExpire])

  return <span className={`study-timer-digits ${className}`.trim()}>{formatStudyClock(seconds)}</span>
}
