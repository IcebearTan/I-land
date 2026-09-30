# I-land 运维手册：首次部署、密码、备份与恢复

面向实际部署（单 VPS + Docker Compose + Caddy TLS）。本地开发不需要读这篇。

## 1. 首次部署

```bash
# 服务器上
git clone <repo> && cd I-land
docker compose up --build -d    # http://<host>:8000，建议再套 Caddy/Nginx 做 HTTPS
```

- 首次启动会自动建表、写种子账号、创建 `/data/uploads`，**不需要任何手工初始化**。
- 数据库与附件都在 named volume `iland-data`（容器内 `/data`）。

## 2. 密码

### 首次部署：设置初始密码

默认用名字 `小熊` / `她` 登录，初始密码 `123456`，来自环境变量 `ILAND_SEED_USERS`
（格式 `身份键:password:名字,...`，两位岛民的身份键仍用 `bear` / `her`）。两种做法：

1. **部署前**：在 `docker-compose.yml` 的 `iland` 服务里加
   `environment: ILAND_SEED_USERS: "bear:你的强密码:小熊,her:她的强密码:她"`，
   首次启动即按此创建账号。
2. **部署后**：先用默认密码登录，立刻在岛上「设置 → 登录暗号」（HUD 右上角）改密。

种子逻辑只创建**不存在**的账号：改 `ILAND_SEED_USERS` 不会覆盖已有账号的密码。
已有账号改密码走面板（见下），这是两者的区别。

### 名字即登录账号

HUD「设置 → 岛民名字」同时更新显示名字与登录账号（去首尾空格、1–20 字、不能重名）。保存后用新名字和原暗号登录，旧名字不再作为别名；已有会话继续有效。
两人可以互换名字。固定身份键和用户 ID 保留，因此旧信、附件、记忆、足迹的归属不变。
另一台设备回到页面或每分钟刷新共享名字；登录页点头像会填入当前名字。

升级前先备份数据库与 uploads；新版本首次启动自动补 `user.login_name`，从已有显示名字迁入，不改密码或重建账号。
历史名字为空、超长、含控制字符或发生冲突时，该账号回退为原身份键（显示名字一起对齐）；启动后可以在设置中改成所需名字。
发布应同时更新前后端。旧代码登录仍查询身份键，回退后的账号行为不同；若需要恢复升级前备份，先保留当前备份并核对升级后新增内容，再按恢复流程处理，不直接覆盖现有数据。

### 已有账号改密

HUD 右上角 → 「设置」→ 「登录暗号」：输入旧密码 + 新密码（≥6 位）。成功后：

- 当前设备保持登录；
- **其他设备的登录全部失效**，需要新密码重新登录；
- 旧密码立即作废。

## 3. HTTPS 与 Cookie

反代 HTTPS（Caddy/Nginx TLS）时，给服务加环境变量 `ILAND_COOKIE_SECURE=1`，
会话 Cookie 将带 `Secure` 标记（只在 HTTPS 下发送）。本地 http 开发保持默认即可。

```yaml
# docker-compose.yml
environment:
  ILAND_COOKIE_SECURE: "1"
```

## 4. 备份

### 备份什么

数据库（`/data/iland.db`）与附件目录（`/data/uploads`）是**同一套内容**：
数据库里的记忆引用附件文件。两者必须一起备份、一起恢复。

### 怎么备

```bash
# 容器内直接跑（backend 代码在镜像 /app）
docker compose exec iland python -m app.backup backup /data/backups
# 或把 volume 内容拷出来在宿主机跑：需要 backend/.venv 环境
```

- 数据库用 **sqlite3 backup API 在线快照**：运行中的服务不用停，WAL 里未合并的数据也会进快照。
  （把运行中的 `iland.db` 单文件复制走不算完整备份——WAL 与 SHM 不在其中。）
- 附件直接复制：上传采用「临时文件 + 原子改名」，目录里永远是完整文件；备份进行中
  新上传的照片至多多出几个未被引用的附件，不影响一致性。
- 产物是 `iland-backup-<时间>/`（`iland.db` + `uploads/` + `manifest.json`）。

### 建议节奏

- 每天 cron 备份一次（`0 4 * * *` 附近挑个低峰时间）；
- **每次升级（换镜像）前额外备份一次**；
- 保存位置与保留周期按实际部署配置（示例：rsync 到另一台机器 / 对象存储，保留 30 份）。

cron 示例（宿主机）：

```cron
17 4 * * * cd /srv/I-land && docker compose exec -T iland python -m app.backup backup /data/backups
```

## 5. 恢复

### 恢复演练（不影响真实数据，推荐先做一次）

```bash
# 在 backend/ 下用本机环境
.venv/bin/python -m app.backup restore <备份目录> /tmp/iland-rehearsal
# 然后用演练数据起一个临时实例核对
ILAND_DB_PATH=/tmp/iland-rehearsal/iland.db ILAND_UPLOADS_DIR=/tmp/iland-rehearsal/uploads \
  .venv/bin/python -m uvicorn app.main:app --port 8001
```

自动化演练在 `backend/tests/test_backup.py`（独立临时目录，验证记录、原图与缩略图完整）。

### 正式恢复（目标 = 服务器数据卷）

1. `docker compose down`（停写入）；
2. 把备份目录内容放回 volume（或用 `restore` 命令指向挂载目录——它会把现有内容
   挪成 `*.pre-restore-<时间>`，可回退）；
3. `docker compose up -d`，登录核对记忆、照片与信件。

## 6. 附件清理（暂不自动执行）

上传后未保存进任何记忆或信件的附件（比如编辑到一半放弃）会留在 `uploads/` 与
`attachment` 表里。维护工具结合 `linked` 标记与实际记忆/信件引用，当前阶段**不自动删除**任何文件，只提供登记：

```bash
docker compose exec iland python -m app.maintenance orphans --days 2
```

确认列表无误后再人工删除对应文件与表记录。已删除记忆的附件在 30 天恢复窗口内
必须保留；过期清理流程待后续阶段明确后另行启用。

## 7. 旧信扫描件迁入

工具只处理真实扫描件（JPEG/PNG/WebP），默认跳过 guide/demo；旧项目保持只读。
先把来源目录放到目标服务器可读取的位置，并备份目标数据。下面命令在 backend 目录运行：

```bash
.venv/bin/python -m app.backup backup backups
# 默认只预览，可使用 --id 指定源信件：
.venv/bin/python -m app.import_letters /路径/IcebearMailbox --id qixi-2026
# 确认预览后执行，会在终端交互询问已有登录暗号：
.venv/bin/python -m app.import_letters /路径/IcebearMailbox --id qixi-2026 --apply --url http://127.0.0.1:8000
```

工具通过当前服务 API 上传并创建信，不直接写数据库。省略 `--user` 会获取白熊的当前名字；`--user '对方当前名字'` 切换作者。参数填登录名字，不能继续填旧身份键作为别名。
容器环境使用 `python` 代替 `.venv/bin/python`，来源目录需以只读方式挂载，目标 URL 按容器实际地址设置。
不将暗号写入命令参数或提交仓库。

重跑须保留同一账号、同一目标 URL 和 `uploads/.imports/` 日志。它记录上传结果、来源哈希与已建信 ID；
相同来源重跑跳过，源内容改变/已建信消失则要求人工核对。换 URL、丢日志或更换数据目录可能失去重跑保护。
只实现本机工具锁与现有 API 精确比对，不宣称公共写信已支持数据库级并发幂等。
图片响应丢失时可能留下未关联上传，当前继续只登记，不自动清理。迁入后核对数量、署名、页序与每页可读性。
