# ROOM-02 / HOME-02 与第二轮视觉接入

交付：2026-11-07（Asia/Shanghai）；任务开始于 2026-11-06。版本 `home02-visual02-v1`。

本轮已完成独立双人客厅、共享电视、全站 UI/ART-02 联合接入、客厅 Tiled 对象层及本地浏览器关键流程验收。没有提交、推送或部署。**真机、线上 HTTPS/WSS 与公网弱网仍未验收。** 根规划入口由主对话更新。

## 实现结果

### 独立客厅房间

- `interior` 与 `seaside` 使用独立成员、快照和状态。共用协调锁保证同一身份最多处于一个房间；新进场先鉴权、校验同页进场代数，再释放自己的旧房间。旧租约 leave、旧 WS finally、旧连接代数不能清除新连接。
- 小屋进场默认在屋内站立、`seat=null`。沙发两席原子占用，同座竞争返回 409 和最新快照；起身释放座位但保留屋内身份。远端只有确认入座才绘制，未同步自由走动位置，不用 visits 或海边成员画同伴。
- 新增 `RoomTelevision` 表，REST 保存开关、频道、24 秒节目位置/UTC 锚点与版本。并发修改使用数据库 CAS，冲突同步最新状态；进屋不重置，关机保留进度，开机继续，换台从新节目开始。
- 电视按服务器真实时间与客户端单调时间推进，不跟随海边景色倍率；个人音量和静音保持独立。服务重启只恢复电视，不恢复在线成员或座位。
- 前端海边与客厅共用带类型校验的租约传输，保留首个 WS 全量帧确认、epoch/revision、断线清空、重连、会话过期、后台释放和同账号接管规则。接管后必须明确重新加入。
- React/Phaser 仍只通过 EventBus 交流，持久化全部经 API。详细数据/事件约定见 [PROTOCOL.md](PROTOCOL.md)。

### 视觉与输入

- 已接收并冻结 `ui-01-v1` 与 `art-v2.1.0`；核对版本、路径、尺寸与接口，没有计算交付哈希。[接收记录](RECEIVED.json)分别确认 UI 12 个入口文件、ART 106 个交付文件存在。
- 登录头像、登录背景人物、主岛、海边及客厅全部改用 ART-02：统一 32×32 帧、24px 可见站高、脚锚 `(16,29)`，人物 `scale=1`；主岛脚底碰撞为 8×4、帧内 offset `(12,25)`。四方向四帧行走、坐姿和左右依靠使用完整新资源。
- 三个可玩场景共用 `worldZoom()`。实测 1470×782、1920×1080 中主岛/小屋/海边均为 3×，避免原先大桌面下客厅 2×/4×、主岛 3×造成跨场景变化。320/390 与常见横屏继续 2×。
- 客厅使用 `public/art-v2/home-room.tmj`（20×15、16px tile）的图像层与五个对象层作为布局真源，`interior/layout.ts` 在构建时读取；正式资源通过 Tiled + 图集接入。Phaser 自带解析器接受该地图，几何数据与浏览器已验收常量完全一致，见 [等价验证](checks/tiled-equivalence.json)。没有手工操作 Tiled 桌面应用。
- 接入沙发前后层、家具脚底深度、日夜双层素材及新碰撞/互动锚点；坐姿放在底座与近侧靠背之间，走动按脚底排序。沙发视觉点击范围与碰撞占地分开，点靠背也能入座。主岛小屋门与灯塔门按新人物扩大开口。
- 三个原创电视频道重绘为 27×20 原生画面，四帧炉火使用新图集，未拉伸旧节目。日夜家具已有受光，不再整屋重复乘色。没有接入示意双人图层。
- Phaser 提示反向抵消相机倍率，正文提示 15 CSS px、场景标签 14px；DOM 使用 UI-01 的 16px 正文/输入、14px 操作、12px 元信息。实测登录输入高 48px，主要按钮至少 44×44px。
- 登录减少动态偏好会暂停装饰补间/计时与视差；客厅实际切换媒体偏好后，炉火与电视使用固定关键帧，恢复普通偏好后重新动画。静音仍由原有个人设置控制。

