import tiledRoom from '../../public/art-v2/home-room.tmj?raw'
import type { Point, Rect } from './navigation'

type MapObject = { name: string; x: number; y: number; width: number; height: number; point?: boolean }
type MapLayer = { name: string; type: string; x?: number; y?: number; offsetx?: number; offsety?: number; objects?: MapObject[]; properties?: { name: string; value: string | number }[] }
type RoomMap = { width: number; height: number; tilewidth: number; tileheight: number; layers: MapLayer[] }
const map = JSON.parse(tiledRoom) as RoomMap
if (map.tilewidth !== 16 || map.tileheight !== 16) throw new Error('客厅地图必须使用 16px tile')
const objects = (layer: string): MapObject[] => {
  const found = map.layers.find(item => item.type === 'objectgroup' && item.name === layer)?.objects
  if (!found) throw new Error(`客厅 Tiled 地图缺少对象层 ${layer}`)
  return found
}
const object = (layer: string, name: string): MapObject => {
  const found = objects(layer).find(item => item.name === name)
  if (!found) throw new Error(`客厅 Tiled 地图缺少 ${layer}/${name}`)
  return found
}
const rect = (o: MapObject): Rect => ({ x: o.x, y: o.y, w: o.width, h: o.height })
const anchor = (name: string): Point => { const o = object('anchors', name); return { x: o.x, y: o.y } }

/** 布局、占地、互动区与坐席只从同一份 Tiled 对象层读取。 */
export const HOME_LAYOUT = {
  width: map.width * map.tilewidth, height: map.height * map.tileheight,
  walkable: rect(object('walkable', 'walkable')),
  walls: objects('walls').map(rect), furniture: objects('furniture').map(rect),
  door: anchor('door'), fireplace: anchor('fireplace'), tv: anchor('tv'),
  fire: anchor('fire'), tvScreen: anchor('tvScreen'),
  seats: [anchor('seat-0'), anchor('seat-1')], standPoints: [anchor('stand-0'), anchor('stand-1')],
  sofa: rect(object('furniture', 'sofa')),
  sofaVisual: rect(object('interaction-bounds', 'sofaVisual')),
  televisionVisual: rect(object('interaction-bounds', 'televisionVisual')),
  fireplaceVisual: rect(object('interaction-bounds', 'fireplaceVisual')),
}

/** Tiled 图像层用于编辑预览，运行时读取其帧名与脚底深度并使用同一图集。 */
export const HOME_LAYERS: readonly [string, number, number, number][] = map.layers.filter(layer => layer.type === 'imagelayer').map(layer => {
  const frame = layer.properties?.find(p => p.name === 'atlasFrame')?.value
  const depth = layer.properties?.find(p => p.name === 'depth')?.value
  if (typeof frame !== 'string' || typeof depth !== 'number') throw new Error(`客厅图层 ${layer.name} 缺少图集帧或深度`)
  return [frame, (layer.x ?? 0) + (layer.offsetx ?? 0), (layer.y ?? 0) + (layer.offsety ?? 0), depth]
})
