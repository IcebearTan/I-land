import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { characterId } from '../characters'
import { useIslanders } from '../islanders'
import type { Phase } from '../game/EventBus'
import { formatStudyClock } from '../study/StudyTimerReadout'
import type { StudyOverview } from '../study/types'
import type { Meta, User } from '../types'
import { CharacterPortrait } from './CharacterPortrait'
import { PixelIcon, type PixelIconName } from './PixelIcon'
import './dock.css'

export type DockMode = 'loading' | 'ready' | 'farewell'

interface Visit {
  last_seen: string
  action_note: string | null
}

function currentPhase(): Phase {
  const h = new Date().getHours()
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 20) return 'dusk'
  return 'night'
}

const PHASE_LABEL: Record<Phase, string> = {
  dawn: '晨光微亮',
  day: '海风晴朗',
  dusk: '日落黄昏',
  night: '星光满岛',
}

const FAREWELL_COPY: Record<Phase, { title: string; body: string }> = {
  dawn: { title: '先歇一会儿吧', body: '晨雾还没散，小岛先替你留着这阵风。要不要再回岛上走走？' },
  day: { title: '海风一直在', body: '海风会替你守着这座小岛，想什么时候回来都可以。' },
  dusk: { title: '晚霞还亮着', body: '日落刚好落在海面上，要不要再回岛上吹一会儿风？' },
  night: { title: '炉火给你留着', body: '星光还亮着，小屋里的炉火也温着。要再上岛坐坐吗？' },
}

function shortVisit(visit: Visit | null, name: string): string {
  if (!visit) return `静静等着你和${name}`
  const utc = /(?:Z|[+-]\d\d:\d\d)$/.test(visit.last_seen) ? visit.last_seen : `${visit.last_seen}Z`
  const mins = Math.max(0, Math.floor((Date.now() - new Date(utc).getTime()) / 60000))
  if (!Number.isFinite(mins)) return `${name}来过小岛`
  if (mins < 2) return `${name}刚刚在岛上`
  if (mins < 60) return `${name} ${mins} 分钟前来过`
  if (mins < 1440) return `${name} ${Math.floor(mins / 60)} 小时前来过`
  return `${name} ${Math.floor(mins / 1440)} 天前来过`
}

function daysTogether(startDate?: string): number | null {
  if (!startDate) return null
  const start = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - start.getTime()) / 86400000) + 1
}

