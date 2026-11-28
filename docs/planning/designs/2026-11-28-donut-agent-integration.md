# I-land 全功能接入 Donut（OpenClaw Agent）统一架构方案

> 日期：2026-11-28 | 状态：方案已定稿，待分阶段实施
> 目标：让小熊与 yearning 各自的 Donut 助手能通过统一、安全、严格身份隔离的接口，查看并操作 I-land 全部适配功能，并为未来新功能（漂流瓶、农场、合作暖饮等）建立标准化扩展契约。

---

## 1. 核心架构原则

1. **绝不直写 `iland.db`**：I-land 是双人共享实时系统，含发件人锁定、乐观锁（`409`）、图片 WebP 三档转码与 EXIF 去敏、附件引用标记（`linked`）、灯塔联动足迹刷新及内存实时房间态。Donut **一律通过本机回环 HTTP API（`http://127.0.0.1:8000/api/...`）** 调用 FastAPI，100% 复用现有校验与业务逻辑。
2. **密码学级双人身份隔离（绝不串号）**：放弃“共享密钥 + 客户端传 `X-Iland-Actor` 头”的弱隔离，改用**分账号独立 Agent Token**（`ILAND_AGENT_TOKENS=bear:<tok_bear>,her:<tok_her>`）。服务端直接由 Bearer Token 反查唯一 `User`，客户端无权指定或冒充另一半身份。
3. **本机回环强限制**：Agent Token 认证仅放行 `client.host in {"127.0.0.1", "::1"}` 的回环请求，公网无法使用 Agent Token 访问任何接口。
4. **同仓同版本原子同步**：技能与 CLI 存放在 `I-land/openclaw-skills/iland-companion/`，由 `I-land/scripts/publish_cloud.ps1` 自动同步至 `/home/donut/.openclaw/workspace`（小熊）与 `/home/donut/.openclaw/workspace-her`（yearning），与后端 API 保持同版本演进。

```text
Donut Agent (workspace=bear | workspace-her)
   │  加载技能：skills/iland-companion/SKILL.md
   ▼
统一领域 CLI：tools/iland_cli.py（零外部依赖，纯 Python 标准库）
   │  自动读取本工作区只读凭证 .iland-agent.json（仅含本账号独立 Bearer Token）
   │  请求本机回环 http://127.0.0.1:8000/api/...
   ▼
I-land FastAPI 后端（127.0.0.1:8000）
   ├─ 统一鉴权层 deps.py（Cookie 登录 ∪ 本机回环分账号 Bearer Token）
   ├─ 100% 复用既有业务路由（letters / anniversaries / memories / lighthouse / uploads / misc）
   └─ 新增只读聚合路由 routers/agent.py（GET /api/agent/digest）
```

---

## 2. 全功能接口映射与权限分级

| 权限级别 | 功能模块 | 对应 API | CLI 子命令 | 行为与安全约束 |
| --- | --- | --- | --- | --- |
| **L1 自由读** | 全岛速览（聚合） | `GET /api/agent/digest` | `digest` | 单次请求返回建岛天数、未读信数、当前灯语、近 14 天节日、对方足迹、海边/客厅在场状态 |
| **L1 自由读** | 小屋信箱（列表/查信） | `GET /api/letters`、`GET /api/letters/{id}` | `letters list` / `letters get <id>` | 对方未读信默认仅返回标题与信封寄语，**禁止静默拆封**（不调 `/read`），保护拆火漆仪式感 |
| **L1 自由读** | 记忆日历（查） | `GET /api/anniversaries`、`GET /api/memories`、`GET /api/memories/deleted` | `anniversaries list\|upcoming`、`memories list\|trash` | 默认查询当月或指定起止日期（≤366 天） |
| **L1 自由读** | 灯语与房间态 | `GET /api/lighthouse`、`GET /api/agent/digest` | `lighthouse get`、`rooms status` | 只读查询海边/客厅当前谁在、姿势、海边倍率、电视开关与频道 |
| **L2 明确意图写** | 灯语信号塔 | `PUT /api/lighthouse` | `lighthouse set --preset <id> --message <text>` | 5 档预设色（`amber/coral/lavender/sea/ivory`）+ 48 字灯语，自动同步足迹 |
| **L2 明确意图写** | 纪念日管理 | `POST/PUT/DELETE /api/anniversaries` | `anniversaries add\|update\|delete` | 支持 `repeat`（`yearly/monthly/once`）、`pinned`、`icon`、`color`、`style` |
| **L2 明确意图写** | 每日记忆卡 | `POST/PUT/DELETE /api/memories`、`POST /{id}/restore` | `memories add\|update\|delete\|restore` | 自动附带幂等 `client_id`；编辑先拉当前 `version` 防 `409`；支持 `--image <path>` 自动先走 `/api/uploads` 转 WebP 再挂附件 |
| **L2 确认后写** | 小屋信箱（投信） | `POST /api/uploads` + `POST /api/letters` | `letters send --title ... --body ... [--image ...]` | 发件人由 Token 锁死；**Skill 强制要求投信前先展示草稿让用户确认再投递**；删除仅限本人信件且需确认 |
| **L3 明确禁止** | 拆封对方未读信 | `POST /api/letters/{id}/read` | 不提供给默认流程 | 仅用户明确说“帮我拆开/标为已读”才允许显式调用 `letters mark-read <id>` |
| **L3 明确禁止** | 账号安全与实时占座 | `/api/auth/password`、`PUT /api/settings/names`、`/api/rooms/*/join`、`PUT /api/world` | **不暴露** | 禁止 Agent 改密、改登录名、替真人占海边/客厅座位、伪造在线心跳或裸覆盖 `WorldState` |

