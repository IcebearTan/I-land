import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { islanderName, useIslanders } from '../../islanders'
import type { Letter } from '../../types'
import { CharacterPortrait } from '../CharacterPortrait'
import { LETTER_THEMES } from './LetterComposer'

function resolveImageUrl(source?: string): string | null {
  if (!source) return null
  if (source.startsWith('uploads/')) return '/api/' + source
  try {
    const url = new URL(source, window.location.origin)
    if (url.origin === window.location.origin && /^https?:$/.test(url.protocol)) {
      return url.href
    }
  } catch {
    return null
  }
  return null
}

export function LetterReader({
  letter,
  currentAccount,
  unsealed,
  onUnseal,
  onBack,
  onMarkedRead,
  onDeleted,
}: {
  letter: Letter
  currentAccount: string
  unsealed: boolean
  onUnseal: () => void
  onBack: () => void
  onMarkedRead: (updated: Letter) => void
  onDeleted: (letterId: number) => void
}) {
  const islanders = useIslanders()
  const [page, setPage] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [imageRetry, setImageRetry] = useState(0)
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [confirmRecall, setConfirmRecall] = useState(false)
  const [recalling, setRecalling] = useState(false)
  const [recallError, setRecallError] = useState('')
  const content = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPage(0)
    setZoomed(false)
    setConfirmRecall(false)
    setRecallError('')
  }, [letter.id])

  useEffect(() => {
    setImageState('loading')
    content.current?.scrollTo({ top: 0, left: 0 })
    setZoomed(false)
  }, [letter.id, page, unsealed])

  useEffect(() => {
    if (!unsealed || zoomed || letter.pages.length === 0) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && page > 0) {
        event.preventDefault()
        setPage(page - 1)
      }
      if (event.key === 'ArrowRight' && page < letter.pages.length - 1) {
        event.preventDefault()
        setPage(page + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [unsealed, letter.pages.length, page, zoomed])

  const author = islanderName(letter.author)
  const recipient = letter.author === 'her' ? islanders.bear : islanders.her
  const isAuthor = letter.author === currentAccount
  const themeMeta = LETTER_THEMES.find((t) => t.id === letter.theme)
  const themeClass =
    letter.theme && ['seaside', 'blossom', 'qixi'].includes(letter.theme)
      ? `sealed-letter--${letter.theme}`
      : ''
  const imageUrl = resolveImageUrl(letter.pages[page])
  const hasBody = Boolean(letter.body.trim())
  const hasPages = letter.pages.length > 0

  function handleBreakSeal() {
    onUnseal()
    if (letter.unread) {
      api<{ letter: Letter }>(`/api/letters/${letter.id}/read`, { method: 'POST' })
        .then((res) => onMarkedRead(res.letter))
        .catch(() => {})
    }
  }

  async function handleRecall() {
    if (recalling) return
    setRecalling(true)
    setRecallError('')
    try {
      await api(`/api/letters/${letter.id}`, { method: 'DELETE' })
      onDeleted(letter.id)
    } catch (err) {
      setRecallError(err instanceof Error ? err.message : '收回失败，请稍后重试')
      setRecalling(false)
    }
  }

  return (
    <>
      <button type="button" className="text-button" onClick={onBack}>
        ← 回到所有信件
      </button>

      {!unsealed ? (
        <div className={`sealed-letter ${themeClass}`}>
          <div className="sealed-letter-address">
            <span className="letter-postmark">
              I-LAND POST
              <br />
              {letter.date}
            </span>
            <div className="px-portrait-box">
              <CharacterPortrait character={letter.author === 'her' ? 'her' : 'bear'} size={40} />
            </div>
          </div>
          {themeMeta?.badge && <span className="letter-theme-label">{themeMeta.badge}</span>}
          <p>
            寄给{recipient} · 来自{author}
          </p>
          <h3>{letter.title}</h3>
          {letter.excerpt && <p className="sealed-letter-excerpt">{letter.excerpt}</p>}
          <button
            type="button"
            className="wax-seal"
            onClick={handleBreakSeal}
            aria-label={`拆开信件：${letter.title}`}
          >
            ♥
          </button>
          <span className="seal-instruction">轻轻拆开，慢慢读</span>
        </div>
      ) : (
        <div className="letter-reading">
          <div className="reading-meta">
            <span>
              {author}写给{recipient} · {letter.date}
            </span>
          </div>

          {hasBody && (
            <article className="letter-stationery" aria-label="信纸正文">
              <p className="letter-text">{letter.body}</p>
              <span className="paper-signature">—— {author}</span>
            </article>
          )}

          {hasPages ? (
            <>
              <div className="reading-toolbar">
                <nav className="letter-page-tabs" aria-label="选择信纸页码">
                  {letter.pages.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      className="letter-page-tab"
                      aria-label={`第 ${index + 1} 页信纸`}
                      aria-current={page === index ? 'page' : undefined}
                      onClick={() => setPage(index)}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </button>
                  ))}
                </nav>
                <button
                  type="button"
                  className="text-button reading-zoom"
                  aria-pressed={zoomed}
                  onClick={() => setZoomed((value) => !value)}
                >
                  {zoomed ? '适应宽度' : '放大阅读'}
                </button>
              </div>
              <div
                className={`letter-paper ${zoomed ? 'letter-paper--zoomed' : ''}`}
                ref={content}
                tabIndex={0}
                aria-label="信纸图片阅读区"
              >
                {imageUrl && (
                  <img
                    key={`${letter.id}-${page}-${imageRetry}`}
                    src={imageUrl}
                    draggable={false}
                    alt={`${letter.title}，第 ${page + 1} 页信纸`}
                    onLoad={() => setImageState('ready')}
                    onError={() => setImageState('error')}
                  />
                )}
                {imageUrl && imageState === 'loading' && (
                  <p className="loading" role="status">
                    正在铺开信纸…
                  </p>
                )}
                {(!imageUrl || imageState === 'error') && (
                  <div role="alert">
                    <p className="form-error">这页信纸暂时无法显示。</p>
                    {imageUrl && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setImageState('loading')
                          setImageRetry((value) => value + 1)
                        }}
                      >
                        重新铺开这页信纸
                      </button>
                    )}
                  </div>
                )}
              </div>
              <nav className="page-turner" aria-label="信纸翻页">
                <button
                  type="button"
                  className="px-btn px-btn-sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  ← 上一页
                </button>
                <span className="num" aria-live="polite">
                  第 {page + 1} / {letter.pages.length} 页
                </span>
                <button
                  type="button"
                  className="px-btn px-btn-sm"
                  disabled={page >= letter.pages.length - 1}
                  onClick={() => setPage(page + 1)}
                >
                  下一页 →
                </button>
              </nav>
            </>
          ) : !hasBody ? (
            <div className="letter-stationery">
              <p className="letter-text">{letter.excerpt || '这封信暂时还没有写下内容。'}</p>
              <span className="paper-signature">—— {author}</span>
            </div>
          ) : null}

          {isAuthor && (
            <div className="letter-reader-footer">
              <span>{letter.read_at ? `${recipient}已经拆开读过这封信` : `还在等${recipient}拆开`}</span>
              {confirmRecall ? (
                <div className="letter-recall-group">
                  <button
                    type="button"
                    className="text-button letter-recall-btn"
                    disabled={recalling}
                    onClick={handleRecall}
                  >
                    {recalling ? '收回中…' : '确认收回'}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={recalling}
                    onClick={() => setConfirmRecall(false)}
                  >
                    保留
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-button letter-recall-btn"
                  onClick={() => setConfirmRecall(true)}
                >
                  收回这封信
                </button>
              )}
            </div>
          )}
          {recallError && (
            <p className="form-error" role="alert">
              {recallError}
            </p>
          )}
        </div>
      )}
    </>
  )
}
