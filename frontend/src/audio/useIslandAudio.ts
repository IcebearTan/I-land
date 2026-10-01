import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { eventBus } from '../game/EventBus'
import { DEFAULT_AUDIO, type AudioSettings, type AudioStatus } from './types'

export function useIslandAudio(userId: number | null) {
  const [settings, setSettings] = useState<AudioSettings>({ ...DEFAULT_AUDIO })
  const [playback, setPlayback] = useState<AudioStatus>({ status: 'locked' })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const snapshot = useRef<AudioSettings>({ ...DEFAULT_AUDIO })
  const controller = useRef<AbortController | null>(null)
  const pending = useRef<Partial<AudioSettings>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const live = useRef(false)

  async function load() {
    if (userId === null) return
    const requestController = controller.current
    if (requestController?.signal.aborted) return
    setError('')
    try {
      const result = await api<{ settings: AudioSettings }>('/api/settings/audio', { signal: requestController?.signal })
      if (!live.current || requestController?.signal.aborted) return
      snapshot.current = result.settings
      setSettings(result.settings); setReady(true); setError('')
      eventBus.emit('AUDIO_SETTINGS', result.settings)
    } catch {
      if (live.current && !requestController?.signal.aborted) setError('没读到声音偏好，重新读取后再开启。')
    }
  }

  async function flush() {
    if (!live.current || inFlight.current || !Object.keys(pending.current).length) return
    const patch = pending.current
    const requestController = controller.current
    pending.current = {}
    inFlight.current = true
    setSaving(true); setError(''); setSaved(false)
    try {
      await api('/api/settings/audio', {
        method: 'PUT', body: JSON.stringify(patch), signal: requestController?.signal,
      })
      if (live.current && requestController === controller.current && !requestController?.signal.aborted) setSaved(true)
    } catch {
      if (live.current && !requestController?.signal.aborted) {
        // 失败字段保留，较新的修改优先；重试按原样设置，不能做 toggle。
        pending.current = { ...patch, ...pending.current }
        setError('声音已在这里调整，偏好还没保存。可以重试。')
      }
      return
    } finally {
      if (requestController === controller.current) {
        inFlight.current = false
        if (live.current) setSaving(false)
      }
    }
    if (requestController === controller.current && Object.keys(pending.current).length) void flush()
  }

  useEffect(() => {
    live.current = true
    controller.current = new AbortController()
    snapshot.current = userId === null ? { ...snapshot.current } : { ...DEFAULT_AUDIO, muted: snapshot.current.muted }
    pending.current = {}; inFlight.current = false
    setReady(userId === null); setSettings(snapshot.current)
    setSaved(false); setSaving(false); setError('')
    const sync = () => {
      eventBus.emit('AUDIO_SESSION', { active: userId !== null })
      eventBus.emit('AUDIO_SETTINGS', snapshot.current)
    }
    const status = (value: AudioStatus) => setPlayback(value)
    eventBus.on('AUDIO_READY', sync)
    eventBus.on('AUDIO_STATUS', status)
    sync()
    eventBus.emit('AUDIO_REQUEST_STATE', {})
    if (userId !== null) void load()
    return () => {
      live.current = false
      controller.current?.abort()
      if (timer.current) clearTimeout(timer.current)
      eventBus.off('AUDIO_READY', sync)
      eventBus.off('AUDIO_STATUS', status)
      eventBus.emit('AUDIO_SESSION', { active: false })
    }
  }, [userId])

  function change(patch: Partial<AudioSettings>, immediate = false) {
    if (!ready) return
    snapshot.current = { ...snapshot.current, ...patch }
    setSettings(snapshot.current); setSaved(false)
    eventBus.emit('AUDIO_SETTINGS', snapshot.current)
    pending.current = { ...pending.current, ...patch }
    if (timer.current) clearTimeout(timer.current)
    if (immediate) void flush()
    else timer.current = setTimeout(() => void flush(), 500)
  }

  function start() {
    if (!ready) { void load(); return }
    change({ muted: false }, true)
    eventBus.emit('AUDIO_UNLOCK', {})
  }

  return { settings, playback, ready, error, saving, saved, change, start, saveNow: () => void flush(), retry: () => ready ? void flush() : void load() }
}
