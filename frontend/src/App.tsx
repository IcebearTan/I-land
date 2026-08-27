import { useEffect, useRef, useState } from 'react'
import { api } from './api/client'
import { eventBus } from './game/EventBus'
import type { User } from './types'
import { GameShell } from './components/GameShell'
import { Hud } from './components/Hud'
import { LoginPanel } from './components/LoginPanel'
import { MailboxPanel } from './components/panels/MailboxPanel'
import { ComingSoonPanel } from './components/panels/ComingSoonPanel'

export default function App() {
  // undefined = 还在检查登录态；null = 未登录
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const userRef = useRef<User | null | undefined>(undefined)

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    api<{ user: User }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
  }, [])

  // Phaser 场景就绪后，按登录态决定停在登录页还是直接上岛
  useEffect(() => {
    const onReady = () => {
      if (userRef.current) eventBus.emit('ENTER_ISLAND', {})
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
              setUser(null)
              eventBus.emit('EXIT_TO_LOGIN', {})
            }}
          />
          <MailboxPanel />
          <ComingSoonPanel />
        </>
      ) : (
        <LoginPanel
          onLogin={(u) => {
            setUser(u)
            eventBus.emit('ENTER_ISLAND', {})
          }}
        />
      )}
    </div>
  )
}
