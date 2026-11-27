import type Phaser from 'phaser'
import type { CharacterId } from '../characters'

/** ART-02 art-v2.1.0：所有姿势共用脚锚，画布尺寸不作为碰撞尺寸。 */
export const CHARACTER_ATLAS = 'art-v2-characters'
export const HOME_ATLAS = 'art-v2-home'
export const CHARACTER_ORIGIN = { x: .5, y: 29 / 32 } as const
export const CHARACTER_FOOT = { width: 8, height: 4, offsetX: 12, offsetY: 25 } as const
export type Facing = 'down' | 'up' | 'left' | 'right'

/**
 * Directional facing selector with hysteresis:
 * Prevents rapid jitter when walking diagonally (45 deg) with keyboard or touch D-Pad.
 */
export function pickFacing(current: Facing, dx: number, dy: number): Facing {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < 1e-4 && ay < 1e-4) return current
  // Keep current horizontal/vertical axis if it still contributes meaningfully in the same sign
  if ((current === 'left' && dx < 0) || (current === 'right' && dx > 0)) {
    if (ax >= ay * 0.72) return current
  }
  if ((current === 'up' && dy < 0) || (current === 'down' && dy > 0)) {
    if (ay >= ax * 0.72) return current
  }
  if (ax > ay) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'up' : 'down'
}

export function actorFrame(account: CharacterId, facing: Facing, moving = false, timeMs = 0): string {
  return moving ? `${account}-walk-${facing}-${Math.floor(timeMs / (1000 / 8.5)) % 4}` : `${account}-idle-${facing}`
}

export function preloadArtV2(scene: Phaser.Scene): void {
  scene.load.atlas(CHARACTER_ATLAS, '/art-v2/characters-atlas.png', '/art-v2/characters-atlas.json')
  scene.load.atlas(HOME_ATLAS, '/art-v2/home-atlas.png', '/art-v2/home-atlas.json')
}
