import { useEffect, useRef, useState } from 'react'
import { characterId } from './characters'
import { CalendarFeature } from './calendar/CalendarFeature'
import { IslandControls } from './components/IslandControls'
import { api } from './api/client'
import { eventBus } from './game/EventBus'
import type { User } from './types'
import { GameShell } from './components/GameShell'
import { Hud } from './components/Hud'
import { LoginPanel } from './components/LoginPanel'
import { MailboxPanel } from './components/panels/MailboxPanel'
import { ComingSoonPanel } from './components/panels/ComingSoonPanel'
import { SettingsPanel } from './components/SettingsPanel'

export default function App() {
  // undefined = 还在检查登录态；null = 未登录
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const userRef = useRef<User | null | undefined>(undefined)
  const gameReady = useRef(false)

  useEffect(() => {
    userRef.current = user
    if (user && gameReady.current) eventBus.emit('ENTER_ISLAND', { character: characterId(user.sprite, user.name), display: user.display })
  }, [user])

  useEffect(() => {
    api<{ user: User }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
  }, [])

  // Phaser 场景就绪后，按登录态决定停在登录页还是直接上岛
  useEffect(() => {
    const onReady = () => {
      gameReady.current = true
      const current = userRef.current
      if (current) eventBus.emit('ENTER_ISLAND', { character: characterId(current.sprite, current.name), display: current.display })
    }
    eventBus.on('GAME_READY', onReady)
    return () => eventBus.off('GAME_READY', onReady)
  }, [])

  // 登岛心跳（异步共岛的存在感）
  useEffect(() => {
    if (!user) return
    const beat = () => api('/api/heartbeat', { method: 'POST', body: JSON.stringify({}) }).catch(() => {})
    beat()
    const timer = window.setInterval(beat, 60_000)
    return () => window.clearInterval(timer)
  }, [user])

  if (user === undefined) {
    // 登录态确认前不弹任何面板，让像素场景先亮相
    return (
      <div className="game-app">
        <GameShell />
      </div>
    )
  }

  return (
    <div className="game-app">
      <GameShell />
      {user ? (
        <>
          <Hud
            user={user}
            onLogout={() => {
              gameReady.current = false
              setUser(null)
              eventBus.emit('EXIT_TO_LOGIN', {})
            }}
          />
          <IslandControls />
          <MailboxPanel />
          <ComingSoonPanel />
          <CalendarFeature />
          <SettingsPanel
            user={user}
            onDisplayChange={display => setUser(current => current ? { ...current, display } : current)}
          />
        </>
      ) : (
        <LoginPanel
          onLogin={(u) => {
            setUser(u)
          }}
        />
      )}
    </div>
  )
}
