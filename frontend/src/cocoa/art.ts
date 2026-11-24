import type Phaser from 'phaser'
import type { HomeMember } from '../interior/room'
import type { CocoaSnapshot } from './types'
import { COCOA_LAYOUT } from './layout'

export const COCOA_ATLAS = 'cocoa-art'
interface ActionArt { body: string; hands: string; hand: [number, number]; cup: { grip: [number, number]; flipX: boolean } | null }
interface ArtMeta {
  actions: Record<string, ActionArt>
  animations: Record<string, { actions: string[]; frameRate: number; repeat: number; reducedMotionAction: string }>
  counter: { parts: Record<string, [number, number]> }
}
interface Actor { body: Phaser.GameObjects.Image; hands: Phaser.GameObjects.Image; tip: Phaser.GameObjects.Image; token: string; since: number }
interface CupVisual { day: Phaser.GameObjects.Image; night: Phaser.GameObjects.Image }
export function preloadCocoa(scene: Phaser.Scene): void {
  scene.load.atlas(COCOA_ATLAS, '/art-v2/cocoa/atlas.png', '/art-v2/cocoa/atlas.json')
  scene.load.json('cocoa-art-meta', '/art-v2/cocoa/manifest.json')
}

/** 杯子按确认 ID 只有一组图像；身体/手层沿用同一脚锚，接受前不画接到杯子。 */
export class CocoaVisuals {
  private readonly meta: ArtMeta
  private actors = new Map<string, Actor>()
  private cups = new Map<number, CupVisual>()
  private parts: { day: Phaser.GameObjects.Image; night: Phaser.GameObjects.Image; base: string }[] = []
  private steam: Phaser.GameObjects.Image
  private glint: Phaser.GameObjects.Image
  constructor(private readonly scene: Phaser.Scene) {
    this.meta = scene.cache.json.get('cocoa-art-meta') as ArtMeta
    const origin = COCOA_LAYOUT.origin, depth = COCOA_LAYOUT.depth
    const parts: [string, number, number, number][] = [
      ['counter-base',0,0,depth], ['burner-0',...this.meta.counter.parts.burner,depth+.1],
      ['pot',...this.meta.counter.parts.pot,depth+.2], ['knob-0',...this.meta.counter.parts.knob,depth+.3], ['counter-front',0,0,depth+.4],
    ]
    for (const [base,x,y,z] of parts) this.parts.push({ base,
      day: scene.add.image(origin.x+x,origin.y+y,COCOA_ATLAS,`${base}-day`).setOrigin(0).setDepth(z),
      night: scene.add.image(origin.x+x,origin.y+y,COCOA_ATLAS,`${base}-night`).setOrigin(0).setDepth(z+.01),
    })
    const [sx,sy] = this.meta.counter.parts.steamAnchor
    this.steam = scene.add.image(origin.x+sx,origin.y+sy,COCOA_ATLAS,'steam-1-day').setOrigin(2/24,1).setDepth(depth+3).setAlpha(.8).setVisible(false)
    this.glint = scene.add.image(0,0,COCOA_ATLAS,'clink-glint-day').setOrigin(.5).setDepth(depth+4).setVisible(false)
  }
  clear(): void {
    for (const actor of this.actors.values()) { actor.body.destroy(); actor.hands.destroy(); actor.tip.destroy() }
    this.actors.clear()
    for (const cup of this.cups.values()) { cup.day.destroy(); cup.night.destroy() }
    this.cups.clear(); this.glint.setVisible(false)
  }
  update(members: HomeMember[], state: CocoaSnapshot | null, now: number, night: number, reduced: boolean): void {
    const theme = night > .5 ? 'night' : 'day', depth = COCOA_LAYOUT.depth
    const heat = state?.operators.find(o => o.station === 'heat')?.intent
    for (const part of this.parts) {
      const base = part.base.startsWith('burner') ? `burner-${heat === 'heat' ? 2 : heat === 'gentle' ? 1 : 0}`
        : part.base.startsWith('knob') ? `knob-${heat === 'heat' ? 2 : heat === 'gentle' ? 1 : 0}` : part.base
      part.day.setTexture(COCOA_ATLAS,`${base}-day`); part.night.setTexture(COCOA_ATLAS,`${base}-night`).setAlpha(night)
    }
    this.steam.setVisible(!!state?.run && state.run.temperature >= 42 && state.run.phase !== 'complete')
      .setTexture(COCOA_ATLAS,`steam-${reduced ? 1 : Math.floor(now/333)%4}-${theme}`)
    const present = members.filter(m => m.station)
    for (const [key,actor] of this.actors) if (!present.some(m => m.account === key)) {
      actor.body.destroy(); actor.hands.destroy(); actor.tip.destroy(); this.actors.delete(key)
    }
    const usedCups = new Set<number>()
    let glint = false
    for (const member of present) {
      const station = member.station!, side = station === 'heat' ? 'right' : 'left'
      const pass = state?.offers.find(o => o.kind === 'pass' && o.from_account === member.account)
      const intent = state?.operators.find(o => o.account === member.account)?.intent
      const action = member.cocoa_pose === 'cheers' ? `clink-${side}` : member.cocoa_pose === 'receiving' ? `receive-${side}`
        : pass ? `offer-${side}` : member.held_cup_id ? 'hold-down' : `${station}-down`
      const animation = this.meta.animations[`${member.account}-${action}`]
      const token = `${action}:${pass?.id ?? state?.cheers?.id ?? ''}`
      let actor = this.actors.get(member.account)
      if (!actor) {
        const make = () => this.scene.add.image(0,0,COCOA_ATLAS,`${member.account}-hold-down-0-body`).setOrigin(.5,29/32)
        actor = { body: make(), hands: make(), tip: make(), token, since: now }; this.actors.set(member.account,actor)
      }
      if (actor.token !== token) { actor.token = token; actor.since = now }
      const animated = !!intent || action.startsWith('offer') || action.startsWith('receive') || action.startsWith('clink')
      const index = animated && !reduced ? Math.floor((now-actor.since)/1000*animation.frameRate) : 0
      const key = reduced || !animated ? animation.reducedMotionAction : animation.actions[animation.repeat === -1 ? index%animation.actions.length : Math.min(index,animation.actions.length-1)]
      const frame = this.meta.actions[key]
      const foot = { ...COCOA_LAYOUT.feet[station] }
      if (action.startsWith('clink')) foot.x += station === 'heat' ? 4 : -4
      actor.body.setPosition(foot.x,foot.y).setTexture(COCOA_ATLAS,frame.body).setDepth(foot.y)
      actor.hands.setPosition(foot.x,foot.y).setTexture(COCOA_ATLAS,frame.hands).setDepth(depth+1)
      actor.tip.setVisible(false)
      const cupId = pass?.cup_id ?? member.held_cup_id
      const cup = state?.visible_cups.find(c => c.id === cupId)
      if (cup && cupId != null) {
        let visual = this.cups.get(cupId)
        const topping = cup.ingredients[0] ?? 'plain', cupFrame = `cup-${cup.cup_type}-${topping}`
        if (!visual) {
          visual = { day: this.scene.add.image(0,0,COCOA_ATLAS,`${cupFrame}-day`).setOrigin(0), night: this.scene.add.image(0,0,COCOA_ATLAS,`${cupFrame}-night`).setOrigin(0) }
          this.cups.set(cupId,visual)
        }
        const binding = frame.cup ?? this.meta.actions[`${member.account}-hold-${side}-0`].cup!
        const x = foot.x-16+frame.hand[0]-binding.grip[0], y = foot.y-29+frame.hand[1]-binding.grip[1]
        visual.day.setPosition(x,y).setTexture(COCOA_ATLAS,`${cupFrame}-day`).setFlipX(binding.flipX).setDepth(depth+1.1)
        visual.night.setPosition(x,y).setTexture(COCOA_ATLAS,`${cupFrame}-night`).setFlipX(binding.flipX).setDepth(depth+1.11).setAlpha(night)
        actor.tip.setPosition(foot.x,foot.y).setTexture(COCOA_ATLAS,frame.hands).setCrop(frame.hand[0]-1,frame.hand[1],2,2).setDepth(depth+1.2).setVisible(true)
        usedCups.add(cupId)
      }
      if (action.startsWith('clink') && !reduced && now-actor.since<600) glint = true
    }
    for (const [id,cup] of this.cups) if (!usedCups.has(id)) { cup.day.destroy(); cup.night.destroy(); this.cups.delete(id) }
    this.glint.setPosition((COCOA_LAYOUT.feet.heat.x+COCOA_LAYOUT.feet.stir.x)/2,COCOA_LAYOUT.feet.heat.y-13).setTexture(COCOA_ATLAS,`clink-glint-${theme}`).setVisible(glint)
  }
}
