import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

function loadTs(relPath) {
  const source = fs.readFileSync(new URL(relPath, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

const { nextOccurrence, occursOn, daysBetween, monthCells, shiftMonth, validDate } = await loadTs('../src/calendar/dates.ts')
const { fileUrl, formatMoment, memoryTitle } = await loadTs('../src/calendar/memories.ts')
test('once: today, future and past', () => {
  const event = { date: '2026-09-22', repeat: 'once' }
  assert.equal(nextOccurrence(event, '2026-09-22'), '2026-09-22')
  assert.equal(nextOccurrence(event, '2026-09-23'), null)
  assert.equal(daysBetween('2026-09-22', event.date), 0)
})
test('yearly recurrence clamps leap day without losing original date', () => {
  const event = { date: '2024-02-29', repeat: 'yearly' }
  assert.equal(nextOccurrence(event, '2025-01-01'), '2025-02-28')
  assert.equal(nextOccurrence(event, '2027-03-01'), '2028-02-29')
  assert.ok(occursOn(event, '2025-02-28'))
  assert.ok(!occursOn(event, '2024-02-28'))
  assert.ok(!occursOn(event, '2028-02-28'))
})
test('monthly recurrence respects short months and year boundary', () => {
  const event = { date: '2024-01-31', repeat: 'monthly' }
  assert.equal(nextOccurrence(event, '2024-02-01'), '2024-02-29')
  assert.equal(nextOccurrence(event, '2025-02-01'), '2025-02-28')
  assert.equal(nextOccurrence(event, '2025-03-01'), '2025-03-31')
  assert.equal(nextOccurrence({date:'2024-01-15',repeat:'monthly'}, '2025-12-16'), '2026-01-15')
})
test('future start date never produces an occurrence before it', () => {
  assert.equal(nextOccurrence({date:'2028-12-31',repeat:'monthly'}, '2026-09-22'), '2028-12-31')
  assert.equal(occursOn({date:'2028-12-31',repeat:'yearly'}, '2026-12-31'), false)
})
test('calendar days are independent of DST and cross-year boundaries', () => {
  assert.equal(daysBetween('2026-03-08', '2026-03-09'), 1)
  assert.equal(daysBetween('2026-11-01', '2026-11-02'), 1)
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1)
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2)
})
test('Monday-first grid and navigation', () => {
  const cells = monthCells('2026-09-01')
  assert.equal(cells.length, 42)
  assert.equal(cells[0], '2026-08-31')
  assert.equal(cells[41], '2026-10-11')
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01')
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01')
})
test('invalid dates fail closed', () => {
  for (const date of ['', 'bad', '2026-02-29', '2026-13-01', '2026-01-32', '1899-01-01']) assert.equal(validDate(date), false)
  assert.equal(nextOccurrence({date:'',repeat:'yearly'}, '2026-09-22'), null)
})

test('memory helpers: title fallback never forces a name', () => {
  assert.equal(memoryTitle({ title: '  海边  ', description: '' }), '海边')
  assert.equal(memoryTitle({ title: '', description: '今天路过一家很香的花店' }), '今天路过一家很香的花店')
  assert.equal(memoryTitle({ title: '', description: 'x'.repeat(30) }), 'x'.repeat(18) + '…')
  assert.equal(memoryTitle({ title: ' ', description: '' }), '这一天的一张照片')
})

test('memory helpers: attachment file urls', () => {
  assert.equal(fileUrl('abc123', 'thumb'), '/api/files/abc123/thumb')
  assert.equal(fileUrl('abc123', 'original'), '/api/files/abc123/original')
})

test('memory helpers: UTC timestamps render in local calendar terms', () => {
  // 本地时区无关的稳定性：无时区标记的 iso 按_utc 处理补 Z，不产生 Invalid Date
  const text = formatMoment('2026-09-28T08:30:00')
  assert.match(text, /^\d+ 月 \d+ 日 \d\d:\d\d$/)
  assert.equal(formatMoment(null), '')
  assert.equal(formatMoment('not-a-date'), '')
})
