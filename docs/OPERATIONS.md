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
- 数据库快照之后复制附件。现有上传在文件写完后才登记数据库，且没有自动物理清理；
  期间新上传至多增加快照未引用的附件。备份期间不要人工删除、替换附件或运行清理任务。
- 源数据库必须存在且含核心表，源 `uploads/` 必须存在（可以为空）。路径配错、尚未初始化、
  损坏库、符号链接或复制失败会报错，不再把缺失的数据源当成空备份。
- 产物是 `iland-backup-<时间>-<随机后缀>/`（`iland.db` + `uploads/` + `manifest.json`）。
  同秒多次备份互不覆盖；先写隐藏暂存目录，校验数据库后才发布正式目录，正常失败清理暂存。
- 新清单为 `format_version: 2`，记录数据库大小、附件文件数，以及数据库与每个附件的 SHA-256。
  迁移/下载时保留完整目录结构和清单，不把 WAL、SHM、journal 或其他文件混入备份根目录。
  校验和用于发现意外损坏，不是签名；仍需保留可信的异地副本。

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
# 在 backend/ 下运行；替换为实际的独立备份目录
backup_dir=/绝对路径/iland-backup-时间-后缀
rehearsal_root="$(mktemp -d "${TMPDIR:-/tmp}/iland-rehearsal.XXXXXX")"
# 恢复非零退出就停止，不能让应用在失败目录里自动建出空库
if ! .venv/bin/python -m app.backup restore "$backup_dir" "$rehearsal_root/restored"; then
  exit 1
fi
# 可选：确认 8001 未被占用后，以临时数据启动实例核对；不会改真实数据路径
ILAND_DB_PATH="$rehearsal_root/restored/iland.db" ILAND_UPLOADS_DIR="$rehearsal_root/restored/uploads" \
  .venv/bin/python -m uvicorn app.main:app --port 8001
