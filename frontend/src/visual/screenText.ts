/** Phaser 世界坐标仍随相机移动；提示整体反向缩放，字体统一使用 ArkPixel 像素字体。 */
export const PIXEL_FONT_FAMILY = "'ArkPixel', 'PingFang SC', 'Microsoft YaHei', sans-serif"
export const SCREEN_BODY_PX = 16
export const SCREEN_LABEL_PX = 12
export const screenTextScale = (zoom: number): number =>
  Number.isFinite(zoom) && zoom > 0 ? 1 / zoom : 1
