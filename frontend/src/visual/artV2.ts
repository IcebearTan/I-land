import type Phaser from 'phaser'
import type { CharacterId } from '../characters'

/** ART-02 art-v2.1.0：所有姿势共用脚锚，画布尺寸不作为碰撞尺寸。 */
export const CHARACTER_ATLAS = 'art-v2-characters'
export const HOME_ATLAS = 'art-v2-home'
export const CHARACTER_ORIGIN = { x: .5, y: 29 / 32 } as const
export const CHARACTER_FOOT = { width: 8, height: 4, offsetX: 12, offsetY: 25 } as const
export type Facing = 'down' | 'up' | 'left' | 'right'
export function actorFrame(account: CharacterId, facing: Facing, moving = false, timeMs = 0): string {
  return moving ? `${account}-walk-${facing}-${Math.floor(timeMs / (1000 / 7)) % 4}` : `${account}-idle-${facing}`
}
export function preloadArtV2(scene: Phaser.Scene): void {
  scene.load.atlas(CHARACTER_ATLAS, '/art-v2/characters-atlas.png', '/art-v2/characters-atlas.json')
  scene.load.atlas(HOME_ATLAS, '/art-v2/home-atlas.png', '/art-v2/home-atlas.json')
}
