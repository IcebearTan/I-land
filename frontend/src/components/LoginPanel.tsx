import { CharacterPortrait } from './CharacterPortrait'
import { CHARACTERS } from '../characters'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api/client'
import { useIslanders } from '../islanders'
import type { User } from '../types'

export function LoginPanel({ onLogin }: { onLogin: (user: User) => void }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const islanders = useIslanders()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ name, password }),
      })
      onLogin(res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上岛失败，再试一次')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-float">
        <div className="login-panel">
          <p className="login-eyebrow">A LITTLE WORLD FOR TWO</p>
          <h1 className="site-title">I-land</h1>
          <p className="site-sub">把日子，慢慢种成我们的小岛。</p>
          <div className="login-divider" aria-hidden="true">♥</div>
          <div className="islander-select" aria-label="选择岛民账号">
            {(['bear', 'her'] as const).map(id => <button type="button" key={id} className="islander-option" aria-pressed={name === id} disabled={busy}
              onClick={() => { setName(id); setPassword(''); setError('') }}>
              <CharacterPortrait character={id} size={44} />
              <span>{id === 'bear' ? `男生 · ${islanders.bear}` : `女生 · ${islanders.her}`}<small>{CHARACTERS[id].description}</small></span>
            </button>)}
          </div>
          <form onSubmit={submit}>
            <label>
              <span>你的名字</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bear / her"
                autoComplete="username"
                required
              />
            </label>
            <label>
              <span>上岛暗号</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="只有我们知道的暗号"
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-login" disabled={busy}>
              {busy ? '上岛中…' : '回到我们的小岛  →'}
            </button>
          </form>
          <p className="login-hint">两位岛民 · 一起收藏平凡的小事</p>
        </div>
        <p className="login-caption">有你的地方，就是小岛。</p>
      </div>
    </div>
  )
}
