import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { useIslandAudio } from '../audio/useIslandAudio'
import { characterId } from '../characters'
import { eventBus, type DayTick, type Phase } from '../game/EventBus'
import { useIslanders } from '../islanders'
import type { Meta, User } from '../types'
import { CharacterPortrait } from './CharacterPortrait'
import { PixelIcon, type PixelIconName } from './PixelIcon'
import './hud.css'

const PHASE_LABEL: Record<Phase, string> = {
  dawn: '黎明',
  day: '白天',
  dusk: '黄昏',
  night: '星夜',
}

interface Visit {
  last_seen: string
  action_note: string | null
}

function visitCopy(visit: Visit | null): string {
  if (!visit) return '还没留下足迹'
  const utc = /(?:Z|[+-]\d\d:\d\d)$/.test(visit.last_seen) ? visit.last_seen : `${visit.last_seen}Z`
  const mins = Math.max(0, Math.floor((Date.now() - new Date(utc).getTime()) / 60000))
  if (!Number.isFinite(mins)) return '曾来过小岛'
  if (mins < 2) return '刚刚在岛上'
  if (mins < 60) return `${mins} 分钟前来过`
  if (mins < 1440) return `${Math.floor(mins / 60)} 小时前来过`
  return `${Math.floor(mins / 1440)} 天前来过`
}

function daysTogether(startDate: string): number {
  const start = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - start.getTime()) / 86400000) + 1
}

/**
 * Stardew-inspired unified HUD:
 * - Desktop: single carved wooden board (clock + phase + days + companion badge) + 4 inventory-style slots underneath.
 * - Mobile: single compact 44px top strip leaving the whole island unobstructed.
 * - Quiet scenes (interior / seaside): only compact sound/settings/depart slots on top-right.
 */
export function Hud({
  user,
  audio,
  onDepart,
  quiet = false,
}: {
  user: User
  audio: ReturnType<typeof useIslandAudio>
  onDepart: () => void
  quiet?: boolean
}) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [presence, setPresence] = useState<Visit | null | undefined>(undefined)
  const [presenceError, setPresenceError] = useState(false)
  const [presenceOpen, setPresenceOpen] = useState(false)
  const [showTip, setShowTip] = useState(true)
  const [tick, setTick] = useState<DayTick | null>(null)
  const character = characterId(user.sprite, user.account)
  const companion = character === 'bear' ? 'her' : 'bear'
  const islanders = useIslanders()

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => setMeta(null))
    const onTick = (t: DayTick) => setTick(t)
    eventBus.on('DAY_TICK', onTick)
    const tipTimer = window.setTimeout(() => setShowTip(false), 5500)
    return () => {
      eventBus.off('DAY_TICK', onTick)
      window.clearTimeout(tipTimer)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const refresh = () =>
      api<{ visit: Visit | null }>('/api/presence', { signal: controller.signal })
        .then((r) => {
          setPresence(r.visit)
          setPresenceError(false)
        })
        .catch(() => {
          if (!controller.signal.aborted) setPresenceError(true)
        })
    void refresh()
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [user.id])

  const phase: Phase = tick?.phase ?? 'day'
  const days = meta?.start_date ? daysTogether(meta.start_date) : null
  const muted = audio.settings.muted || ['locked', 'blocked', 'error'].includes(audio.playback.status)

  function toggleAudio() {
    if (muted) audio.start()
    else audio.change({ muted: true }, true)
  }

  return (
    <div className={`hud px-font${quiet ? ' hud-quiet' : ''}`}>
      <div className="hud-cluster">
        {!quiet && (
          <button
            type="button"
            className="hud-board px-panel-compact"
            aria-expanded={presenceOpen}
            title="查看对方足迹"
            onClick={() => setPresenceOpen((v) => !v)}
          >
            <div className="hud-board-top">
              <PixelIcon name={phase as PixelIconName} size={20} />
              <span className="hud-time">{tick?.time ?? '--:--'}</span>
              <span className="hud-phase-tag">{PHASE_LABEL[phase]}</span>
            </div>
            <div className="hud-board-divider" aria-hidden="true" />
            <div className="hud-board-bot">
              <span className="hud-days-label">
                {days !== null ? `第 ${days} 天` : meta?.site_title ?? 'I-land'}
              </span>
              <span className="hud-companion-chip">
                <CharacterPortrait character={companion} size={18} />
                <span className="hud-companion-dot" />
              </span>
            </div>
          </button>
        )}

        <div className="hud-slots" role="toolbar" aria-label="小岛工具栏">
          {!quiet && (
            <button
              type="button"
              className="px-slot"
              title="记忆日历"
              aria-label="打开记忆日历"
              onClick={() => eventBus.emit('OPEN_CALENDAR', {})}
            >
              <PixelIcon name="calendar" size={22} />
            </button>
          )}
          <button
            type="button"
            className={`px-slot${muted ? ' is-active' : ''}`}
            aria-pressed={muted}
            title={muted ? '开启小岛声音' : '静音'}
            aria-label={muted ? '开启声音' : '静音'}
            onClick={toggleAudio}
          >
            <PixelIcon name={muted ? 'sound-off' : 'sound-on'} size={22} />
          </button>
          <button
            type="button"
            className="px-slot"
            title="小岛设置"
            aria-label="打开小岛设置"
            onClick={() => eventBus.emit('OPEN_SETTINGS', {})}
          >
            <PixelIcon name="settings" size={22} />
          </button>
          <button
            type="button"
            className="px-slot"
            title="暂别小岛"
            aria-label="暂别小岛"
            onClick={onDepart}
          >
            <PixelIcon name="boat" size={22} />
          </button>
        </div>
      </div>

      {!quiet && presenceOpen && (
        <div className="hud-presence-pop px-panel-compact px-pop" role="status">
          <div className="px-portrait-box hud-presence-avatar">
            <CharacterPortrait character={companion} size={32} />
          </div>
          <div className="hud-presence-copy">
            <strong>{islanders[companion]}的足迹</strong>
            <span>
              {presenceError
                ? '暂时读不到足迹'
                : presence === undefined
                  ? '查看足迹中…'
                  : visitCopy(presence)}
            </span>
            {presence?.action_note && <span className="presence-note">{presence.action_note}</span>}
          </div>
          <button
            type="button"
            className="hud-pop-close"
            aria-label="收起足迹"
            onClick={() => setPresenceOpen(false)}
          >
            <PixelIcon name="close" size={14} />
          </button>
        </div>
      )}

      {!quiet && showTip && (
        <div className="hud-tip px-panel-dark px-pop" role="status">
          WASD / 点击地面漫步 · 靠近按 E 互动
        </div>
      )}
    </div>
  )
}