## 本轮实看发现并修复的问题

| 问题 | 修复及最终证据 |
| --- | --- |
| 320×568 海边时间面板压到人物头部约 8px | 调整短屏面板位置与内边距。最终面板底边 **268.39px**，人物顶边 **280px**；见 24 / 42 前后图。 |
| 844×390 客厅操作条覆盖坐姿，门口脚底贴底边 | 横屏操作条移至右侧，行走相机留操作空间；门口脚点由 **390px** 调到 **250px**。坐姿与控件横向分离；见 37–40。 |
| 568×320 横屏 HUD 会挡住电视内容、三列操作挤出逐字换行 | 短横屏调整坐姿相机、HUD/回岛横向分区，按钮图标与文字上下排列。最终电视内容顶边 **84px**，HUD 底边 **70px**；人物脚点 **302px**，控件左边 **356px**、本人中心 **256px**；见 41。 |
| 大桌面不同场景的整数倍率不一致 | 用共用缩放函数覆盖主岛画布边界；两种大桌面均实测三个场景 3×、32×32 帧、sprite scale=1；见 58–62。 |
| 旧本地坐姿的取消动画规则可能与服务器确认座位矛盾 | 视觉动画被设置/失焦打断时完成到已确认姿势；断线才回安全站点。迟到的旧场景回调不能改新场景。相关场景检查通过。 |

## 检查证据

用户 2026-11-07 更新规则后，停止全量回归和交接校验和，只运行本次改动及直接依赖的明确测试文件、必要类型检查与构建；已通过且未受影响的检查未重复跑。

| 检查 | 结果与范围 |
| --- | --- |
| `.venv/bin/python -m pytest tests/test_home_rooms.py tests/test_rooms.py -q` | **53 passed**：小屋 17 项、海边 36 项；临时数据库与独立 Cookie，含座位竞争、电视 CAS、跨房间/旧请求、WS、过期、退出与重启。之后后端仅改说明文字，无语义变动。 |
| 房间传输/海边场景阶段 A | **36 passed**；[现有输出](checks/room-and-seaside-stage-a.log)。 |
| 客厅客户端/场景阶段 A | **24 passed**；[现有输出](checks/home-room-stage-a.log)。 |
| ART 接入后的室内路径 / 海边场景 | 分别 **10 / 12 项通过**；后续没有修改路径算法或家具碰撞占地。室内断言因新增近沙发快照而更新，随后该文件独立通过。 |
| 共用倍率收尾 `node --test tests/visual-scale.test.mjs tests/interior-scene.test.mjs tests/seaside-scene.test.mjs` | **31 passed，0 失败/跳过**：共用倍率 1、客厅场景 18、海边场景 12；[完整输出](checks/world-scale-and-scenes.log)。 |
| 最后 Tiled 收尾 `node --test tests/home-map.test.mjs tests/interior-navigation.test.mjs tests/interior-scene.test.mjs` | **29 passed，0 失败/跳过**：Phaser Tiled 解析与图集引用 1、路径 10、客厅场景 18；[完整输出](checks/tiled-home.log)。几何/图层位置等价核对通过，没有重复房间业务或全部浏览器流程。 |
| 最终 `npm run build` | TypeScript strict + Vite 通过，**90 modules**；JS **1,890.67 kB / gzip 448.41 kB**，CSS **71.65 kB / gzip 12.79 kB**。保留既有 >500 kB chunk 提示；[构建输出](checks/build.log)。 |
| 浏览器关键检查 | **25 项通过，0 失败/待定**；[结构化结果](browser-checks.json)。含真实双会话、冲突、网络、后台、服务重启、多视口及旧内容 UI。 |
| 源码边界 / diff | 新房间/视觉代码没有 localStorage/sessionStorage，游戏层不引入 React；运行渲染入口没有旧人物纹理键。`git diff --check` 通过。 |

历史检查单独保留：新指令到达前曾执行后端全量 **204 passed / 181 warnings / 4.88s**、前端阶段 A 全量 **111 passed**。这些不是最终全量回归声明；新指令后没有再执行全量命令。后端警告来自既有 Starlette/httpx 与 SQLModel 弃用提示，未安装或更改依赖。

