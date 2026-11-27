import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { api, uploadImage } from '../../api/client'
import { useIslanders } from '../../islanders'
import type { Letter, User } from '../../types'
import { CharacterPortrait } from '../CharacterPortrait'

export interface UploadedPage {
  url: string
  thumbUrl: string
  name: string
}

interface LetterDraft {
  title: string
  date: string
  excerpt: string
  body: string
  theme: string
  pages: UploadedPage[]
}

export const LETTER_THEMES = [
  { id: 'classic', label: '暖牛皮纸', swatch: '#f0d49b', badge: '' },
  { id: 'seaside', label: '海风蓝笺', swatch: '#c5dfee', badge: '✦ 海风来信' },
  { id: 'blossom', label: '樱粉花笺', swatch: '#f2cfd7', badge: '✦ 花笺寄语' },
  { id: 'qixi', label: '星夜七夕', swatch: '#dcd2eb', badge: '✦ 七夕来信' },
] as const

const MAX_PAGES = 12

function todayIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function draftKey(account: string): string {
  return `iland_letter_draft_v1_${account}`
}

function loadDraft(account: string): LetterDraft {
  try {
    const raw = localStorage.getItem(draftKey(account))
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LetterDraft>
      return {
        title: typeof parsed.title === 'string' ? parsed.title : '',
        date: typeof parsed.date === 'string' && parsed.date ? parsed.date : todayIso(),
        excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt : '',
        body: typeof parsed.body === 'string' ? parsed.body : '',
        theme: typeof parsed.theme === 'string' ? parsed.theme : 'classic',
        pages: Array.isArray(parsed.pages) ? parsed.pages.slice(0, MAX_PAGES) : [],
      }
    }
  } catch {
    // ignore storage failures
  }
  return { title: '', date: todayIso(), excerpt: '', body: '', theme: 'classic', pages: [] }
}

