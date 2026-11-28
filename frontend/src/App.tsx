import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { characterId } from './characters'
import { api } from './api/client'
import { eventBus, type IslandIdentity, type SceneState } from './game/EventBus'
import type { User } from './types'
import { GameShell } from './components/GameShell'
import { DockOverlay, type DockMode } from './components/DockOverlay'
import { useIslandAudio } from './audio/useIslandAudio'

const LoginPanel = lazy(() =>
  import('./components/LoginPanel').then((m) => ({ default: m.LoginPanel })),
)
const Hud = lazy(() => import('./components/Hud').then((m) => ({ default: m.Hud })))
const IslandControls = lazy(() =>
  import('./components/IslandControls').then((m) => ({ default: m.IslandControls })),
)
const SeasideControls = lazy(() =>
  import('./components/SeasideControls').then((m) => ({ default: m.SeasideControls })),
)
const InteriorControls = lazy(() =>
  import('./components/InteriorControls').then((m) => ({ default: m.InteriorControls })),
)
const MailboxPanel = lazy(() =>
  import('./components/panels/MailboxPanel').then((m) => ({ default: m.MailboxPanel })),
)
const LighthousePanel = lazy(() =>
  import('./components/panels/LighthousePanel').then((m) => ({ default: m.LighthousePanel })),
)
const ComingSoonPanel = lazy(() =>
  import('./components/panels/ComingSoonPanel').then((m) => ({ default: m.ComingSoonPanel })),
)
const CalendarFeature = lazy(() =>
  import('./calendar/CalendarFeature').then((m) => ({ default: m.CalendarFeature })),
)
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
)

function islandIdentity(user: User): IslandIdentity {
  return {
    character: characterId(user.sprite, user.account),
    display: user.display,
    ...(user.account === 'bear' || user.account === 'her' ? { account: user.account } : {}),
  }
}

