import { useEffect, useRef } from 'react'
import { createGame } from '../game/game'

/** Phaser 容器：挂载即创建，卸载即销毁 */
export function GameShell() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const game = createGame(el)
    // 调试口：浏览器 console 里可用 __ilandGame 检查场景/纹理
    ;(window as unknown as Record<string, unknown>).__ilandGame = game

    // WebGL 上下文丢失/恢复完全交给 Phaser 自己的生命周期管理：
    // 不 preventDefault（会打断 Phaser 的恢复流程，主循环永久暂停=画面冻结），
    // 不 destroy 重建（会制造僵尸实例）。只在恢复后补一刀：
    // 把所有画布纹理 refresh 重传（Phaser 恢复时对动态 CanvasTexture 的重传
    // 不完整，只画一次的纹理如登录页山体会永久透明）。
    const onRestored = () => {
      for (const key of game.textures.getTextureKeys()) {
        const tex = game.textures.get(key) as unknown as {
          canvas?: HTMLCanvasElement
          refresh?: () => void
        }
        if (tex?.canvas && typeof tex.refresh === 'function') tex.refresh()
      }
    }
    el.addEventListener('webglcontextrestored', onRestored, true)

    return () => {
      el.removeEventListener('webglcontextrestored', onRestored, true)
      game.destroy(true)
    }
  }, [])

  return <div className="game-shell" ref={ref} />
}
