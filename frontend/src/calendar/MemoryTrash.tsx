import { CharacterPortrait } from '../components/CharacterPortrait'
import { islanderName, useIslanders } from '../islanders'
import { fileUrl, formatMoment, memoryTitle } from './memories'
import type { MemoryRecord } from './memories'

interface TrashProps {
  items: MemoryRecord[]
  keepDays: number
  loading: boolean
  error: string
  busy: boolean
  onRefresh: () => void
  onRestore: (memory: MemoryRecord) => void
  onBack: () => void
}

/** 「最近删除」：恢复窗口内的软删除记忆，一键还原。 */
export function MemoryTrash({ items, keepDays, loading, error, busy, onRefresh, onRestore, onBack }: TrashProps) {
  useIslanders()
  return <section className="memory-trash">
    <div className="memory-trash-heading">
      <div>
        <p className="panel-eyebrow">RECENTLY DELETED</p>
        <h3>最近删除 <small>删除 {keepDays} 天内可找回</small></h3>
      </div>
      <div className="memory-trash-actions">
        <button className="text-button" onClick={onRefresh} disabled={loading}>刷新</button>
        <button className="cal-secondary" onClick={onBack}>回到日历</button>
      </div>
    </div>
    {error && <div className="calendar-error" role="alert">{error}<button className="text-button" onClick={onRefresh}>重试</button></div>}
    {loading && <p className="calendar-loading" role="status">正在翻找…</p>}
    {!loading && !error && items.length === 0 && <div className="countdown-empty memory-trash-empty">
      <h4>回收站是空的</h4>
      <p>删除的记忆会在这里安静躺 {keepDays} 天，随时可以捡回来。</p>
    </div>}
    <ul className="memory-trash-list">
      {items.map(memory => <li key={memory.id}>
        <article className="memory-trash-item">
          {memory.attachments[0] && <img src={fileUrl(memory.attachments[0], 'thumb')} alt="" />}
          <div>
            <h4>{memoryTitle(memory)} <small>{memory.date}</small></h4>
            <p>{memory.description || '（只有照片）'}</p>
            <span className="memory-trash-meta">
              <CharacterPortrait character={memory.created_by === 'her' ? 'her' : 'bear'} size={18} />
              {islanderName(memory.created_by)} · {islanderName(memory.deleted_by)}删于 {formatMoment(memory.deleted_at)} · 还能找回 {memory.days_left} 天
            </span>
          </div>
          <button className="cal-secondary" disabled={busy} onClick={() => onRestore(memory)}>恢复</button>
        </article>
      </li>)}
    </ul>
  </section>
}
