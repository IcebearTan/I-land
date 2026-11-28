---
name: iland-ui-style
description: >-
  Enforces the unified 16-bit Stardew Carved-Oak & Warm Parchment UI design system
  for I-land (`D:\OpenClaw\I-land`). Activate whenever creating, editing, or reviewing
  any React component, modal, form, HUD element, or CSS file in I-land frontend.
---

# I-land UI Design System & Pixel Style Guardrails

I-land 的所有 DOM 界面（信箱、记忆日历、灯语信号塔、漂流瓶、设置、登岛码头、HUD）必须严格统一在同一套 **16-bit 星露谷雕花橡木 + 暖羊皮纸** 视觉体系下，严禁混入现代圆角卡片、胶囊药丸、散装边框色或衬线/混排锯齿字体。

## 1. 唯一令牌源（Single Source of Truth）
所有颜色、字号与阴影只准引用 `frontend/src/styles/tokens.css` 与 `frontend/src/styles/pixel-ui.css`：
- **纸面层级**：主底板 `--px-cream` (`#f8e1b8`)、抬升卡片 `--px-cream-hi` (`#fff4da`)、凹陷输入框 `--px-cream-input` (`#fff8e8`)、深色分组槽 `--px-cream-deep` (`#eed3a1`)。
- **墨色与木框**：主文字 `--px-ink` (`#3b2117`)、辅助文字 `--px-ink-soft` (`#6e4529`)、标准卡片边框 `--px-border` (`#8a5a38`)、深色木框/输入边框 `--px-wood-dark` (`#68371d`)、分割线 `--px-divider` (`#cfa76e`)。
- **语义强调**：主操作松石绿 `--px-accent` (`#326c62`)、警示火漆红 `--px-danger` (`#a8374b`)。
- **阴影规范**：一律使用无模糊像素硬投影 `var(--ui-shadow-control)` (`0 2px 0 rgba(...)`) 或内凹阴影 `inset 2px 2px 0 #e2c593`，严禁使用现代大面积高斯模糊卡片阴影。

## 2. 双层字体红线（Two-Tier Typography）
1. **像素字体 `--px-font`（`ArkPixel`）仅限短 UI 骨架**：
   - 允许位置：`.px-ribbon` 卷轴标题、`.px-btn` / `.btn` 按钮文字、HUD 时钟与短状态栏、小节编号徽章、`.num` 等宽数字。
   - **严禁事项**：
     - 严禁在弹窗外层容器（如 `.modal-panel`、`.login-wrap`、`.dock-stage`）上整体挂载 `.px-font`！
     - 严禁设置 `-webkit-font-smoothing: none`（高分屏/移动端非整数缩放会导致中文笔画粗细撕裂）。
     - 严禁在同一行 `label` 里把 `--px-font` 主标题和 `--ui-font` 副提示混排导致基线参差不齐。
2. **系统无衬线字体 `--ui-font` 用于一切阅读与输入**：
   - 所有表单字段名（`label`）、副提示（`small`）、输入框/文本域（`.px-input`）、信件正文、日历描述、空状态说明一律使用 `--ui-font`。
   - 严禁引入 `Georgia`、`Times New Roman` 等西文衬线字体。

## 3. 零圆角与标准组件原语（Zero-Radius & Primitives）
- **全局零圆角**：全岛 DOM CSS 严禁出现任何非 `0` 的 `border-radius`（禁止 `4px`、`6px`、`50%`、`999px`）。色块、头像框、信号点、贴纸一律采用 `2px solid` 方框像素造型。
- **标准弹窗结构**：
  ```tsx
  <div className="modal-mask" onClick={close}>
    <div className="wood-panel modal-panel px-pop" role="dialog" aria-modal="true" aria-labelledby="xxx-title" onClick={e => e.stopPropagation()}>
      <div className="modal-head">
        <div className="px-ribbon" id="xxx-title">
          <PixelIcon name="spark" size={18} />
          <span>面板标题</span>
        </div>
        <button type="button" className="px-slot" onClick={close} aria-label="关闭">
          <PixelIcon name="close" size={18} />
        </button>
      </div>
      {/* 内容区 */}
    </div>
  </div>
  ```
- **标准控件复用**：
  - 主/次按钮：`.px-btn`、`.px-btn.px-btn-accent`、小号 `.px-btn.px-btn-sm`。
  - 轻量操作芯片（替代裸文字按钮）：`.text-button`（自带 `2px` 暖木边框与按压反馈）。
  - 输入框/下拉框/多行文本：统一复用 `.px-input`（移动端 `<=680px` 自动 `16px` 防 iOS 缩放）。

## 4. 模块化与提交前必跑自检（Validation）
- 单个新建/重写样式或组件文件控制在 **280 行以内**（复杂模块按 `*-base.css` + `*-editors.css` 拆分）。
- 每次修改 `I-land/frontend/src` 后，必须运行以下静态合规扫描并确认输出为空：
  ```powershell
  Get-ChildItem -Path D:\OpenClaw\I-land\frontend\src -Recurse -Include *.css,*.tsx | Select-String -Pattern 'border-radius\s*:\s*(?!0(?:\b|px))|Georgia|Times New Roman|\bserif\b|font-smoothing\s*:\s*none'
  ```