```

登录核对双方名字、旧信页序、记忆日期/内容以及原图、展示图和缩略图；核对后停止临时实例。
本包自动化演练只运行 CLI/pytest，没有启动该实例或占用端口。

恢复按以下顺序执行：

1. 检查清单字段、数据库/附件目录和普通文件类型，拒绝符号链接、特殊文件、数据库旁路文件；
2. 在目标父目录的同一文件系统中完整暂存数据库和附件；核对大小、数量，v2 另核对全部路径和 SHA-256；
3. 只读打开暂存库，要求完整 `PRAGMA integrity_check` 结果恰为一行 `ok`，并检查核心表；
4. 校验通过后，已有目标整体改名为唯一的 `目标.pre-restore-<时间>-<随机后缀>`，再发布暂存目录。
   发布失败时尝试把旧目录改回；绝不从源备份再复制一遍来发布。

旧格式（没有版本/哈希字段）仍可恢复，但只验证清单、数据库大小/完整性与附件数，并输出提示。
它无法发现同数量附件被替换或照片字节损坏；先演练并人工核对，再由新工具制作后续备份。
不要通过删除 v2 校验和、改清单数值或补空文件来绕过校验错误。

### 正式恢复（Docker named volume）

**不要把 `/data` 挂载点或项目的 `backend/` 代码目录传给 restore。** 工具发布需要重命名目标目录，
挂载点不能这样替换；`/data/backups/...` 也不能恢复到包含它的 `/data`。推荐恢复到卷内新的独立子目录，
再切换数据库和上传路径，保留原库及其 WAL/SHM、原上传、备份目录和原配置用于回退。

以下命令以仓库现有 `docker-compose.yml` 和默认 `/data/iland.db`、`/data/uploads` 为例。
如果部署用了其他 `-f` 覆盖文件，每条命令都保留原来的文件顺序和参数，并在最后追加恢复配置。
执行前记录当前数据路径和 Compose 配置；使用包含本次备份修复的镜像。

1. 先按上一节完成独立恢复演练。正常升级/回退前，额外保存当前数据库与附件的同套备份；
   如果当前库已坏而无法备份，保留现有文件，不能以清空或重建原库作为恢复前置。
2. 停止应用，确保没有其他容器、宿主进程或清理任务写入同一数据目录：

   ```bash
   docker compose stop iland
   ```

3. 选取已经验证的备份，恢复到新的目录。下面的备份名须替换为实际值；确认 `restored-candidate` 未被服务使用。
   只有命令退出码为 0、终端报告恢复成功，才继续切换配置：

   ```bash
   docker compose run --rm --no-deps iland python -m app.backup restore \
     /data/backups/iland-backup-时间-后缀 /data/restored-candidate
   ```

4. 在服务器准备 `compose.recovery.yml`（作为本次运维配置保留，不必提交到仓库）：

   ```yaml
   services:
     iland:
       environment:
         ILAND_DB_PATH: /data/restored-candidate/iland.db
         ILAND_UPLOADS_DIR: /data/restored-candidate/uploads
   ```

5. 加载原配置与该覆盖文件，重建服务容器后逐项核对内容：

   ```bash
   docker compose -f docker-compose.yml -f compose.recovery.yml up -d --force-recreate iland
   ```

   此后启动、升级、备份与 cron 也要使用同一套 `-f` 参数，才能继续指向恢复后的数据。
   不要只改其中一个数据路径。核对无误后再恢复日常写入；旧数据和备份继续保留。

6. 若应用验收失败，先停止恢复后的实例，保留恢复目录中可能新增的内容；
   用**切换前保存的完整配置和原数据路径**重新创建容器。例如原先只有默认配置时：

   ```bash
   docker compose -f docker-compose.yml -f compose.recovery.yml stop iland
   docker compose -f docker-compose.yml up -d --force-recreate iland
   ```

   若原库本身已损坏，回到原路径不能修复它，应保持停服并另选可信备份恢复到另一独立目录。
   本地自动化没有实跑 Docker 卷、服务器路径切换或线上内容验收。

### 失败与回退

- 校验、复制或权限/空间不足导致失败：已有目标保持不变；新目标不会留下半套数据。
  根据报错检查来源、可用空间、权限和备份传输完整性，重新从可信副本演练，不覆盖旧文件。
- 旧目标已移走但发布失败：工具尝试自动改回原路径。若连回退都失败，错误会给出原数据所在的
  `*.pre-restore-*` 完整路径；保持停服，先恢复磁盘/权限，再把该完整目录改回空缺的目标路径。
  若目标又出现，先核对并将它另存，不强制覆盖；数据库、WAL/SHM 和 uploads 必须作为整套处理。
- 成功后想撤销独立目录恢复：停服，将当前目标另存为唯一的新目录，再把终端记录的
  `*.pre-restore-*` 改回原目标位置。不要猜“最新”目录，不合并两套附件或丢弃后来写入的记忆。
- 切换由两个目录重命名组成，须串行执行、目标停写。它不承诺断电/强杀时自动回退；
  异常退出后检查 `*.pre-restore-*` 和隐藏的 `.目标.restore-*`，保持停服，先找回原目标。
  不运行 `docker compose down -v`，不删除唯一备份或把残留暂存目录当成成功备份。
- SHA-256 不验证照片可解码、业务引用是否原本缺失或新旧程序兼容性；仍需上述应用内容验收。
  恢复目录父文件系统需容纳完整新副本，旧目标保留也需要继续占用空间。

自动化入口（使用现有 venv；测试自设临时数据库/附件）：

```bash
cd backend
.venv/bin/python -m pytest tests/test_backup.py -q
.venv/bin/python -m pytest tests/ -q
```

测试覆盖正常/WAL 恢复、坏清单/坏库/坏附件拒绝、源与目标保护、复制/发布失败与回退。
本轮证据和未验证范围见 [BASE-02 评估](planning/evaluations/2026-11-06-backup-recovery.md)。

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

## 8. 双人海边发布

新版本的海边同步需要同时更新前后端。继续使用现有 FastAPI / SQLite 服务，不增加独立联机服务或数据库；升级前按上面的流程备份数据库与 uploads。

- **一个 Uvicorn worker、一个服务副本**。当前 Dockerfile 启动命令符合要求；不能加 `--workers 2` 或将 iland 扩为多副本。成员/座位/姿势在进程内管理，共享景色时钟存 `roomclock` 表，首次启动仅增加新表，不修改旧内容。
- WebSocket 使用网站同源的 `/api/rooms/seaside/events`；HTTPS 网站自动使用 WSS。Vite 开发代理已开启 `ws: true` 并保留原 Host（[Vite 官方说明](https://vite.dev/config/server-options#server-proxy)）。
- 反代必须保留 Host 与 Origin，不能缓存房间 API。Caddy 的 `reverse_proxy` 已支持 WebSocket 升级（[Caddy 官方说明](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#streaming)），原站点可继续代理到现有服务端口。
- 来源检查默认要求请求 Host/协议与页面 Origin 相同。若 Caddy 容器到后端的链路是 HTTP，而后端未收到可信 HTTPS 代理信息，在 iland 服务内显式设置公开站点来源；仅填自己的实际网站地址，多个地址用逗号分隔，不用 `*`：

```yaml
environment:
  ILAND_COOKIE_SECURE: "1"
  ILAND_ROOM_ORIGINS: "https://island.example.com"
```

`island.example.com` 是示例，替换为实际域名。Cookie 仍负责身份校验，来源白名单不授予登录或座位权限。网站若使用非默认端口，来源须包含端口。

升级后用两位岛民的**隔离登录会话**验证：先进入/后进入、两边看到相同座位与姿势、依靠/起身/离开、共同暂停或调速、页面后台返回、网络恢复、同账号新窗口接管。WebSocket 请求应实际升级成功；不能仅凭 HTTP 页面加载成功宣布 WSS 发布完成。

服务重启会清空在线成员并重新确认入座，保存的景色时钟继续按原倍率推进。暂停、加速和回现实只改变海边景色，不改变纪念日、恋爱天数、音频速度或会话过期时间。真实 iOS/Android 锁屏及服务器 WSS 尚需实际设备和部署环境验收。