## 实际浏览器验收

使用已有 Chromium **151.0.7922.34** 与已有 Playwright 缓存，没有安装依赖。主要验收为两个独立 browser context，真实 `bear` / `her` Cookie 登录；除临时信件/照片初始夹具外，主要动作通过实际按钮、键盘和 canvas 点击执行。脚锚、帧名和位置仅通过已有 `__ilandGame` 调试口读取，没有移动人物来跳过走路。

同座与电视并发检查在两个实际 UI 发起的请求之间设置一次放行屏障，让两边基于同一旧状态竞争。服务端均只接受一个请求，另一方得到 409；没有用替身成员代替房间事实。

| 关键流程 | 结果 |
| --- | --- |
| 双 Cookie 先后进屋 / 入座 | 默认两位站立、远端 actor=0；先后坐两席后各自只额外显示一个确认的远端角色。两边可开关/换台，频道一致。 |
| 同座 / 并发电视 | 两者均为 **200 + 409**；冲突页保留可操作连接并显示原因，可选空座/继续操作。 |
| 起身 / 离开 | 起身后成员数仍为 2、远端坐姿消失并显示“也在屋里，暂时没坐下”；离屋后对应房间才移除成员。 |
| 断网 / 重连 | 浏览器真实离线后另一页移除同伴；恢复网络自动重连，电视保持，旧座位不会复活。 |
| 服务重启 | 暂时离线两个浏览器后重启自己的 uvicorn；用临时 Cookie 读到空成员及原电视状态；两页恢复网络后重新确认，均未自动坐回旧座。 |
| 同账号接管 | 新标签进屋后旧标签进入 taken-over、不自动夺位；点击“重新加入客厅”才重新取得控制，迟到旧页面关闭不清掉新租约。 |
| 原生后台 | 普通 Chromium 独立临时 profile，以 `connectOverCDP(..., {noDefaults:true})` 连接。切到另一实际标签页得到原生 `visibilityState=hidden`，当前房间变 away、另一身份只剩自己；回来变 visible 并重新确认，保持 standing/null。 |
| 减少动态 / 静音 | 实际媒体偏好切换：减少动态下 TV 像素与炉火帧不变；普通偏好下 TV 变化、四张炉火帧均出现。A 静音、B 未静音的 API 设置互不覆盖。没有做人耳听感结论。 |
| 海边回归 | 从小屋回岛走到海边、两人反向座位分配、单靠/双靠、共享 30×/暂停/回现实；旧小屋成员为空。新坐/靠姿势均使用同一 32×32 图集和脚锚。 |
| 长名字 / 字号 / 横向溢出 | 18 字及最终 20 字中文名字、20 字连续英文名字完整换行；测试的 320/390/横屏/桌面无页面级横向溢出。输入 16px、主要按钮 14px，关键目标 ≥44px。 |
| 日历 / 照片 | 手输日期、小挂历局部横向滚动、Esc 返回日期按钮、选配色/图标/样式并保存；真实保存得到 sea/moon/starry。两张临时图走失败重试、排序、移除/重加、长文字保存、大图翻页及 Esc 回日历。 |
| 信箱 | 临时长标题、长署名、长摘要和两页信纸；拆信、翻到第 2 页、放大阅读可用。320px 信纸区域高 **363.52px**，内部横向滚动宽 **648px**，页面仍宽 **320px**。 |
| 四向与碰撞 | 实际键盘四向步态采样；主岛 body=8×4、offset=(12,25)、origin=(.5,.90625)、scale=1。客厅从沙发绕家具到壁炉、两席安全起身、视觉靠背点击与门口回岛可用。 |

初次后台探针受自动化驱动的强制前台状态影响，未据此宣布通过；读取本地驱动实现后改用不覆盖默认前台状态的独立普通 Chromium，补齐了上表原生后台证据。结构化结果还保留了独立的合成 visibility 事件检查，两者没有混为真机测试。

