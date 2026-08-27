import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { eventBus } from '../game/EventBus'
import type { DayTick, Phase } from '../game/EventBus'
import type { Meta, User } from '../types'

const PHASE_LABEL: Record<Phase, string> = {
  dawn: '黎明',
  day: '白天',
  dusk: '黄昏',
  night: '星夜',
}

function daysTogether(startDate: string): number {
  const start = new Date(startDate + 'T00:00:00')
  if (Number.isNaN(start.getTime())) return 0
  const today = new Date()
  const diff = Math.floor((today.setHours(0, 0, 0, 0) - start.getTime()) / 86400000)
  return diff + 1
}

/** 左上木牌（站名+天数）与右上时钟/账号，数据来自游戏 DAY_TICK 事件 */
export function Hud({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [tick, setTick] = useState<DayTick | null>(null)

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => setMeta(null))
    const onTick = (t: DayTick) => setTick(t)
    eventBus.on('DAY_TICK', onTick)
    return () => eventBus.off('DAY_TICK', onTick)
  }, [])

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      onLogout()
    }
  }

  return (
    <div className="hud">
      <div className="hud-sign wood-panel">
        <div className="hud-title">{meta?.site_title ?? 'I-land'}</div>
        {meta?.start_date && <div className="hud-days">第 {daysTogether(meta.start_date)} 天</div>}
      </div>
      <div className="hud-right">
        {tick && (
          <div className="hud-clock">
            <span className="num">{tick.time}</span>
            <span className="hud-phase">{PHASE_LABEL[tick.phase]}</span>
          </div>
        )}
        <div className="hud-user">
          {user.display}
          <button className="btn btn-mini" onClick={logout}>
            下岛
          </button>
        </div>
      </div>
    </div>
  )
}
