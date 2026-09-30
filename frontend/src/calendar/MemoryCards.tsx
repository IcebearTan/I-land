import { useEffect } from 'react'
import { CharacterPortrait } from '../components/CharacterPortrait'
import { islanderName, useIslanders } from '../islanders'
import { fileUrl, formatMoment, memoryTitle } from './memories'
import type { MemoryRecord, WeatherId } from './memories'
import { WEATHERS } from './memories'

interface CardsProps {
  memories: MemoryRecord[]
  busy: boolean
  onDelete: (memory: MemoryRecord) => void
  onEdit: (memory: MemoryRecord) => void
  onOpenPhoto: (memory: MemoryRecord, index: number) => void
}

/** 日视图的记忆卡列表：拍立得照片条 + 描述 + 心情天气 + 创建/修改信息。 */
export function MemoryCards({ memories, busy, onDelete, onEdit, onOpenPhoto }: CardsProps) {
  useIslanders()
  return <div className="memory-cards">
    {memories.map(memory => {
      const weather = memory.weather.type ? WEATHERS[memory.weather.type as WeatherId] : null
      return <article className="memory-card" key={memory.id}>
        {memory.attachments.length > 0 && <div className="memory-card-photos" aria-label={`${memory.attachments.length} 张照片`}>
          {memory.attachments.map((id, index) => <button key={id} className="memory-card-photo" onClick={() => onOpenPhoto(memory, index)} aria-label={`查看第 ${index + 1} 张大图`}>
            <img src={fileUrl(id, 'thumb')} alt={`${memoryTitle(memory)}，第 ${index + 1} 张照片`} loading="lazy" />
          </button>)}
          {memory.attachments.length > 1 && <span className="memory-card-photo-count num" aria-hidden="true">×{memory.attachments.length}</span>}
        </div>}
        <div className="memory-card-copy">
          <h4>{memoryTitle(memory)}</h4>
          {memory.description && <p>{memory.description}</p>}
          <div className="memory-card-meta">
            <span className="memory-card-author"><CharacterPortrait character={memory.created_by === 'her' ? 'her' : 'bear'} size={22} />{islanderName(memory.created_by)}记下</span>
            {memory.mood && <span aria-label={`心情 ${memory.mood}`}>{memory.mood}</span>}
            {weather && <span aria-label={`天气 ${weather.label}`}>{weather.icon}{memory.weather.note ? ` ${memory.weather.note}` : ''}</span>}
            {memory.location && <span>📍 {memory.location}</span>}
          </div>
          <div className="memory-card-time">
            <time>{formatMoment(memory.created_at)}</time>
            {memory.updated_at && <span>{islanderName(memory.updated_by)}改于 {formatMoment(memory.updated_at)}</span>}
          </div>
          <div className="memory-card-actions">
            <button className="text-button" onClick={() => onEdit(memory)} disabled={busy}>编辑</button>
            <button className="text-button" onClick={() => onDelete(memory)} disabled={busy}>删除</button>
          </div>
        </div>
      </article>
    })}
  </div>
}

interface ViewerProps {
  memory: MemoryRecord
  index: number
  onIndex: (index: number) => void
  onClose: () => void
}

/** 大图浏览：逐张切换，键盘 ←/→/Esc，触摸滑动交给浏览器默认滚动条。 */
export function PhotoViewer({ memory, index, onIndex, onClose }: ViewerProps) {
  const total = memory.attachments.length
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      else if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      else if (event.key === 'ArrowRight' && index < total - 1) onIndex(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, total, onIndex, onClose])

  return <div className="memory-viewer" role="dialog" aria-modal="true" aria-label="照片大图" onClick={onClose}>
    <div className="memory-viewer-stage" onClick={event => event.stopPropagation()}>
      <img key={memory.attachments[index]} src={fileUrl(memory.attachments[index], 'original')} alt={`${memoryTitle(memory)}，第 ${index + 1} 张照片`} />
      <div className="memory-viewer-bar">
        <button className="cal-secondary" onClick={onClose} aria-label="关闭大图">✕ 关闭</button>
        <span className="num" aria-live="polite">{index + 1} / {total}</span>
        <span>
          <button className="cal-secondary" disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="上一张">‹</button>
          <button className="cal-secondary" disabled={index >= total - 1} onClick={() => onIndex(index + 1)} aria-label="下一张">›</button>
        </span>
      </div>
    </div>
  </div>
}
