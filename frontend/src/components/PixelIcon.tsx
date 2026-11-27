export type PixelIconName =
  | 'dawn'
  | 'day'
  | 'dusk'
  | 'night'
  | 'calendar'
  | 'sound-on'
  | 'sound-off'
  | 'settings'
  | 'boat'
  | 'back'
  | 'sofa'
  | 'tv'
  | 'next'
  | 'heart'
  | 'clock'
  | 'spark'
  | 'close'
  | 'chat'
  | 'paw'

/** 16x16 hand-plotted pixel icon rendered crisp at integer multiples (16 / 24 / 32px). */
export function PixelIcon({
  name,
  size = 24,
  className = '',
}: {
  name: PixelIconName
  size?: number
  className?: string
}) {
  return (
    <img
      src={`/art-v2/ui/icons/${name}.png`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`px-icon ${className}`.trim()}
    />
  )
}
