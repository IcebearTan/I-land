import { useEffect, useRef, useState } from 'react'
import { api, uploadImage } from '../api/client'
import { PixelIcon } from '../components/PixelIcon'
import type {
  StudyAccount,
  StudyAttachment,
  StudyMessageItem,
  StudyNudgeEvent,
  StudyNudgeKind,
  StudyPhase,
  StudySnapshot,
} from './types'

const NUDGES: Array<{ kind: StudyNudgeKind; label: string }> = [
  { kind: 'tea', label: '递杯热茶' },
  { kind: 'pat', label: '摸摸头' },
  { kind: 'poke', label: '戳一下' },
  { kind: 'flower', label: '送朵小花' },
]

function shortTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function mergeMessages(prev: StudyMessageItem[], incoming: StudyMessageItem[]): StudyMessageItem[] {
  const map = new Map<number, StudyMessageItem>()
  for (const item of prev) map.set(item.id, item)
  for (const item of incoming) map.set(item.id, item)
  return Array.from(map.values()).sort((a, b) => a.id - b.id)
}

export function StudyChatPanel({
  myAccount,
  myPhase,
  latestMessageId,
  lastNudge,
  collapsed,
  onToggleCollapse,
  onSyncSnapshot,
}: {
  myAccount: StudyAccount
  myPhase: StudyPhase
  latestMessageId: number
  lastNudge: StudyNudgeEvent | null
  collapsed: boolean
  onToggleCollapse: () => void
  onSyncSnapshot: (snap: StudySnapshot) => void
}) {
  const [messages, setMessages] = useState<StudyMessageItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [draft, setDraft] = useState('')
  const [pendingAtt, setPendingAtt] = useState<StudyAttachment | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [nudgeCooldown, setNudgeCooldown] = useState(0)
  const [nudgeBanner, setNudgeBanner] = useState<string | null>(null)
  const [unreadPreview, setUnreadPreview] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<StudyAttachment | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const maxIdRef = useRef(0)
  const seenNudgeRef = useRef<number | null>(null)
  const prevPhaseRef = useRef<StudyPhase>(myPhase)

  const scrollToBottom = () => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    api<{ messages: StudyMessageItem[]; has_more: boolean; latest_message_id: number }>('/api/study/messages?limit=40')
      .then((res) => {
        setMessages(res.messages)
        setHasMore(res.has_more)
        maxIdRef.current = Math.max(res.latest_message_id, ...res.messages.map((m) => m.id), 0)
        window.requestAnimationFrame(scrollToBottom)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (latestMessageId <= maxIdRef.current) return
    const cursor = maxIdRef.current
    api<{ messages: StudyMessageItem[] }>(`/api/study/messages?after_id=${cursor}&limit=60`)
      .then((res) => {
        if (!res.messages.length) return
        maxIdRef.current = Math.max(maxIdRef.current, ...res.messages.map((m) => m.id))
        const el = listRef.current
        const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 96
        setMessages((prev) => mergeMessages(prev, res.messages))
        const last = res.messages[res.messages.length - 1]
        if (last.sender !== myAccount && (collapsed || (myPhase === 'focusing' && !nearBottom))) {
          setUnreadPreview(`${last.sender_display}：${last.body || '[发来一张截图]'}`)
        }
        if (nearBottom || last.sender === myAccount) {
          window.requestAnimationFrame(scrollToBottom)
        }
      })
      .catch(() => {})
  }, [latestMessageId, myAccount, myPhase, collapsed])

  useEffect(() => {
    if (prevPhaseRef.current !== 'resting' && myPhase === 'resting') {
      setUnreadPreview(null)
      if (collapsed) onToggleCollapse()
    }
    prevPhaseRef.current = myPhase
  }, [myPhase, collapsed, onToggleCollapse])

  useEffect(() => {
    if (!lastNudge) {
      if (seenNudgeRef.current === null) seenNudgeRef.current = 0
      return
    }
    if (seenNudgeRef.current !== null && lastNudge.seq > seenNudgeRef.current) {
      const text =
        lastNudge.from_account === myAccount
          ? `已轻轻送出「${lastNudge.label}」`
          : `${lastNudge.from_display}悄悄给你「${lastNudge.label}」`
      setNudgeBanner(text)
      const t = window.setTimeout(() => setNudgeBanner(null), 4200)
      seenNudgeRef.current = lastNudge.seq
      return () => window.clearTimeout(t)
    }
    seenNudgeRef.current = lastNudge.seq
  }, [lastNudge, myAccount])

  useEffect(() => {
    if (nudgeCooldown <= 0) return
    const id = window.setInterval(() => setNudgeCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [nudgeCooldown])

  async function handleLoadOlder() {
    if (!messages.length || loadingMore) return
    setLoadingMore(true)
    try {
      const oldest = messages[0].id
      const res = await api<{ messages: StudyMessageItem[]; has_more: boolean }>(
        `/api/study/messages?before_id=${oldest}&limit=30`,
      )
      setMessages((prev) => mergeMessages(res.messages, prev))
      setHasMore(res.has_more)
    } catch {
      // ignore transient error
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleUploadFile(file: File) {
    setError('')
    setUploadPct(0)
    try {
      const { promise } = uploadImage<{ attachment: StudyAttachment }>('/api/uploads', file, (f) =>
        setUploadPct(Math.round(f * 100)),
      )
      const res = await promise
      setPendingAtt(res.attachment)
    } catch (err) {
      setError(err instanceof Error ? err.message : '截图上传失败')
    } finally {
      setUploadPct(null)
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if ((!body && !pendingAtt) || sending || uploadPct !== null) return
    setSending(true)
    setError('')
    const cid = `study-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    try {
      const res = await api<{ message: StudyMessageItem; snapshot?: StudySnapshot }>('/api/study/messages', {
        method: 'POST',
        body: JSON.stringify({ body, attachment_id: pendingAtt?.id ?? '', client_id: cid }),
      })
      maxIdRef.current = Math.max(maxIdRef.current, res.message.id)
      setMessages((prev) => mergeMessages(prev, [res.message]))
      setDraft('')
      setPendingAtt(null)
      if (res.snapshot) onSyncSnapshot(res.snapshot)
      window.requestAnimationFrame(scrollToBottom)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请重试')
    } finally {
      setSending(false)
    }
  }

  async function handleDeleteMessage(id: number) {
    try {
      await api(`/api/study/messages/${id}`, { method: 'DELETE' })
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch {
      // ignore
    }
  }

  async function handleNudge(kind: StudyNudgeKind) {
    if (nudgeCooldown > 0) return
    setError('')
    try {
      const res = await api<{ snapshot?: StudySnapshot }>('/api/study/nudge', {
        method: 'POST',
        body: JSON.stringify({ kind }),
      })
      setNudgeCooldown(15)
      if (res.snapshot) onSyncSnapshot(res.snapshot)
    } catch (err) {
      setError(err instanceof Error ? err.message : '轻互动稍后再试')
    }
  }

  return (
    <section className={`study-chat px-panel-compact${collapsed ? ' is-collapsed' : ''}`} aria-label="书房专属轻聊">
      <div className="study-chat-head">
        <div className="study-chat-title">
          <PixelIcon name="chat" size={16} />
          <span>书房轻聊</span>
          {myPhase === 'focusing' && <span className="study-dnd-tag">专注柔光免打扰</span>}
          {unreadPreview && <span className="study-unread-dot" aria-hidden="true" />}
        </div>
        <button
          type="button"
          className="study-collapse-btn"
          onClick={() => {
            setUnreadPreview(null)
            onToggleCollapse()
          }}
        >
          {collapsed ? '展开聊天' : '收起'}
        </button>
      </div>

      {nudgeBanner && <div className="study-nudge-toast" role="status">{nudgeBanner}</div>}
      {unreadPreview && collapsed && (
        <button
          type="button"
          className="study-unread-strip"
          onClick={() => {
            setUnreadPreview(null)
            onToggleCollapse()
          }}
        >
          {unreadPreview}
        </button>
      )}

      {!collapsed && (
        <>
          <div className="study-nudge-bar" aria-label="桌边零打字轻互动">
            {NUDGES.map((item) => (
              <button
                key={item.kind}
                type="button"
                className="study-nudge-btn"
                disabled={nudgeCooldown > 0}
                onClick={() => handleNudge(item.kind)}
              >
                {item.label}
              </button>
            ))}
            {nudgeCooldown > 0 && <span className="study-nudge-cd">{nudgeCooldown}s</span>}
          </div>

          <div
            ref={listRef}
            className="study-msg-list"
            onScroll={() => {
              const el = listRef.current
              if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) setUnreadPreview(null)
            }}
          >
            {hasMore && (
              <button type="button" className="study-older-btn" disabled={loadingMore} onClick={handleLoadOlder}>
                {loadingMore ? '翻阅中…' : '翻看更早的书房便签'}
              </button>
            )}
            {messages.length === 0 ? (
              <p className="study-chat-empty">不用切出去看微信啦，遇到难题截张图或留句话在这儿就好。</p>
            ) : (
              messages.map((m) => {
                const mine = m.sender === myAccount
                return (
                  <article key={m.id} className={`study-msg${mine ? ' is-mine' : ' is-partner'}`}>
                    <header className="study-msg-meta">
                      <span>{m.sender_display}</span>
                      <span>{shortTime(m.created_at)}</span>
                      {mine && (
                        <button type="button" className="study-msg-del" onClick={() => handleDeleteMessage(m.id)}>
                          撤回
                        </button>
                      )}
                    </header>
                    {m.body && <p className="study-msg-body">{m.body}</p>}
                    {m.attachment && (
                      <button
                        type="button"
                        className="study-msg-img-btn"
                        onClick={() => setLightbox(m.attachment)}
                        aria-label="放大查看截图"
                      >
                        <img src={m.attachment.urls.thumb} alt={m.attachment.original_name || '题目截图'} loading="lazy" />
                      </button>
                    )}
                  </article>
                )
              })
            )}
          </div>

          {pendingAtt && (
            <div className="study-att-preview">
              <img src={pendingAtt.urls.thumb} alt="待发送截图" />
              <span>已附截图，可配文字发出</span>
              <button type="button" className="study-msg-del" onClick={() => setPendingAtt(null)}>移除</button>
            </div>
          )}
          {uploadPct !== null && <div className="study-att-preview">正在上传截图 {uploadPct}%…</div>}
          {error && <p className="study-chat-err" role="alert">{error}</p>}

          <form className="study-composer" onSubmit={handleSend}>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void handleUploadFile(f)
              }}
            />
            <button
              type="button"
              className="px-slot study-upload-slot"
              title="上传或粘贴题目截图"
              aria-label="上传题目截图"
              disabled={uploadPct !== null}
              onClick={() => fileRef.current?.click()}
            >
              <PixelIcon name="spark" size={18} />
            </button>
            <textarea
              className="px-input study-chat-input"
              rows={1}
              maxLength={1000}
              value={draft}
              placeholder="说句话，或直接 Ctrl+V 粘贴截图…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 680) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              onPaste={(e) => {
                const items = e.clipboardData?.items
                if (!items) return
                for (const item of items) {
                  if (item.type.startsWith('image/')) {
                    const file = item.getAsFile()
                    if (file) {
                      e.preventDefault()
                      void handleUploadFile(file)
                    }
                    break
                  }
                }
              }}
            />
            <button
              type="submit"
              className="px-btn px-btn-accent px-btn-sm study-send-btn"
              disabled={sending || uploadPct !== null || (!draft.trim() && !pendingAtt)}
            >
              发送
            </button>
          </form>
        </>
      )}

      {lightbox && (
        <div className="modal-mask study-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          <div className="px-panel-compact study-lightbox-box" onClick={(e) => e.stopPropagation()}>
            <div className="study-lightbox-head">
              <span>截图预览</span>
              <button type="button" className="px-slot" onClick={() => setLightbox(null)} aria-label="关闭截图预览">
                <PixelIcon name="close" size={16} />
              </button>
            </div>
            <img src={lightbox.urls.display} alt={lightbox.original_name || '放大截图'} className="study-lightbox-img" />
          </div>
        </div>
      )}
    </section>
  )
}
