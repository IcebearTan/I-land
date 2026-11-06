import type { CharacterId } from '../characters'

/** 与游戏共用 ART-02 原生帧；头像只改变 CSS 展示尺寸。 */
export function CharacterPortrait({ character, size = 40 }: { character: CharacterId; size?: number }) {
  return <img className="character-portrait" src={`/art-v2/characters/${character}-idle-down.png`}
    width={size} height={size} alt="" aria-hidden="true" style={{ imageRendering: 'pixelated', objectFit: 'contain' }} />
}
