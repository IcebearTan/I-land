import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { useIslandAudio } from '../audio/useIslandAudio'
import { characterId } from '../characters'
import { CharacterPortrait } from '../components/CharacterPortrait'
import { PixelIcon } from '../components/PixelIcon'
import { eventBus } from '../game/EventBus'
import { useIslanders } from '../islanders'
import type { User } from '../types'
import { StudyChatPanel } from './StudyChatPanel'
import { StudyPomodoroBar, type TimerCommandPayload } from './StudyPomodoroBar'
import { playStudyChime } from './StudyRoomClient'
import { StudyTimerReadout } from './StudyTimerReadout'
import type {
  StudyAccount,
  StudyAudioMode,
  StudyOverview,
  StudyPhase,
  StudyRangeSummary,
  StudySceneState,
  StudySnapshot,
  StudyTimer,
} from './types'
import './study.css'

const DEFAULT_TIMER = (account: StudyAccount): StudyTimer => ({
  account,
  phase: 'idle',
  focus_minutes: 25,
  break_minutes: 5,
  started_at_ms: 0,
  ends_at_ms: 0,
  goal_text: '',
  synced_with: '',
  version: 1,
})

export function StudyWorkspace({
  user,
  audio,
  transitioning,
}: {
  user: User
  audio: ReturnType<typeof useIslandAudio>
  transitioning: boolean
}) {
  const myAccount: StudyAccount = characterId(user.sprite, user.account)
  const partnerAcc: StudyAccount = myAccount === 'bear' ? 'her' : 'bear'
  const islanders = useIslanders()
  const bearName = islanders.bear || '小熊'
  const herName = islanders.her || '她'
  const names = { bear: bearName, her: herName }
  const partnerName = partnerAcc === 'bear' ? bearName : herName

  const [sceneState, setSceneState] = useState<StudySceneState>({
    connection: { state: 'joining', pending: false },
    members: [],
    timers: { bear: DEFAULT_TIMER('bear'), her: DEFAULT_TIMER('her') },
    latestMessageId: 0,
    lastNudge: null,
    serverOffsetMs: 0,
    audioMode: 'whitenoise',
  })
  const [today, setToday] = useState<StudyRangeSummary | null>(null)
  const [recentGoals, setRecentGoals] = useState<string[]>([])
  const [timerBusy, setTimerBusy] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [wakeLocked, setWakeLocked] = useState(false)
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null)
  const prevPhaseRef = useRef<StudyPhase>('idle')

  const refreshOverview = useCallback(() => {
    api<StudyOverview>('/api/study/overview')
      .then((ov) => {
        setToday(ov.today)
        setRecentGoals(ov.recent_goals)
        setSceneState((prev) => ({
          ...prev,
          timers: ov.timers,
          latestMessageId: Math.max(prev.latestMessageId, ov.latest_message_id),
          serverOffsetMs: ov.server_now_ms - Date.now(),
        }))
        const pPhase = ov.timers[partnerAcc].phase
        eventBus.emit('STUDY_ROOF_STATUS', {
          lit: ov.roof_lit,
          companionFocusing: pPhase === 'focusing' || pPhase === 'stopwatch',
          companionName: partnerName,
        })
      })
      .catch(() => {})
  }, [partnerAcc, partnerName])

  useEffect(() => {
    refreshOverview()
    const onState = (next: StudySceneState) => setSceneState(next)
    eventBus.on('STUDY_STATE', onState)
    eventBus.emit('STUDY_REQUEST_STATE', {})
    return () => {
      eventBus.off('STUDY_STATE', onState)
    }
  }, [refreshOverview])

  const myPhase = sceneState.timers[myAccount].phase
  useEffect(() => {
    const prev = prevPhaseRef.current
    if (prev !== myPhase && sceneState.audioMode !== 'mute' && !audio.settings.muted) {
      if (prev === 'focusing' && myPhase === 'resting') playStudyChime('rest')
      else if (prev === 'resting' && myPhase === 'idle') playStudyChime('done')
    }
    prevPhaseRef.current = myPhase
  }, [myPhase, sceneState.audioMode, audio.settings.muted])

  // 手机软键盘弹起智能避让（监听 visualViewport 高度收缩）
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let baseline = Math.max(window.innerHeight, vv.height)
    const check = () => {
      if (window.innerWidth > 820) {
        setKeyboardOpen(false)
        return
      }
      if (vv.height > baseline) baseline = vv.height
      setKeyboardOpen(baseline - vv.height > 125)
    }
    vv.addEventListener('resize', check)
    return () => vv.removeEventListener('resize', check)
  }, [])

  // 退出书房时释放屏幕常亮锁
  useEffect(() => {
    return () => {
      void wakeRef.current?.release().catch(() => {})
      wakeRef.current = null
    }
  }, [])

  async function toggleWakeLock() {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }
    if (!nav.wakeLock) return
    if (wakeRef.current) {
      await wakeRef.current.release().catch(() => {})
      wakeRef.current = null
      setWakeLocked(false)
      return
    }
    try {
      wakeRef.current = await nav.wakeLock.request('screen')
      setWakeLocked(true)
    } catch {
      setWakeLocked(false)
    }
  }

  function handleAudioMode(mode: StudyAudioMode) {
    if (mode !== 'mute') audio.start()
    eventBus.emit('STUDY_AUDIO_MODE', { mode })
  }

  const handleSyncSnapshot = useCallback((snapshot: StudySnapshot) => {
    eventBus.emit('STUDY_SYNC_SNAPSHOT', snapshot)
  }, [])

  async function handleTimerCommand(payload: TimerCommandPayload) {
    if (timerBusy) return
    setTimerBusy(true)
    try {
      const res = await api<{
        today?: StudyRangeSummary
        snapshot?: StudySnapshot
      }>('/api/study/timer', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (res.today) setToday(res.today)
      if (res.snapshot) eventBus.emit('STUDY_SYNC_SNAPSHOT', res.snapshot)
      refreshOverview()
    } catch {
      // ignore transient error
    } finally {
      setTimerBusy(false)
    }
  }

  const handleTimerExpire = useCallback(() => {
    api<{ snapshot?: StudySnapshot }>('/api/study/timer', {
      method: 'POST',
      body: JSON.stringify({ action: 'settle' }),
    })
      .then((res) => {
        if (res.snapshot) eventBus.emit('STUDY_SYNC_SNAPSHOT', res.snapshot)
        refreshOverview()
      })
      .catch(() => {})
  }, [refreshOverview])

  const retryNeeded = ['taken-over', 'error'].includes(sceneState.connection.state)
  const canWakeLock = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  return (
    <div
      className={`study-shell px-font${keyboardOpen ? ' is-keyboard-open' : ''}`}
      data-study-state={sceneState.connection.state}
      data-my-phase={myPhase}
    >
      <header className="study-topbar">
        <div className="study-nav-btns">
          <button
            type="button"
            className="px-btn px-btn-sm"
            disabled={transitioning}
            onClick={() => eventBus.emit('TRAVEL_REQUEST', { from: 'study', to: 'island' })}
          >
            <PixelIcon name="back" size={16} />
            <span>回小岛</span>
          </button>
          <button
            type="button"
            className="px-btn px-btn-sm"
            disabled={transitioning}
            onClick={() => eventBus.emit('TRAVEL_REQUEST', { from: 'study', to: 'interior' })}
          >
            <span>下楼客厅</span>
          </button>
        </div>

        <div className="study-audio-group" role="group" aria-label="书房环境音切换">
          {([
            ['whitenoise', '白噪音'],
            ['melody', '伴读乐'],
            ['mute', '静音'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`study-top-chip${sceneState.audioMode === mode ? ' is-active' : ''}`}
              onClick={() => handleAudioMode(mode)}
            >
              {label}
            </button>
          ))}
          {canWakeLock && (
            <button
              type="button"
              className={`study-top-chip${wakeLocked ? ' is-active' : ''}`}
              onClick={toggleWakeLock}
              title="保持手机屏幕常亮作桌面钟"
            >
              常亮
            </button>
          )}
        </div>
      </header>

      {keyboardOpen && (
        <div className="study-kb-mini-bar px-panel-compact">
          {([myAccount, partnerAcc] as const).map((acc) => (
            <div key={acc} className="study-kb-mini-seat">
              <CharacterPortrait character={acc} size={20} />
              <span>{names[acc]}</span>
              <StudyTimerReadout timer={sceneState.timers[acc]} serverOffsetMs={sceneState.serverOffsetMs} />
            </div>
          ))}
        </div>
      )}

      <aside className="study-console">
        {retryNeeded && (
          <div className="study-reconnect-bar px-panel-dark">
            <span>{sceneState.connection.message || '连接暂时断开'}</span>
            <button
              type="button"
              className="px-btn px-btn-accent px-btn-sm"
              onClick={() => eventBus.emit('STUDY_RECONNECT', {})}
            >
              重新入座
            </button>
          </div>
        )}

        {!keyboardOpen && (
          <StudyPomodoroBar
            myAccount={myAccount}
            names={names}
            members={sceneState.members}
            timers={sceneState.timers}
            today={today}
            recentGoals={recentGoals}
            serverOffsetMs={sceneState.serverOffsetMs}
            busy={timerBusy || transitioning}
            onCommand={handleTimerCommand}
            onTimerExpire={handleTimerExpire}
          />
        )}

        <StudyChatPanel
          myAccount={myAccount}
          myPhase={myPhase}
          latestMessageId={sceneState.latestMessageId}
          lastNudge={sceneState.lastNudge}
          collapsed={chatCollapsed && !keyboardOpen}
          onToggleCollapse={() => setChatCollapsed((v) => !v)}
          onSyncSnapshot={handleSyncSnapshot}
        />
      </aside>
    </div>
  )
}