function isEmbeddedInPortal(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

type JourneyStage = 'embark' | 'on-island' | 'farewell'

export default function App() {
  // undefined = checking session; null = unauthenticated standalone visit
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [engineProgress, setEngineProgress] = useState(0)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [bootRetryKey, setBootRetryKey] = useState(0)
  const [bootProgress, setBootProgress] = useState(0)
  const [gameReady, setGameReady] = useState(false)
  const [stage, setStage] = useState<JourneyStage>('embark')
  const [scene, setScene] = useState<SceneState>({ scene: 'login', transitioning: false })
  const [embedded] = useState(isEmbeddedInPortal)
  const [wantMuted, setWantMuted] = useState(false)
  const unreadLettersRef = useRef(0)
  const enteredUser = useRef<number | null>(null)
  const audio = useIslandAudio(user?.id ?? null)

  const audioState = {
    'data-audio-status': audio.playback.status,
    'data-audio-period': audio.playback.period,
    'data-audio-tracks': audio.playback.availableTracks,
    'data-audio-playing-layers': audio.playback.playingLayers?.join(','),
  }

  useEffect(() => {
    api<{ user: User }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    if (audio.ready) setWantMuted(audio.settings.muted)
  }, [audio.ready, audio.settings.muted])

  useEffect(() => {
    if (user && stage === 'on-island' && enteredUser.current === user.id) {
      eventBus.emit('IDENTITY_CHANGED', islandIdentity(user))
    }
  }, [user, stage])

  useEffect(() => {
    const onProgress = ({ progress }: { progress: number }) =>
      setBootProgress((p) => Math.max(p, progress))
    const onReady = () => {
      setEngineProgress(1)
      setBootProgress(1)
      setGameReady(true)
    }
    const onScene = (value: SceneState) => setScene(value)
    const expired = () => {
      enteredUser.current = null
      setUser(null)
      setStage('embark')
      eventBus.emit('EXIT_TO_LOGIN', {})
    }
    eventBus.on('BOOT_PROGRESS', onProgress)
    eventBus.on('GAME_READY', onReady)
    eventBus.on('SCENE_CHANGED', onScene)
    eventBus.on('SESSION_EXPIRED', expired)
    eventBus.emit('SCENE_REQUEST_STATE', {})
    return () => {
      eventBus.off('BOOT_PROGRESS', onProgress)
      eventBus.off('GAME_READY', onReady)
      eventBus.off('SCENE_CHANGED', onScene)
      eventBus.off('SESSION_EXPIRED', expired)
    }
  }, [])

  // Presence heartbeat & unread mailbox sync while on the island
  useEffect(() => {
    if (!user || stage !== 'on-island') return
    const beat = () => api('/api/heartbeat', { method: 'POST', body: JSON.stringify({}) }).catch(() => {})
    const syncMailbox = () =>
      api<{ unread_count?: number }>('/api/letters')
        .then((res) => {
          const count = typeof res.unread_count === 'number' ? res.unread_count : 0
          unreadLettersRef.current = count
          eventBus.emit('MAILBOX_UNREAD_CHANGED', { count })
        })
        .catch(() => {})
    const onUnread = ({ count }: { count: number }) => {
      unreadLettersRef.current = count
    }
    const onSceneReady = ({ scene: readyScene }: { scene: string }) => {
      if (readyScene === 'island') {
        eventBus.emit('MAILBOX_UNREAD_CHANGED', { count: unreadLettersRef.current })
      }
    }
    eventBus.on('MAILBOX_UNREAD_CHANGED', onUnread)
    eventBus.on('SCENE_READY', onSceneReady)
    beat()
    syncMailbox()
    const timer = window.setInterval(() => {
      beat()
      syncMailbox()
    }, 60_000)
    return () => {
      eventBus.off('MAILBOX_UNREAD_CHANGED', onUnread)
      eventBus.off('SCENE_READY', onSceneReady)
      window.clearInterval(timer)
    }
  }, [user, stage])

  const handleEngineProgress = useCallback((value: number) => {
    setEngineProgress((prev) => Math.max(prev, value))
  }, [])

  const handleRetryBoot = useCallback(() => {
    setEngineError(null)
    setEngineProgress(0)
    setBootProgress(0)
    setBootRetryKey((k) => k + 1)
  }, [])

  function handleEmbark() {
    if (!user || !gameReady) return
    if (wantMuted) {
      if (audio.ready && !audio.settings.muted) audio.change({ muted: true }, true)
    } else {
      audio.start()
    }
    enteredUser.current = user.id
    setStage('on-island')
    eventBus.emit('ENTER_ISLAND', islandIdentity(user))
  }

  function handleDepart() {
    enteredUser.current = null
    setStage('farewell')
    eventBus.emit('EXIT_TO_LOGIN', {})
  }

  function handleReturnPortal() {
    try {
      window.parent?.postMessage({ type: 'iland:return-portal' }, '*')
    } catch {
      window.location.href = '/'
    }
  }

  function handleToggleDockMute() {
    const next = !wantMuted
    setWantMuted(next)
    if (audio.ready) {
      if (next) audio.change({ muted: true }, true)
      else audio.start()
    }
  }

  // Real staged boot progress:
  // 10% auth check + 55% Phaser engine chunk + 30% pixel atlases + 5% LoginScene ready
  const combinedProgress =
    (user !== undefined ? 0.1 : 0.04) +
    engineProgress * 0.55 +
    bootProgress * 0.3 +
    (gameReady ? 0.05 : 0)
  const assetsReady = gameReady && user !== undefined

  const dockMode: DockMode = !assetsReady
    ? 'loading'
    : stage === 'farewell'
      ? 'farewell'
      : 'ready'

  const showIslandUi = Boolean(user) && stage === 'on-island' && scene.scene !== 'login'

  return (
    <div
      className="game-app"
      data-game-scene={scene.scene}
      data-journey-stage={stage}
      {...audioState}
    >
      <GameShell
        retryKey={bootRetryKey}
        onEngineProgress={handleEngineProgress}
        onEngineError={setEngineError}
      />

      {!assetsReady ? (
        <DockOverlay
          mode="loading"
          progress={combinedProgress}
          gameReady={gameReady}
          loadError={engineError}
          onRetryLoad={handleRetryBoot}
          user={user}
          muted={wantMuted}
          onToggleMute={handleToggleDockMute}
          onEmbark={handleEmbark}
          onReturnPortal={handleReturnPortal}
          embedded={embedded}
        />
      ) : !user ? (
        <Suspense fallback={null}>
          <LoginPanel
            onLogin={(u) => {
              setUser(u)
              setStage('embark')
            }}
          />
        </Suspense>
      ) : stage !== 'on-island' ? (
        <DockOverlay
          mode={dockMode}
          progress={1}
          gameReady={gameReady}
          user={user}
          muted={wantMuted}
          onToggleMute={handleToggleDockMute}
          onEmbark={handleEmbark}
          onReturnPortal={handleReturnPortal}
          embedded={embedded}
        />
      ) : (
        <Suspense fallback={null}>
          {showIslandUi && (
            <Hud
              user={user}
              quiet={scene.scene === 'seaside' || scene.scene === 'interior'}
              audio={audio}
              onDepart={handleDepart}
            />
          )}
          {scene.scene === 'island' && !scene.transitioning && <IslandControls />}
          {scene.scene === 'seaside' && <SeasideControls transitioning={scene.transitioning} />}
          {scene.scene === 'interior' && <InteriorControls transitioning={scene.transitioning} />}
          <MailboxPanel user={user} />
          <LighthousePanel />
          <ComingSoonPanel />
          <CalendarFeature />
          <SettingsPanel
            user={user}
            onUserChange={setUser}
            audio={audio}
            embedded={embedded}
          />
        </Suspense>
      )}
    </div>
  )
}
