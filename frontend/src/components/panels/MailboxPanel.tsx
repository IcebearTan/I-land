import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import { eventBus } from '../../game/EventBus'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { islanderName, useIslanders } from '../../islanders'
import type { Letter, User } from '../../types'
import { CharacterPortrait } from '../CharacterPortrait'
import { LETTER_THEMES, LetterComposer } from './LetterComposer'
import { LetterReader } from './LetterReader'
import './mailbox.css'

/** 小屋信箱：收信列表 · 拆火漆读信 · 提笔写信（文字 + 手写信纸图片双修）。 */
export function MailboxPanel({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'list' | 'read' | 'compose'>('list')
  const [letters, setLetters] = useState<Letter[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<Letter | null>(null)
  const [unsealed, setUnsealed] = useState(false)
  const [composeDirty, setComposeDirty] = useState(false)
  const islanders = useIslanders()
  const currentAccount = user.account === 'her' ? 'her' : 'bear'
  const recipient = currentAccount === 'her' ? islanders.bear : islanders.her

  const syncUnread = useCallback((list: Letter[]) => {
    const count = list.filter((item) => item.unread).length
    eventBus.emit('MAILBOX_UNREAD_CHANGED', { count })
  }, [])

  function close() {
    setOpen(false)
    setMode('list')
    setSelected(null)
    setUnsealed(false)
    setNotice('')
    eventBus.emit('PANEL_CLOSED', { panel: 'mailbox' })
  }

  function handleMaskClick() {
    if (mode === 'compose' && composeDirty) {
      setNotice('草稿已自动保存在本机，点右上角「合上」或「先存草稿返回」可以安心离开。')
      return
    }
    close()
  }

  const dialog = useDialogFocus(open, close)

  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      setMode('list')
      setSelected(null)
      setUnsealed(false)
      setNotice('')
      eventBus.emit('PANEL_OPENED', { panel: 'mailbox' })
    }
    eventBus.on('OPEN_MAILBOX', onOpen)
    return () => eventBus.off('OPEN_MAILBOX', onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLetters(null)
    setError('')
    api<{ letters: Letter[]; unread_count?: number }>('/api/letters', { signal: controller.signal })
      .then((r) => {
        if (controller.signal.aborted) return
        setLetters(r.letters)
        syncUnread(r.letters)
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : '取信失败')
        }
      })
    return () => controller.abort()
  }, [open, retry, syncUnread])

  useEffect(() => {
    if (mode === 'read' && selected) {
      dialog.current?.querySelector<HTMLButtonElement>('.text-button')?.focus()
    }
  }, [mode, selected, unsealed, dialog])

  if (!open) return null

  function handleLetterSent(created: Letter) {
    setLetters((prev) => {
      const next = [created, ...(prev ?? [])].sort((a, b) =>
        b.date !== a.date ? b.date.localeCompare(a.date) : b.id - a.id,
      )
      syncUnread(next)
      return next
    })
    setMode('list')
    setNotice(`信已封蜡放进小屋信箱，等${recipient}上岛拆开。`)
  }

  function handleMarkedRead(updated: Letter) {
    setSelected(updated)
    setLetters((prev) => {
      if (!prev) return prev
      const next = prev.map((item) => (item.id === updated.id ? updated : item))
      syncUnread(next)
      return next
    })
  }

  function handleDeleted(letterId: number) {
    setSelected(null)
    setUnsealed(false)
    setMode('list')
    setLetters((prev) => {
      if (!prev) return prev
      const next = prev.filter((item) => item.id !== letterId)
      syncUnread(next)
      return next
    })
    setNotice('这封信已经从信箱里收回了。')
  }

  const heading =
    mode === 'compose'
      ? `给${recipient}写一封信`
      : mode === 'read' && selected
        ? unsealed
          ? selected.title
          : '一封给你的信'
        : '小屋信箱'

  const readingWide = mode === 'read' && unsealed && Boolean(selected?.pages.length)

  return (
    <div className="modal-mask mailbox-mask" onClick={handleMaskClick}>
      <div
        ref={dialog}
        className={`wood-panel modal-panel mailbox-panel ${readingWide ? 'mailbox-panel--reading' : ''} ${selected?.theme === 'qixi' ? 'mailbox-panel--qixi' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mailbox-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="panel-eyebrow">LETTERS BETWEEN US</p>
            <h2 id="mailbox-title">{heading}</h2>
          </div>
          <div className="mailbox-head-actions">
            {mode === 'list' && (
              <button
                type="button"
                className="btn btn-primary btn-mini"
                onClick={() => {
                  setNotice('')
                  setMode('compose')
                }}
              >
                提笔写信
              </button>
            )}
            <button type="button" className="btn btn-mini" onClick={close}>
              合上 ✕
            </button>
          </div>
        </div>

        {notice && (
          <p className="mailbox-notice" role="status">
            {notice}
          </p>
        )}

        {mode === 'compose' ? (
          <LetterComposer
            user={user}
            onCancel={() => {
              setNotice('')
              setMode('list')
            }}
            onSent={handleLetterSent}
            onDirtyChange={setComposeDirty}
          />
        ) : mode === 'read' && selected ? (
          <LetterReader
            letter={selected}
            currentAccount={currentAccount}
            unsealed={unsealed}
            onUnseal={() => setUnsealed(true)}
            onBack={() => {
              setSelected(null)
              setUnsealed(false)
              setMode('list')
            }}
            onMarkedRead={handleMarkedRead}
            onDeleted={handleDeleted}
          />
        ) : (
          <>
            <div className="mailbox-shelf-heading">
              <p className="mailbox-intro">把平时没说完的话，留给彼此慢慢读。</p>
              {letters && <span>{letters.length} 封信件</span>}
            </div>
            {error && (
              <div role="alert">
                <p className="form-error">{error}</p>
                <button type="button" className="text-button" onClick={() => setRetry((v) => v + 1)}>
                  再取一次信
                </button>
              </div>
            )}
            {letters === null && !error && (
              <p className="loading" role="status">
                正在取信…
              </p>
            )}
            {letters?.length === 0 && (
              <div className="letter-empty">
                <div className="paper-envelope" aria-hidden="true">
                  ♥
                </div>
                <p>把想念，留在一封信里。</p>
                <span>点右上角「提笔写信」，投出你们在岛上的第一封信吧。</span>
              </div>
            )}
            <ul className="letter-list">
              {letters?.map((letter) => {
                const themeMeta = LETTER_THEMES.find((t) => t.id === letter.theme)
                const themeClass =
                  letter.theme && ['seaside', 'blossom', 'qixi'].includes(letter.theme)
                    ? `letter-card--${letter.theme}`
                    : ''
                const formatParts: string[] = []
                if (themeMeta?.badge) formatParts.push(themeMeta.badge)
                if (letter.body.trim()) formatParts.push('文字信纸')
                if (letter.pages.length) formatParts.push(`${letter.pages.length} 页信纸图`)
                if (formatParts.length === 0) formatParts.push('文字来信')
                return (
                  <li key={letter.id}>
                    <button
                      type="button"
                      className={`letter-card ${themeClass} ${letter.unread ? 'letter-card--unread' : ''}`}
                      onClick={() => {
                        setSelected(letter)
                        setUnsealed(false)
                        setNotice('')
                        setMode('read')
                      }}
                    >
                      <CharacterPortrait
                        character={letter.author === 'her' ? 'her' : 'bear'}
                        size={36}
                      />
                      <span className="letter-card-copy">
                        <span className="letter-meta">
                          <span>
                            {islanderName(letter.author)}寄来的信
                            {letter.unread && <span className="letter-unread-pill">未拆</span>}
                          </span>
                          <time>{letter.date}</time>
                        </span>
                        <strong>{letter.title}</strong>
                        <span className="letter-excerpt">
                          {letter.excerpt || '拆开火漆，慢慢读给你听。'}
                        </span>
                        <span className="letter-card-details">{formatParts.join(' · ')}</span>
                      </span>
                      <span className="letter-card-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
