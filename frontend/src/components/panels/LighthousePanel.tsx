import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { eventBus, type LighthouseSignal } from '../../game/EventBus'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { PixelIcon } from '../PixelIcon'
import './lighthouse.css'

interface Preset {
  id: string
  label: string
  color: string
  hint: string
}

const DEFAULT_PRESETS: Preset[] = [
  { id: 'amber', label: '暖金 · 想你了', color: '#ffd98a', hint: '亮一盏暖光，告诉你我在想你' },
  { id: 'coral', label: '珊瑚 · 来海边', color: '#ff9f8c', hint: '海风刚好，有空一起去海边坐坐' },
  { id: 'lavender', label: '星紫 · 晚安', color: '#c7b2ff', hint: '今天辛苦啦，祝你一夜好梦' },
  { id: 'sea', label: '海蓝 · 在忙中', color: '#8ad4f5', hint: '正在专注做事，忙完马上来找你' },
  { id: 'ivory', label: '月白 · 静静守候', color: '#fff4d6', hint: '不催不急，小岛一直亮着灯等你' },
]

function formatAgo(iso: string | null): string {
  if (!iso) return '等待第一次点亮'
  const utc = /(?:Z|[+-]\d\d:\d\d)$/.test(iso) ? iso : `${iso}Z`
  const mins = Math.max(0, Math.floor((Date.now() - new Date(utc).getTime()) / 60000))
  if (!Number.isFinite(mins)) return ''
  if (mins < 2) return '刚刚点亮'
  if (mins < 60) return `${mins} 分钟前`
  if (mins < 1440) return `${Math.floor(mins / 60)} 小时前`
  return `${Math.floor(mins / 1440)} 天前`
}

export function LighthousePanel() {
  const [open, setOpen] = useState(false)
  const [signal, setSignal] = useState<LighthouseSignal | null>(null)
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS)
  const [selected, setSelected] = useState('amber')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function loadSignal(syncForm: boolean) {
    api<{ signal: LighthouseSignal; presets?: Preset[] }>('/api/lighthouse')
      .then((res) => {
        setSignal(res.signal)
        if (res.presets?.length) setPresets(res.presets)
        eventBus.emit('LIGHTHOUSE_UPDATED', res.signal)
        if (syncForm) {
          setSelected(res.signal.preset)
          setMessage(res.signal.message || '')
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadSignal(false)
    const onOpen = () => {
      setError('')
      setOpen(true)
      eventBus.emit('PANEL_OPENED', { panel: 'lighthouse' })
      loadSignal(true)
    }
    const onReady = ({ scene }: { scene: string }) => {
      if (scene === 'island') loadSignal(false)
    }
    eventBus.on('OPEN_LIGHTHOUSE', onOpen)
    eventBus.on('SCENE_READY', onReady)
    return () => {
      eventBus.off('OPEN_LIGHTHOUSE', onOpen)
      eventBus.off('SCENE_READY', onReady)
    }
  }, [])

  function close() {
    setOpen(false)
    eventBus.emit('PANEL_CLOSED', { panel: 'lighthouse' })
  }

  const dialog = useDialogFocus(open, close)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const res = await api<{ ok: boolean; signal: LighthouseSignal }>('/api/lighthouse', {
        method: 'PUT',
        body: JSON.stringify({ preset: selected, message }),
      })
      setSignal(res.signal)
      eventBus.emit('LIGHTHOUSE_UPDATED', res.signal)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : '暂时无法更新灯塔信号')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const activePreset = presets.find((p) => p.id === selected) ?? presets[0]

  return (
    <div className="modal-mask" onClick={close}>
      <div
        ref={dialog}
        className="wood-panel modal-panel lighthouse-panel px-font"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lighthouse-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="lighthouse-title" className="lh-heading">
            <PixelIcon name="spark" size={18} />
            <span>灯语信号塔</span>
          </h2>
          <button type="button" className="btn btn-mini" onClick={close} aria-label="关上灯塔面板">
            <PixelIcon name="close" size={14} />
          </button>
        </div>

        <div className="lh-current">
          <span
            className="lh-beacon-dot"
            style={{ background: signal?.color ?? '#ffd98a', boxShadow: `0 0 12px ${signal?.color ?? '#ffd98a'}` }}
            aria-hidden="true"
          />
          <div className="lh-current-copy">
            <strong>{signal?.label ?? '暖金 · 想你了'}</strong>
            <p>{signal?.message || '小岛灯塔正静静亮着，点击下方切换此刻的灯语信号。'}</p>
            <span className="lh-meta">
              {signal?.updated_by_display ? `${signal.updated_by_display} · ${formatAgo(signal.updated_at)}` : '还没有人切换过灯语'}
            </span>
          </div>
        </div>

        <form className="lh-form" onSubmit={handleSave}>
          <div className="lh-presets" role="radiogroup" aria-label="选择灯塔信号色">
            {presets.map((p) => {
              const active = selected === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`lh-preset${active ? ' is-active' : ''}`}
                  onClick={() => setSelected(p.id)}
                >
                  <span className="lh-swatch" style={{ background: p.color }} aria-hidden="true" />
                  <span>{p.label}</span>
                </button>
              )
            })}
          </div>

          <label className="lh-field">
            <span>留一句灯语（选填，最多 48 字）</span>
            <input
              type="text"
              maxLength={48}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={activePreset.hint}
            />
          </label>

          {error && <p className="lh-error">{error}</p>}

          <div className="lh-actions">
            <button type="button" className="btn btn-mini" onClick={close}>
              先不改
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '点亮中…' : '点亮灯塔'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
