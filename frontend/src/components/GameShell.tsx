import { useEffect, useRef } from 'react'
import type Phaser from 'phaser'

interface GameShellProps {
  retryKey?: number
  onEngineProgress?: (progress: number) => void
  onEngineError?: (message: string | null) => void
}

/** Phaser 容器：异步懒加载引擎 chunk，避免首屏阻塞码头进度条渲染。 */
export function GameShell({ retryKey = 0, onEngineProgress, onEngineError }: GameShellProps) {
  const ref = useRef<HTMLDivElement>(null)
  const progressRef = useRef(onEngineProgress)
  const errorRef = useRef(onEngineError)
  progressRef.current = onEngineProgress
  errorRef.current = onEngineError

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let disposed = false
    let game: Phaser.Game | null = null
    let simulated = 0.08
    errorRef.current?.(null)
    progressRef.current?.(simulated)

    // 异步拉取 Phaser + 场景 chunk 期间平滑推进进度，避免进度条停滞
    const tick = window.setInterval(() => {
      simulated = Math.min(0.88, simulated + (0.9 - simulated) * 0.12)
      progressRef.current?.(simulated)
    }, 180)

    const onRestored = () => {
      if (!game) return
      for (const key of game.textures.getTextureKeys()) {
        const tex = game.textures.get(key) as unknown as {
          canvas?: HTMLCanvasElement
          refresh?: () => void
        }
        if (tex?.canvas && typeof tex.refresh === 'function') tex.refresh()
      }
    }
    el.addEventListener('webglcontextrestored', onRestored, true)

    import('../game/game')
      .then(({ createGame }) => {
        window.clearInterval(tick)
        if (disposed) return
        progressRef.current?.(1)
        game = createGame(el)
        ;(window as unknown as Record<string, unknown>).__ilandGame = game
      })
      .catch((err) => {
        window.clearInterval(tick)
        if (disposed) return
        const msg = err instanceof Error ? err.message : '小岛引擎加载失败，请检查网络后重试'
        errorRef.current?.(msg)
      })

    return () => {
      disposed = true
      window.clearInterval(tick)
      el.removeEventListener('webglcontextrestored', onRestored, true)
      game?.destroy(true)
      game = null
    }
  }, [retryKey])

  return <div className="game-shell" ref={ref} />
}
