import Phaser from 'phaser'
import { eventBus, type IslandIdentity } from '../EventBus'
import { bayer, colorAt, ditherMix, hash2, lerpRGB, type RGB } from '../art'
import {
  BEAR_PALETTE,
  BEAR_ROWS,
  BIRD_A,
  BIRD_B,
  BIRD_PALETTE,
  BUTTERFLY_A,
  BUTTERFLY_B,
  BUTTERFLY_PALETTE,
  CLOUD_BIG,
  CLOUD_MED,
  CLOUD_PALETTE,
  CLOUD_SMALL,
  HEART_PALETTE,
  HEART_ROWS,
  SUN_PALETTE,
  SUN_ROWS,
  makeTexture,
} from '../pixels'

/**
 * 登录场景 · 泰拉瑞亚式白天像素视差（纯天空 + 双层山）
 * 逻辑宽 480、高随视口（≤560）。
 *
 * 技法：天空与山体都用 Bayer 4×4 有序抖动的量化渐变（真·像素画过渡，
 * 不是 CSS 渐变）；山体叠加岩层横纹与深度明暗。
 *
 * 纹理纪律：画布纹理只创建、不 remove（WebGL 批次持有旧纹理引用）；
 * resize 只重新布局，不重启场景。
 */
const VW = 480
const VH_MAX = 560
const LAYER_W = 560 // 比视口宽，留出视差余量

/** 天空渐变关键色（t → RGB） */
const SKY_STOPS: Array<[number, RGB]> = [
  [0, [0x7f, 0xb6, 0xd9]],
  [0.3, [0xa1, 0xcb, 0xde]],
  [0.55, [0xc3, 0xdd, 0xe1]],
  [0.78, [0xe2, 0xe8, 0xd8]],
  [1, [0xfd, 0xf6, 0xe9]],
]

const FAR_CREST = 50
const NEAR_CREST = 150

interface HillConf {
  base: RGB
  dark: RGB
  edge: RGB
  crest: number
  levels: number // 抖动量化级数：越少颗粒越粗
  strata: boolean
}

const HILL_FAR: HillConf = {
  base: [0xad, 0xc5, 0x94],
  dark: [0x8e, 0xad, 0x7d],
  edge: [0xd3, 0xde, 0xb9],
  crest: FAR_CREST,
  levels: 6,
  strata: false,
}

const HILL_NEAR: HillConf = {
  base: [0x7c, 0xb8, 0x60],
  dark: [0x5a, 0x94, 0x4a],
  edge: [0xad, 0xcb, 0x83],
  crest: NEAR_CREST,
  levels: 10,
  strata: false,
}

interface ParallaxLayer {
  container: Phaser.GameObjects.Container
  factor: number
}

interface Cloud {
  sprite: Phaser.GameObjects.Image
  speed: number
  w: number
}

export class LoginScene extends Phaser.Scene {
  private layers: ParallaxLayer[] = []
  private cloudsFar: Cloud[] = []
  private cloudsNear: Cloud[] = []
  private butterflies: Phaser.GameObjects.Image[] = []
  private hillsFarC!: Phaser.GameObjects.Container
  private hillsNearC!: Phaser.GameObjects.Container
  private sun!: Phaser.GameObjects.Image
  private skyImg!: Phaser.GameObjects.Image
  private pointerNorm = 0
  private parallaxCur = 0
  private elapsed = 0
  private vh = VH_MAX
  private leaving = false

  constructor() {
    super('Login')
  }

