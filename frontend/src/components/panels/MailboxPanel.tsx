import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { eventBus } from '../../game/EventBus'
import type { Letter } from '../../types'

/** 邮箱面板：走近邮筒按 E 触发（OPEN_MAILBOX），关闭时通知游戏层恢复操控 */
export function MailboxPanel() {
  const [open, setOpen] = useState(false)
  const [letters, setLetters] = useState<Letter[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      eventBus.emit('PANEL_OPENED', { panel: 'mailbox' })
      setLetters(null)
      setError('')
      api<{ letters: Letter[] }>('/api/letters')
        .then((r) => setLetters(r.letters))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : '取信失败'))
    }
    eventBus.on('OPEN_MAILBOX', onOpen)
    return () => eventBus.off('OPEN_MAILBOX', onOpen)
  }, [])

  function close() {
    setOpen(false)
    eventBus.emit('PANEL_CLOSED', { panel: 'mailbox' })
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div className="modal-mask" onClick={close}>
      <div className="wood-panel modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>📮 信箱</h2>
          <button className="btn btn-mini" onClick={close}>
            合上 ✕
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        {letters === null && !error && <p className="loading">翻信中…</p>}
        {letters !== null && letters.length === 0 && (
          <p className="empty">信箱还空着，M2 会把 IcebearMailbox 的信都搬进来，并让你们互相写信 ✉</p>
        )}
        <ul className="letter-list">
          {letters?.map((letter) => (
            <li key={letter.id} className="letter-item">
              <div className="letter-meta">
                <span className={`author-chip ${letter.author}`}>{letter.author === 'bear' ? '🐻 小熊' : '💌 她'}</span>
                <span className="num letter-date">{letter.date}</span>
              </div>
              <div className="letter-title">{letter.title}</div>
              {letter.excerpt && <div className="letter-excerpt">{letter.excerpt}</div>}
              <div className="letter-pages num">{letter.pages.length} 页信纸</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
