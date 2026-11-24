import { homeMapObject, homeMapImage } from '../interior/layout'
import type { Point, Rect } from '../interior/navigation'
const point = (name: string): Point => { const value = homeMapObject('cocoa', name); return { x: value.x, y: value.y } }
const layer = homeMapImage('cocoa-counter-preview'), bounds = homeMapObject('cocoa', 'counter-visual')
export const COCOA_LAYOUT = {
  origin: { x: (layer.x ?? 0) + (layer.offsetx ?? 0), y: (layer.y ?? 0) + (layer.offsety ?? 0) },
  visual: { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height } as Rect,
  depth: Number(layer.properties?.find(p => p.name === 'depth')?.value ?? 171),
  interaction: point('interaction'), feet: { heat: point('heat-foot'), stir: point('stir-foot') },
  stands: { heat: point('heat-stand'), stir: point('stir-stand') },
}
/** 与受控面板的紧凑侧栏/底栏保持同一可见区，不读取 DOM 或 React。 */
export function cocoaFocus(width: number, height: number, zoom: number): Point {
  const middle = { x: (COCOA_LAYOUT.feet.heat.x + COCOA_LAYOUT.feet.stir.x) / 2, y: COCOA_LAYOUT.origin.y + 30 }
  const x = width <= 600 ? width / 2 : (width - Math.min(440, width * .42) - 24) / 2
  const y = width <= 600 ? (120 + Math.max(120, height - Math.min(height * .54, 390) - 24)) / 2 : height * .48
  return { x: middle.x + (width / 2 - x) / zoom, y: middle.y + (height / 2 - y) / zoom }
}