---

## 3. 后端设计规格

### 3.1 配置与鉴权（`backend/app/config.py` + `backend/app/deps.py`）
- 新增环境变量：`ILAND_AGENT_TOKENS`（格式 `bear:<secret1>,her:<secret2>`，未配置时自动关闭 Agent 认证）。
- 新增解析辅助函数 `parse_agent_tokens() -> dict[str, str]`（映射到 `{token: account_name}`，校验时使用 `hmac.compare_digest` 防时序侧信道）。
- 升级 `get_current_user(request: Request, iland_session: Optional[str] = Cookie(default=None), authorization: Optional[str] = Header(default=None), db: Session = Depends(get_db)) -> User`：
  1. 若存在 `iland_session` Cookie，走原有浏览器会话校验；
  2. 否则若存在 `Authorization: Bearer <token>`：
     - 校验 `request.client.host in {"127.0.0.1", "::1"}`（测试客户端 `testclient` 在单元测试下通过显式开关或 ASGI loopback 兼容）；
     - 在 `AGENT_TOKENS` 中常时间比对，命中即查询 `User.name == account` 并返回；
     - 额外约束：**禁止 Agent Token 调用 `POST /api/auth/password`、`POST /api/auth/logout`、`PUT /api/settings/names`、`PUT /api/world`**（通过 `require_human_session` 依赖显式拦截并返回 `403`）。

### 3.2 新增只读聚合路由（`backend/app/routers/agent.py`）
- 挂载路径：`GET /api/agent/digest`（依赖 `get_current_user`，支持浏览器与 Agent 双方调用）。
- 在 `backend/app/room_runtime.py` 增加轻量无副作用只读方法 `RoomRuntime.read_summary(db)`（加锁读取当前在线成员、姿势/座位及海边时钟或客厅电视状态，不要求会话 Cookie 或租约）。
- `GET /api/agent/digest` 响应结构：
```json
{
  "actor": {"account": "bear", "display": "小熊"},
  "companion": {"account": "her", "display": "yearning"},
  "island": {"site_title": "I-land", "start_date": "2024-01-01", "days_together": 1062},
  "mailbox": {"total": 12, "unread_count": 1, "latest_unread": {"id": 12, "date": "2026-11-28", "title": "...", "excerpt": "...", "author": "her"}},
  "lighthouse": {"preset": "amber", "label": "暖金 · 想你了", "message": "...", "updated_by": "her", "updated_at": "..."},
  "upcoming_anniversaries": [{"id": 3, "name": "周年纪念", "date": "2026-12-05", "days_left": 7, "repeat": "yearly", "pinned": true}],
  "recent_memories_count_7d": 2,
  "presence": {"last_seen": "...", "action_note": "..."},
  "rooms": {
    "seaside": {"online_count": 0, "members": [], "clock_rate": 1, "following_real": true},
    "interior": {"online_count": 1, "members": [{"account": "her", "display": "yearning", "seat": 0}], "tv_powered": true, "tv_channel": 1}
  }
}
```

---

## 4. 统一 CLI 与 OpenClaw Skill 规格

### 4.1 目录归属
```text
D:\OpenClaw\I-land\openclaw-skills\iland-companion\
├── SKILL.md            # Donut 技能触发词、命令手册与仪式感/安全守则
└── tools\
    └── iland_cli.py    # 纯标准库 CLI（<= 260 行，子模块拆分保持清爽）
```
> 若 `iland_cli.py` 接近 260 行，按 `safe-resumable-dev` 拆为入口 `iland_cli.py` + 辅助模块 `_iland_http.py`（HTTP / multipart 上传 / 凭证发现），发布脚本同步全部 `.py` 文件。

### 4.2 凭证发现与防越权
- 每个 Donut 工作区在云端初始化时由部署脚本写入各自独立的只读凭证文件：
  - `/home/donut/.openclaw/workspace/.iland-agent.json` → `{"base_url":"http://127.0.0.1:8000","token":"<tok_bear>"}`
  - `/home/donut/.openclaw/workspace-her/.iland-agent.json` → `{"base_url":"http://127.0.0.1:8000","token":"<tok_her>"}`
