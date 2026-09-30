# I-land · 我们的岛 🐻🏝️

Icebear 的「去你的岛」——星露谷式 2.5D 像素小岛网页小游戏，
属于两个人的爱情空间：信箱、记忆日历、漂流瓶留言，以后还有农场。

设计与架构规范见 [DESIGN.md](./DESIGN.md)（v2 游戏化架构，色板/里程碑/风险都在里面）。
开发规划、当前状态、任务交接与历史评估统一见 [开发规划中心](./docs/planning/README.md)。

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
格式 `name:password:display,...`）。**上线给她用之前务必改密码**——已有账号
在岛上「设置 → 登录暗号」改（HUD 右上角），首次部署直接用 `ILAND_SEED_USERS` 设置强密码。
部署、HTTPS Cookie、备份与恢复见 [docs/OPERATIONS.md](./docs/OPERATIONS.md)。

## 测试

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
cd ../frontend && npm run test:calendar && npm run build
```

后端覆盖：登录/改密、私人内容访问控制、图片上传与派生图、记忆 CRUD 与
版本冲突、软删除恢复、备份恢复演练、旧库迁移。

## Docker（可选，一步起完整服务）

```bash
docker compose up --build -d   # http://localhost:8000
```

数据持久化在 named volume `iland-data`（SQLite + uploads）。反向代理 HTTPS 时
给服务加 `ILAND_COOKIE_SECURE=1`。

## 目录结构

```
I-land/
├── DESIGN.md            设计与架构规范（v2）
├── AGENTS.md            AI 协作约定
├── docs/planning/       开发规划中心（状态/路线/任务/验收/历史）
├── docs/OPERATIONS.md   运维手册（部署/改密/备份恢复）
├── backend/             FastAPI + SQLite
│   ├── app/
│   │   ├── main.py      入口（lifespan 建表/种子、前端托管）
│   │   ├── models.py    全部数据表
│   │   ├── attachments.py  图片处理（三档派生、EXIF 去敏）
│   │   ├── backup.py    备份/恢复（python -m app.backup）
│   │   └── routers/     auth / letters / anniversaries / memories / uploads / settings / world / misc
│   └── tests/           pytest（TestClient 全链路）
└── frontend/            React + Phaser
    └── src/
        ├── game/        Phaser（scenes/ + EventBus 事件总线）
        ├── calendar/    日历与记忆卡（节日 + 每日记忆）
        ├── components/  React（GameShell / Hud / Login / Settings / panels）
        ├── api/         fetch / multipart 上传封装
        └── styles/      木牌 UI 样式
```

## 当前进度（M0 完成 · M1/M2/M3 推进中）

当前功能与验证边界见 [当前状态](./docs/planning/CURRENT_STATE.md)，
下一阶段执行 [M2 写信回信计划](./docs/planning/NEXT_STAGE_M2.md)。
用户已确认服务器部署完成；备份恢复与真机等专项验收按实际证据单独记录。

- [x] 岛内视觉重绘：原创像素小屋/灯塔/树木、花圃与海岸布局、前后遮挡、行走碰撞及昼夜暖灯。

- [x] M0 地基：登录（cookie session）、岛屿占位场景、昼夜 tint、
      角色移动（WASD/方向键 + 点地行走）、交互系统、信箱面板、事件总线全链路
- [x] M1 角色区分：男生围巾小熊、女生长发裙装，按账号恢复身份，共用四方向两帧步态与像素头像。
- [x] M1 移动端：虚拟摇杆、靠近互动按钮、点击落点提示、面板打开时暂停操控。
- [x] 异步足迹：显示对方最近登岛时间（读取 presence API，不代表实时在线）。
- [ ] M1 正式资产管线：Tiled 地图、正式美术图集
- [x] M2 阅读前端：信件卡片 → 火漆拆信 → 图片信纸翻页，加载/失败/空状态、键盘焦点和手机布局。
- [ ] M2 写信与数据：扫描件上传、IcebearMailbox 数据迁移、她可回信
- [x] M3 自定义节日：共享 CRUD、月历、每年/每月/单次重复、8 配色 × 18 图标 × 4 倒数卡样式、实时预览及岛上置顶倒数。
- [x] M3 每日记忆卡：照片上传（WebP 三档、EXIF 去敏转正）、描述/心情/天气/地点、
      版本冲突保护、软删除 30 天恢复、月历照片缩略图与日视图大图、最近删除。
- [x] 可靠性地基：私人内容统一登录校验（照片与信纸不再公开可访问）、已有账号改密、
      SQLite 一致性备份与恢复演练（见 docs/OPERATIONS.md）。
- [x] 小岛设置：共享修改两位岛民名字，登录页、足迹、信件和记忆卡署名同步更新；设置内改密。
- [ ] M4 漂流瓶：留言系统
- [ ] M5 农场：种花送她
