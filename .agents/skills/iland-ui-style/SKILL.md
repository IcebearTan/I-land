---
name: iland-ui-style
description: >-
  Enforces the unified 16-bit Stardew Carved-Oak, Warm Parchment & Pure ArkPixel UI
  design system for I-land (`D:\OpenClaw\I-land`). Activate whenever creating, editing,
  or reviewing any React component, modal, form, HUD element, Phaser label, or CSS file in I-land.
---

# I-land UI Design System & Pure Pixel Typography Guardrails

I-land 的所有界面（DOM 弹窗面板、HUD、表单以及 Phaser 画布路牌/气泡）必须 **100% 统一在同一套 16-bit 星露谷雕花橡木 + 暖羊皮纸 + 纯正 `ArkPixel` 像素字体** 体系下，严禁混入微软雅黑/苹方等现代网页字体、严禁伪粗体涂抹、严禁圆角与现代白色滚动条。

## 1. 全岛纯像素字体与零伪粗体红线（Pure Pixel Font & Zero Faux-Bold）
1. **100% 统一 `ArkPixel` 字体栈**：
   - `--px-font`、`--ui-font`、`--ui-font-number` 与 Phaser `PIXEL_FONT_FAMILY` 全部统一指向 `'ArkPixel'`（系统无衬线仅作生僻字兜底），**严禁把正文、引导语、空状态、按钮或路牌单独设回 `system-ui` / `Microsoft YaHei` 网页字体**。
2. **全局严禁伪粗体（Zero Faux-Bold）**：
   - `ArkPixel` 为单字重 `400` 点阵字体。全局必须保持 `font-weight: 400; font-synthesis: none;`。
   - **严禁在任何 CSS/TSX 中写 `font-weight: 500 / 600 / 700 / bold`**（包括 `h1`–`h4`、`strong`、`b`），否则浏览器会横向涂抹像素笔画造成黏连发糊。信息层级一律靠**字号阶梯**与**墨色深浅**（主色 `--px-ink` `#3b2117` vs 辅色 `--px-ink-soft` `#6e4529`）区分。
3. **点阵友好字号阶梯（Snap to Pixel Scale）**：
   - `ArkPixel` 原生基于 `12px` 网格。只准使用 **`12px`、`14px`、`16px`、`24px`、`48px`** 五档字号（其中 `16px`、`24px`、`48px` 在主流 150%/200% 缩放屏上均为精确整数物理像素倍）。
   - **严禁使用 `11px`、`13px`、`15px`、`17px`、`18px`、`20px` 等非对齐字号**，避免汉字中间某一横出现粗细不均。
   - 深色松石绿按钮文字阴影固定使用轻薄 `0 1px 0 #1c383e`（严禁 `0 2px 0` 厚阴影糊底）。

## 2. 零圆角、橡木滚动条与标准组件原语
- **全局零圆角**：全岛 DOM CSS 严禁任何非 `0` 的 `border-radius`（禁止 `4px`、`6px`、`50%`、`999px`）。
- **像素橡木滚动条**：所有可滚动面板统一继承 `global.css` 的 `#eed3a1` 凹槽 + `#8a5a38` 橡木滑块，严禁露出系统白色滚动条。
- **标准弹窗与控件**：
  - 弹窗：`.wood-panel.modal-panel.px-pop` + `.modal-head`（左 `.px-ribbon` + 右 `.px-slot` 关闭槽）。
  - 按钮：`.px-btn` / `.px-btn-accent` / `.px-btn-sm` / `.text-button`。
  - 输入框：`.px-input`。

## 3. 提交前必跑静态合规自检（Validation）
每次修改 `I-land/frontend/src` 后，必须运行以下扫描并确认违规项为空：
```powershell
Get-ChildItem -Path D:\OpenClaw\I-land\frontend\src -Recurse -Include *.css,*.tsx,*.ts | Select-String -Pattern 'border-radius\s*:\s*(?!0(?:\b|px))|font-weight\s*:\s*[56789]00|font-weight\s*:\s*bold|system-ui|Georgia|\bserif\b|font-size\s*:\s*(11|13|15|17|18|20)px'
```
