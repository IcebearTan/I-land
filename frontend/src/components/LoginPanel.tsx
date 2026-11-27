import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api/client'
import { CHARACTERS, type CharacterId } from '../characters'
import { useIslanders } from '../islanders'
import type { User } from '../types'
import { CharacterPortrait } from './CharacterPortrait'
import { PixelIcon } from './PixelIcon'

/** Fallback standalone login when `/island` is opened directly outside Donut without a session. */
export function LoginPanel({ onLogin }: { onLogin: (user: User) => void }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<CharacterId | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const islanders = useIslanders()
  const loginName = selected ? islanders[selected] : name

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ name: loginName, password }),
      })
      onLogin(res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上岛失败，再试一次')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap px-font">
      <div className="login-float px-pop">
        <img
          src="/art-v2/ui/title-plaque.png"
          alt="I-land"
          width={272}
          height={84}
          draggable={false}
          className="dock-plaque"
        />
        <div className="login-panel wood-panel">
          <div className="islander-select" aria-label="选择岛民账号">
            {(['bear', 'her'] as const).map((id) => (
              <button
                type="button"
                key={id}
                className="islander-option"
                aria-pressed={loginName === islanders[id]}
                disabled={busy}
                onClick={() => {
                  setSelected(id)
                  setName(islanders[id])
                  setPassword('')
                  setError('')
                }}
              >
                <CharacterPortrait character={id} size={56} />
                <span>{islanders[id]}</span>
                <small style={{ color: 'var(--px-ink-soft)', fontSize: 11 }}>
                  {CHARACTERS[id].description}
                </small>
              </button>
            ))}
          </div>
          <form onSubmit={submit}>
            <label>
              <span>岛民名字</span>
              <input
                value={loginName}
                onChange={(e) => {
                  setSelected(null)
                  setName(e.target.value)
                }}
                placeholder="点选上方头像或输入名字"
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
                placeholder="输入暗号"
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary btn-login" disabled={busy}>
              <PixelIcon name="boat" size={20} />
              <span>{busy ? '上岛中…' : '核验身份'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
