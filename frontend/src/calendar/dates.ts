export type Repeat = 'once' | 'monthly' | 'yearly'
export interface CalendarDate { date: string; repeat: Repeat }
const DAY = 86_400_000
export function localDateKey(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
export function dateParts(key: string): [number, number, number] { return key.split('-').map(Number) as [number, number, number] }
export function dayNumber(key: string): number { const [y, m, d] = dateParts(key); return Date.UTC(y, m - 1, d) / DAY }
export function daysBetween(from: string, to: string): number { return dayNumber(to) - dayNumber(from) }
export function daysInMonth(year: number, month: number): number { return new Date(Date.UTC(year, month, 0)).getUTCDate() }
export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
export function validDate(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const [y, m, d] = dateParts(key)
  return y >= 1900 && y <= 2199 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}
/** 月末日期回落到当月最后一天；2 月 29 日在平年落于 2 月 28 日。 */
export function occursOn(event: CalendarDate, key: string): boolean {
  if (!validDate(event.date) || !validDate(key) || key < event.date) return false
  if (event.repeat === 'once') return event.date === key
  const [, originalMonth, originalDay] = dateParts(event.date), [year, month, day] = dateParts(key)
  return (event.repeat === 'monthly' || month === originalMonth) && day === Math.min(originalDay, daysInMonth(year, month))
}
export function nextOccurrence(event: CalendarDate, from: string): string | null {
  if (!validDate(event.date) || !validDate(from)) return null
  if (event.date >= from) return event.date
  if (event.repeat === 'once') return null
  const [, originalMonth, originalDay] = dateParts(event.date)
  let [year, month] = dateParts(from)
  if (event.repeat === 'yearly') month = originalMonth
  let next = dateKey(year, month, Math.min(originalDay, daysInMonth(year, month)))
  if (next < from) {
    if (event.repeat === 'yearly') year++
    else { month++; if (month > 12) { month = 1; year++ } }
    next = dateKey(year, month, Math.min(originalDay, daysInMonth(year, month)))
  }
  return next
}
export function shiftMonth(key: string, delta: number): string {
  const [year, month] = dateParts(key), d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}
export function monthCells(monthKey: string): string[] {
  const [year, month] = dateParts(monthKey)
  const start = Date.UTC(year, month - 1, 1), offset = (new Date(start).getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => new Date(start + (i - offset) * DAY).toISOString().slice(0, 10))
}
