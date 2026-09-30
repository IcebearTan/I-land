/** 两位岛民显示名字的共享小仓库：后端 meta 为数据源，改名后全站即时生效。 */
import { useEffect, useState } from 'react'
import { api } from './api/client'

export interface IslanderNames { bear: string; her: string }

const FALLBACK: IslanderNames = { bear: '小熊', her: '她' }
let names: IslanderNames = { ...FALLBACK }
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()
let refreshTimer: number | null = null

function refreshVisible(): void {
  if (document.visibilityState === 'visible') void refreshIslanders().catch(() => {})
}

export function refreshIslanders(): Promise<void> {
  pending = pending ?? api<{ names?: Partial<IslanderNames> }>('/api/meta')
    .then(meta => {
      applyIslanders({
        bear: meta.names?.bear?.trim() || FALLBACK.bear,
        her: meta.names?.her?.trim() || FALLBACK.her,
      })
    })
    .finally(() => { pending = null })
  return pending
}

export function applyIslanders(next: Partial<IslanderNames>): void {
  names = { ...names, ...next }
  listeners.forEach(notify => notify())
}

/** 订阅名字变化；首次使用时自动从 /api/meta 拉一次（并发去重）。 */
export function useIslanders(): IslanderNames {
  const [, setRevision] = useState(0)
  useEffect(() => {
    const notify = () => setRevision(value => value + 1)
    listeners.add(notify)
    if (refreshTimer === null) {
      refreshTimer = window.setInterval(refreshVisible, 60_000)
      window.addEventListener('focus', refreshVisible)
      document.addEventListener('visibilitychange', refreshVisible)
    }
    void refreshIslanders().catch(() => {})
    return () => {
      listeners.delete(notify)
      if (!listeners.size && refreshTimer !== null) {
        window.clearInterval(refreshTimer); refreshTimer = null
        window.removeEventListener('focus', refreshVisible)
        document.removeEventListener('visibilitychange', refreshVisible)
      }
    }
  }, [])
  return names
}

/** 账号名 → 当前显示名（bear/her 之外的账号原样返回）。 */
export function islanderName(account: string): string {
  if (account === 'bear') return names.bear
  if (account === 'her') return names.her
  return account || '岛上居民'
}
