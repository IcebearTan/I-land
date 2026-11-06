import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import ts from 'typescript';
const transpile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const compile = path => transpile(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const audioUrl = url(compile('../src/audio/types.ts')), navigationUrl = url(compile('../src/interior/navigation.ts')), charactersUrl = url(compile('../src/characters.ts'));
const artSource = fs.readFileSync(new URL('../src/game/art/interior.ts', import.meta.url), 'utf8');
const { HOME_LAYOUT } = await import(url(transpile(artSource.slice(artSource.indexOf('export const HOME_LAYOUT'), artSource.indexOf('const C =')))));
const bus = new EventEmitter(), RealDate = Date, baseRealMs = RealDate.parse('2026-10-02T14:00:00.000Z');
let realNow = baseRealMs;
class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [realNow])); }
    ;
    static now() { return realNow; }
}
globalThis.Date = FixedDate;
class TrackedTarget extends EventTarget {
    listeners = new Map();
    addEventListener(name, listener, options) { super.addEventListener(name, listener, options); if (!this.listeners.has(name))
        this.listeners.set(name, new Set()); this.listeners.get(name).add(listener); }
    removeEventListener(name, listener, options) { super.removeEventListener(name, listener, options); this.listeners.get(name)?.delete(listener); }
    listenerCount(name) { return this.listeners.get(name)?.size ?? 0; }
}
class MediaQuery extends TrackedTarget {
    matches = false;
    change(value) { this.matches = value; this.dispatchEvent(new Event('change')); }
}
const media = new MediaQuery(), documentTarget = new TrackedTarget();
documentTarget.hidden = false;
documentTarget.activeElement = null;
globalThis.document = documentTarget;
globalThis.window = { location: { search: '' }, matchMedia: () => media };
globalThis.HTMLElement = class HTMLElement {
    constructor(interactive = false) { this.interactive = interactive; }
    ;
    closest() { return this.interactive ? this : null; }
};
class ContextEmitter {
    entries = [];
    on(name, listener, context) { this.entries.push({ name, listener, context }); return this; }
    off(name, listener, context) { this.entries = this.entries.filter(item => item.name !== name || item.listener !== listener || item.context !== context); return this; }
    emit(name, ...args) { for (const item of this.entries.filter(item => item.name === name))
        item.listener.apply(item.context, args); }
    listenerCount(name) { return this.entries.filter(item => item.name === name).length; }
}
class DisplayObject extends EventEmitter {
    active = true;
    visible = true;
    alpha = 1;
    width = 0;
    constructor(kind, x = 0, y = 0, texture = '') { super(); Object.assign(this, { kind, x, y, texture }); this.textures = [texture]; }
    setOrigin(...value) { this.origin = value; return this; }
    setDepth(value) { this.depth = value; return this; }
    setVisible(value) { this.visible = value; return this; }
    setAlpha(value) { this.alpha = value; return this; }
    setPosition(x, y) { this.x = x; this.y = y; return this; }
    setTexture(texture) { this.texture = texture; this.textures.push(texture); return this; }
    setFlipX(value) { this.flipX = value; return this; }
    setText(text) { this.text = text; this.width = text.length * 8; return this; }
    setInteractive() { this.interactive = true; return this; }
    destroy() { this.active = false; this.removeAllListeners(); }
}
for (const method of ['clear', 'lineStyle', 'fillStyle', 'strokeEllipse', 'fillRoundedRect', 'fillTriangle'])
    DisplayObject.prototype[method] = function () { return this; };