export function LetterComposer({
  user,
  onCancel,
  onSent,
  onDirtyChange,
}: {
  user: User
  onCancel: () => void
  onSent: (letter: Letter) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const account = user.account === 'her' ? 'her' : 'bear'
  const islanders = useIslanders()
  const recipient = account === 'her' ? islanders.bear : islanders.her
  const [draft, setDraft] = useState<LetterDraft>(() => loadDraft(account))
  const [uploading, setUploading] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const hasContent = Boolean(
    draft.title.trim() || draft.excerpt.trim() || draft.body.trim() || draft.pages.length > 0,
  )

  useEffect(() => {
    onDirtyChange(hasContent)
  }, [hasContent, onDirtyChange])

  useEffect(() => {
    try {
      if (hasContent) {
        localStorage.setItem(draftKey(account), JSON.stringify(draft))
      } else {
        localStorage.removeItem(draftKey(account))
      }
    } catch {
      // ignore quota errors
    }
  }, [account, draft, hasContent])

  function patch(partial: Partial<LetterDraft>) {
    setDraft((prev) => ({ ...prev, ...partial }))
    setError('')
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    const remain = MAX_PAGES - draft.pages.length
    if (remain <= 0) {
      setError(`一封信最多附 ${MAX_PAGES} 页信纸图片。`)
      return
    }
    const queue = files.slice(0, remain)
    setError('')
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i]
      setUploading(`正在上传第 ${i + 1} / ${queue.length} 页…`)
      try {
        const handle = uploadImage<{
          attachment: { urls: { display: string; thumb: string }; original_name: string }
        }>('/api/uploads', file, (frac) => {
          setUploading(`正在上传第 ${i + 1} / ${queue.length} 页（${Math.round(frac * 100)}%）`)
        })
        const res = await handle.promise
        const item: UploadedPage = {
          url: res.attachment.urls.display,
          thumbUrl: res.attachment.urls.thumb,
          name: res.attachment.original_name || file.name,
        }
        setDraft((prev) => ({ ...prev, pages: [...prev.pages, item].slice(0, MAX_PAGES) }))
      } catch (err) {
        setError(err instanceof Error ? err.message : '图片上传失败，请重试')
        break
      }
    }
    setUploading(null)
  }

  function movePage(index: number, delta: -1 | 1) {
    const next = index + delta
    if (next < 0 || next >= draft.pages.length) return
    setDraft((prev) => {
      const copy = [...prev.pages]
      ;[copy[index], copy[next]] = [copy[next], copy[index]]
      return { ...prev, pages: copy }
    })
  }

  function removePage(index: number) {
    setDraft((prev) => ({ ...prev, pages: prev.pages.filter((_, i) => i !== index) }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (sending || uploading) return
    const title = draft.title.trim()
    const body = draft.body.trim()
    const excerpt = draft.excerpt.trim()
    if (!title) {
      setError('给这封信起一个标题吧。')
      return
    }
    if (!body && !excerpt && draft.pages.length === 0) {
      setError('先写几句信纸正文，或者附上一页手写信照片再投递吧。')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await api<{ letter: Letter }>('/api/letters', {
        method: 'POST',
        body: JSON.stringify({
          date: draft.date || todayIso(),
          title,
          excerpt,
          body,
          theme: draft.theme === 'classic' ? '' : draft.theme,
          pages: draft.pages.map((p) => p.url),
        }),
      })
      try {
        localStorage.removeItem(draftKey(account))
      } catch {
        // ignore
      }
      onDirtyChange(false)
      onSent(res.letter)
    } catch (err) {
      setError(err instanceof Error ? err.message : '投递失败，草稿已保留，稍后再试一次吧')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="letter-composer" onSubmit={handleSubmit}>
      <div className="letter-composer-banner">
        <span className="letter-composer-who">
          <CharacterPortrait character={account} size={28} />
          <span>寄给 {recipient}</span>
        </span>
        {hasContent && <span className="letter-draft-tag">草稿已自动保存在本机</span>}
      </div>

      <div className="letter-field-row">
        <label className="letter-field">
          <span>
            信件标题 <small>必填</small>
          </span>
          <input
            value={draft.title}
            maxLength={80}
            placeholder="例如：给这周辛苦啦的你"
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>
        <label className="letter-field">
          <span>落款日期</span>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => patch({ date: e.target.value })}
          />
        </label>
      </div>

      <div className="letter-field">
        <span>信封样式</span>
        <div className="letter-theme-grid" role="group" aria-label="选择信封样式">
          {LETTER_THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="letter-theme-chip"
              aria-pressed={draft.theme === item.id}
              onClick={() => patch({ theme: item.id })}
            >
              <span className="letter-theme-swatch" style={{ background: item.swatch }} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="letter-field">
        <span>
          信封寄语 <small>拆开火漆前露出的短短一句（选填，不剧透正文）</small>
        </span>
        <input
          value={draft.excerpt}
          maxLength={200}
          placeholder="例如：今晚风很温柔，慢慢拆开看"
          onChange={(e) => patch({ excerpt: e.target.value })}
        />
      </label>

      <label className="letter-field">
        <span>
          信纸正文 <small>拆开火漆后才展开（{draft.body.length} / 10000）</small>
        </span>
        <textarea
          value={draft.body}
          maxLength={10000}
          rows={6}
          placeholder="把平时没来得及说的话，慢慢写在这里…"
          onChange={(e) => patch({ body: e.target.value })}
        />
      </label>

      <div className="letter-pages-box">
        <div className="letter-pages-head">
          <span>
            附上手写信 / 照片（{draft.pages.length}/{MAX_PAGES}）
          </span>
          <label className="btn btn-mini letter-upload-btn">
            <span>{uploading ? '上传中…' : '+ 添加信纸图'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={Boolean(uploading) || draft.pages.length >= MAX_PAGES}
              onChange={handleFiles}
            />
          </label>
        </div>
        {uploading && (
          <p className="loading" role="status">
            {uploading}
          </p>
        )}
        {draft.pages.length > 0 && (
          <div className="letter-pages-grid">
            {draft.pages.map((page, index) => (
              <div key={`${page.url}-${index}`} className="letter-page-thumb">
                <img src={page.thumbUrl || page.url} alt={`第 ${index + 1} 页信纸预览`} />
                <div className="letter-page-thumb-bar">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <button
                      type="button"
                      disabled={index === 0}
                      title="往前移一页"
                      onClick={() => movePage(index, -1)}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={index === draft.pages.length - 1}
                      title="往后移一页"
                      onClick={() => movePage(index, 1)}
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      title="移除这页"
                      onClick={() => removePage(index)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="letter-composer-actions">
        <button type="button" className="btn btn-mini" onClick={onCancel} disabled={sending}>
          先存草稿返回
        </button>
        <button
          type="submit"
          className="btn btn-primary btn-mini"
          disabled={sending || Boolean(uploading)}
        >
          {sending ? '封蜡投递中…' : '封蜡投递'}
        </button>
      </div>
    </form>
  )
}
