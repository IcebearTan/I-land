# ART-02 · 人物、家具与画面尺度统一

交付日期：2026-11-07（本轮任务于 2026-11-06 发起）。版本 `art-v2.1.0`。

选定 **24px 可见站姿、32×32 统一帧、16px tile、人物不单独缩放**。沙发重新绘制为 80×48、两块 26px 坐垫，人物肩/臂轮廓 14–17px；配套门洞净尺寸 22×32，杯身 4×5。这是本轮资产标准，运行时接入与联合验收由 HOME-02 完成。

首先看 [同视口 24/32px 对照](previews/scale-comparison.png) 与 [门、人物、坐垫、杯子比例](previews/proportions.png)。两方案均在 390×568 CSS px、2× 相机的相同静态取景中对照，没有独立放大人物。24px 对应家具与原主岛建筑更接近；约 32px 对应的门洞/家具更大，主岛需要更广的整体适配。ART-01 的约 31px 人物与 128×65 沙发继续作为历史候选保存，没有直接升格为标准。

| 内容 | 可看结果 / 接入入口 |
| --- | --- |
| 白天 / 夜晚 | [白天](previews/day-presentation.png) · [夜晚](previews/night-presentation.png) · `previews/*-1x.png` |
| 完整人物 | [姿态表](previews/actor-poses.png) · [全部 56 帧](previews/all-frames-4x.png) |
| 跨场景一致 | [海边站 / 坐 / 依靠](previews/seaside-poses.png)，与主岛/客厅同一帧资源 |
| 小屏比例 | [320 / 390px 取景](previews/mobile.png)，固定 2× 像素，14/16px 文字与 44px 操作留位 |
| 可运行资源 | [资源总契约](../../../../frontend/public/art-v2/manifest.json) · [资源说明](../../../../frontend/public/art-v2/README.md) |
| 可编辑源 | [构图与资产绘制](source/build.py) · [整数像素基础与继承材质](source/materials.py) |
| 验证 / 交接 | [评估](../../evaluations/visual-round-02/art/EVALUATION.md) · [READY](../../evaluations/visual-round-02/art/READY.json) |

人物包含每位 4 方向待机、4×4 步态、4 方向坐姿，以及向左/向右依靠各 2 帧，共 56 帧。侧面镜像绕固定脚锚进行。站、坐、走和依靠在同向复用完全相同的头部，依靠重画躯干与手臂，不旋转或拉伸整个人物。白熊保留长身体、圆耳、无围巾；岛民保留黑长发、青绿罗小黑短袖、黑裤，背面没有猫脸或猫耳。

客厅有 42 张日夜分件，电视机壳与 27×20 屏幕、窗框与 39×49 窗外、四帧 28×28 火焰、沙发前后层均分开。运行目录没有合成双人人物层。展示图内的两人仅为比例示意，不构成联机证据。

重绘和静态验证（仓库根目录）：

```bash
backend/.venv/bin/python docs/planning/designs/art-02/source/build.py
backend/.venv/bin/python docs/planning/designs/art-02/source/validate.py
```

以上使用现有 Pillow，不改共享依赖。中文展示板使用本机 `/System/Library/Fonts/STHeiti Light.ttc`；字体不分发，换机器可调整 `build.py` 的 `FONT`。原始游戏资源不依赖字体。`materials.py` 从 ART-01 已提交源码复制相关绘制函数，旧目录只读；没有裁剪或降采样 ImageGen 概念图。

**READY 写出即冻结本包。** 按用户 2026-11-07 的最新要求，READY 仅记录版本、路径、尺寸/接口、检查证据和限制，不生成交付校验和。后续再修改/重绘，由接手的整合者管理版本，不混用旧 READY。碰撞、起身点、深度规则、相机及真实成员展示仍须在应用中验证；交接详见 [INTEGRATION.md](INTEGRATION.md)。