export function DockOverlay({
  mode,
  progress,
  gameReady = true,
  loadError = null,
  onRetryLoad,
  user,
  muted,
  onToggleMute,
  onEmbark,
  onEmbarkStudy,
  onReturnPortal,
  embedded,
}: {
  mode: DockMode
  progress: number
  gameReady?: boolean
  loadError?: string | null
  onRetryLoad?: () => void
  user: User | null | undefined
  muted: boolean
  onToggleMute: () => void
  onEmbark: () => void
  onEmbarkStudy?: () => void
  onReturnPortal: () => void
  embedded: boolean
}) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [visit, setVisit] = useState<Visit | null>(null)
  const [studyOv, setStudyOv] = useState<StudyOverview | null>(null)
  const islanders = useIslanders()
  const phase = currentPhase()

  useEffect(() => {
    if (!user || mode === 'loading') return
    api<Meta>('/api/meta').then(setMeta).catch(() => {})
    api<{ visit: Visit | null }>('/api/presence')
      .then((r) => setVisit(r.visit))
      .catch(() => {})
    api<StudyOverview>('/api/study/overview')
      .then(setStudyOv)
      .catch(() => {})
  }, [user?.id, mode])

  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)))
  const char = user ? characterId(user.sprite, user.account) : 'bear'
  const companion = char === 'bear' ? 'her' : 'bear'
  const myName =
    user && (user.account === 'bear' || user.account === 'her')
      ? islanders[user.account]
      : user?.display || '岛民'
  const days = daysTogether(meta?.start_date)
  const farewell = FAREWELL_COPY[phase]
  const companionInStudy = Boolean(studyOv?.members.some((m) => m.account === companion))
  const companionTimer = studyOv?.timers[companion]
  const companionFocusing =
    companionTimer?.phase === 'focusing' || companionTimer?.phase === 'stopwatch'
  const companionRemainSec =
    companionTimer?.phase === 'focusing' && studyOv
      ? Math.max(0, Math.ceil((companionTimer.ends_at_ms - studyOv.server_now_ms) / 1000))
      : null
  const studySubCopy =
    companionFocusing || companionInStudy
      ? `${islanders[companion]}正在阁楼自习${companionRemainSec ? ` · 剩余 ${formatStudyClock(companionRemainSec)}` : ''}`
      : null
  const loadLabel =
    pct < 20
      ? '正在启航连接小岛…'
      : pct < 68
        ? '正在载入小岛引擎与画卷…'
        : pct < 95
          ? '正在铺开海风与像素图集…'
          : '海风已经准备好了'

  return (
    <>
      <div className={`dock-backdrop${gameReady ? ' is-hidden' : ''}`} aria-hidden="true">
        <span className="dock-stars dock-stars--far" />
        <span className="dock-stars dock-stars--mid" />
        <span className="dock-star-cross dock-star-cross--1" />
        <span className="dock-star-cross dock-star-cross--2" />
        <span className="dock-star-cross dock-star-cross--3" />
        <span className="dock-star-cross dock-star-cross--4" />
      </div>

      <div className="dock-stage" data-dock-mode={mode}>
        <div className="dock-center px-pop">
          <img
            src="/art-v2/ui/title-plaque.png"
            alt="I-land"
            width={272}
            height={84}
            draggable={false}
            className="dock-plaque"
          />

          {mode === 'loading' ? (
            <div className="dock-card dock-loading px-panel-compact" role="status" aria-live="polite">
              {loadError ? (
                <div className="dock-load-error">
                  <p className="dock-error-text">海风连接中断了，请重试登岛。</p>
                  {onRetryLoad && (
                    <button type="button" className="px-btn px-btn-accent" onClick={onRetryLoad}>
                      重新载入
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="dock-progress-head">
                    <span>{loadLabel}</span>
                    <span className="dock-pct">{pct}%</span>
                  </div>
                  <div className="dock-progress-wrap">
                    <div className="dock-boat-track" aria-hidden="true">
                      <span className="dock-boat-runner" style={{ left: `calc(${pct}% - 12px)` }}>
                        <PixelIcon name="boat" size={24} />
                      </span>
                    </div>
                    <div className="px-progress">
                      <div className="px-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : mode === 'ready' ? (
          <div className="dock-card px-panel" role="region" aria-label="登岛准备">
            <div className="dock-dialog-row">
              <div className="px-portrait-box dock-avatar">
                <CharacterPortrait character={char} size={52} />
              </div>
              <div className="dock-copy">
                <div className="dock-phase-pill">
                  <PixelIcon name={phase as PixelIconName} size={18} />
                  <span>{PHASE_LABEL[phase]}</span>
                  {days !== null && <span className="dock-days">· 第 {days} 天</span>}
                </div>
                <h2 className="dock-heading">准备好了吗，{myName}？</h2>
                <p className={`dock-sub${studySubCopy ? ' is-study-live' : ''}`}>
                  <PixelIcon name={studySubCopy ? 'book' : 'paw'} size={16} />
                  <span>{studySubCopy ?? shortVisit(visit, islanders[companion])}</span>
                </p>
              </div>
            </div>

            <div className="dock-actions">
              <button type="button" className="px-btn px-btn-accent dock-main-btn" onClick={onEmbark}>
                <PixelIcon name="boat" size={22} />
                <span>乘船登岛</span>
              </button>
              {onEmbarkStudy && (
                <button
                  type="button"
                  className={`px-btn dock-study-btn${studySubCopy ? ' px-btn-accent' : ''}`}
                  onClick={onEmbarkStudy}
                >
                  <PixelIcon name="book" size={20} />
                  <span>{studySubCopy ? `去陪${islanders[companion]}自习` : '直达书房'}</span>
                </button>
              )}
              <button
                type="button"
                className={`px-slot${muted ? ' is-active' : ''}`}
                aria-pressed={muted}
                title={muted ? '当前静音，点击开启声音' : '点击静音登岛'}
                aria-label={muted ? '开启声音' : '静音登岛'}
                onClick={onToggleMute}
              >
                <PixelIcon name={muted ? 'sound-off' : 'sound-on'} size={22} />
              </button>
              {embedded && (
                <button
                  type="button"
                  className="px-slot"
                  title="回到 Donut"
                  aria-label="回到 Donut"
                  onClick={onReturnPortal}
                >
                  <PixelIcon name="chat" size={22} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="dock-card px-panel" role="region" aria-label="离岛问候">
            <div className="dock-dialog-row">
              <div className="px-portrait-box dock-avatar">
                <CharacterPortrait character={char} size={52} />
              </div>
              <div className="dock-copy">
                <div className="dock-phase-pill">
                  <PixelIcon name={phase as PixelIconName} size={18} />
                  <span>{farewell.title}</span>
                </div>
                <p className="dock-farewell-text">{farewell.body}</p>
              </div>
            </div>

            <div className="dock-actions">
              <button type="button" className="px-btn px-btn-accent dock-main-btn" onClick={onEmbark}>
                <PixelIcon name="boat" size={22} />
                <span>再次上岛</span>
              </button>
              {embedded && (
                <button type="button" className="px-btn" onClick={onReturnPortal}>
                  <PixelIcon name="chat" size={20} />
                  <span>回到 Donut</span>
                </button>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  )
}
