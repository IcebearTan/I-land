import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api/client'
import type { User } from '../types'

export function LoginPanel({ onLogin }: { onLogin: (user: User) => void }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
          <h1 className="site-title">I-land</h1>
          <p className="site-sub">我们的岛 · 登岛上岸</p>
          <form onSubmit={submit}>
            <label>
              <span>名字</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bear / her"
                autoComplete="username"
                required
              />
            </label>
            <label>
              <span>密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary btn-login" disabled={busy}>
              {busy ? '上岛中…' : '🐻 上岛'}
            </button>
          </form>
          <p className="login-hint">这座岛只住两只小熊 ♥</p>
        </div>
      </div>
    </div>
  )
}