浏览器收集到的未捕获 `pageerror` 为 **0**，未预期 HTTP 404/5xx 为 **0**。一次上传请求被有意中断以测试重试。服务日志没有 ERROR/Traceback/500/404；没有宣称采集了所有浏览器控制台告警。[服务日志](server.log)已去掉临时租约标识。

## 取景证据

共 **63 张真实浏览器截图**，不是静态样板。00–02 用原 `index-Cu29tXA8.js` 构建在独立临时环境中捕获，作为本轮前后对照；随后用整合构建验收。最后的大桌面修复只影响相关取景，前面未受影响的业务检查没有重跑。Tiled 收尾为同坐标、同图层的表示迁移，完成等价核对、29 项定向检查与构建后没有重跑全部浏览器流程。

| 范围 | 重点截图 |
| --- | --- |
| 原版 / 新版登录与客厅 | [原登录](screenshots/00-before-login-desktop.png)、[原客厅](screenshots/01-before-home-desktop.png)、[新登录](screenshots/03-after-login-desktop.png)、[新客厅双人](screenshots/07-two-seated-shared-moon-desktop.png) |
| 双人小屏与冲突 | [320](screenshots/09-two-seated-320.png)、[390](screenshots/10-two-seated-390.png)、[抢座](screenshots/11-seat-conflict-390.png)、[电视 CAS 结果](screenshots/12-tv-cas-result-320.png) |
| 网络 / 接管 / 原生后台 | [掉线](screenshots/16-partner-offline-390.png)、[重连](screenshots/17-reconnected-unseated-320.png)、[重启](screenshots/18-service-restart-restored-tv-320.png)、[接管](screenshots/19-old-tab-taken-over-320.png)、[真实后台](screenshots/56-native-background-clears-partner-390.png)、[返回未入座](screenshots/57-native-background-return-unseated.png) |
| 海边与短屏修复 | [双靠 320](screenshots/22-seaside-mutual-lean-320.png)、[双靠 390](screenshots/23-seaside-mutual-lean-390.png)、[时间面板修复前](screenshots/24-seaside-clock-panel-320.png)、[修复后](screenshots/42-after-seaside-clock-panel-320.png) |
| 横屏修复 | [门口原取景](screenshots/37-before-landscape-door-framing.png)、[原控件遮挡](screenshots/38-before-landscape-seated-overlap.png)、[门口调整后](screenshots/39-after-landscape-door-framing.png)、[844×390](screenshots/40-after-landscape-seated-controls.png)、[568×320](screenshots/41-home-568-landscape-seated.png) |
| 日历 / 信箱 | [主题编辑](screenshots/28-calendar-theme-editor-320.png)、[记忆照片](screenshots/31-memory-photos-320.png)、[大图](screenshots/32-memory-large-photo-320.png)、[长标题](screenshots/33-mailbox-long-title-320.png)、[阅读](screenshots/35-letter-reading-320.png)、[放大第二页](screenshots/36-letter-zoom-page-two-320.png)、[桌面月历](screenshots/48-calendar-desktop-final.png) |
| 最终小屏、日夜、设置 | [登录 320](screenshots/43-login-320-long-names.png)、[滚到登录按钮](screenshots/44-login-320-submit-reachable.png)、[登录 390](screenshots/45-login-390.png)、[设置](screenshots/49-settings-desktop-final.png)、[20 字名字与壁炉](screenshots/52-fireplace-and-max-name-320.png)、[她的白天](screenshots/53-her-home-day-final-390.png)、[双人夜间 320](screenshots/54-two-people-night-final-320.png)、[双人夜间桌面](screenshots/55-two-people-night-final-desktop.png) |
| 大桌面一致倍率 | [主岛 1470](screenshots/58-island-1470-shared-scale.png)、[客厅 1470](screenshots/59-home-1470-shared-scale.png)、[客厅 1920](screenshots/60-home-1920-shared-scale.png)、[海边 1920](screenshots/61-seaside-1920-shared-scale.png)、[海边 1470](screenshots/62-seaside-1470-shared-scale.png) |

## 隔离环境与收尾

