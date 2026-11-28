# AGENTS.md · I-land AI 协作约定

每个新会话开工前先读 `DESIGN.md`（v2 游戏化架构）与本文件。

## 2026-11-07 用户最新验收约定

后续开发不做交付文件的 SHA-256/哈希生成或验证，不做全量回归。只运行本次改动及直接依赖涉及的明确测试文件、必要的类型检查/构建和关键使用流程；已通过且不受新改动影响的检查不重复。此约定覆盖旧规划、交接 READY 和常用命令中要求全量测试的文字。
现有产品的密码/备份等安全保护不因本约定删除。额度不足时停止并保留进度；绝不使用重置卡、购买额度或更换账号规避限制。夜间自动推进授权与停止条件见 `docs/planning/AUTONOMOUS_RUN.md`。

## 项目一句话

两人共享的星露谷式像素小岛网页游戏（爱情空间）：信箱 / 记忆日历 / 漂流瓶留言 / 农场。

## 架构铁律（违反即返工）

1. **三层分界**：Phaser（游戏 canvas）↔ React（DOM UI）只通过 `frontend/src/game/EventBus.ts` 的 mitt 事件总线通信；React 不碰 canvas 内部，Phaser 不 import 任何 React。
2. **持久化一律走 API**：游戏/UI 状态要落盘就调后端 REST，不写 localStorage。
3. **后端**：FastAPI + SQLModel + SQLite（WAL）。新表加在 `backend/app/models.py`，新路由加在 `backend/app/routers/`，`main.py` 挂载。
4. **美术**：16px tile、像素帧动画、调色板以 DESIGN.md 锁定值为准；白嫖资产必须重着色入库。占位美术用 `makeTexture()` 字符画生成，正式资产走 Tiled + 图集（M1 起）。
5. **UI 视觉与像素样式铁律（必读 `.agents/skills/iland-ui-style/SKILL.md`）**：
   - **唯一令牌源**：全岛 DOM 面板一律复用 `frontend/src/styles/tokens.css` 与 `pixel-ui.css` 的暖羊皮纸与雕花橡木变量（`--px-ink`、`--px-cream*`、`--px-border`、`--px-wood-dark`、`--px-accent`），严禁私自发明散装色板、现代圆角卡片或大模糊阴影。
   - **零圆角纪律**：全岛任何 CSS/TSX **严禁非零 `border-radius`**（包括 `4px`、`6px`、`50%`、`999px`）；弹窗统一使用 `.wood-panel` + `.px-ribbon` 卷轴标题 + `.px-slot` 关闭槽，表单控件统一用 `.px-input`，次级芯片按钮用 `.text-button`。
   - **纯像素字体与零伪粗体红线**：全岛 DOM 与 Phaser 画布路牌/气泡 **100% 统一使用 `ArkPixel` 像素字体**（严禁混入 `system-ui`/`Microsoft YaHei` 网页字体或 `Georgia`/`serif`）；全局锁定 `font-weight: 400; font-synthesis: none;`（严禁 `font-weight: 600/bold` 伪粗体涂抹）；字号只准取 `12px / 14px / 16px / 24px / 48px`（严禁 `13px / 15px / 17px / 18px` 非对齐字号）。所有动效尊重 `prefers-reduced-motion`。
6. **无惩罚原则**：任何玩法（作物等）不许因玩家不登录而惩罚。
7. **新功能同步接入 Donut（OpenClaw Agent）三步契约**：今后小岛每新增一个持久化玩法（如漂流瓶、农场、送花、珍藏架等），必须同步完成以下三步才算验收完成（详见 `docs/planning/designs/2026-11-28-donut-agent-integration.md`）：
   - **后端 REST 优先**：新路由统一复用 `Depends(get_current_user)`，天然支持浏览器 Cookie 与本机回环分账号 Agent Token；若涉及账号安全/真人专属动作则显式使用 `Depends(require_human_session)`。
   - **补入聚合摘要**：将核心计数或最新状态接入 `GET /api/agent/digest`（`backend/app/routers/agent.py`）。
   - **注册 CLI 与 Skill**：在 `openclaw-skills/iland-companion/tools/iland_cli.py` 增加对应子命令，并在 `openclaw-skills/iland-companion/SKILL.md` 补充调用示例与仪式感/权限边界。

## 常用命令

```bash
# 后端：只测试本次改动涉及的文件（以下仅示例，按实际改动选择）
cd backend && .venv/bin/python -m pytest tests/test_home_rooms.py -q

# 前端类型检查 + 构建（改前端必跑）
cd frontend && npm run build

# 本地起服（生产模式，FastAPI 托管前端）
cd backend && .venv/bin/python -m uvicorn app.main:app --reload --port 8000

# 前端开发模式（另开终端，代理 /api → 8000）
cd frontend && npm run dev
```

## 环境事实

- 后端 venv：`backend/.venv`（Python 3.11，uv 管理）。依赖装完别动 requirements 之外的包。
- 固定身份键 bear/her；登录用当前显示名字（默认小熊/她），初始密码 123456（`ILAND_SEED_USERS` 覆盖）。改名同步登录账号，不改身份键。
- SQLite 在 `backend/iland.db`，上传在 `backend/uploads/`，都已 gitignore（是真实记忆，勿删勿提交）。
- 昼夜 tint、DAY_TICK 逻辑在 `IslandScene.updateDayNight()`；交互物在 `placeInteractables()`。
- 里程碑状态见 README「当前进度」小节，做完一项勾一项。
- 开发规划与评估统一在 `docs/planning/`；开新功能前读其 README、CURRENT_STATE 与对应阶段计划，历史归档不作为当前待办。

## 代码风格

- 前端 TS strict；组件用函数式；事件名全大写下划线（`OPEN_MAILBOX`）。
- 后端中文注释可以写，风格跟随现有文件；路由函数顺序：list → get → create → delete。
- 提交信息中文，格式 `M1: xxx` / `fix: xxx`。
