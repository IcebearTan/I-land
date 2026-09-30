import { useEffect, useState } from 'react'
import { CharacterPortrait } from './CharacterPortrait'
import { characterId } from '../characters'
import { api } from '../api/client'
import { eventBus } from '../game/EventBus'
import { useIslanders } from '../islanders'
import type { DayTick, Phase } from '../game/EventBus'
import type { Meta, User } from '../types'

const PHASE_LABEL: Record<Phase, string> = {
  dawn: '黎明',
  day: '白天',
  dusk: '黄昏',
  night: '星夜',
}

interface Visit { last_seen: string; action_note: string | null }
function visitCopy(visit: Visit | null): string {
  if (!visit) return '还没有留下登岛足迹'
  const utc = /(?:Z|[+-]\d\d:\d\d)$/.test(visit.last_seen) ? visit.last_seen : visit.last_seen + 'Z'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(utc).getTime()) / 60000))
  if (!Number.isFinite(minutes)) return '曾来过这座小岛'
  if (minutes < 1) return '刚刚来过岛上'
  if (minutes < 60) return `${minutes} 分钟前来过`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前来过`
  return `${Math.floor(minutes / 1440)} 天前来过`
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
  const [presence, setPresence] = useState<Visit | null | undefined>(undefined)
  const [presenceError, setPresenceError] = useState(false)
  const character = characterId(user.sprite, user.name)
  const companion = character === 'bear' ? 'her' : 'bear'
  const islanders = useIslanders()
  const [tick, setTick] = useState<DayTick | null>(null)

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => setMeta(null))
    const onTick = (t: DayTick) => setTick(t)
    eventBus.on('DAY_TICK', onTick)
    return () => eventBus.off('DAY_TICK', onTick)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => api<{ visit: Visit | null }>('/api/presence', { signal: controller.signal })
      .then(r => { setPresence(r.visit); setPresenceError(false) })
      .catch(() => { if (!controller.signal.aborted) setPresenceError(true) })
    void refresh()
    const timer = window.setInterval(refresh, 60_000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [user.id])

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
      <div className="hud-presence">
        <CharacterPortrait character={companion} size={30} />
        <div><strong>{islanders[companion]}的足迹</strong>
          <span>{presenceError ? '暂时无法读取足迹' : presence === undefined ? '看看对方的足迹…' : visitCopy(presence)}</span>
          {presence?.action_note && <span className="presence-note">{presence.action_note}</span>}
        </div>
      </div>
      <div className="hud-help"><span className="hud-help-keys">WASD / 方向键漫步 · E 互动 · 也可以点击地面</span><span className="hud-help-touch">轻点地面漫步 · 走近后轻点气泡互动</span></div>
      <div className="hud-right">
        {tick && (
          <div className="hud-clock">
            <span className="num">{tick.time}</span>
            <span className="hud-phase">{PHASE_LABEL[tick.phase]}</span>
          </div>
        )}
        <div className="hud-user">
          <CharacterPortrait character={character} size={28} />
          {user.display}
          <button className="btn btn-mini" onClick={() => eventBus.emit('OPEN_SETTINGS', {})} aria-label="打开小岛设置">
            设置
          </button>
          <button className="btn btn-mini" onClick={logout}>
            下岛
          </button>
        </div>
      </div>
    </div>
  )
}
