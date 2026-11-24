# COCOA-03 · 一起把可可搅得温暖

2026-11-07，版本 `cocoa-art-1.0.0`，依赖已验收 `art-v2.1.0`。沿用32×32人物帧、24px可见站高、脚锚(16,29)，没有改既有角色/客厅图集、根manifest、地图或运行时代码。

| 产物 | 查看入口 |
| --- | --- |
| 白天 / 夜晚样台 | [白天](previews/day.png) · [夜晚](previews/night.png) |
| 与既有家具同比例 | [料理台与沙发](previews/scale-comparison.png) |
| 两种杯型 / 三种配料 | [奶油、青绿杯与成品](previews/cups-and-toppings.png) |
| 控温 / 搅拌 | [完整关键帧](previews/work-motion.png) |
| 持杯 / 递杯 / 接杯 / 碰杯 | [动作表](previews/social-actions.png) · [双人接触检查](previews/pair-contact.png) |
| 小屏素材取景 | [320 / 390px、固定2×](previews/mobile.png) |
| 运行资源 | [独立资源契约](../../../../frontend/public/art-v2/cocoa/manifest.json) · [资源说明](../../../../frontend/public/art-v2/cocoa/README.md) |
| 可编辑源 | [build.py](source/build.py) · [素材检查](source/validate.py) |
| 交接 | [评估](../../evaluations/warm-drink-03/art/EVALUATION.md) · [READY](../../evaluations/warm-drink-03/art/READY.json) |

共236张独立PNG/图集帧：62个动作关键帧各提供身体、手臂与合成姿势三层（186张），另有50张日夜道具帧。包含料理台前后层、锅、三档热盘、三帧旋钮、四帧侧向柔和蒸汽、三种配料、两种杯色×四种外观（基本杯/三种成品）及碰杯微光。

人物图里没有烘焙固定杯型；杯子按明确握持点叠加，配料/颜色由真实成果决定。接杯姿势保持空手，只有确认接受后才重新绑定同一杯对象。工作场景将人物身体放在台面后，手臂/勺子放到台面前；不拉伸人物以够到锅。

本包只提供料理台局部坐标与占地/工位建议，没有指定绝对摆放位置。图中人物与杯子是比例示意，不证明实际参与、物品归属、接杯或碰杯成功。

重绘与定向素材检查：

```bash
backend/.venv/bin/python docs/planning/designs/cocoa-03-art/source/build.py
backend/.venv/bin/python docs/planning/designs/cocoa-03-art/source/validate.py
```

源文件只读复用 `art-02/source/materials.py` 的整数绘制类与色板，并读已验收人物PNG。中文预览使用系统字体，不分发字体文件；运行资源没有嵌入中文或UI。按本轮要求只做素材检查，不生成校验和、不跑全量或应用构建、不操作浏览器。

READY写出后冻结，后续资源适配与版本更新由整合者接管。接入细节见 [INTEGRATION.md](INTEGRATION.md)。