- 每次启动前确认 8031 空闲，只启动本轮自己的单 worker uvicorn。数据库、上传、生成的假信件/照片全部位于 [environment.json](environment.json) 记录的 `iland-home02-*` 临时目录。
- 没有读取、恢复或试验性改动真实 `backend/iland.db` / `backend/uploads`。没有连接线上服务器。
- 最终临时服务与本轮浏览器均已关闭，8031 再次确认无监听；保留临时 DB/uploads 以便复查，普通 Chromium 的临时 profile 已清理。
- 最后 Tiled 收尾后的产物为 `index-DJ8N_jWk.js` 与 `index-CqiWzKrh.css`，仅由本整合者写 `frontend/dist`。没有计算交付 SHA-256 或其他校验和；既有产品备份安全校验保留且未再修改。
- 没有切分支、暂存、提交、推送、安装共享依赖、更改模型/全局配置或使用额度重置卡。`AUTONOMOUS_STATE.json` 及总入口属于主对话，本任务没有编辑它们。

## 文件与交接入口

- 后端：`app/room_runtime.py`、`app/routers/rooms.py`、`app/routers/auth.py`、`app/models.py`、`app/main.py`；测试 `tests/test_home_rooms.py`（新增）、`tests/test_rooms.py`。BASE-02 的 backup.py/test_backup.py 保持不动。
- 房间前端：`src/game/rooms/`（新增共用传输、进场代数、海边适配）、`src/interior/room.ts`（新增小屋类型/客户端/节目时钟）、`src/interior/layout.ts` 与 `public/art-v2/home-room.tmj`（Tiled 布局）、`src/seaside/room.ts` 兼容导出、EventBus、InteriorScene/SeasideScene、InteriorControls 与对应测试。
- 视觉前端：`src/visual/`（新图集/脚锚、共用倍率、屏幕字号）、Boot/Login/Island 场景、game/art 三场景、CharacterPortrait；新增 `tests/visual-scale.test.mjs`、`tests/home-map.test.mjs`。
- UI/ART：完整包含已冻结 UI-01、ART-02 交付，入口分别为 [UI READY](../ui/READY.json)、[ART READY](../art/READY.json)。本整合又修补了 `components/interior.css`、`styles/seaside.css` 的实测布局，未改其余 UI 业务规则。
- 交接只读入口：[READY.json](READY.json) → 本报告 → [browser-checks.json](browser-checks.json)、截图及 checks/。主对话可据此审阅整包并按包提交，统一更新 ROOM-02/HOME-02、ART-02/03 与视觉任务状态；主岛 Tiled 地图等未实施范围不要一并勾选。

运行定向检查仍使用现有环境：

```bash
cd backend
.venv/bin/python -m pytest tests/test_home_rooms.py tests/test_rooms.py -q
cd ../frontend
node --test tests/home-room.test.mjs tests/room.test.mjs
node --test tests/home-map.test.mjs tests/visual-scale.test.mjs tests/interior-navigation.test.mjs tests/interior-scene.test.mjs tests/seaside-scene.test.mjs
npm run build
```

这些是接续时按改动选用的入口，不要求无变化重复执行。重新浏览器验收须另建临时目录、显式设置 `ILAND_DB_PATH` / `ILAND_UPLOADS_DIR` / `ILAND_FRONTEND_DIST`，先确认端口空闲，不能省略隔离变量。

## 未验证范围与发布条件

- 320×568、390×844、横屏和大桌面均为浏览器 CSS 视口；本轮没有 iOS/Android 触屏真机、软键盘、设备 safe-area、系统锁屏或强制暗色实测。普通 Chromium 原生后台证据不代替手机后台策略。
- 没有线上 HTTPS/WSS、反代、Secure Cookie、生产卷恢复、真实内容回归或公网弱网/长时性能基准；没有做人耳音质/循环听感结论。
- 房间仍要求 **一个 Uvicorn worker / 一个服务副本**。成员只在内存租约中；新增电视表由现有初始化建表流程创建，前后端应整包发布。发布前沿用已完成 BASE-02 备份/恢复保障。
- 此轮同步沙发与电视，不同步室内自由走动、不扩展主岛同行、邀约、料理、背包、装修或后续合作玩法。
