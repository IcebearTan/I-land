# ART-01 · 窗边有海，炉边有你

2026-11-06。壁炉—沙发—窗户精修样板，保留电视。全部结果限于本目录；没有替换游戏纹理、角色数据或 HOME_LAYOUT。

**这是视觉样板。画中的两人仅作比例示意，未接入真实双人室内。** 本包完成静态美术与交接准备，不代表 ART-02、ART-03 或 HOME-02 完成。

先看 [白天精修图](previews/day-presentation.png)、[夜晚精修图](previews/night-presentation.png)，再看 [人物与家具比例](previews/proportions.png)。昼夜共用 320×240 构图与 12 个图层，只改变材质受光和窗外天空。

| 交付 | 入口 |
| --- | --- |
| 同构图日 / 夜 | [白天原始像素](previews/day-1x.png) · [夜晚原始像素](previews/night-1x.png) · [白天 4×](previews/day-4x.png) · [夜晚 4×](previews/night-4x.png) |
| 人物站坐、家具比例 | [比例表](previews/proportions.png)，八张候选姿势 PNG 在 `assets/` |
| 五件主要资产 | [资产预览](previews/assets-overview.png)，透明原图、沙发前后层、独立火焰在 `assets/` |
| 简短风格表 | [图示](previews/style-sheet.png) · [文字与色值](STYLE.md) |
| 小屏取景 | [320 / 390px 静态图](previews/mobile-framing.png)；没有使用应用浏览器 |
| 可继续编辑的源文件 | [整数像素绘制源](source/render.py) · [白天分层 SVG](source/day-layers.svg) · [夜晚分层 SVG](source/night-layers.svg) |
| 分层与接入 | [接入清单](INTEGRATION.md) · [样板坐标提案](source/integration-proposal.json) · [草稿图集](assets/atlas-draft.png) / [JSON](assets/atlas-draft.json) |
| 检查与限制 | [本包评估](EVALUATION.md) · [静态检查报告](source/validation-report.json) |
| 概念参考与来源 | [ImageGen 材质参考](reference/material-direction.png) · [完整提示词与取舍](reference/PROMPT.md) |

源文件沿用项目 `PixelArt` 的矩形、扫描线多边形、整数椭圆绘制词汇，离线导出 PNG。SVG 以可编辑图层组和无损像素横条表达，Python 源负责语义级改形；没有新增构建依赖。参考概念图没有被缩小、滤镜化或直接塞进图集。

在仓库根目录重绘及核验：

```bash
backend/.venv/bin/python docs/planning/designs/art-01/source/render.py
backend/.venv/bin/python docs/planning/designs/art-01/source/validate.py
```

使用后端现有 Pillow。展示板的普通中文字体取本机 `/System/Library/Fonts/STHeiti Light.ttc`，不随包分发；换机器时在 `render.py` 的 `FONT` 指定可用中文字体即可。像素原图不依赖字体。

下一步入口是 ART-02：确认候选角色约 32px 的全场景尺度。随后 ART-03 逐件接入图集/Tiled，验证相机、遮挡、可达性与碰撞；不要把本包的样板坐标直接覆盖现有功能坐标。
