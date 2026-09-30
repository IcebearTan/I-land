import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { eventBus } from '../../game/EventBus'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { CharacterPortrait } from '../CharacterPortrait'
import { islanderName, useIslanders } from '../../islanders'
import type { Letter } from '../../types'

/** 信封 → 拆信 → 原尺寸信纸；只读取现有 API，不生成虚构信件。 */
export function MailboxPanel() {
  const [open, setOpen] = useState(false)
  const islanders = useIslanders()
  const [letters, setLetters] = useState<Letter[] | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<Letter | null>(null)
  const [unsealed, setUnsealed] = useState(false)
  const [page, setPage] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [imageRetry, setImageRetry] = useState(0)
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading')
  const content = useRef<HTMLDivElement>(null)
  function close() { setOpen(false); eventBus.emit('PANEL_CLOSED', { panel: 'mailbox' }) }
  const dialog = useDialogFocus(open, close)

  useEffect(() => {
    const onOpen = () => {
      setOpen(true); setSelected(null); setUnsealed(false); setPage(0)
      eventBus.emit('PANEL_OPENED', { panel: 'mailbox' })
    }
    eventBus.on('OPEN_MAILBOX', onOpen)
    return () => eventBus.off('OPEN_MAILBOX', onOpen)
  }, [])
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLetters(null); setError('')
    api<{ letters: Letter[] }>('/api/letters', { signal: controller.signal })
      .then(r => { if (!controller.signal.aborted) setLetters(r.letters) })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '取信失败') })
    return () => controller.abort()
  }, [open, retry])
  useEffect(() => {
    setImageState('loading')
    content.current?.scrollTo({ top: 0, left: 0 })
    setZoomed(false)
  }, [selected?.id, page, unsealed])
  useEffect(() => {
    if (!open || !unsealed || !selected || zoomed) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && page > 0) { event.preventDefault(); setPage(page - 1) }
      if (event.key === 'ArrowRight' && page < selected.pages.length - 1) { event.preventDefault(); setPage(page + 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, unsealed, selected, page, zoomed])
  useEffect(() => {
    if (selected) dialog.current?.querySelector<HTMLButtonElement>('.text-button')?.focus()
  }, [selected, unsealed, dialog])
  if (!open) return null
  const author = islanderName(selected?.author ?? '')
  const recipient = selected?.author === 'her' ? islanders.bear : islanders.her
  const source = selected?.pages[page]
  let imageUrl: string | null = null
  if (source) {
    // 旧信纸是 uploads/ 相对路径 → 走登录保护的兼容接口；其余仅放行同源地址
    if (source.startsWith('uploads/')) imageUrl = '/api/' + source
    else {
      try {
        const url = new URL(source, window.location.origin)
        if (url.origin === window.location.origin && /^https?:$/.test(url.protocol)) imageUrl = url.href
      } catch { /* 无效信纸地址由下面的可见错误状态说明 */ }
    }
  }
  function turnPage(next: number) {
    setPage(next)
  }
  return <div className="modal-mask mailbox-mask" onClick={close}>
    <div ref={dialog} className={`wood-panel modal-panel mailbox-panel ${unsealed ? 'mailbox-panel--reading' : ''} ${selected?.theme === 'qixi' ? 'mailbox-panel--qixi' : ''}`} role="dialog" aria-modal="true" aria-labelledby="mailbox-title" onClick={e => e.stopPropagation()}>
      <div className="modal-head">
        <div><p className="panel-eyebrow">LETTERS BETWEEN US</p><h2 id="mailbox-title">{selected ? (unsealed ? selected.title : '一封给你的信') : '小屋信箱'}</h2></div>
        <button className="btn btn-mini" onClick={close}>合上 ✕</button>
      </div>
      {selected ? <>
        <button className="text-button" onClick={() => { setSelected(null); setUnsealed(false) }}>← 回到所有信件</button>
        {!unsealed ? <div className="sealed-letter">
          <div className="sealed-letter-address"><span className="letter-postmark">I-LAND POST<br />{selected.date}</span><CharacterPortrait character={selected.author === 'her' ? 'her' : 'bear'} size={48} /></div>
          {selected.theme === 'qixi' && <span className="letter-theme-label">✦ 七夕来信</span>}
          <p>寄给{recipient} · 来自{author}</p><h3>{selected.title}</h3>
          {selected.excerpt && <p className="sealed-letter-excerpt">{selected.excerpt}</p>}
          <button className="wax-seal" onClick={() => setUnsealed(true)} aria-label={`拆开信件：${selected.title}`}>♥</button>
          <span className="seal-instruction">轻轻拆开，慢慢读</span>
        </div> : <div className="letter-reading">
          <div className="reading-meta"><span>{author}写给{recipient} · {selected.date}</span></div>
          {selected.pages.length > 0 && <div className="reading-toolbar">
            <nav className="letter-page-tabs" aria-label="选择信纸页码">
              {selected.pages.map((_, index) => <button key={index} className="letter-page-tab" aria-label={`第 ${index + 1} 页信纸`} aria-current={page === index ? 'page' : undefined} onClick={() => turnPage(index)}>{String(index + 1).padStart(2, '0')}</button>)}
            </nav>
            <button className="text-button reading-zoom" aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}>{zoomed ? '适应宽度' : '放大阅读'}</button>
          </div>}
          <div className={`letter-paper ${zoomed ? 'letter-paper--zoomed' : ''}`} ref={content} tabIndex={0} aria-label="信纸阅读区">
            {selected.pages.length ? <>
              {imageUrl && <img key={`${selected.id}-${page}-${imageRetry}`} src={imageUrl} draggable={false} alt={`${selected.title}，第 ${page + 1} 页信纸`} onLoad={() => setImageState('ready')} onError={() => setImageState('error')} />}
              {imageUrl && imageState === 'loading' && <p className="loading" role="status">正在铺开信纸…</p>}
              {(!imageUrl || imageState === 'error') && <div role="alert"><p className="form-error">这页信纸暂时无法显示。</p>{imageUrl && <button className="text-button" onClick={() => { setImageState('loading'); setImageRetry(value => value + 1) }}>重新铺开这页信纸</button>}</div>}
            </> : <><p className="letter-text">{selected.excerpt || '这封信暂时还没有附上信纸。'}</p><span className="paper-signature">—— {author}</span></>}
          </div>
          {selected.pages.length > 0 && <nav className="page-turner" aria-label="信纸翻页">
            <button className="btn btn-mini" disabled={page === 0} onClick={() => turnPage(page - 1)}>← 上一页</button>
            <span className="num" aria-live="polite">第 {page + 1} / {selected.pages.length} 页</span>
            <button className="btn btn-mini" disabled={page >= selected.pages.length - 1} onClick={() => turnPage(page + 1)}>下一页 →</button>
          </nav>}
        </div>}
      </> : <>
        <div className="mailbox-shelf-heading"><p className="mailbox-intro">把平时没说完的话，留给彼此慢慢读。</p>{letters && <span>{letters.length} 封来信</span>}</div>
        {error && <div role="alert"><p className="form-error">{error}</p><button className="text-button" onClick={() => setRetry(v => v + 1)}>再取一次信</button></div>}
        {letters === null && !error && <p className="loading" role="status">正在取信…</p>}
        {letters?.length === 0 && <div className="letter-empty"><div className="paper-envelope" aria-hidden="true">♥</div><p>把想念，留在一封信里。</p><span>信箱暂时还没有来信。</span></div>}
        <ul className="letter-list">
          {letters?.map(letter => <li key={letter.id}>
            <button className={`letter-card ${letter.theme === 'qixi' ? 'letter-card--qixi' : ''}`} onClick={() => { setSelected(letter); setUnsealed(false); setPage(0) }}>
              <CharacterPortrait character={letter.author === 'her' ? 'her' : 'bear'} size={36} />
              <span className="letter-card-copy"><span className="letter-meta"><span>{islanderName(letter.author)}寄来的信</span><time>{letter.date}</time></span>
                <strong>{letter.title}</strong><span className="letter-excerpt">{letter.excerpt || '有些话，想亲手写给你。'}</span><span className="letter-card-details">{letter.theme === 'qixi' ? '✦ 七夕珍藏 · ' : ''}{letter.pages.length ? `${letter.pages.length} 页信纸` : '文字来信'}</span></span>
              <span className="letter-card-arrow" aria-hidden="true">↗</span>
            </button>
          </li>)}
        </ul>
      </>}
    </div>
  </div>
}
