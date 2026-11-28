import { useState } from 'react'
import { CharacterPortrait } from '../components/CharacterPortrait'
import { PixelIcon } from '../components/PixelIcon'
import { StudyTimerReadout } from './StudyTimerReadout'
import type { StudyAccount, StudyMember, StudyRangeSummary, StudyTimer } from './types'

const PRESETS = [
  { id: '25-5', label: '25 / 5', focus: 25, rest: 5 },
  { id: '45-10', label: '45 / 10', focus: 45, rest: 10 },
  { id: '60-10', label: '60 / 10', focus: 60, rest: 10 },
  { id: 'stopwatch', label: '自由正向', focus: 0, rest: 5 },
  { id: 'custom', label: '自定义', focus: 35, rest: 8 },
] as const

type PresetId = (typeof PRESETS)[number]['id']

const PHASE_COPY: Record<StudyTimer['phase'], string> = {
  idle: '桌前待命',
  focusing: '专注中',
  stopwatch: '自由计时',
  resting: '小憩喝茶',
}

export interface TimerCommandPayload {
  action: 'start_focus' | 'start_stopwatch' | 'start_break' | 'sync_partner' | 'stop'
  focus_minutes?: number
  break_minutes?: number
  goal_text?: string
}

export function StudyPomodoroBar({
  myAccount,
  names,
  members,
  timers,
  today,
  recentGoals,
  serverOffsetMs,
  busy,
  onCommand,
  onTimerExpire,
}: {
  myAccount: StudyAccount
  names: { bear: string; her: string }
  members: StudyMember[]
  timers: { bear: StudyTimer; her: StudyTimer }
  today: StudyRangeSummary | null
  recentGoals: string[]
  serverOffsetMs: number
  busy: boolean
  onCommand: (payload: TimerCommandPayload) => void
  onTimerExpire: () => void
}) {
  const partnerAcc: StudyAccount = myAccount === 'bear' ? 'her' : 'bear'
  const myTimer = timers[myAccount]
  const partnerTimer = timers[partnerAcc]
  const [preset, setPreset] = useState<PresetId>('25-5')
  const [customFocus, setCustomFocus] = useState(35)
  const [customBreak, setCustomBreak] = useState(8)
  const [goalInput, setGoalInput] = useState(myTimer.goal_text || '')

  const presentSet = new Set(members.map((m) => m.account))
  const partnerActive =
    partnerTimer.phase === 'focusing' ||
    partnerTimer.phase === 'resting' ||
    partnerTimer.phase === 'stopwatch'
  const alreadySynced =
    partnerActive &&
    myTimer.phase === partnerTimer.phase &&
    (partnerTimer.phase === 'stopwatch' ||
      Math.abs(myTimer.ends_at_ms - partnerTimer.ends_at_ms) < 2000)

  function handleStart() {
    const cleanGoal = goalInput.trim().slice(0, 24)
    if (preset === 'stopwatch') {
      onCommand({ action: 'start_stopwatch', goal_text: cleanGoal })
      return
    }
    const found = PRESETS.find((p) => p.id === preset) ?? PRESETS[0]
    const focusMins = preset === 'custom' ? Math.max(10, Math.min(120, customFocus || 25)) : found.focus
    const breakMins = preset === 'custom' ? Math.max(0, Math.min(30, customBreak || 5)) : found.rest
    onCommand({
      action: 'start_focus',
      focus_minutes: focusMins,
      break_minutes: breakMins,
      goal_text: cleanGoal,
    })
  }

  return (
    <section className="study-pomo px-panel-compact" aria-label="双人番茄钟控制台">
      <div className="study-seats-grid">
        {([myAccount, partnerAcc] as const).map((acc) => {
          const t = timers[acc]
          const isMe = acc === myAccount
          const inRoom = presentSet.has(acc)
          const active = t.phase === 'focusing' || t.phase === 'stopwatch'
          return (
            <div
              key={acc}
              className={`study-seat-card${active ? ' is-focusing' : ''}${t.phase === 'resting' ? ' is-resting' : ''}`}
            >
              <div className="study-seat-head">
                <div className="px-portrait-box study-seat-avatar">
                  <CharacterPortrait character={acc} size={28} />
                </div>
                <div className="study-seat-meta">
                  <div className="study-seat-name-row">
                    <span className="study-seat-name">{names[acc]}</span>
                    <span className={`study-presence-dot${inRoom ? ' is-online' : ''}`} title={inRoom ? '在书房内' : '暂未进屋'} />
                  </div>
                  <span className="study-seat-phase">{inRoom || t.phase !== 'idle' ? PHASE_COPY[t.phase] : '暂未入座'}</span>
                </div>
                <StudyTimerReadout
                  timer={t}
                  serverOffsetMs={serverOffsetMs}
                  className="study-seat-clock"
                  onExpire={isMe ? onTimerExpire : undefined}
                />
              </div>
              {t.goal_text && t.phase !== 'idle' && (
                <div className="study-seat-goal" title={t.goal_text}>
                  目标：{t.goal_text}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {myTimer.phase === 'idle' ? (
        <div className="study-setup">
          <div className="study-preset-row" role="radiogroup" aria-label="计时档位">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset === p.id}
                className={`study-chip${preset === p.id ? ' is-active' : ''}`}
                onClick={() => setPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="study-custom-row">
              <label className="study-num-field">
                <span>专注(分)</span>
                <input
                  type="number"
                  className="px-input study-num-input"
                  min={10}
                  max={120}
                  value={customFocus}
                  onChange={(e) => setCustomFocus(Number(e.target.value))}
                />
              </label>
              <label className="study-num-field">
                <span>休息(分)</span>
                <input
                  type="number"
                  className="px-input study-num-input"
                  min={0}
                  max={30}
                  value={customBreak}
                  onChange={(e) => setCustomBreak(Number(e.target.value))}
                />
              </label>
            </div>
          )}

          <div className="study-goal-row">
            <input
              type="text"
              className="px-input study-goal-input"
              maxLength={24}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="这轮小目标（选填，如：看文献第3章）"
            />
            {recentGoals.length > 0 && (
              <div className="study-recent-goals">
                {recentGoals.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className="study-goal-pill"
                    onClick={() => setGoalInput(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="study-action-row">
            <button
              type="button"
              className="px-btn px-btn-accent px-btn-sm study-primary-btn"
              disabled={busy}
              onClick={handleStart}
            >
              <PixelIcon name="clock" size={16} />
              <span>{preset === 'stopwatch' ? '开启自由计时' : '开始专注'}</span>
            </button>
            {partnerActive && !alreadySynced && (
              <button
                type="button"
                className="px-btn px-btn-sm"
                disabled={busy}
                onClick={() =>
                  onCommand({ action: 'sync_partner', goal_text: goalInput.trim().slice(0, 24) })
                }
              >
                <PixelIcon name="heart" size={16} />
                <span>跟随{names[partnerAcc]}的节奏</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="study-running-bar">
          <div className="study-running-hint">
            {myTimer.phase === 'resting'
              ? '小憩片刻，起来伸个懒腰喝口水吧'
              : '满 5 分钟自动记入共学足迹 · 随时结束零负担'}
          </div>
          <div className="study-action-row">
            {(myTimer.phase === 'focusing' || myTimer.phase === 'stopwatch') && (
              <button
                type="button"
                className="px-btn px-btn-sm"
                disabled={busy}
                onClick={() => onCommand({ action: 'start_break', break_minutes: myTimer.break_minutes || 5 })}
              >
                <span>提前休息</span>
              </button>
            )}
            {myTimer.phase === 'resting' && (
              <button
                type="button"
                className="px-btn px-btn-accent px-btn-sm"
                disabled={busy}
                onClick={() =>
                  onCommand({
                    action: 'start_focus',
                    focus_minutes: myTimer.focus_minutes || 25,
                    break_minutes: myTimer.break_minutes || 5,
                    goal_text: myTimer.goal_text,
                  })
                }
              >
                <PixelIcon name="clock" size={16} />
                <span>开启下一轮</span>
              </button>
            )}
            {partnerActive && !alreadySynced && (
              <button
                type="button"
                className="px-btn px-btn-sm"
                disabled={busy}
                onClick={() => onCommand({ action: 'sync_partner', goal_text: myTimer.goal_text })}
              >
                <PixelIcon name="heart" size={16} />
                <span>同频对齐</span>
              </button>
            )}
            <button
              type="button"
              className="px-btn px-btn-sm"
              disabled={busy}
              onClick={() => onCommand({ action: 'stop' })}
            >
              <span>{myTimer.phase === 'resting' ? '结束休息' : '结束本轮'}</span>
            </button>
          </div>
        </div>
      )}

      {today && (
        <div className="study-stats-strip">
          <span>今日共学：{names.bear} {today.bear_minutes} 分钟 · {names.her} {today.her_minutes} 分钟</span>
          {today.together_count > 0 && <span className="study-together-badge">同席 {today.together_count} 轮</span>}
        </div>
      )}
    </section>
  )
}
