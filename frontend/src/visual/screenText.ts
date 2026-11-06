/** Phaser 世界坐标仍随相机移动；提示整体反向缩放，字体保持最终 CSS 像素。 */
export const SCREEN_BODY_PX = 15
export const SCREEN_LABEL_PX = 14
export const screenTextScale = (zoom: number): number => Number.isFinite(zoom) && zoom > 0 ? 1 / zoom : 1
