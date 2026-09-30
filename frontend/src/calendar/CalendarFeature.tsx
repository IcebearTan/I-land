import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError, uploadImage } from '../api/client'
import { eventBus } from '../game/EventBus'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { CountdownCard } from './CountdownCard'
import { HolidayIcon } from './HolidayIcon'
import { HolidayDateField } from './HolidayDateField'
import { ICONS, PRESETS, REPEATS, STYLES, THEMES, themeVars } from './design'
import type { Holiday, HolidayDraft, IconId, StyleId, ThemeId } from './design'
import { dateParts, daysBetween, localDateKey, monthCells, nextOccurrence, occursOn, shiftMonth, validDate } from './dates'
import type { Repeat } from './dates'
import { MemoryEditor } from './MemoryEditor'
import { MemoryCards, PhotoViewer } from './MemoryCards'
import { MemoryTrash } from './MemoryTrash'
import { fileUrl, MAX_PHOTOS, memoryTitle } from './memories'
import type { AttachmentInfo, MemoryDraft, MemoryRecord } from './memories'
import './calendar.css'

function blank(date: string): HolidayDraft { return { name: '', date, repeat: 'yearly', note: '', icon: 'heart', color: 'rose', style: 'letter', pinned: false } }
function readableDate(key: string) { const [y, m, d] = dateParts(key); return `${y} 年 ${m} 月 ${d} 日` }
function photoSnapshot(draft: MemoryDraft): string {
  return JSON.stringify(draft.photos.map(photo => [photo.key, photo.attachmentId]))
}

