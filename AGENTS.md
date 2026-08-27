# AGENTS.md · I-land AI 协作约定

每个新会话开工前先读 `DESIGN.md`（v2 游戏化架构）与本文件。

## 项目一句话

两人共享的星露谷式像素小岛网页游戏（爱情空间）：信箱 / 记忆日历 / 漂流瓶留言 / 农场。

## 架构铁律（违反即返工）

1. **三层分界**：Phaser（游戏 canvas）↔ React（DOM UI）只通过 `frontend/src/game/EventBus.ts` 的 mitt 事件总线通信；React 不碰 canvas 内部，Phaser 不 import 任何 React。
2. **持久化一律走 API**：游戏/UI 状态要落盘就调后端 REST，不写 localStorage。
3. **后端**：FastAPI + SQLModel + SQLite（WAL）。新表加在 `backend/app/models.py`，新路由加在 `backend/app/routers/`，`main.py` 挂载。
4. **美术**：16px tile、像素帧动画、调色板以 DESIGN.md 锁定值为准；白嫖资产必须重着色入库。占位美术用 `makeTexture()` 字符画生成，正式资产走 Tiled + 图集（M1 起）。
5. **中文正文不硬凹像素字体**；对比度红线：深底浅字 #f5eee2、浅底深字 #4a3b55、闪烁透明度 ≥ 0.7、所有动效尊重 `prefers-reduced-motion`。
6. **无惩罚原则**：任何玩法（作物等）不许因玩家不登录而惩罚。

## 常用命令

```bash
# 后端测试（改后端必跑）
cd backend && .venv/bin/python -m pytest tests/ -q

# 前端类型检查 + 构建（改前端必跑）
cd frontend && npm run build

# 本地起服（生产模式，FastAPI 托管前端）
cd backend && .venv/bin/python -m uvicorn app.main:app --reload --port 8000

# 前端开发模式（另开终端，代理 /api → 8000）
cd frontend && npm run dev
```

## 环境事实

- 后端 venv：`backend/.venv`（Python 3.11，uv 管理）。依赖装完别动 requirements 之外的包。
- 种子账号 bear/her 密码 123456（`ILAND_SEED_USERS` 覆盖）。
- SQLite 在 `backend/iland.db`，上传在 `backend/uploads/`，都已 gitignore（是真实记忆，勿删勿提交）。
- 昼夜 tint、DAY_TICK 逻辑在 `IslandScene.updateDayNight()`；交互物在 `placeInteractables()`。
- 里程碑状态见 README「当前进度」小节，做完一项勾一项。

## 代码风格

- 前端 TS strict；组件用函数式；事件名全大写下划线（`OPEN_MAILBOX`）。
- 后端中文注释可以写，风格跟随现有文件；路由函数顺序：list → get → create → delete。
- 提交信息中文，格式 `M1: xxx` / `fix: xxx`。
