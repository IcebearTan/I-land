import Phaser from 'phaser'
import { preloadArtV2 } from '../../visual/artV2'
import { eventBus } from '../EventBus'

/** 常驻声音场景先启动，同时上报真实像素资源加载进度给码头准备屏。 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload(): void {
    eventBus.emit('BOOT_PROGRESS', { progress: 0.12 })
    this.load.on('progress', (value: number) => {
      eventBus.emit('BOOT_PROGRESS', { progress: Math.max(0.12, Math.min(0.98, value)) })
    })
    preloadArtV2(this)
  }

  create(): void {
    eventBus.emit('BOOT_PROGRESS', { progress: 1 })
    this.scene.launch('Navigation')
    this.scene.launch('Audio')
    this.scene.start('Login')
  }
}