export function CalendarFeature() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [revision, setRevision] = useState(0)
  const [today, setToday] = useState(localDateKey)
  const [month, setMonth] = useState(() => localDateKey().slice(0, 7) + '-01')
  const [selectedDay, setSelectedDay] = useState(localDateKey)
  const [editor, setEditor] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [draft, setDraft] = useState<HolidayDraft>(() => blank(localDateKey()))
  const initialDraft = useRef('')
  const [busy, setBusy] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [discard, setDiscard] = useState<'close' | 'view' | null>(null)
  const [notice, setNotice] = useState('')
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const dirty = editor && JSON.stringify(draft) !== initialDraft.current

  // ── 每日记忆 ────────────────────────────────────────────────
  const [view, setView] = useState<'calendar' | 'trash'>('calendar')
  const [monthMemories, setMonthMemories] = useState<MemoryRecord[]>([])
  const [memoriesError, setMemoriesError] = useState('')
  const [memoryEditing, setMemoryEditing] = useState<MemoryDraft | null>(null)
  const initialMemory = useRef('')
  const [memoryBusy, setMemoryBusy] = useState(false)
  const [memoryError, setMemoryError] = useState('')
  const [conflict, setConflict] = useState<MemoryRecord | null>(null)
  const [deletingMemory, setDeletingMemory] = useState<MemoryRecord | null>(null)
  const [viewer, setViewer] = useState<{ memoryId: number; index: number } | null>(null)
  const [trashItems, setTrashItems] = useState<MemoryRecord[]>([])
  const [trashKeepDays, setTrashKeepDays] = useState(30)
  const [trashLoading, setTrashLoading] = useState(false)
  const [trashError, setTrashError] = useState('')
  const memoryDirty = !!memoryEditing && (() => {
    const [initialFields, initialPhotos] = initialMemory.current.split('|')
    return photoSnapshot(memoryEditing) !== initialPhotos
      || JSON.stringify({ ...memoryEditing, photos: [] }) !== initialFields
  })()
  const uploadHandles = useRef(new Map<string, { abort: () => void }>())
  const photoFiles = useRef(new Map<string, File>())

  function releasePhotos(photos: MemoryDraft['photos']) {
    for (const photo of photos) {
      if (photo.previewUrl.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)
      uploadHandles.current.get(photo.key)?.abort()
      uploadHandles.current.delete(photo.key)
      photoFiles.current.delete(photo.key)
    }
  }

  function close() {
    if (viewer) { setViewer(null); return } // 大图开着时，Esc/点击只收起大图
    if (busy || memoryBusy) return
    if (dirty || memoryDirty) { setDiscard('close'); return }
    setOpen(false); setEditor(false); setMemoryEditing(null); setDeleteId(null); setDiscard(null)
    setView('calendar'); setViewer(null)
    releaseDrafts()
    eventBus.emit('PANEL_CLOSED', { panel: 'calendar' })
  }
  function releaseDrafts() {
    if (memoryEditing) releasePhotos(memoryEditing.photos)
  }
  const dialog = useDialogFocus(open, close)
  useEffect(() => {
    const show = () => {
      setOpen(true); setRevision(value => value + 1)
      eventBus.emit('PANEL_OPENED', { panel: 'calendar' })
    }
    eventBus.on('OPEN_CALENDAR', show)
    return () => eventBus.off('OPEN_CALENDAR', show)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setLoadError('')
    api<{ anniversaries: Holiday[] }>('/api/anniversaries', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setItems(data.anniversaries) })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : '暂时无法读取日历') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    const refresh = () => {
      setToday(localDateKey())
      if (!document.hidden) setRevision(value => value + 1)
    }
    const timer = window.setInterval(refresh, 60_000)
    const onVisible = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  // 当前月历网格（42 格）内的记忆：月历缩略图与日详情共用
  const cells = useMemo(() => monthCells(month), [month])
  useEffect(() => {
    if (!open || view !== 'calendar' || memoryEditing) return
    const controller = new AbortController()
    setMemoriesError('')
    api<{ memories: MemoryRecord[] }>(`/api/memories?start=${cells[0]}&end=${cells[cells.length - 1]}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setMonthMemories(data.memories) })
      .catch(error => {
        if (controller.signal.aborted) return
        setMonthMemories([])
        setMemoriesError(error instanceof Error ? error.message : '暂时无法读取记忆')
      })
    return () => controller.abort()
  }, [open, view, memoryEditing, cells, revision])
  useEffect(() => {
    if (!open || view !== 'trash') return
    const controller = new AbortController()
    setTrashLoading(true); setTrashError('')
    api<{ memories: MemoryRecord[]; keep_days: number }>('/api/memories/deleted', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setTrashItems(data.memories); setTrashKeepDays(data.keep_days) } })
      .catch(error => { if (!controller.signal.aborted) setTrashError(error instanceof Error ? error.message : '暂时无法读取回收站') })
      .finally(() => { if (!controller.signal.aborted) setTrashLoading(false) })
    return () => controller.abort()
  }, [open, view, revision])
  useEffect(() => {
    if (!open || !dialog.current) return
    dialog.current.scrollTop = 0
    if (discard) dialog.current.querySelector<HTMLButtonElement>('.calendar-confirm button')?.focus()
    else if (memoryEditing) dialog.current.querySelector<HTMLTextAreaElement>('[name="memory-description"]')?.focus()
    else if (editor) dialog.current.querySelector<HTMLInputElement>('[name="holiday-name"]')?.focus()
    else dialog.current.querySelector<HTMLButtonElement>('.calendar-close')?.focus()
  }, [editor, open, discard, dialog, memoryEditing])

  const upcoming = items.map(item => ({ item, next: nextOccurrence(item, today) }))
    .filter((entry): entry is { item: Holiday; next: string } => !!entry.next)
    .sort((a, b) => a.next.localeCompare(b.next) || a.item.id - b.item.id)
  const featured = upcoming.find(({ item }) => item.pinned) ?? upcoming[0]
  const selectedItems = items.filter(item => occursOn(item, selectedDay))
  const highlighted = items.find(item => item.id === highlightId) ?? selectedItems[0] ?? featured?.item
  const [year, monthNumber] = dateParts(month)
  const monthItems = items.filter(item => monthCells(month).some(key => key.slice(0, 7) === month.slice(0, 7) && occursOn(item, key)))
  const selectedMemories = monthMemories.filter(item => item.date === selectedDay)
  const viewerMemory = viewer ? monthMemories.find(item => item.id === viewer.memoryId) : null

  function selectDay(key: string) {
    if (!validDate(key)) return
    setSelectedDay(key); setMonth(key.slice(0, 7) + '-01'); setHighlightId(null); setDeleteId(null); setDeletingMemory(null); setActionError('')
  }
  function startEdit(item?: Holiday) {
    const next = item ? { name: item.name, date: item.date, repeat: item.repeat, note: item.note,
      icon: item.icon in ICONS ? item.icon : 'heart', color: item.color in THEMES ? item.color : 'rose',
      style: item.style in STYLES ? item.style : 'letter', pinned: item.pinned } as HolidayDraft : blank(selectedDay)
    setDraft(next); initialDraft.current = JSON.stringify(next); setEditId(item?.id ?? null)
    setEditor(true); setActionError(''); setDeleteId(null); setDiscard(null); setNotice('')
  }
  function cancelEdit() { if (busy) return; if (dirty) setDiscard('view'); else setEditor(false) }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!draft.name.trim() || !validDate(draft.date)) { setActionError('请填写名称和有效日期。'); return }
    setBusy(true); setActionError('')
    try {
      const { anniversary } = await api<{ anniversary: Holiday }>(editId ? `/api/anniversaries/${editId}` : '/api/anniversaries', {
        method: editId ? 'PUT' : 'POST', body: JSON.stringify({ ...draft, name: draft.name.trim() }),
      })
      // 取消在途的旧列表请求，重新读取服务端的置顶状态。
      setRevision(value => value + 1)
      setItems(previous => [...previous.filter(item => item.id !== anniversary.id).map(item => anniversary.pinned ? { ...item, pinned: false } : item), anniversary])
      const day = nextOccurrence(anniversary, today) ?? anniversary.date
      setSelectedDay(day); setMonth(day.slice(0, 7) + '-01'); setHighlightId(anniversary.id)
      setEditor(false); setNotice(editId ? '已更新这个特别的日子。' : '新的期待，已经记进日历。')
    } catch (error) { setActionError(error instanceof Error ? error.message : '保存失败，编辑内容已保留，请重试。') }
    finally { setBusy(false) }
  }
  async function remove(id: number) {
    if (busy) return
    setBusy(true); setActionError('')
    try {
      await api(`/api/anniversaries/${id}`, { method: 'DELETE' })
      setItems(previous => previous.filter(item => item.id !== id)); setRevision(value => value + 1)
      setDeleteId(null); setHighlightId(null); setNotice('这个节日已从日历移除。')
    } catch (error) { setActionError(error instanceof Error ? error.message : '删除失败，请重试') }
    finally { setBusy(false) }
  }

  // ── 记忆编辑器 ──────────────────────────────────────────────
  function startMemoryEdit(memory?: MemoryRecord) {
    const base: MemoryDraft = memory
      ? { id: memory.id, version: memory.version, clientId: '', date: memory.date, title: memory.title, description: memory.description,
          mood: memory.mood, weatherType: memory.weather.type || '', weatherNote: memory.weather.note, location: memory.location,
          photos: memory.attachments.map(id => ({ key: `server-${id}`, attachmentId: id, name: 'photo', previewUrl: fileUrl(id, 'thumb'), status: 'done' as const, progress: 1, error: '' })) }
      : { id: null, version: 0, clientId: crypto.randomUUID(), date: selectedDay, title: '', description: '', mood: '', weatherType: '', weatherNote: '', location: '', photos: [] }
    releaseDrafts()
    setMemoryEditing(base)
    initialMemory.current = JSON.stringify({ ...base, photos: [] }) + '|' + photoSnapshot(base)
    setMemoryError(''); setConflict(null); setEditor(false); setDeleteId(null); setDeletingMemory(null); setDiscard(null); setNotice('')
  }
  function cancelMemoryEdit() {
    if (memoryBusy) return
    if (memoryDirty) { setDiscard('view'); return }
    closeMemoryEdit()
  }
  function closeMemoryEdit() {
    if (memoryEditing) releasePhotos(memoryEditing.photos)
    setMemoryEditing(null); setConflict(null); setMemoryError('')
  }
  function patchMemory(patch: Partial<MemoryDraft>) {
    setMemoryEditing(current => current ? { ...current, ...patch } : current)
  }
  function startUpload(key: string, file: File) {
    photoFiles.current.set(key, file)
    const handle = uploadImage<{ attachment: AttachmentInfo }>('/api/uploads', file, fraction => {
      setMemoryEditing(current => current && { ...current, photos: current.photos.map(photo => photo.key === key ? { ...photo, progress: fraction } : photo) })
    })
    uploadHandles.current.set(key, handle)
    handle.promise.then(result => {
      uploadHandles.current.delete(key)
      setMemoryEditing(current => current && { ...current, photos: current.photos.map(photo => photo.key === key
        ? { ...photo, status: 'done' as const, attachmentId: result.attachment.id, previewUrl: result.attachment.urls.thumb, progress: 1, error: '' }
        : photo) })
    }).catch((error: unknown) => {
      uploadHandles.current.delete(key)
      const message = error instanceof ApiError && error.status === 401
        ? '登录已过期，重新登录后可以接着传'
        : error instanceof Error ? error.message : '上传失败'
      setMemoryEditing(current => current && { ...current, photos: current.photos.map(photo => photo.key === key
        ? { ...photo, status: 'error' as const, error: message }
        : photo) })
    })
  }
  function addMemoryFiles(files: File[]) {
    const current = memoryEditing
    if (!current) return
    const room = MAX_PHOTOS - current.photos.length
    const accepted = files.slice(0, room)
    if (files.length > room) setMemoryError(`一条记忆最多放 ${MAX_PHOTOS} 张照片，多出来的 ${files.length - room} 张没有加入。`)
    if (!accepted.length) return
    const additions = accepted.map(file => {
      const key = crypto.randomUUID()
      return { entry: { key, attachmentId: null, name: file.name, previewUrl: URL.createObjectURL(file), status: 'uploading' as const, progress: 0, error: '' }, file, key }
    })
    setMemoryEditing({ ...current, photos: [...current.photos, ...additions.map(item => item.entry)] })
    for (const item of additions) startUpload(item.key, item.file)
  }
  function retryPhoto(key: string) {
    const file = photoFiles.current.get(key)
    if (!file) { setMemoryError('这张照片需要重新选择一次。'); return }
    patchMemory({ photos: (memoryEditing?.photos ?? []).map(photo => photo.key === key ? { ...photo, status: 'uploading' as const, progress: 0, error: '' } : photo) })
    startUpload(key, file)
  }
  function removePhoto(key: string) {
    const photo = memoryEditing?.photos.find(item => item.key === key)
    if (photo) {
      if (photo.previewUrl.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)
      uploadHandles.current.get(key)?.abort()
      uploadHandles.current.delete(key)
      photoFiles.current.delete(key)
    }
    patchMemory({ photos: (memoryEditing?.photos ?? []).filter(item => item.key !== key) })
  }
  function movePhoto(key: string, delta: -1 | 1) {
    const photos = [...(memoryEditing?.photos ?? [])]
    const index = photos.findIndex(photo => photo.key === key)
    const target = index + delta
    if (index < 0 || target < 0 || target >= photos.length) return
    [photos[index], photos[target]] = [photos[target], photos[index]]
    patchMemory({ photos })
  }
  async function saveMemory() {
    const current = memoryEditing
    if (!current || memoryBusy) return
    if (!validDate(current.date)) { setMemoryError('请选一个有效的日期。'); return }
    const attachments = current.photos.filter(photo => photo.status === 'done' && photo.attachmentId).map(photo => photo.attachmentId as string)
    if (!attachments.length && !current.description.trim()) { setMemoryError('至少放一张照片，或写下一句描述。'); return }
    setMemoryBusy(true); setMemoryError(''); setConflict(null)
    const payload = {
      date: current.date, title: current.title, description: current.description, mood: current.mood,
      weather_type: current.weatherType, weather_note: current.weatherNote, location: current.location,
      attachments, client_id: current.clientId,
    }
    try {
      const { memory } = await api<{ memory: MemoryRecord }>(
        current.id ? `/api/memories/${current.id}` : '/api/memories',
        { method: current.id ? 'PUT' : 'POST', body: JSON.stringify(current.id ? { ...payload, version: current.version } : payload) },
      )
      releasePhotos(current.photos)
      setMemoryEditing(null)
      setRevision(value => value + 1) // 刷新月历缩略图与日详情
      setSelectedDay(memory.date); setMonth(memory.date.slice(0, 7) + '-01')
      setNotice(current.id ? '这条记忆已更新。' : '这一天，已经好好收起来了。')
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const latest = (error.payload as { detail?: { memory?: MemoryRecord } } | null)?.detail?.memory ?? null
        setConflict(latest)
        setMemoryError(error.message || '对方刚刚更新了这条记忆。')
      } else if (error instanceof ApiError && error.status === 401) {
        setMemoryError('登录已过期。你写的都还在这里，重新登录后再回来保存。')
      } else {
        setMemoryError(error instanceof Error ? error.message : '保存失败，内容都保留着，请重试。')
      }
    } finally { setMemoryBusy(false) }
  }
  function loadConflictLatest() {
    if (!conflict || !memoryEditing) return
    const memory = conflict
    releasePhotos(memoryEditing.photos)
    const next: MemoryDraft = { ...memoryEditing,
      version: memory.version, date: memory.date, title: memory.title, description: memory.description,
      mood: memory.mood, weatherType: memory.weather.type || '', weatherNote: memory.weather.note, location: memory.location,
      photos: memory.attachments.map(id => ({ key: `server-${id}-${Date.now()}`, attachmentId: id, name: 'photo', previewUrl: fileUrl(id, 'thumb'), status: 'done' as const, progress: 1, error: '' })) }
    setMemoryEditing(next)
    initialMemory.current = JSON.stringify({ ...next, photos: [] }) + '|' + photoSnapshot(next)
    setConflict(null); setMemoryError('已载入她的最新版本，改完再保存吧。')
  }
  async function removeMemory(memory: MemoryRecord) {
    if (memoryBusy) return
    setMemoryBusy(true); setActionError('')
    try {
      await api(`/api/memories/${memory.id}`, { method: 'DELETE' })
      setDeletingMemory(null); setRevision(value => value + 1)
      setMonthMemories(previous => previous.filter(item => item.id !== memory.id))
      setNotice('这条记忆已放进「最近删除」，30 天内可以找回。')
    } catch (error) {
      setActionError(error instanceof ApiError && error.status === 401 ? '登录已过期，请重新登录后再删。' : error instanceof Error ? error.message : '删除失败，请重试。')
    } finally { setMemoryBusy(false) }
  }
  async function restoreMemory(memory: MemoryRecord) {
    if (memoryBusy) return
    setMemoryBusy(true); setTrashError('')
    try {
      await api(`/api/memories/${memory.id}/restore`, { method: 'POST' })
      setRevision(value => value + 1)
      setSelectedDay(memory.date); setMonth(memory.date.slice(0, 7) + '-01'); setView('calendar')
      setNotice('这条记忆已经回到日历上。')
    } catch (error) { setTrashError(error instanceof Error ? error.message : '恢复失败，请重试。') }
    finally { setMemoryBusy(false) }
  }

  return <>
    {!open && <button className={`calendar-shortcut ${featured && !loadError ? 'calendar-shortcut--filled' : ''}`} onClick={() => eventBus.emit('OPEN_CALENDAR', {})} aria-label="打开记忆日历">
      {featured && !loadError ? <CountdownCard holiday={featured.item} today={today} compact /> : <><HolidayIcon icon="book" size={22} /><span>记忆日历<small>{loadError ? '轻点重试，找回小日子' : '留住日子，也收藏期待'}</small></span><span aria-hidden="true">↗</span></>}
    </button>}
    {open && <div className="modal-mask calendar-mask" onClick={close}>
      <div ref={dialog} className="calendar-panel" role="dialog" aria-modal="true" aria-labelledby="calendar-title" onClick={event => event.stopPropagation()}>
        <header className="calendar-header">
          <span className="calendar-brand-icon"><HolidayIcon icon="book" size={26} /></span>
          <div><p className="panel-eyebrow">OUR LITTLE ALMANAC</p><h2 id="calendar-title">{memoryEditing ? (memoryEditing.id ? '编辑这条记忆' : '记下这一天') : editor ? editId ? '编辑这个特别的日子' : '收藏一个特别的日子' : view === 'trash' ? '最近删除' : '灯塔 · 记忆日历'}</h2></div>
          {view === 'calendar' && !editor && !memoryEditing && <button type="button" className="calendar-trash-entry text-button" onClick={() => setView('trash')}>最近删除</button>}
          <button type="button" className="calendar-close" onClick={close} disabled={busy || memoryBusy} aria-label="关闭记忆日历">✕</button>
        </header>
        {discard ? <section className="calendar-confirm" role="alert">
          <HolidayIcon icon="letter" size={42} /><h3>还有没保存的心意</h3><p>离开会放弃这次编辑，已保存的节日与记忆不受影响。</p>
          <div><button className="cal-primary" onClick={() => setDiscard(null)}>继续编辑</button><button className="cal-secondary" onClick={() => {
            const destination = discard; setDiscard(null); setEditor(false)
            if (memoryEditing) closeMemoryEdit()
            if (destination === 'close') { setOpen(false); eventBus.emit('PANEL_CLOSED', { panel: 'calendar' }) }
          }}>放弃编辑</button></div>
        </section> : memoryEditing ? <MemoryEditor
          draft={memoryEditing}
          busy={memoryBusy}
          error={memoryError}
          conflict={conflict}
          onField={patchMemory}
          onDate={date => patchMemory({ date })}
          onAddFiles={addMemoryFiles}
          onRetryPhoto={retryPhoto}
          onRemovePhoto={removePhoto}
          onMovePhoto={movePhoto}
          onLoadLatest={loadConflictLatest}
          onSubmit={saveMemory}
          onCancel={cancelMemoryEdit}
        /> : editor ? <form onSubmit={save} className="holiday-editor">
          <fieldset disabled={busy} className="editor-fields">
            <div className="editor-section-title"><span>01</span><h3>这一天，值得一个名字</h3></div>
            {!editId && <div className="holiday-presets" aria-label="节日快捷模板">{PRESETS.map(preset => <button type="button" key={preset.label} onClick={() => setDraft(value => ({ ...value, name: preset.name, icon: preset.icon, color: preset.color, style: preset.style, repeat: preset.repeat }))}>
              <HolidayIcon icon={preset.icon} size={17} />{preset.label}</button>)}</div>}
            <label className="cal-field">节日名称<input name="holiday-name" value={draft.name} maxLength={60} required placeholder="例如：第一次说喜欢你" onChange={e => setDraft(value => ({ ...value, name: e.target.value }))} /></label>
            <div className="cal-field-row"><HolidayDateField value={draft.date} onChange={date => setDraft(value => ({ ...value, date }))} />
              <label className="cal-field">如何纪念<select value={draft.repeat} onChange={e => setDraft(value => ({ ...value, repeat: e.target.value as Repeat }))}>{Object.entries(REPEATS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
            <p className="cal-field-hint">使用公历。农历节日请填当年的公历日期，并选「仅此一次」。月末或闰日遇到短月时，按该月最后一天纪念。</p>
            <label className="cal-field">留一句话 <span className="field-optional">选填</span><textarea rows={3} value={draft.note} maxLength={1000} placeholder="想怎么度过这一天，或记住当时的心情…" onChange={e => setDraft(value => ({ ...value, note: e.target.value }))} /></label>
            <div className="editor-section-title"><span>02</span><h3>给它挑一身喜欢的样子</h3></div>
            <div className="picker-label">配色 <span>{THEMES[draft.color].name}</span></div>
            <div className="theme-picker" aria-label="节日配色">{Object.entries(THEMES).map(([key, theme]) => <button type="button" key={key} aria-pressed={draft.color === key} aria-label={theme.name} title={theme.name} style={themeVars(key)} onClick={() => setDraft(value => ({ ...value, color: key as ThemeId }))}><span>{draft.color === key ? '✓' : ''}</span><small>{theme.name}</small></button>)}</div>
            <div className="picker-label">图标 <span>{ICONS[draft.icon]}</span></div>
            <div className="icon-picker" aria-label="节日图标">{Object.entries(ICONS).map(([key, label]) => <button type="button" key={key} aria-label={label} title={label} aria-pressed={draft.icon === key} onClick={() => setDraft(value => ({ ...value, icon: key as IconId }))}><HolidayIcon icon={key} size={23} /><small>{label}</small></button>)}</div>
            <div className="picker-label">倒数卡样式</div>
            <div className="style-picker" aria-label="倒数卡样式">{Object.entries(STYLES).map(([key, label]) => <button type="button" key={key} aria-pressed={draft.style === key} onClick={() => setDraft(value => ({ ...value, style: key as StyleId }))}><span className={`style-swatch style-swatch--${key}`} />{label}</button>)}</div>
            <label className="cal-pin"><input type="checkbox" checked={draft.pinned} onChange={e => setDraft(value => ({ ...value, pinned: e.target.checked }))} /><span>把这一天放在岛上倒数面板<small>只置顶一个日子；不置顶时显示最近的节日。</small></span></label>
          </fieldset>
          <aside className="editor-preview"><p className="panel-eyebrow">A DAY TO LOOK FORWARD TO</p><h3>我们的期待，长这样</h3><CountdownCard holiday={draft} today={today} /><p className="preview-note">配色和图标也会同步到月历里的这一天。</p></aside>
          <footer className="editor-footer">{actionError && <p className="form-error" role="alert">{actionError}</p>}<button type="button" className="cal-secondary" onClick={cancelEdit} disabled={busy}>返回月历</button><button type="submit" className="cal-primary" disabled={busy}>{busy ? '正在保存…' : editId ? '保存修改' : '把这一天记下来'}</button></footer>
        </form> : view === 'trash' ? <MemoryTrash
          items={trashItems}
          keepDays={trashKeepDays}
          loading={trashLoading}
          error={trashError}
          busy={memoryBusy}
          onRefresh={() => setRevision(value => value + 1)}
          onRestore={restoreMemory}
          onBack={() => setView('calendar')}
        /> : <>
          <div className="calendar-intro"><div><h3>每个小日子，都值得期待。</h3><p>记下属于我们的节日，把平凡的一天变特别。</p></div><button className="cal-primary" onClick={() => startEdit()}><span aria-hidden="true">＋</span> 新建节日</button></div>
          {notice && <p className="calendar-notice" role="status">{notice}</p>}
          {loadError && <div className="calendar-error" role="alert">{loadError}<button onClick={() => setRevision(value => value + 1)} className="text-button">重新读取</button></div>}
          {loading && <p className="calendar-loading" role="status">正在翻开日历…</p>}
          <div className="calendar-layout">
            <section className="calendar-month" aria-label="节日与记忆月历">
              <div className="month-heading"><div><span className="month-year num">{year}</span><h3>{monthNumber} 月 <small>{monthItems.length} 个特别日子</small></h3></div>
                <div className="month-nav"><button aria-label="上个月" disabled={month <= '1900-01-01'} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button><button onClick={() => selectDay(today)}>今天</button><button aria-label="下个月" disabled={month >= '2199-12-01'} onClick={() => setMonth(shiftMonth(month, 1))}>›</button></div></div>
              <div className="calendar-week" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div>
              <div className="calendar-grid">{cells.map(key => {
                const events = items.filter(item => occursOn(item, key)), inMonth = key.slice(0, 7) === month.slice(0, 7)
                const dayMemories = monthMemories.filter(item => item.date === key)
                const cover = dayMemories.find(item => item.attachments.length > 0)
                return <button key={key} className={`calendar-day ${!inMonth ? 'calendar-day--outside' : ''} ${key === today ? 'calendar-day--today' : ''} ${key === selectedDay ? 'calendar-day--selected' : ''}`} disabled={!validDate(key)} aria-pressed={key === selectedDay} aria-current={key === today ? 'date' : undefined} aria-label={`${readableDate(key)}${events.length ? '，' + events.map(item => item.name).join('、') : ''}${dayMemories.length ? `，${dayMemories.length} 条记忆` : ''}`} onClick={() => selectDay(key)}>
                  <span className="day-number num">{dateParts(key)[2]}</span>
                  <span className="day-stickers">
                    {cover && <span className="day-memory-sticker" title="这一天的记忆"><img src={fileUrl(cover.attachments[0], 'thumb')} alt="" loading="lazy" /></span>}
                    {dayMemories.length > 0 && <span className="day-memory-count num" title={`${dayMemories.length} 条记忆`}>{dayMemories.length}</span>}
                    {events.slice(0, cover ? 1 : 2).map(item => <span key={item.id} className="day-sticker" style={themeVars(item.color)} title={item.name}><HolidayIcon icon={item.icon} size={14} /></span>)}
                    {events.length > (cover ? 1 : 2) && <small>+{events.length - (cover ? 1 : 2)}</small>}
                  </span>
                  {events[0] && <span className="day-event-name">{events[0].name}</span>}
                </button>
              })}</div>
              {memoriesError && <div className="calendar-error" role="alert">{memoriesError}<button className="text-button" onClick={() => setRevision(value => value + 1)}>重新读取</button></div>}
              <div className="calendar-legend"><span><i />今天</span><span>照片与数字 = 这一天的记忆</span><span>轻点日期查看与添加</span></div>
              <section className="day-detail"><div className="day-detail-heading"><h4>{readableDate(selectedDay)}</h4><div className="day-detail-entry">
                <button className="text-button" onClick={() => startMemoryEdit()}><span aria-hidden="true">＋</span> 添加记忆</button>
                <button className="text-button" onClick={() => startEdit()}>＋ 记下这一天</button>
              </div></div>
                {selectedMemories.length > 0 && <MemoryCards
                  memories={selectedMemories}
                  busy={memoryBusy}
                  onEdit={memory => startMemoryEdit(memory)}
                  onDelete={memory => { setDeletingMemory(memory); setActionError('') }}
                  onOpenPhoto={(memory, index) => setViewer({ memoryId: memory.id, index })}
                />}
                {selectedMemories.length === 0 && <p className="day-memory-empty">这一天还没有记忆。拍下的照片、路过的心情，都可以放进来。</p>}
                {deletingMemory && <div className="delete-confirm" role="alert">
                  <p>删除「{memoryTitle(deletingMemory)}」？它会进「最近删除」，30 天内都能找回，照片不会被清掉。</p>
                  <button className="cal-secondary" disabled={memoryBusy} onClick={() => setDeletingMemory(null)}>保留</button>
                  <button className="cal-danger" disabled={memoryBusy} onClick={() => removeMemory(deletingMemory)}>{memoryBusy ? '正在删除…' : '确认删除'}</button>
                </div>}
                {actionError && <p className="form-error" role="alert">{actionError}</p>}
                <div className="day-detail-divider" aria-hidden="true">纪念日在下面 ↓</div>
                {!selectedItems.length ? <p className="day-empty">这一天还是一张空白信纸，写下一个属于你们的约定吧。</p> : selectedItems.map(item => <article className="day-event" key={item.id} style={themeVars(item.color)}>
                  <span className="event-icon"><HolidayIcon icon={item.icon} /></span><div className="day-event-copy"><h4>{item.name}</h4><span>{REPEATS[item.repeat]} · 从 {item.date} 开始{item.pinned ? ' · 岛上置顶' : ''}</span>{item.note && <p>{item.note}</p>}
                  {deleteId === item.id ? <div className="delete-confirm" role="alert"><p>删除「{item.name}」？这个节日的重复提醒也会一起移除。</p><button className="cal-secondary" disabled={busy} onClick={() => setDeleteId(null)}>保留</button><button className="cal-danger" disabled={busy} onClick={() => remove(item.id)}>{busy ? '正在删除…' : '确认删除'}</button></div> : <div className="day-event-actions"><button onClick={() => setHighlightId(item.id)} className="text-button">查看倒数</button><button onClick={() => startEdit(item)} className="text-button">编辑</button><button onClick={() => { setDeleteId(item.id); setActionError('') }} className="text-button">删除</button></div>}
                  </div></article>)}
              </section>
            </section>
            <aside className="calendar-countdowns"><div className="countdown-heading"><span className="panel-eyebrow">COUNTING LITTLE JOYS</span><h3>下一份小期待</h3></div>
              {highlighted ? <CountdownCard holiday={highlighted} today={today} /> : <div className="countdown-empty"><HolidayIcon icon="sparkles" size={44} /><h4>把期待放在这里</h4><p>添一个节日，灯塔就会开始为你们倒数。</p><button className="cal-secondary" onClick={() => startEdit()}>添加第一个节日</button></div>}
              {highlighted && <button className="text-button countdown-edit" onClick={() => startEdit(highlighted)}>调整这张倒数卡 ↗</button>}
              <div className="upcoming-heading"><h4>即将到来</h4><span>{upcoming.length} 个约定</span></div>
              <div className="upcoming-list">{upcoming.slice(0, 8).map(({ item, next }) => <button key={item.id} className="upcoming-item" style={themeVars(item.color)} onClick={() => { selectDay(next); setHighlightId(item.id) }}>
                <span className="event-icon"><HolidayIcon icon={item.icon} size={20} /></span><span><strong>{item.name}</strong><small>{next}{item.pinned ? ' · 置顶' : ''}</small></span><b className="num">{daysBetween(today, next) === 0 ? '今天' : `${daysBetween(today, next)} 天`}</b>
              </button>)}</div>
              {!upcoming.length && items.length > 0 && <p className="day-empty">过去的日子仍在月历里。添一个新约定，继续期待吧。</p>}
              <div className="all-holidays"><h4>全部收藏 · {items.length}</h4>{items.map(item => <button key={item.id} className="text-button" onClick={() => { const day = nextOccurrence(item, today) ?? item.date; selectDay(day); setHighlightId(item.id) }}>{item.name}<span>{REPEATS[item.repeat]} ↗</span></button>)}</div>
            </aside>
          </div>
        </>}
        <div className="calendar-colophon"><span>只属于我们的日历</span><span aria-hidden="true">✦</span><span>把日子慢慢过成喜欢的样子</span></div>
      </div>
    </div>}
    {viewerMemory && viewer && <PhotoViewer
      memory={viewerMemory}
      index={Math.min(viewer.index, viewerMemory.attachments.length - 1)}
      onIndex={index => setViewer({ memoryId: viewer.memoryId, index })}
      onClose={() => setViewer(null)}
    />}
  </>
}
