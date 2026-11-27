import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import type { useIslandAudio } from '../audio/useIslandAudio'
import { characterId } from '../characters'
import { eventBus } from '../game/EventBus'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { applyIslanders, useIslanders } from '../islanders'
import type { User } from '../types'
import { AudioControls } from './AudioControls'
import { CharacterPortrait } from './CharacterPortrait'
import { PixelIcon } from './PixelIcon'

const MAX_NAME = 20

/** Island settings panel — carved wood pixel modal; hides duplicate password form when embedded in Donut. */
export function SettingsPanel({
  user,
  onUserChange,
  audio,
  embedded = false,
}: {
  user: User
  onUserChange: (user: User) => void
  audio: ReturnType<typeof useIslandAudio>
  embedded?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<'sound' | 'account'>('sound')
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
    audio.saveNow()
    setOpen(false)
    setOldPassword('')
    setNewPassword('')
    setRepeat('')
    setPwError('')
    setPwDone(false)
    setBearName(islanders.bear)
    setHerName(islanders.her)
    setNameError('')
    setNameNotice('')
    eventBus.emit('PANEL_CLOSED', { panel: 'settings' })
  }

  const dialog = useDialogFocus(open, close)
  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      setBearName(islanders.bear)
      setHerName(islanders.her)
      setNameError('')
      setNameNotice('')
      setPwDone(false)
      setPwError('')
      eventBus.emit('PANEL_OPENED', { panel: 'settings' })
    }
    eventBus.on('OPEN_SETTINGS', onOpen)
    return () => eventBus.off('OPEN_SETTINGS', onOpen)
  }, [islanders])

  async function saveNames(event: FormEvent) {
    event.preventDefault()
    if (nameBusy) return
    const bear = bearName.trim()
    const her = herName.trim()
    if (!bear || !her) {
      setNameError('两个名字都要填哦。')
      return
    }
    if (bear === her) {
      setNameError('两个人需要不同的名字。')
      return
    }
    if (bear.length > MAX_NAME || her.length > MAX_NAME) {
      setNameError(`名字最多 ${MAX_NAME} 个字。`)
      return
    }
    setNameBusy(true)
    setNameError('')
    setNameNotice('')
    try {
      const { names, user: updatedUser } = await api<{
        names: { bear: string; her: string }
        user: User
      }>('/api/settings/names', {
        method: 'PUT',
        body: JSON.stringify({ bear, her }),
      })
      applyIslanders(names)
      onUserChange(updatedUser)
      setBearName(names.bear)
      setHerName(names.her)
      setNameNotice('岛民名字已更新。')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setNameError('登录已过期，重新进入小岛后再改。')
      } else {
        setNameError(error instanceof Error ? error.message : '保存失败，请重试。')
      }
    } finally {
      setNameBusy(false)
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (pwBusy) return
    if (newPassword.length < 6) {
      setPwError('新密码至少 6 位。')
      return
    }
    if (newPassword !== repeat) {
      setPwError('两次输入的新密码不一样。')
      return
    }
    setPwBusy(true)
    setPwError('')
    try {
      await api('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      })
      setPwDone(true)
      setOldPassword('')
      setNewPassword('')
      setRepeat('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setPwError('现在的暗号不对。')
      } else {
        setPwError(error instanceof Error ? error.message : '改密失败，请重试。')
      }
    } finally {
      setPwBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-mask" onClick={close}>
      <div
        ref={dialog}
        className="wood-panel modal-panel settings-panel px-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="px-ribbon" id="settings-title">
            <PixelIcon name="settings" size={18} />
            <span>小岛设置</span>
          </div>
          <button type="button" className="px-slot" onClick={close} aria-label="合上设置">
            <PixelIcon name="close" size={18} />
          </button>
        </div>

        <div className="settings-tabs" role="group" aria-label="设置分类">
          <button
            type="button"
            className={`px-btn${section === 'sound' ? ' px-btn-accent' : ''}`}
            aria-pressed={section === 'sound'}
            onClick={() => setSection('sound')}
          >
            <PixelIcon name="sound-on" size={18} />
            <span>声音与海风</span>
          </button>
          <button
            type="button"
            className={`px-btn${section === 'account' ? ' px-btn-accent' : ''}`}
            aria-pressed={section === 'account'}
            onClick={() => {
              audio.saveNow()
              setSection('account')
            }}
          >
            <PixelIcon name="paw" size={18} />
            <span>{embedded ? '岛民昵称' : '岛民与暗号'}</span>
          </button>
        </div>

        {section === 'sound' ? (
          <AudioControls audio={audio} />
        ) : (
          <>
            <form className="settings-section" onSubmit={saveNames}>
              <h3 className="px-font">岛民名字</h3>
              <p className="settings-note">信件与记忆中的署名会同步更新。</p>
              <div className="settings-name-row">
                <div className="px-portrait-box settings-portrait">
                  <CharacterPortrait character="bear" size={36} />
                </div>
                <label>
                  <span>白熊</span>
                  <input
                    value={bearName}
                    maxLength={MAX_NAME}
                    placeholder="小熊"
                    onChange={(e) => setBearName(e.target.value)}
                  />
                </label>
              </div>
              <div className="settings-name-row">
                <div className="px-portrait-box settings-portrait">
                  <CharacterPortrait character="her" size={36} />
                </div>
                <label>
                  <span>黑发岛民</span>
                  <input
                    value={herName}
                    maxLength={MAX_NAME}
                    placeholder="她"
                    onChange={(e) => setHerName(e.target.value)}
                  />
                </label>
              </div>
              {nameError && (
                <p className="form-error" role="alert">
                  {nameError}
                </p>
              )}
              {nameNotice && (
                <p className="settings-notice" role="status">
                  {nameNotice}
                </p>
              )}
              <button className="px-btn px-btn-accent" disabled={nameBusy}>
                {nameBusy ? '保存中…' : '保存名字'}
              </button>
            </form>

            {!embedded &&
              (pwDone ? (
                <div className="settings-section account-done" role="status">
                  <div className="px-portrait-box">
                    <CharacterPortrait character={characterId(user.sprite, user.account)} size={48} />
                  </div>
                  <h3 className="px-font">暗号换好了</h3>
                  <button type="button" className="px-btn" onClick={() => setPwDone(false)}>
                    再改一次
                  </button>
                </div>
              ) : (
                <form className="settings-section" onSubmit={changePassword}>
                  <h3 className="px-font">独立登录暗号</h3>
                  <label>
                    <span>现在的暗号</span>
                    <input
                      type="password"
                      value={oldPassword}
                      autoComplete="current-password"
                      required
                      onChange={(e) => setOldPassword(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>
                      新暗号 <small>至少 6 位</small>
                    </span>
                    <input
                      type="password"
                      value={newPassword}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>再输一遍</span>
                    <input
                      type="password"
                      value={repeat}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      onChange={(e) => setRepeat(e.target.value)}
                    />
                  </label>
                  {pwError && (
                    <p className="form-error" role="alert">
                      {pwError}
                    </p>
                  )}
                  <button className="px-btn px-btn-accent" disabled={pwBusy}>
                    {pwBusy ? '更换中…' : '换新暗号'}
                  </button>
                </form>
              ))}
          </>
        )}
      </div>
    </div>
  )
}
