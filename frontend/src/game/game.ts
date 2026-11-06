import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { IslandScene } from './scenes/IslandScene'
import { LoginScene } from './scenes/LoginScene'
import { AudioScene } from './scenes/AudioScene'
import { NavigationScene } from './scenes/NavigationScene'
import { SeasideScene } from './scenes/SeasideScene'
import { InteriorScene } from './scenes/InteriorScene'

export function createGame(parent: HTMLElement, forceCanvas = false): Phaser.Game {
  return new Phaser.Game({
    type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
    parent,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#3f6f9e',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    scene: [BootScene, NavigationScene, AudioScene, LoginScene, IslandScene, SeasideScene, InteriorScene],
  })
}
