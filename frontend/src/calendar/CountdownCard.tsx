import { daysBetween, nextOccurrence, validDate } from './dates'
import { themeVars, REPEATS, type HolidayDraft } from './design'
import { HolidayIcon } from './HolidayIcon'
export function CountdownCard({ holiday, today, compact = false }: { holiday: HolidayDraft; today: string; compact?: boolean }) {
  const next = nextOccurrence(holiday, today)
  const days = daysBetween(today, next ?? holiday.date)
  const valid = validDate(holiday.date) && Number.isFinite(days)
  return <div className={`countdown-card countdown-card--${holiday.style} ${compact ? 'countdown-card--compact' : ''}`} style={themeVars(holiday.color)}>
    <div className="countdown-decor" aria-hidden="true"><HolidayIcon icon={holiday.icon} size={compact ? 60 : 124} /></div>
    <div className="countdown-top"><span className="holiday-stamp"><HolidayIcon icon={holiday.icon} size={compact ? 18 : 26} /></span><span>{holiday.pinned ? '特别期待' : '我们的小日子'}</span><span className="countdown-spark" aria-hidden="true">✦</span></div>
    <h3>{holiday.name || '给这一天起个名字'}</h3>
    <div className="countdown-number">{valid && days === 0 ? <strong className="countdown-today">就是今天</strong> : <><span>{valid && days < 0 ? '已经' : '还有'}</span><strong className="num">{valid ? Math.abs(days) : '—'}</strong><span>天</span></>}</div>
    <div className="countdown-footer"><time>{(next ?? holiday.date) || '选择一个日期'}</time><span>{REPEATS[holiday.repeat]}</span></div>
    {!compact && <p className="countdown-caption">{valid && days === 0 ? '把今天，过成值得收藏的一页。' : valid && days < 0 ? '日子过去了，记忆一直在。' : '把期待，慢慢写进日子里。'}</p>}
  </div>
}