  create(): void {
    if (this.scale.gameSize.width <= 0 || this.scale.gameSize.height <= 0) {
      this.time.delayedCall(60, () => this.scene.restart())
      return
    }

    this.layers = []
    this.cloudsFar = []
    this.cloudsNear = []
    this.butterflies = []
    this.leaving = false

    this.layout()

    // ── 天空（Bayer 抖动渐变，固定画布按 vh 重绘 + 裁剪）──
    // 顺序铁律：先把纹理画出来，再创建显示对象——
    // 反过来的话首帧会绑定 Phaser 的"缺失纹理"绿框占位图
    this.drawSky()
    this.skyImg = this.add.image(0, 0, 'login-sky').setOrigin(0, 0)
    this.skyImg.setCrop(0, 0, VW, this.vh)

    makeTexture(this, 'login-sun', SUN_ROWS, SUN_PALETTE)
    this.sun = this.add.image(VW * 0.82, this.vh * 0.16, 'login-sun').setOrigin(0.5)
    this.tweens.add({
      targets: this.sun,
      scale: 1.05,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    })

    // ── 视差层：云 ×2 + 山 ×2（山体填满画面底部，无前景土地）──
    this.addCloudLayer('far', 0.1, this.cloudsFar, 4)
    this.addCloudLayer('near', 0.22, this.cloudsNear, 3)
    this.hillsFarC = this.addHillLayer('far', HILL_FAR, 0.3)
    this.hillsNearC = this.addHillLayer('near', HILL_NEAR, 0.55)

    this.spawnButterfly()
    this.time.delayedCall(2600, () => {
      if (this.scene.isActive()) this.spawnButterfly()
    })
    this.time.addEvent({ delay: 9000, loop: true, callback: () => this.spawnBird() })

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointerNorm = Phaser.Math.Clamp((p.x / this.scale.gameSize.width - 0.5) * 2, -1, 1)
    })

    const onEnter = (identity: IslandIdentity) => this.leave(identity)
    eventBus.on('ENTER_ISLAND', onEnter)
    this.events.once('shutdown', () => {
      eventBus.off('ENTER_ISLAND', onEnter)
      this.scale.off('resize', this.relayout, this)
    })
    this.scale.on('resize', this.relayout, this)

    this.cameras.main.fadeIn(420, 0, 0, 0)
    eventBus.emit('GAME_READY', {})
  }

  private layout(): void {
    const cw = this.scale.gameSize.width
    const ch = this.scale.gameSize.height
    const zoom = Math.max(0.5, cw / VW, ch / VH_MAX)
    this.vh = Math.min(VH_MAX, Math.ceil(ch / zoom))
    const cam = this.cameras.main
    cam.setZoom(zoom)
    cam.centerOn(VW / 2, this.vh / 2)
  }

  private relayout(): void {
    this.layout()
    this.drawSky()
    this.hillsFarC.y = this.vh * 0.4 - FAR_CREST
    this.hillsNearC.y = this.vh * 0.55 - NEAR_CREST
    this.sun.setPosition(VW * 0.82, this.vh * 0.16)
    for (const c of this.cloudsFar) {
      c.sprite.y = this.vh * Phaser.Math.FloatBetween(0.05, 0.22)
    }
    for (const c of this.cloudsNear) {
      c.sprite.y = this.vh * Phaser.Math.FloatBetween(0.14, 0.34)
    }
    for (const b of this.butterflies) {
      b.y = this.vh * (0.42 + Math.random() * 0.2)
    }
  }

  // ─── 天空：量化 + Bayer 抖动渐变 ───────────────────────────
  private drawSky(): void {
    const key = 'login-sky'
    const tex = (
      this.textures.exists(key)
        ? this.textures.get(key)
        : this.textures.createCanvas(key, VW, VH_MAX)
    ) as Phaser.Textures.CanvasTexture | null
    if (!tex) return
    const ctx = tex.getContext()
    const vh = this.vh
    const img = ctx.createImageData(VW, VH_MAX)
    const data = img.data
    const LEVELS = 18

    for (let y = 0; y < VH_MAX; y++) {
      const tBase = Math.min(y / vh, 1)
      for (let x = 0; x < VW; x++) {
        // 抖动量化：竖直渐变按 Bayer 阈值上下取级
        const q = tBase * LEVELS
        const qi = Math.floor(q)
        const up = q - qi > bayer(x, y) ? 1 : 0
        const c = colorAt(SKY_STOPS, (qi + up) / LEVELS)
        const idx = (y * VW + x) * 4
        data[idx] = c[0]
        data[idx + 1] = c[1]
        data[idx + 2] = c[2]
        data[idx + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    tex.refresh()
    this.skyImg?.setCrop(0, 0, VW, vh)
  }

  // ─── 云层 ─────────────────────────────────────────────────
  private addCloudLayer(depth: 'far' | 'near', factor: number, store: Cloud[], count: number): void {
    makeTexture(this, 'cloud-s', CLOUD_SMALL, CLOUD_PALETTE, 3)
    makeTexture(this, 'cloud-m', CLOUD_MED, CLOUD_PALETTE, 3)
    makeTexture(this, 'cloud-b', CLOUD_BIG, CLOUD_PALETTE, 3)

    const container = this.add.container(240 - LAYER_W / 2, 0)
    this.layers.push({ container, factor })
    const yRange = depth === 'far' ? [0.05, 0.22] : [0.14, 0.34]
    const variants = ['cloud-s', 'cloud-m', 'cloud-b']
    for (let i = 0; i < count; i++) {
      const key = variants[Phaser.Math.Between(0, 2)]
      const sprite = this.add.image(Phaser.Math.Between(-30, LAYER_W - 40), 0, key).setOrigin(0, 0)
      container.add(sprite)
      sprite.y = this.vh * Phaser.Math.FloatBetween(yRange[0], yRange[1])
      if (depth === 'far') sprite.setAlpha(0.82)
      store.push({ sprite, speed: Phaser.Math.FloatBetween(3, 7) + (depth === 'near' ? 4 : 0), w: sprite.width })
    }
  }

  // ─── 山：阶梯剪影 + 深度明暗渐变 + 岩层纹理 ──────────────────
  // 每次进场景都整幅重绘（确定性绘制，结果逐像素一致）——云/太阳/天空
  // 这些每次重绘的元素从未丢过，唯一只画一次的山体出过"填充消失"，
  // 所以统一走"必重绘"这条路，不给任何缓存状态背锅的机会。
  private addHillLayer(
    depth: 'far' | 'near',
    conf: HillConf,
    factor: number,
  ): Phaser.GameObjects.Container {
    const key = `login-hill-${depth}`
    const heights: number[] = []
    const seed = depth === 'far' ? 2.3 : 5.1

    for (let x = 0; x < LAYER_W; x += 4) {
      let hgt =
        conf.crest +
        Math.sin((x + seed * 40) * 0.021) * conf.crest * 0.42 +
        Math.sin((x + seed * 90) * 0.052) * conf.crest * 0.16
      if (x < 70) hgt += (70 - x) * 0.5
      if (x > LAYER_W - 70) hgt += (x - (LAYER_W - 70)) * 0.5
      heights.push(Math.max(6, Math.round(hgt / 2) * 2))
    }

    const tex = (
      this.textures.exists(key)
        ? this.textures.get(key)
        : this.textures.createCanvas(key, LAYER_W, VH_MAX)
    ) as Phaser.Textures.CanvasTexture | null
    if (tex) {
      const ctx = tex.getContext()
      ctx.clearRect(0, 0, LAYER_W, VH_MAX)

      // 逐像素：山脊以上透明；山体内深度明暗 + 岩层横纹 + 颗粒
      const img = ctx.createImageData(LAYER_W, VH_MAX)
      const data = img.data
      for (let x = 0; x < LAYER_W; x++) {
        const crest = heights[Math.floor(x / 4)]
        for (let y = 0; y < VH_MAX; y++) {
          const idx = (y * LAYER_W + x) * 4
          if (y < crest) {
            data[idx + 3] = 0
            continue
          }
          const depthT = Math.pow((y - crest) / (VH_MAX - crest), 0.75)
          let c = ditherMix(conf.base, conf.dark, depthT, x, y, conf.levels)
          // 岩层横纹：每 12px 一条暗线，端点抖动淡化
          if (conf.strata && (y + Math.floor(x / 4) * 3) % 12 === 0 && bayer(x, y) < 0.6) {
            c = lerpRGB(c, conf.dark, 0.5)
          }
          // 稀疏颗粒斑点
          if (hash2(x, y) < 0.004) {
            c = lerpRGB(c, conf.dark, 0.2)
          }
          data[idx] = c[0]
          data[idx + 1] = c[1]
          data[idx + 2] = c[2]
          data[idx + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
      // 山脊高光沿
      ctx.fillStyle = `rgb(${conf.edge.join(',')})`
      heights.forEach((hgt, i) => ctx.fillRect(i * 4, hgt, 4, 2))

      // 近山种树（矮胖两色树冠；hash 确定性布点，重绘不跳位）
      if (depth === 'near') {
        for (let x = 40; x < LAYER_W - 40; x += 95 + Math.floor(hash2(x, 7) * 56)) {
          const surface = heights[Math.floor(x / 4)]
          ctx.fillStyle = '#5d4632'
          ctx.fillRect(x, surface - 5, 3, 5)
          ctx.fillStyle = '#3d7a52'
          ctx.fillRect(x - 3, surface - 14, 9, 2)
          ctx.fillRect(x - 4, surface - 12, 11, 8)
          ctx.fillStyle = '#57a06b'
          ctx.fillRect(x - 3, surface - 13, 6, 4)
        }
      }
      tex.refresh()
    }

    const y = depth === 'far' ? this.vh * 0.4 - FAR_CREST : this.vh * 0.55 - NEAR_CREST
    const container = this.add.container(240 - LAYER_W / 2, y)
    container.add(this.add.image(0, 0, key).setOrigin(0, 0))
    this.layers.push({ container, factor })

    // 近山山脊上的小熊 + 飘心（站在剪影表面，跟随视差）
    if (depth === 'near') {
      makeTexture(this, 'login-bear', BEAR_ROWS, BEAR_PALETTE)
      const bearX = 352
      const surface = heights[Math.floor(bearX / 4)]
      const bear = this.add.image(bearX, surface, 'login-bear').setOrigin(0.5, 1)
      container.add(bear)
      this.tweens.add({
        targets: bear,
        scaleY: 0.95,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inout',
      })
      makeTexture(this, 'login-heart', HEART_ROWS, HEART_PALETTE, 2)
      this.time.addEvent({
        delay: 4600,
        loop: true,
        callback: () => {
          const heart = this.add
            .image(bearX + Phaser.Math.Between(-4, 4), surface - 18, 'login-heart')
            .setOrigin(0.5)
            .setAlpha(0)
          container.add(heart)
          this.tweens.chain({
            targets: heart,
            tweens: [
              { alpha: 1, y: '-=5', duration: 380, ease: 'sine.out' },
              { alpha: 0, y: '-=11', duration: 1200, ease: 'sine.in' },
            ],
            onComplete: () => heart.destroy(),
          })
        },
      })
    }

    return container
  }

  // ─── 蝴蝶：两帧扇翅 + 正弦路径 ─────────────────────────────
  private spawnButterfly(): void {
    makeTexture(this, 'bfly-a', BUTTERFLY_A, BUTTERFLY_PALETTE, 2)
    makeTexture(this, 'bfly-b', BUTTERFLY_B, BUTTERFLY_PALETTE, 2)
    const sprite = this.add.image(-12, this.vh * (0.42 + Math.random() * 0.2), 'bfly-a')
    this.butterflies.push(sprite)
    const frame = this.time.addEvent({
      delay: 170,
      loop: true,
      callback: () => sprite.setTexture(sprite.texture.key === 'bfly-a' ? 'bfly-b' : 'bfly-a'),
    })
    this.tweens.add({
      targets: sprite,
      x: VW + 16,
      duration: Phaser.Math.Between(15000, 21000),
      repeat: -1,
      onRepeat: () => {
        sprite.y = this.vh * (0.42 + Math.random() * 0.2)
      },
    })
    this.tweens.add({
      targets: sprite,
      y: '+=14',
      duration: Phaser.Math.Between(700, 1000),
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    })
    this.events.once('shutdown', () => frame.remove())
  }

  // ─── 海鸟 ─────────────────────────────────────────────────
  private spawnBird(): void {
    if (this.leaving || !this.scene.isActive()) return
    makeTexture(this, 'bird-a', BIRD_A, BIRD_PALETTE, 2)
    makeTexture(this, 'bird-b', BIRD_B, BIRD_PALETTE, 2)
    const y = this.vh * Phaser.Math.FloatBetween(0.06, 0.2)
    const bird = this.add.image(-16, y, 'bird-a')
    let frame = 0
    const flap = this.time.addEvent({
      delay: 190,
      loop: true,
      callback: () => {
        frame = 1 - frame
        bird.setTexture(frame ? 'bird-b' : 'bird-a')
      },
    })
    this.tweens.add({
      targets: bird,
      x: VW + 20,
      duration: Phaser.Math.Between(9000, 13000),
      onComplete: () => {
        flap.remove()
        bird.destroy()
      },
    })
  }

  // ─── 每帧：视差趋近 + 云漂移 ───────────────────────────────
  update(_time: number, delta: number): void {
    this.elapsed += delta
    const drift = Math.sin(this.elapsed * 0.00013) * 0.32
    const target = Phaser.Math.Clamp(this.pointerNorm * 0.9 + drift, -1.3, 1.3)
    this.parallaxCur = Phaser.Math.Linear(this.parallaxCur, target, 0.045)
    for (const layer of this.layers) {
      layer.container.x = 240 - LAYER_W / 2 - this.parallaxCur * 30 * layer.factor
    }

    const dt = delta / 1000
    for (const cloud of this.cloudsFar) {
      cloud.sprite.x -= cloud.speed * dt
      if (cloud.sprite.x < -cloud.w - 24) {
        cloud.sprite.x = LAYER_W + 24
        cloud.sprite.y = this.vh * Phaser.Math.FloatBetween(0.05, 0.22)
      }
    }
    for (const cloud of this.cloudsNear) {
      cloud.sprite.x -= cloud.speed * dt
      if (cloud.sprite.x < -cloud.w - 24) {
        cloud.sprite.x = LAYER_W + 24
        cloud.sprite.y = this.vh * Phaser.Math.FloatBetween(0.14, 0.34)
      }
    }
  }

  private leave(identity: IslandIdentity): void {
    if (this.leaving) return
    this.leaving = true
    this.cameras.main.fadeOut(520, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.time.delayedCall(60, () => this.scene.start('Island', identity))
    })
  }
}
