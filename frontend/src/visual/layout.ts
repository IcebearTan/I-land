/** 可玩场景共用整数像素倍率；同时覆盖主岛 640×480 的画布边界。 */
export function worldZoom(width: number, height: number): number {
  return Math.max(2, Math.ceil(width / 640), Math.ceil(height / 480))
}
