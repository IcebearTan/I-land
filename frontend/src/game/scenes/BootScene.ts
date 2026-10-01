import Phaser from 'phaser'

/** 常驻声音场景先启动，音乐按需异步加载，不阻塞登录。 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  create(): void {
    this.scene.launch('Navigation')
    this.scene.launch('Audio')
    this.scene.start('Login')
  }
}
