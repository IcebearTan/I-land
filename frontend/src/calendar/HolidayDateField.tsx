import { useId, useRef, useState } from 'react'
import { dateParts, localDateKey, monthCells, shiftMonth, validDate } from './dates'
import { HolidayIcon } from './HolidayIcon'

export function HolidayDateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const [month, setMonth] = useState(() => (validDate(value) ? value : localDateKey()).slice(0, 7) + '-01')
  const trigger = useRef<HTMLButtonElement>(null)
  const [year, number] = dateParts(month)
  function pick(key: string) { onChange(key); setExpanded(false); trigger.current?.focus() }
  return <div className="holiday-date-field" onKeyDown={event => {
    if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); trigger.current?.focus() }
  }}>
    <div className="cal-field"><label htmlFor={id}>日期</label>
      <span className="holiday-date-input"><input id={id} type="text" inputMode="text" placeholder="YYYY-MM-DD" required maxLength={10} pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" title="公历日期，格式如 2026-09-22" value={value} onChange={event => onChange(event.target.value)} />
      <button ref={trigger} type="button" aria-label="展开日期小挂历" aria-expanded={expanded} aria-controls={`${id}-picker`} onClick={() => {
        if (!expanded) setMonth((validDate(value) ? value : localDateKey()).slice(0, 7) + '-01')
        setExpanded(!expanded)
      }}><HolidayIcon icon="book" size={19} /></button></span>
    </div>
    {expanded && <div id={`${id}-picker`} className="date-mini" role="group" aria-label="选择节日日期">
      <div className="date-mini-heading"><button type="button" aria-label="日期选择上个月" disabled={month <= '1900-01-01'} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button><strong>{year} 年 {number} 月</strong><button type="button" aria-label="日期选择下个月" disabled={month >= '2199-12-01'} onClick={() => setMonth(shiftMonth(month, 1))}>›</button></div>
      <div className="date-mini-scroll" role="region" aria-label="日期表，可左右滑动" tabIndex={0}>
      <div className="date-mini-week" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="date-mini-grid">{monthCells(month).map(key => <button key={key} type="button" aria-label={`选择 ${key}`} aria-pressed={key === value} disabled={!validDate(key)} className={key.slice(0, 7) !== month.slice(0, 7) ? 'date-mini-outside' : ''} onClick={() => pick(key)}>{dateParts(key)[2]}</button>)}</div>
      </div>
      <button className="text-button" type="button" onClick={() => pick(localDateKey())}>选择今天</button>
      <small>小挂历可左右滑动，也可以直接输入 YYYY-MM-DD。</small>
    </div>}
  </div>
}
