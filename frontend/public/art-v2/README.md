# I-land ART v2 assets

Version: `art-v2.1.0` · Visual round 02 · Prepared 2026-11-07.

The authoritative integration interface is `manifest.json`. All actor frames are native 32×32 pixels with a 24px visible standing height and a fixed foot anchor `(16,29)`, origin `(0.5,0.90625)`. Keep sprite scale 1 and use the same integer camera zoom across scenes.

The two JSON hash atlases and individual PNG files are equivalent sources. `characters-pixels.json` reconstructs the same frames for the existing makeTexture and DOM portrait pipelines. This package contains 56 actor frames and 42 day/night furniture frames. No preview/demo actor layer is baked into home resources.

Left/right in `lean-left` and `lean-right` mean the visual direction of leaning, not a seat identifier. Seat 0 leans right; seat 1 leans left. All head pixels are shared between idle, walking, seated and leaning poses in the same direction. Reduced-motion frame mappings are supplied.

TV screen, window view, fireplace animation and sofa foreground are separate. Day/night furniture is already lit; avoid applying the same ambient tint twice. Furniture footprints, seat anchors and stand points are proposals for the integrator to validate in the game. Asset preparation does not certify runtime collisions, room presence, network behavior or mobile usability.

Editable sources and integration notes live in `docs/planning/designs/art-02/`. The frozen version, file list, interfaces and evidence live in `docs/planning/evaluations/visual-round-02/art/READY.json`. Per the user's 2026-11-07 instruction, no delivery checksums are generated. After READY, the HOME-02 integrator owns further changes and versioning.

## HOME-02 运行布局（2026-11-07 接入）

`home-room.tmj` 是 20×15、16px tile 的 Tiled 地图。图像层提供白天编辑预览，`atlasFrame` / `depth` 属性由运行时用于同一图集的日夜分层；动态炉火、电视节目和真实人物仍由场景绘制。

`walkable`、`walls`、`furniture`、`interaction-bounds`、`anchors` 五个对象层分别保存地板范围、墙体、脚底占地、视觉点击区和门/坐席/起身/动态内容锚点。对象层默认隐藏只影响编辑预览，不关闭碰撞或交互。`src/interior/layout.ts` 在构建时直接读取此地图，禁止再维护第二套坐标常量；编辑后重新构建。

本地图沿用联合验收后的坐标，并已用 Phaser 自带 Tiled 对象/图像解析器与运行时读取结果核对；没有在 Tiled 桌面应用中进行额外手工验收。主岛 Tiled 地图仍属后续工作。