- 权限 `0600 donut:donut`，`iland_cli.py` 按 `Path(__file__).resolve().parent.parent / ".iland-agent.json"` 自动定位，**不接受 `--actor` 覆盖参数**。

### 4.3 统一输出与子命令面
所有命令输出单行紧凑 JSON（支持 `--pretty`）：成功 `{"ok": true, ...}`，失败 `{"ok": false, "status": 4xx, "error": "..."}` 且退出码非 0。
- `digest`：查看全岛速览
- `lighthouse get` / `lighthouse set --preset <id> [--message <text>]`
- `letters list [--unread]` / `letters get <id>` / `letters send --title <t> [--date YYYY-MM-DD] [--excerpt <e>] [--body <b>] [--theme classic|seaside|blossom|qixi] [--image <path> ...]` / `letters mark-read <id>` / `letters delete <id>`
- `anniversaries list` / `anniversaries upcoming [--days 30]` / `anniversaries add ...` / `anniversaries update <id> ...` / `anniversaries delete <id>`
- `memories list --start YYYY-MM-DD --end YYYY-MM-DD` / `memories trash` / `memories add --date YYYY-MM-DD [--title ...] [--desc ...] [--mood ...] [--weather ...] [--location ...] [--image <path> ...]` / `memories update <id> ...` / `memories delete <id>` / `memories restore <id>`
- `rooms status`：只读查看海边与客厅状态

### 4.4 Skill 交互守则（`iland-companion/SKILL.md`）
- **自然语言直达**：如“帮我把岛上灯塔换成海蓝说在开会”、“把这张图记到今天的岛上日历里”、“看看小岛上有没有新信或快到的纪念日”，直接调用对应命令并返回温暖简洁的反馈。
- **仪式感保护**：
  1. 查到对方发来的未读信时，只告知标题和信封寄语，提醒用户亲自上岛拆火漆，除非用户明确说“帮我直接读内容并标记已读”；
  2. 代写信投递前，先向用户展示拟投递的标题、日期与正文，获确认后再执行 `letters send`；
  3. 删除纪念日、记忆或信件前，先向用户核对条目标题与日期。

---

## 5. 分阶段实施计划（严格遵循 `safe-resumable-dev`）

| 阶段 | 范围与改动文件 | 验证与检查点 |
| --- | --- | --- |
| **Phase 1：后端本机 Agent 鉴权与聚合摘要** | `backend/app/config.py`、`deps.py`、`room_runtime.py`、新增 `routers/agent.py`、`main.py`、高危路由加 `require_human_session` | 新增 `backend/tests/test_agent_api.py`（覆盖双账号 Token 隔离、非回环拒绝、高危路由 403、digest 聚合、`letters/memories/lighthouse` 读写闭环）→ `pytest` 通过 → **`git commit`** |
| **Phase 2：统一 CLI 与官方技能** | 新增 `openclaw-skills/iland-companion/tools/_iland_http.py`、`iland_cli.py`、`SKILL.md` | 本地启测或 mock/回环测试全部子命令与图片 multipart 上传 → **`git commit`** |
| **Phase 3：发布脚本整合与文档契约** | 更新 `scripts/build_iland_bundle.sh`、`scripts/publish_cloud.ps1`（自动同步 `openclaw-skills/iland-companion` 至双工作区）、更新 `I-land/AGENTS.md` 写入“新功能同步接入 Donut 三步契约” | 干跑打包检查 bundle 内容 → **`git commit && git push`** |
| **Phase 4：云端凭据初始化、部署与端到端验收** | 云端生成双账号随机 `ILAND_AGENT_TOKENS` 写入 `couple-iland.service` 与两工作区 `.iland-agent.json` → 运行 `publish_cloud.ps1` | 在服务器分别以 `workspace`（bear）与 `workspace-her`（her）执行 `iland_cli.py digest`、读写测试并清理测试脏数据 |

---

## 6. 未来新功能扩展契约（拟写入 `I-land/AGENTS.md`）

今后小岛每新增一个持久化玩法（如 M4 漂流瓶、农场、送花、珍藏架），必须同步完成以下三步才算验收完成：
1. **后端 REST 优先**：新路由统一复用 `Depends(get_current_user)`，天然支持浏览器 Cookie 与本机 Agent Token；
2. **补入聚合摘要**：将核心计数/最新状态接入 `GET /api/agent/digest`；
3. **注册 CLI 与 Skill**：在 `openclaw-skills/iland-companion/tools/iland_cli.py` 增加对应子命令，并在 `SKILL.md` 补充调用示例与权限边界。
