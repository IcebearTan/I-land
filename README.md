# I-land · 我们的岛 🐻🏝️

Icebear 的「去你的岛」——星露谷式 2.5D 像素小岛网页小游戏，
属于两个人的爱情空间：信箱、记忆日历、漂流瓶留言，以后还有农场。

设计与架构规范见 [DESIGN.md](./DESIGN.md)（v2 游戏化架构，色板/里程碑/风险都在里面）。

## 技术栈

- **游戏层**：Phaser 3 + TypeScript（tile 世界、角色、昼夜、交互）
- **UI 层**：React 19 + Vite（登录、HUD、信箱/日历/留言面板）
- **后端**：FastAPI + SQLModel + SQLite（WAL），Pillow 生成缩略图
- **通信**：React ↔ Phaser 走事件总线（mitt）；React ↔ 后端走同源 REST

架构铁律：**Phaser 不知道 React 存在，React 不碰 canvas，持久化一律走 API。**

## 本地开发

后端（终端 1）：

```bash
cd backend
uv venv --python 3.11 .venv          # 首次
uv pip install -r requirements.txt --python .venv/bin/python
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

前端（终端 2，开发模式带 /api 代理到 8000）：

```bash
cd frontend
npm install        # 首次
npm run dev        # http://localhost:5173
```

生产模式（单服务，FastAPI 直接托管前端构建产物）：

```bash
cd frontend && npm run build
cd ../backend && .venv/bin/python -m uvicorn app.main:app --port 8000
# 打开 http://localhost:8000
```

## 默认账号

种子用户 `bear` / `her`，初始密码 `123456`（环境变量 `ILAND_SEED_USERS` 可改，
格式 `name:password:display,...`）。**上线给她用之前务必改密码。**

## 测试

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```

## Docker（可选，一步起完整服务）

```bash
docker compose up --build -d   # http://localhost:8000
```

数据持久化在 named volume `iland-data`（SQLite + uploads）。

## 目录结构

```
I-land/
├── DESIGN.md            设计与架构规范（v2）
├── AGENTS.md            AI 协作约定
├── backend/             FastAPI + SQLite
│   ├── app/
│   │   ├── main.py      入口（lifespan 建表/种子、静态托管）
│   │   ├── models.py    全部数据表
│   │   └── routers/     auth / letters / world / misc
│   └── tests/           pytest（TestClient 全链路）
└── frontend/            React + Phaser
    └── src/
        ├── game/        Phaser（scenes/ + EventBus 事件总线）
        ├── components/  React（GameShell / Hud / Login / panels）
        ├── api/         fetch 封装
        └── styles/      木牌 UI 样式
```

## 当前进度（M0 ✅）

- [x] M0 地基：登录（cookie session）、岛屿占位场景、昼夜 tint、
      角色移动（WASD/方向键 + 点地行走）、交互系统、信箱面板、事件总线全链路
- [ ] M1 走岛：Tiled 地图、正式美术资产、移动端摇杆
- [ ] M2 信箱：拆信仪式、扫描件上传、IcebearMailbox 数据迁移、她可回信
- [ ] M3 灯塔日历：纪念日 CRUD、记忆卡（照片/天气/描述）
- [ ] M4 漂流瓶：留言系统
- [ ] M5 农场：种花送她
