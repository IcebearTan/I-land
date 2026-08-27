import Phaser from 'phaser'

/** M0 无外部资产；以后图片/图集/音频都在这里预加载 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  create(): void {
    this.scene.start('Login')
  }
}