class Keyboard extends EventEmitter {
    enabled = true;
    captured = false;
    resets = 0;
    removed = [];
    keys = {};
    resetKeys() { this.resets++; for (const key of Object.values(this.keys))
        key.isDown = false; }
    disableGlobalCapture() { this.captured = false; }
    addKeys(names, capture) { this.captured = capture; this.keys = Object.fromEntries(names.split(',').map(name => [name, { name, isDown: false }])); return this.keys; }
    removeKey(key) { this.removed.push(key.name); delete this.keys[key.name]; }
}
class Scene {
    constructor() {
        this.events = new EventEmitter();
        this.game = { events: new EventEmitter() };
        this.scale = new ContextEmitter();
        this.scale.gameSize = { width: 1120, height: 740 };
        this.input = new EventEmitter();
        this.input.keyboard = new Keyboard();
        this.objects = [];
        const add = (kind, x, y, key) => { const item = new DisplayObject(kind, x, y, key); this.objects.push(item); return item; };
        this.add = { image: (x, y, key) => add('image', x, y, key), sprite: (x, y, key) => add('sprite', x, y, key), ellipse: (x, y) => add('ellipse', x, y), graphics: () => add('graphics'), text: (x, y, text) => add('text', x, y).setText(text), zone: (x, y) => add('zone', x, y), container: (x, y, children) => { const item = add('container', x, y); item.children = children; return item; } };
        this.cameras = { main: { zoom: 1, center: [], fades: [], setBackgroundColor(color) { this.background = color; return this; }, setZoom(zoom) { this.zoom = zoom; return this; }, centerOn(...point) { this.center = point; return this; }, getWorldPoint(x, y) { return { x, y }; }, fadeIn(duration) { this.fades.push(duration); } } };
        this.tweens = { items: [], add: config => {
                const initialAlpha = config.targets.alpha;
                const tween = { config, stopped: false, playing: true, stops: 0, stop() { this.stopped = true; this.playing = false; this.stops++; }, isPlaying() { return this.playing; }, yoyo() { if (this.playing)
                        config.onYoyo?.(); }, complete() { if (this.stopped || !this.playing)
                        return; this.playing = false; if (config.x !== undefined)
                        config.targets.x = config.x; if (config.y !== undefined)
                        config.targets.y = config.y; if (config.alpha !== undefined)
                        config.targets.alpha = config.yoyo ? initialAlpha : config.alpha; config.onYoyo?.(); config.onComplete?.(); }, lateComplete() { config.onYoyo?.(); config.onComplete?.(); } };
                this.tweens.items.push(tween);
                return tween;
            } };
        this.timers = [];
        this.time = { timeScale: 1, delayedCall: (delay, callback) => { const timer = { delay, removed: false, remove() { this.removed = true; }, lateFire() { callback(); } }; this.timers.push(timer); return timer; } };
        this.sound = { rate: 1 };
        this.backdrops = [];
        this.programs = [];
        this.textureCreates = [];
    }
}
globalThis.__homeTestBus = bus;
globalThis.__homeTestPhaser = { Scene, Math: { Clamp: (value, min, max) => Math.max(min, Math.min(max, value)) }, Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } } };
globalThis.__homeTestArt = { HOME_LAYOUT, createInteriorArt: scene => { scene.artCreates = (scene.artCreates ?? 0) + 1; }, paintInteriorBackdrop: (scene, hour) => scene.backdrops.push(hour), paintInteriorTV: (scene, ...args) => scene.programs.push(args) };
globalThis.__homeTestTexture = (scene, key) => scene.textureCreates.push(key);
const source = compile('../src/game/scenes/InteriorScene.ts')
    .replace(/import Phaser from ['"]phaser['"];?/, 'const Phaser = globalThis.__homeTestPhaser;')
    .replace(/import \{ eventBus \} from ['"]\.\.\/EventBus['"];?/, 'const eventBus = globalThis.__homeTestBus;')
    .replace(/import \{([^}]+)\} from ['"]\.\.\/art\/interior['"];?/, 'const {$1} = globalThis.__homeTestArt;')
    .replace(/import \{ makeTexture \} from ['"]\.\.\/pixels['"];?/, 'const makeTexture = globalThis.__homeTestTexture;')
    .replace(/from ['"]\.\.\/\.\.\/audio\/types['"]/, `from '${audioUrl}'`)
    .replace(/from ['"]\.\.\/\.\.\/interior\/navigation['"]/, `from '${navigationUrl}'`)
    .replace(/from ['"]\.\.\/\.\.\/characters['"]/, `from '${charactersUrl}'`);
const { InteriorScene } = await import(url(source));
const homeNavigation = await import(navigationUrl);
const subscriptions = ['MOVE_INPUT', 'INTERACT', 'INTERACTION_REQUEST_STATE', 'INTERIOR_ACTION', 'INTERIOR_REQUEST_STATE', 'PANEL_OPENED', 'PANEL_CLOSED', 'IDENTITY_CHANGED', 'SCENE_CHANGED'];
const point = actor => ({ x: actor.x, y: actor.y });
function setup({ reduce = false, identity = { character: 'bear', display: '小熊', account: 'bear' } } = {}) {
    realNow = baseRealMs;
    media.matches = reduce;
    document.hidden = false;
    document.activeElement = null;
    window.location.search = '';
    const scene = new InteriorScene(), states = [], contexts = [], ready = [], days = [], travels = [], settings = [];
    const observers = [['INTERIOR_STATE', value => states.push(value)], ['AUDIO_CONTEXT', value => contexts.push(value)], ['SCENE_READY', value => ready.push(value)], ['DAY_TICK', value => days.push(value)], ['TRAVEL_REQUEST', value => travels.push(value)], ['AUDIO_SETTINGS', value => settings.push(value)]];
    for (const [name, listener] of observers)
        bus.on(name, listener);
    scene.init(identity);
    scene.create();
    const actor = () => scene.objects.filter(item => item.kind === 'sprite' && item.active).at(-1);
    const advance = (delta = 16) => { realNow += delta; scene.update(realNow - baseRealMs, delta); };
    const complete = () => { for (const tween of scene.tweens.items)
        if (tween.isPlaying())
            tween.complete(); };
    const click = p => scene.input.emit('pointerdown', p, []);
    const seat = (which = 0) => { actor().setPosition(HOME_LAYOUT.standPoints[which].x, HOME_LAYOUT.standPoints[which].y); click(HOME_LAYOUT.seats[which]); for (let i = 0; i < 10; i++)
        advance(); };
    const shutdown = () => { scene.events.emit('shutdown'); for (const item of scene.objects)
        if (item.active)
            item.destroy(); }; // Phaser 管理显示列表的 shutdown。
    const destroy = () => { shutdown(); scene.events.emit('destroy'); for (const [name, listener] of observers)
        bus.off(name, listener); };
    return { scene, states, contexts, ready, days, travels, settings, actor, advance, complete, click, seat, shutdown, destroy };
}
test('local interior creates only the selected person and starts with television off', () => {
    const t = setup({ reduce: true, identity: { character: 'her', display: '小青', account: 'her' } });
    try {
        assert.equal(t.scene.objects.filter(item => item.kind === 'sprite').length, 1);
        assert.equal(t.actor().texture, 'islander-her-front');
        assert.deepEqual(t.ready, [{ scene: 'interior', identity: { character: 'her', display: '小青', account: 'her' } }]);
        assert.equal(t.states.at(-1).pose, 'walking');
        assert.equal(t.states.at(-1).seat, null);
        assert.equal(t.states.at(-1).television, false);
        assert.equal(t.states.at(-1).channel, 0);
        assert.equal(t.states.at(-1).companion, undefined);
        bus.emit('IDENTITY_CHANGED', { character: 'bear', display: '熊', account: 'bear' });
        assert.equal(t.actor().texture, 'islander-bear-front');
        assert.equal(t.scene.objects.filter(item => item.kind === 'sprite').length, 1);
        assert.equal(t.settings.length, 0);
    }
    finally {
        t.destroy();
    }
});
test('sofa arrival, sitting and standing use dedicated poses and safe points without reviving earlier movement', () => {
    const t = setup();
    try {
        t.seat(1);
        assert.equal(t.states.at(-1).pose, 'approaching');
        assert.equal(t.scene.tweens.items.at(-1).config.duration, 460);
        t.complete();
        assert.equal(t.states.at(-1).pose, 'seated');
        assert.equal(t.states.at(-1).seat, 1);
        assert.equal(t.actor().texture, 'home-bear-seated');
        assert.deepEqual(point(t.actor()), HOME_LAYOUT.seats[1]);
        bus.emit('MOVE_INPUT', { x: 1, y: 0 });
        t.advance(80);
        assert.deepEqual(point(t.actor()), HOME_LAYOUT.seats[1]);
        bus.emit('INTERIOR_ACTION', { action: 'stand' });
        t.complete();
        assert.equal(t.states.at(-1).pose, 'walking');
        assert.equal(t.states.at(-1).seat, null);
        assert.equal(t.actor().texture, 'islander-bear-front');
        assert.deepEqual(point(t.actor()), HOME_LAYOUT.standPoints[1]);
        t.advance(80);
        assert.deepEqual(point(t.actor()), HOME_LAYOUT.standPoints[1]);
    }
    finally {
        t.destroy();
    }
});
test('panel opened during sitting cancels to safe floor and closing does not restore pending keys or actions', () => {
    const t = setup();
    try {
        t.seat();
        const arrival = t.scene.tweens.items.at(-1);
        t.actor().setPosition(146, 190);
        bus.emit('PANEL_OPENED', { panel: 'settings' });
        assert.equal(arrival.stopped, true);
        assert.equal(t.scene.input.keyboard.enabled, false);
        assert.deepEqual(point(t.actor()), HOME_LAYOUT.standPoints[0]);
        assert.equal(t.states.at(-1).pose, 'walking');
        const count = t.states.length;
        bus.emit('INTERIOR_ACTION', { action: 'tv-toggle' });
        bus.emit('INTERACT', {});
        t.scene.input.keyboard.emit('keydown', { code: 'Escape' });
        arrival.lateComplete();
        assert.equal(t.states.length, count);
        assert.deepEqual(t.travels, []);
        bus.emit('MOVE_INPUT', { x: -1, y: 1 });
        t.scene.input.keyboard.keys.D.isDown = true;
        bus.emit('PANEL_CLOSED', { panel: 'settings' });
        t.advance(80);
        assert.equal(t.scene.input.keyboard.enabled, true);
        assert.equal(t.scene.input.keyboard.captured, false);
        assert.deepEqual(point(t.actor()), HOME_LAYOUT.standPoints[0]);
        assert.equal(t.states.at(-1).television, false);
    }
    finally {
        t.destroy();
    }
});
test('blur and visibility cancel old movement and sitting without late animation resurrection', () => {
    const t = setup();
    try {
        bus.emit('MOVE_INPUT', { x: -1, y: 0 });
        t.advance(80);
        const p = point(t.actor());
        t.scene.game.events.emit('blur');
        t.advance(80);
        assert.deepEqual(point(t.actor()), p);
        t.seat();
        const arrival = t.scene.tweens.items.at(-1);
        document.hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
        assert.equal(arrival.stopped, true);
        assert.equal(t.states.at(-1).pose, 'walking');
        const count = t.states.length;
        arrival.lateComplete();
        document.hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
        t.advance(80);
        assert.equal(t.states.length, count);
        assert.deepEqual(point(t.actor()), HOME_LAYOUT.standPoints[0]);
    }
    finally {
        t.destroy();
    }
});
test('interrupting a stand clears its progress notice and lands safely for either seat', () => {
    for (const seat of [0, 1]) for (const interrupt of ['blur', 'panel', 'movement']) {
        const t = setup();
        try {
            t.seat(seat); t.complete();
            bus.emit('INTERIOR_ACTION', { action: 'stand' });
            const motion = t.scene.tweens.items.at(-1);
            assert.equal(t.states.at(-1).notice, '慢慢起身…');
            if (interrupt === 'blur') t.scene.game.events.emit('blur');
            else if (interrupt === 'panel') bus.emit('PANEL_OPENED', { panel: 'settings' });
            else bus.emit('MOVE_INPUT', { x: 1, y: 0 });
            assert.equal(motion.stopped, true);
            assert.deepEqual(point(t.actor()), HOME_LAYOUT.standPoints[seat]);
            assert.equal(t.states.at(-1).pose, 'walking');
            assert.equal(t.states.at(-1).notice, undefined, 'cancelled standing must not leave an endless progress message');
            motion.lateComplete();
            assert.equal(t.states.at(-1).pose, 'walking');
        } finally { t.destroy(); }
    }
});
test('clicking clear floor from either seat stands first then routes around the sofa', () => {
    const { homeWalkable, homeSegmentClear } = homeNavigation;
    for (const seat of [0, 1]) {
        const t = setup();
        try {
            t.seat(seat); t.complete();
            const target = { x: HOME_LAYOUT.seats[seat].x, y: HOME_LAYOUT.sofa.y - 12 };
            t.click(target);
            assert.equal(t.states.at(-1).pose, 'approaching');
            assert.deepEqual(point(t.actor()), HOME_LAYOUT.seats[seat]);
            t.complete();
            let previous = point(t.actor());
            assert.deepEqual(previous, HOME_LAYOUT.standPoints[seat]);
            let wentAround = false;
            for (let i = 0; i < 350; i++) {
                t.advance(16);
                const current = point(t.actor());
                assert.ok(homeWalkable(HOME_LAYOUT, current.x, current.y));
                assert.ok(homeSegmentClear(HOME_LAYOUT, previous, current));
                if (current.x <= HOME_LAYOUT.sofa.x - 4 || current.x >= HOME_LAYOUT.sofa.x + HOME_LAYOUT.sofa.w + 4) wentAround = true;
                previous = current;
            }
            assert.deepEqual(point(t.actor()), target);
            assert.ok(wentAround);
            assert.equal(t.states.at(-1).pose, 'walking');
            assert.equal(t.states.at(-1).seat, null);
        } finally { t.destroy(); }
    }
});
test('reduced motion skips sofa/TV tweens and changing the preference ends the current visual arrival', () => {
    const t = setup({ reduce: true });
    try {
        t.seat();
        assert.equal(t.states.at(-1).pose, 'seated');
        bus.emit('INTERIOR_ACTION', { action: 'tv-toggle' });
        bus.emit('INTERIOR_ACTION', { action: 'tv-next' });
        assert.equal(t.states.at(-1).television, true);
        assert.equal(t.states.at(-1).channel, 1);
        assert.equal(t.scene.tweens.items.length, 0);
        assert.deepEqual(t.scene.cameras.main.fades, []);
        assert.ok(t.scene.programs.every(args => args[2] === true));
        bus.emit('INTERIOR_ACTION', { action: 'stand' });
        assert.equal(t.states.at(-1).pose, 'walking');
    }
    finally {
        t.destroy();
    }
    const active = setup();
    try {
        active.seat();
        const arrival = active.scene.tweens.items.at(-1);
        media.change(true);
        assert.equal(arrival.stopped, true);
        assert.equal(active.states.at(-1).pose, 'seated');
        arrival.lateComplete();
        assert.equal(active.states.at(-1).pose, 'seated');
    }
    finally {
        active.destroy();
    }
});
test('TV transitions can be interrupted without stale rendering, extra players or changing personal audio preferences', () => {
    const t = setup();
    try {
        t.seat();
        t.complete();
        bus.emit('INTERIOR_ACTION', { action: 'tv-next' });
        assert.equal(t.states.at(-1).channel, 0);
        bus.emit('INTERIOR_ACTION', { action: 'tv-toggle' });
        const turnOn = t.scene.tweens.items.at(-1);
        assert.equal(t.states.at(-1).television, true);
        assert.equal(turnOn.config.duration, 400);
        bus.emit('INTERIOR_ACTION', { action: 'tv-next' });
        assert.equal(turnOn.stopped, true);
        assert.equal(t.states.at(-1).channel, 1);
        const change = t.scene.tweens.items.at(-1);
        change.yoyo();
        assert.equal(t.scene.programs.at(-1)[0], 1);
        bus.emit('INTERIOR_ACTION', { action: 'tv-toggle' });
        const current = t.scene.programs.at(-1), screen = t.scene.objects.find(item => item.texture === 'home-tv');
        assert.equal(t.states.at(-1).television, false);
        assert.equal(screen.alpha, 1);
        change.lateComplete();
        turnOn.lateComplete();
        assert.equal(t.scene.programs.at(-1), current);
        assert.equal(screen.alpha, 1);
        assert.equal(t.settings.length, 0);
        assert.equal(t.scene.sound.rate, 1);
        assert.equal(t.scene.time.timeScale, 1);
    }
    finally {
        t.destroy();
    }
});
test('focused React controls block held movement keys and E/Space/Escape game actions', () => {
    const t = setup({ reduce: true });
    try {
        t.actor().setPosition(HOME_LAYOUT.tv.x, HOME_LAYOUT.tv.y);
        const button = new HTMLElement(true);
        document.activeElement = button;
        t.scene.input.keyboard.keys.D.isDown = true;
        for (const code of ['Space', 'KeyE', 'Escape'])
            t.scene.input.keyboard.emit('keydown', { code, target: button });
        const p = point(t.actor());
        t.advance(80);
        assert.deepEqual(point(t.actor()), p);
        assert.equal(t.states.at(-1).television, false);
        assert.deepEqual(t.travels, []);
        document.activeElement = null;
        t.scene.input.keyboard.keys.D.isDown = false;
        t.scene.input.keyboard.emit('keydown', { code: 'KeyE', target: new HTMLElement(false) });
        assert.equal(t.states.at(-1).television, true);
        t.scene.input.keyboard.emit('keydown', { code: 'Escape' });
        assert.deepEqual(t.travels, [{ from: 'interior', to: 'island' }]);
    }
    finally {
        t.destroy();
    }
});
test('television commands require a seat or proximity, and renaming preserves the seat and channel', () => {
    const t = setup({ reduce: true });
    try {
        bus.emit('INTERIOR_ACTION', { action: 'tv-toggle' });
        assert.equal(t.states.at(-1).television, false, 'door is too far from television');
        t.actor().setPosition(HOME_LAYOUT.tv.x, HOME_LAYOUT.tv.y);
        t.advance();
        assert.equal(t.states.at(-1).nearTelevision, true);
        bus.emit('INTERIOR_ACTION', { action: 'tv-toggle' });
        for (const channel of [1, 2, 0]) {
            bus.emit('INTERIOR_ACTION', { action: 'tv-next' });
            assert.equal(t.states.at(-1).channel, channel);
        }
        t.seat(1);
        const before = { ...t.states.at(-1) };
        bus.emit('IDENTITY_CHANGED', { character: 'bear', account: 'bear', display: '新名字' });
        assert.deepEqual(t.states.at(-1), before);
        assert.deepEqual(point(t.actor()), HOME_LAYOUT.seats[1]);
        assert.equal(t.actor().texture, 'home-bear-seated');
        assert.deepEqual(t.travels, []);
    } finally { t.destroy(); }
});
test('held keyboard movement cannot clip the sofa even with fractional positions and long frames', () => {
    const t = setup({ reduce: true });
    try {
        const sofa = HOME_LAYOUT.sofa;
        t.actor().setPosition(sofa.x - 4.9, sofa.y + sofa.h + 3.1);
        t.scene.input.keyboard.keys.D.isDown = true;
        t.scene.input.keyboard.keys.W.isDown = true;
        let previous = point(t.actor());
        for (let i = 0; i < 100; i++) {
            t.advance(i % 3 ? 16.667 : 250);
            const current = point(t.actor());
            assert.ok(homeNavigation.homeWalkable(HOME_LAYOUT, current.x, current.y));
            assert.ok(homeNavigation.homeSegmentClear(HOME_LAYOUT, previous, current));
            previous = current;
        }
    } finally { t.destroy(); }
});
test('short portrait TV and fireplace prompts stay below the return control', () => {
    const t = setup({ reduce: true });
    try {
        t.scene.scale.gameSize = { width: 320, height: 568 };
        t.scene.scale.emit('resize');
        for (const target of [HOME_LAYOUT.tv, HOME_LAYOUT.fireplace]) {
            t.actor().setPosition(target.x, target.y);
            t.advance();
            const prompt = t.scene.objects.find(item => item.kind === 'container');
            const zoom = t.scene.cameras.main.zoom;
            const screenTop = (prompt.y - 120 - 10) * zoom + 568 / 2;
            assert.ok(prompt.visible);
            assert.ok(screenTop > 114, 'the full prompt background clears the mobile return button');
        }
    } finally { t.destroy(); }
});
test('portrait camera keeps door and stand points above the walking controls', () => {
    const t = setup({ reduce: true });
    try {
        for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
            t.scene.scale.gameSize = size;
            for (const target of [HOME_LAYOUT.door, ...HOME_LAYOUT.standPoints]) {
                t.actor().setPosition(target.x, target.y);
                t.scene.scale.emit('resize');
                const camera = t.scene.cameras.main;
                const feetY = (t.actor().y - camera.center[1]) * camera.zoom + size.height / 2;
                assert.ok(feetY <= size.height - 150, 'all of the player remains above the walking controls');
            }
        }
    } finally { t.destroy(); }
});
test('interior audio and day ticks use real time and do not respond to accelerated seaside clock controls', () => {
    const t = setup({ reduce: true });
    try {
        const time = ms => { const date = new RealDate(ms); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; };
        const initial = t.contexts.at(-1);
        assert.equal(initial.scene, 'interior');
        assert.equal(t.days.at(-1).time, time(realNow));
        bus.emit('SEASIDE_CLOCK_REQUEST', { action: 'rate', rate: 120 });
        t.advance(60000);
        assert.equal(t.days.at(-1).time, time(realNow));
        assert.equal(t.contexts.at(-1).night, initial.night);
        assert.equal(t.contexts.at(-1).scene, 'interior');
        assert.equal(t.scene.sound.rate, 1);
        assert.equal(t.scene.time.timeScale, 1);
        assert.equal(t.settings.length, 0);
    }
    finally {
        t.destroy();
    }
});
test('a fireplace notice still expires after ordinary walking and a newer notice ignores the older timer', () => {
    const t = setup({ reduce: true });
    try {
        t.actor().setPosition(HOME_LAYOUT.fireplace.x, HOME_LAYOUT.fireplace.y);
        bus.emit('INTERACT', {});
        const first = t.scene.timers.at(-1);
        assert.ok(t.states.at(-1).notice);
        bus.emit('MOVE_INPUT', { x: 1, y: 0 });
        t.advance(80);
        first.lateFire();
        assert.equal(t.states.at(-1).notice, undefined);
        bus.emit('MOVE_INPUT', { x: 0, y: 0 });
        t.actor().setPosition(HOME_LAYOUT.tv.x, HOME_LAYOUT.tv.y);
        bus.emit('INTERIOR_ACTION', { action: 'tv-toggle' });
        const turnOn = t.scene.timers.at(-1);
        bus.emit('INTERIOR_ACTION', { action: 'tv-toggle' });
        const latest = t.states.at(-1).notice;
        turnOn.lateFire();
        assert.equal(t.states.at(-1).notice, latest);
        t.scene.timers.at(-1).lateFire();
        assert.equal(t.states.at(-1).notice, undefined);
    }
    finally {
        t.destroy();
    }
});
test('travel and repeated shutdown clean all listeners; same-instance reentry rejects prior animation and timer callbacks', () => {
    const t = setup();
    try {
        t.seat();
        const arrival = t.scene.tweens.items.at(-1);
        t.complete();
        bus.emit('INTERIOR_ACTION', { action: 'tv-toggle' });
        const tv = t.scene.tweens.items.at(-1), notice = t.scene.timers.at(-1);
        for (const name of subscriptions)
            assert.equal(bus.listenerCount(name), 1);
        assert.equal(media.listenerCount('change'), 1);
        assert.equal(document.listenerCount('visibilitychange'), 1);
        bus.emit('SCENE_CHANGED', { scene: 'interior', transitioning: true });
        const count = t.states.length;
        arrival.lateComplete();
        tv.lateComplete();
        notice.lateFire();
        bus.emit('INTERIOR_ACTION', { action: 'stand' });
        bus.emit('INTERIOR_ACTION', { action: 'tv-next' });
        assert.equal(t.states.length, count);
        assert.equal(tv.stopped, true);
        const keyboard = t.scene.input.keyboard;
        t.shutdown();
        t.scene.events.emit('destroy');
        assert.equal(t.scene.input.listenerCount('pointerdown'), 0);
        assert.equal(keyboard.listenerCount('keydown'), 0);
        assert.equal(keyboard.removed.length, 8);
        assert.equal(notice.removed, true);
        assert.equal(t.scene.game.events.listenerCount('blur'), 0);
        assert.equal(t.scene.scale.listenerCount('resize'), 0);
        assert.equal(media.listenerCount('change'), 0);
        assert.equal(document.listenerCount('visibilitychange'), 0);
        for (const name of subscriptions)
            assert.equal(bus.listenerCount(name), 0);
        assert.equal(t.scene.events.listenerCount('shutdown'), 0);
        assert.equal(t.scene.events.listenerCount('destroy'), 0);
        const paints = t.scene.programs.length;
        tv.lateComplete();
        notice.lateFire();
        t.scene.update(1000, 1000);
        assert.equal(t.scene.programs.length, paints);
        assert.equal(t.states.length, count);
        t.scene.init({ character: 'her', display: '青', account: 'her' });
        t.scene.create();
        const actor = t.actor(), latest = t.states.at(-1);
        assert.equal(actor.texture, 'islander-her-front');
        assert.equal(latest.pose, 'walking');
        assert.equal(latest.television, false);
        assert.equal(latest.channel, 0);
        const states = t.states.length, programs = t.scene.programs.length;
        arrival.lateComplete();
        tv.lateComplete();
        notice.lateFire();
        assert.equal(t.states.length, states);
        assert.equal(t.scene.programs.length, programs);
        assert.equal(t.actor(), actor);
        assert.equal(actor.texture, 'islander-her-front');
        assert.equal(media.listenerCount('change'), 1);
        assert.equal(document.listenerCount('visibilitychange'), 1);
        for (const name of subscriptions)
            assert.equal(bus.listenerCount(name), 1);
        t.scene.scale.gameSize = { width: 390, height: 844 };
        t.scene.scale.emit('resize');
        assert.equal(t.actor(), actor);
        assert.equal(t.scene.cameras.main.zoom, 2);
    }
    finally {
        t.destroy();
    }
});
