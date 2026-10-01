import { useEffect, useRef, useState } from 'react'
import { characterId } from './characters'
import { CalendarFeature } from './calendar/CalendarFeature'
import { IslandControls } from './components/IslandControls'
import { api } from './api/client'
import { eventBus, type SceneState } from './game/EventBus'
import type { User } from './types'
import { GameShell } from './components/GameShell'
import { Hud } from './components/Hud'
import { LoginPanel } from './components/LoginPanel'
import { MailboxPanel } from './components/panels/MailboxPanel'
import { ComingSoonPanel } from './components/panels/ComingSoonPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { useIslandAudio } from './audio/useIslandAudio'
import { SeasideControls } from './components/SeasideControls'

export default function App() {
  // undefined = 还在检查登录态；null = 未登录
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const userRef = useRef<User | null | undefined>(undefined)
  const gameReady = useRef(false)
  const enteredUser = useRef<number | null>(null)
  const [scene, setScene] = useState<SceneState>({ scene: 'login', transitioning: false })
  const audio = useIslandAudio(user?.id ?? null)
  const audioState = {
    'data-audio-status': audio.playback.status,
    'data-audio-period': audio.playback.period,
    'data-audio-tracks': audio.playback.availableTracks,
    'data-audio-playing-layers': audio.playback.playingLayers?.join(','),
  }

  useEffect(() => {
    userRef.current = user
    if (user && gameReady.current) {
      const identity = { character: characterId(user.sprite, user.account), display: user.display }
      eventBus.emit(enteredUser.current === user.id ? 'IDENTITY_CHANGED' : 'ENTER_ISLAND', identity)
    }
    enteredUser.current = user?.id ?? null
  }, [user])

  useEffect(() => {
    api<{ user: User }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    const onScene = (value: SceneState) => setScene(value)
    eventBus.on('SCENE_CHANGED', onScene)
    eventBus.emit('SCENE_REQUEST_STATE', {})
    return () => eventBus.off('SCENE_CHANGED', onScene)
  }, [])

  // Phaser 场景就绪后，按登录态决定停在登录页还是直接上岛
  useEffect(() => {
    const onReady = () => {
      gameReady.current = true
      const current = userRef.current
      if (current) eventBus.emit('ENTER_ISLAND', { character: characterId(current.sprite, current.account), display: current.display })
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
      <div className="game-app" data-game-scene={scene.scene} {...audioState}>
        <GameShell />
      </div>
    )
  }

  return (
    <div className="game-app" data-game-scene={scene.scene} {...audioState}>
      <GameShell />
      {user ? (
        <>
          <Hud
            user={user}
            quiet={scene.scene === 'seaside'}
            onLogout={() => {
              gameReady.current = false
              userRef.current = null
              enteredUser.current = null
              setUser(null)
              eventBus.emit('EXIT_TO_LOGIN', {})
            }}
          />
          {scene.scene === 'island' && !scene.transitioning && <IslandControls />}
          {scene.scene === 'seaside' && <SeasideControls transitioning={scene.transitioning} />}
          <MailboxPanel />
          <ComingSoonPanel />
          <CalendarFeature />
          <SettingsPanel
            user={user}
            onUserChange={setUser}
            audio={audio}
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
