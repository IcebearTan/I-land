import { CHARACTERS, type CharacterId } from '../characters'

export function CharacterPortrait({ character, size = 40 }: { character: CharacterId; size?: number }) {
  const art = CHARACTERS[character]
  return <svg className="character-portrait" width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
    {art.frames.front.flatMap((row, y) => [...row].map((pixel, x) => art.palette[pixel]
      ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={art.palette[pixel]} /> : null))}
  </svg>
}
