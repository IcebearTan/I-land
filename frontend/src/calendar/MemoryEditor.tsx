import { useRef } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { HolidayDateField } from './HolidayDateField'
import { MAX_DESCRIPTION, MAX_PHOTOS, MOODS, WEATHERS } from './memories'
import type { MemoryDraft, MemoryRecord, WeatherId } from './memories'

interface EditorProps {
  draft: MemoryDraft
  busy: boolean
  error: string
  conflict: MemoryRecord | null
  onField: (patch: Partial<MemoryDraft>) => void
  onDate: (date: string) => void
  onAddFiles: (files: File[]) => void
  onRetryPhoto: (key: string) => void
  onRemovePhoto: (key: string) => void
  onMovePhoto: (key: string, delta: -1 | 1) => void
  onLoadLatest: () => void
  onSubmit: () => void
  onCancel: () => void
}

export function MemoryEditor(props: EditorProps) {
  const { draft, busy } = props
  const fileInput = useRef<HTMLInputElement>(null)
  const uploading = draft.photos.some(photo => photo.status === 'uploading')
  const failed = draft.photos.some(photo => photo.status === 'error')
  const canSave = !busy && !uploading
  const photosFull = draft.photos.length >= MAX_PHOTOS

  function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length) props.onAddFiles(files)
    event.target.value = '' // 允许连续选择同一张
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (canSave) props.onSubmit()
  }

  return <form className="memory-editor" onSubmit={submit}>
    <fieldset disabled={busy} className="editor-fields">
      <div className="editor-section-title"><span>01</span><h3>这一天发生了什么</h3></div>
      <div className="cal-field-row"><HolidayDateField value={draft.date} onChange={props.onDate} />
        <label className="cal-field">取个名字 <span className="field-optional">选填</span>
          <input value={draft.title} maxLength={120} placeholder="例如：海边的日落" onChange={e => props.onField({ title: e.target.value })} /></label>
      </div>
      <label className="cal-field">写下来 <span className="field-optional">照片和文字至少留一样</span>
        <textarea name="memory-description" rows={5} value={draft.description} maxLength={MAX_DESCRIPTION} placeholder="那天的小事、当时的心情、路过的猫…" onChange={e => props.onField({ description: e.target.value })} /></label>
      <p className="cal-field-hint">不取名字也没关系，日历会用日期和你写的第一句话来称呼它。</p>

      <div className="editor-section-title"><span>02</span><h3>照片 <span className="field-optional">最多 {MAX_PHOTOS} 张</span></h3></div>
      <ul className="memory-photos">
        {draft.photos.map((photo, index) => <li key={photo.key} className={`memory-photo memory-photo--${photo.status}`}>
          <img src={photo.previewUrl} alt={photo.name} />
          {photo.status === 'uploading' && <span className="memory-photo-progress" role="status"><i style={{ width: `${Math.round(photo.progress * 100)}%` }} /><small>{Math.round(photo.progress * 100)}%</small></span>}
          {photo.status === 'error' && <span className="memory-photo-error" role="alert">{photo.error || '没传上去'}</span>}
          {photo.status === 'done' && <span className="memory-photo-ready" aria-label="已上传">✓</span>}
          <div className="memory-photo-actions">
            <button type="button" aria-label="前移一张" disabled={index === 0} onClick={() => props.onMovePhoto(photo.key, -1)}>‹</button>
            <button type="button" aria-label="后移一张" disabled={index === draft.photos.length - 1} onClick={() => props.onMovePhoto(photo.key, 1)}>›</button>
            {photo.status === 'error'
              ? <button type="button" className="memory-photo-retry" onClick={() => props.onRetryPhoto(photo.key)}>重试</button>
              : <span aria-hidden="true" />}
            <button type="button" aria-label={`移除 ${photo.name}`} className="memory-photo-remove" onClick={() => props.onRemovePhoto(photo.key)}>✕</button>
          </div>
        </li>)}
        <li className="memory-photo memory-photo--add">
          <button type="button" disabled={photosFull} onClick={() => fileInput.current?.click()} aria-label={photosFull ? `最多 ${MAX_PHOTOS} 张照片` : '添加照片'}>
            <span aria-hidden="true">＋</span><small>{photosFull ? '满了' : '照片'}</small>
          </button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={pickFiles} />
        </li>
      </ul>
      {uploading && <p className="cal-field-hint" role="status">照片还在上传，等它们打上 ✓ 再保存。</p>}
      {failed && !uploading && <p className="form-error" role="alert">有照片没传成功：重试或移除它，再保存这条记忆。</p>}

      <div className="editor-section-title"><span>03</span><h3>那天的心情与天气</h3></div>
      <div className="picker-label">心情 <span>{draft.mood || '不填也可以'}</span></div>
      <div className="mood-picker" aria-label="选择心情">
        {MOODS.map(mood => <button type="button" key={mood} aria-pressed={draft.mood === mood} aria-label={`心情 ${mood}`} onClick={() => props.onField({ mood: draft.mood === mood ? '' : mood })}>{mood}</button>)}
      </div>
      <div className="picker-label">天气 <span>{draft.weatherType ? WEATHERS[draft.weatherType].label : '不填也可以'}</span></div>
      <div className="weather-picker" aria-label="选择天气">
        {(Object.keys(WEATHERS) as WeatherId[]).map(id => <button type="button" key={id} aria-pressed={draft.weatherType === id} onClick={() => props.onField({ weatherType: draft.weatherType === id ? '' : id })}>
          <span aria-hidden="true">{WEATHERS[id].icon}</span><small>{WEATHERS[id].label}</small>
        </button>)}
      </div>
      <div className="cal-field-row">
        <label className="cal-field">天气备注 <span className="field-optional">选填</span>
          <input value={draft.weatherNote} maxLength={60} placeholder="29°C 微风" onChange={e => props.onField({ weatherNote: e.target.value })} /></label>
        <label className="cal-field">在哪里 <span className="field-optional">选填</span>
          <input value={draft.location} maxLength={60} placeholder="青岛" onChange={e => props.onField({ location: e.target.value })} /></label>
      </div>
    </fieldset>
    <footer className="editor-footer">
      {props.conflict && <div className="memory-conflict" role="alert">
        <p>{props.error || '对方刚刚更新了这条记忆。'}</p>
        <div><button type="button" className="cal-secondary" onClick={props.onLoadLatest}>载入她的最新版本</button>
          <button type="button" className="cal-secondary" onClick={props.onCancel}>先不保存了</button></div>
      </div>}
      {!props.conflict && props.error && <p className="form-error" role="alert">{props.error}</p>}
      <button type="button" className="cal-secondary" onClick={props.onCancel} disabled={busy}>返回日历</button>
      <button type="submit" className="cal-primary" disabled={!canSave}>{busy ? '正在保存…' : draft.id ? '保存修改' : '把这一天记下来'}</button>
    </footer>
  </form>
}
