import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import { eventBus } from '../game/EventBus'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { CharacterPortrait } from './CharacterPortrait'
import { characterId } from '../characters'
import { applyIslanders, useIslanders } from '../islanders'
import type { User } from '../types'

const MAX_NAME = 20

/** 设置控制台：岛民名字 + 登录暗号。名字两人共享，任意一方可改。 */
export function SettingsPanel({ user, onUserChange }: { user: User; onUserChange: (user: User) => void }) {
  const [open, setOpen] = useState(false)
  const islanders = useIslanders()
  const [bearName, setBearName] = useState(islanders.bear)
  const [herName, setHerName] = useState(islanders.her)
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState('')
  const [nameNotice, setNameNotice] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwDone, setPwDone] = useState(false)

  function close() {
    setOpen(false)
    setOldPassword(''); setNewPassword(''); setRepeat(''); setPwError(''); setPwDone(false)
    setBearName(islanders.bear); setHerName(islanders.her); setNameError(''); setNameNotice('')
    eventBus.emit('PANEL_CLOSED', { panel: 'settings' })
  }
  const dialog = useDialogFocus(open, close)
  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      setBearName(islanders.bear); setHerName(islanders.her)
      setNameError(''); setNameNotice(''); setPwDone(false); setPwError('')
      eventBus.emit('PANEL_OPENED', { panel: 'settings' })
    }
    eventBus.on('OPEN_SETTINGS', onOpen)
    return () => eventBus.off('OPEN_SETTINGS', onOpen)
  }, [islanders])

  async function saveNames(event: FormEvent) {
    event.preventDefault()
    if (nameBusy) return
    const bear = bearName.trim(), her = herName.trim()
    if (!bear || !her) { setNameError('两个名字都要填哦。'); return }
    if (bear === her) { setNameError('两个人需要不同的名字，才能分清登录账号。'); return }
    if (bear.length > MAX_NAME || her.length > MAX_NAME) { setNameError(`名字最多 ${MAX_NAME} 个字。`); return }
    setNameBusy(true); setNameError(''); setNameNotice('')
    try {
      const { names, user: updatedUser } = await api<{ names: { bear: string; her: string }; user: User }>('/api/settings/names', {
        method: 'PUT', body: JSON.stringify({ bear, her }),
      })
      applyIslanders(names)
      onUserChange(updatedUser)
      setBearName(names.bear); setHerName(names.her)
      setNameNotice('名字和登录账号都换好了。下次用新名字上岛，暗号不变。')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setNameError('登录已过期，重新登录后再改。')
      else setNameError(error instanceof Error ? error.message : '保存失败，请重试。')
    } finally { setNameBusy(false) }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (pwBusy) return
    if (newPassword.length < 6) { setPwError('新密码至少 6 位。'); return }
    if (newPassword !== repeat) { setPwError('两次输入的新密码不一样。'); return }
    setPwBusy(true); setPwError('')
    try {
      await api('/api/auth/password', { method: 'POST', body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) })
      setPwDone(true); setOldPassword(''); setNewPassword(''); setRepeat('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setPwError('现在的密码不对，再想想。')
      else setPwError(error instanceof Error ? error.message : '改密失败，请重试。')
    } finally { setPwBusy(false) }
  }

  if (!open) return null
  return <div className="modal-mask" onClick={close}>
    <div ref={dialog} className="wood-panel modal-panel settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e => e.stopPropagation()}>
      <div className="modal-head">
        <div><p className="panel-eyebrow">ISLAND SETTINGS</p><h2 id="settings-title">小岛设置</h2></div>
        <button className="btn btn-mini" onClick={close}>合上 ✕</button>
      </div>

      <form className="settings-section" onSubmit={saveNames}>
        <h3>岛民名字</h3>
        <p className="settings-note">名字也是登录账号，改名后用新名字上岛，暗号不变。信件和记忆里的署名也会同步，两个人都能改。</p>
        <div className="settings-name-row">
          <CharacterPortrait character="bear" size={44} />
          <label><span>白熊的名字</span>
            <input value={bearName} maxLength={MAX_NAME} placeholder="小熊" onChange={e => setBearName(e.target.value)} />
          </label>
        </div>
        <div className="settings-name-row">
          <CharacterPortrait character="her" size={44} />
          <label><span>黑发岛民的名字</span>
            <input value={herName} maxLength={MAX_NAME} placeholder="她" onChange={e => setHerName(e.target.value)} />
          </label>
        </div>
        {nameError && <p className="form-error" role="alert">{nameError}</p>}
        {nameNotice && <p className="settings-notice" role="status">{nameNotice}</p>}
        <button className="btn btn-primary" disabled={nameBusy}>{nameBusy ? '正在保存…' : '保存名字'}</button>
      </form>

      {pwDone ? <div className="settings-section account-done" role="status">
        <CharacterPortrait character={characterId(user.sprite, user.account)} size={56} />
        <h3>暗号换好了</h3>
        <p>这台设备保持登录；其他设备需要用新暗号重新上岛。</p>
        <button className="btn" onClick={() => setPwDone(false)}>再改一次</button>
      </div> : <form className="settings-section" onSubmit={changePassword}>
        <h3>登录暗号</h3>
        <p className="settings-note">换暗号后其他设备会下线，需要新暗号重新上岛。</p>
        <label><span>现在的暗号</span>
          <input type="password" value={oldPassword} autoComplete="current-password" required onChange={e => setOldPassword(e.target.value)} />
        </label>
        <label><span>新暗号 <small>至少 6 位</small></span>
          <input type="password" value={newPassword} autoComplete="new-password" required minLength={6} onChange={e => setNewPassword(e.target.value)} />
        </label>
        <label><span>再输一遍新暗号</span>
          <input type="password" value={repeat} autoComplete="new-password" required minLength={6} onChange={e => setRepeat(e.target.value)} />
        </label>
        {pwError && <p className="form-error" role="alert">{pwError}</p>}
        <button className="btn btn-primary" disabled={pwBusy}>{pwBusy ? '正在更换…' : '换新暗号'}</button>
      </form>}
    </div>
  </div>
}
