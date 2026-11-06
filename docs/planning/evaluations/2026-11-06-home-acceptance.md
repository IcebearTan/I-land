# BASE-01 · 客厅本地验收与交接

执行日期：2026-11-06。承接工作区已有、尚未提交的 HOME-01；保留全部既有改动。本包完成本地收尾，可由主对话按包整理提交。**真机、线上、主观听感仍未验收；HOME-02 未实施。**

本轮没有修改后端、美术样板目录、根 README / DESIGN 或规划总入口，没有切分支、暂存、提交、推送、部署或更改模型配置。既有室内美术、三频道、炉火录音和 EventBus 架构沿用。

## 本轮修复

| 实际问题 | 修复与验证 |
| --- | --- |
| 起身动画被失焦、设置或方向输入打断后，场景快照仍保留“慢慢起身…”；旧进度文字可能再次显示 | `InteriorScene.cancelAction()` 同时清掉动作进度提示。新增测试在左右两个座位、三种中断下验证安全落地、文案清理与迟到回调无效；先复现失败，修复后通过。浏览器中点击空地后立刻切标签再返回，人物留在安全起身点，无旧目标复活。 |
| 320×568 下“回岛”按钮盖住电视气泡一角 | 短竖屏提示根据相机当前位置留出顶部安全区。保留桌面与高竖屏原构图；320px 前后真实截图见 09 / 11，补坐标回归检查。 |
| 320×568 门口人物下半身被底部互动按钮盖住 | 短竖屏行走相机为底部操作区留 150 CSS px，门口与起身点的脚底保持在控件上方；家具、碰撞与落脚坐标不变。最终生产构建已在浏览器复验门口、入座、起身与摇杆。前后截图见 10 / 22，起身见 23。 |
| 声音设置说明未提到新增炉火，容易误解环境声音量控制范围 | `AudioControls.tsx` 改为“环境的声音”，说明鸟鸣、虫声、海浪与炉火；已有个人 REST 设置逻辑不变。 |

本轮直接编辑的功能文件只有 `frontend/src/game/scenes/InteriorScene.ts`、`frontend/src/components/AudioControls.tsx`、`frontend/tests/interior-scene.test.mjs`；其余前端文件是开工前已有 HOME-01 成果，均保留。

## 隔离环境与方法

- 开始前用 `lsof` 和 socket bind 确认 8031 空闲；只启动自己的 `127.0.0.1:8031` 单 worker uvicorn（PID 85192）。
- `ILAND_DB_PATH=/var/folders/dp/6_g0zg313vsfyr61ppk7v8lc0000gn/T/iland-base01-8eph4umg/acceptance.db`；`ILAND_UPLOADS_DIR` 为同目录下 `uploads/`；`ILAND_FRONTEND_DIST` 明确指向本工作区 `frontend/dist`，`ILAND_COOKIE_SECURE=0`。
- 浏览器是本机 Safari 26.4；浏览器连接器不可用，因此用原生 UI 操作真实生产构建，未用模拟房间替代游戏。桌面游戏区域截图为 2940×1564 物理像素；响应式设计模式分别设置 **390×844**、**320×568**，像素比 2。390 视口在 Safari 外框中按 78% 显示，不改变所设 CSS 视口尺寸。
- 两个身份顺序登录同一验收标签：`bear` / `her`。本轮验证的是单人客厅及跨场景回归，没有声称完成双 Cookie 共处回归。
- 改名测试通过本地 REST 将临时 `her` 改为“小青验收”；验证前后 `id=2`、`account=her`、`sprite=her` 与个人静音保持，浏览器重新聚焦后显示新名字、原座位和频道不变，退出后可以用新名字再登录。没有改真实账号。
- 夜景使用验收时实际本地夜间；日景用既有 `?phase=day` 预览参数，并明确只作日景预览，不声称等待了自然昼夜转换。
- 23 张图片均来自真实 Safari 截图，只裁去了浏览器标签栏/无关外框，没有重绘游戏内容。响应式截图保留尺寸栏。右侧粉色翻译圆钮来自浏览器扩展，不是游戏控件。
- 结束时退出临时账号、关闭本任务标签，停止自己的验收服务（正常 shutdown）。未关闭其他标签或服务，临时库/目录保留供追查；`backend/iland.db` 与真实 uploads 没有用于本轮测试。

## 实际验收记录

| 项目 | 实际步骤与结果 | 证据边界 |
| --- | --- | --- |
| 门口入口 | 小熊桌面点地走到家门，按 E 进入；小熊 390px 点门口气泡进入；她 320px 点 DOM 互动按钮进入 | 均进入真实 Interior，未误开信箱。 |
| 走动与绕行 | 点左右沙发、从座位点沙发另一侧空地、从电视到沙发、走到壁炉；键盘主岛走位与小屏摇杆按住/释放可用 | 浏览器可见绕行与停止；浮点穿角/长帧和完整足底几何由自动测试精确验证，不靠截图推断。 |
| 两个座位 | 小熊桌面左座、390/320 右座；她 320/390 左座、桌面左→右换座；最终 320 修复版右座与起身再验 | 专门背向坐姿、靠背遮挡、旁座空着；本人二选一，不画假在线同伴。 |
| 安全起身与空地点击 | 起身按钮；坐着点空地先站再走；点另一座先站再换；最终 320px 起身位置完整可见 | 两座落脚和路径逐帧断言同时覆盖。 |
| 电视 | 小熊沙发开启并连续切换“海风小岛→海上月亮→猫咪午后”；近电视点击机身关闭/开启，近场工具条出现，离开后隐藏 | 三幅真实节目截图 02–04；动画可见。关闭时换台禁用，远处伪动作与频道回环由场景测试验证。 |
| 炉火 | 小熊点壁炉自动走近拨火，出现“炉火暖了一些，慢慢待着就好。”，火焰短暂增强后恢复 | 真实炉火 WAV 请求 200；不消耗物品，无离线惩罚。截图 05。未做人耳音质结论。 |
| 设置 | 走动/坐着打开设置，客厅动作控件隐藏；合上后可继续原座位与电视操作 | 自动测试覆盖行进/入座中打开面板，清键盘、清旧目标与安全恢复。 |
| 静音与混音 | 小熊保存静音后刷新仍保持；切换 her 最初为自己的未静音默认值；her 保存静音后改名、切标签、客厅→主岛→海边仍显示“此刻安静” | API / 临时库确认个人设置；14 项音频测试验证室内收住户外层、炉火懒加载、渐变、唯一循环、失败重试和静音不被动作/可见性解除。未做人耳听感或手机音频验收。 |
| 失焦 | 她从右座点远处空地，立即新开空白标签；关掉该空白标签回到客厅后停在安全起身点，等待后仍不走向旧目标 | 截图 17；场景测试还覆盖隐藏、迟到动画与重复清理。 |
| 减少动态 | 原有场景测试注入 media query 并切换：跳过坐姿/电视补间、直接完成当前入座、电视使用静态模式；代码确认静态炉火与暖光分支 | **自动测试与代码证据；本轮没有在 Safari/系统设置中切换此偏好，不记为真实浏览器或真机通过。** |
| 改名和换号 | 临时 REST 改名后回前台，新名字生效，仍是 her 原座位/原频道；退出后选新名字再次成功登录 | 稳定 id/account/sprite 与声音偏好不变；没有为改名创建新身份。截图 14–16。 |
| 连续场景往返 | 她在客厅点门垫回岛→键盘/点地到海边→E 看海→回岛→点地回家→E 重新进屋 | 门外/海边安全点可继续走动，没有立即折返；海边只一名真实成员，另座空着；重入客厅电视默认关闭、人物在门垫。截图 18–20。 |
| 退出/刷新 | 室内下岛回登录页，换身份进入；退出/重新登录保留 REST 静音，刷新回主岛；重新进屋可操作 | 客厅电视和频道是临时状态；**当前实现每次重新创建 Interior 都关机并回到第一频道**，不把它描述为跨进出存档。 |
| 日夜与小屏 | 桌面夜景、白天预览；两个身份均看过桌面/390/320；最终版短屏门口、坐下/站起和摇杆再验 | 日夜/小屏截图见下表；仅模拟视口，不是触屏真机。 |

## 检查结果

开工基线的 **97 项**现有前端测试全部通过。随后新增 6 项风险回归：两座起身中断、两座先站再绕行、电视距离/频道/改名、浮点键盘碰撞、短屏顶部提示、短屏脚底与底部控件避让。

最终 `cd frontend && node --test tests/*.test.mjs`：**103 / 103 通过，0 失败、0 跳过**。分项为声音 14、日历 10、导航 7、景色时钟 10、房间/共享时钟 24、海边场景 12、室内路径 10、室内场景 16。完整输出见 [frontend-tests.txt](assets/home-base-01/frontend-tests.txt)。场景测试使用 Phaser 替身与实际场景源码，浏览器实看另行记录。

最终 `cd frontend && npm run build`：TypeScript strict 检查及生产构建通过，82 modules；`index-Cu29tXA8.js` 1,879.45 kB，gzip 448.55 kB；CSS 57.82 kB，gzip 12.05 kB。仍有既有大于 500 kB chunk 提示，未通过拆包或更改 minifier 掩盖。未改依赖/锁文件。

`git diff --check -- frontend` 通过。自己的 uvicorn 日志无 ERROR / Traceback / HTTP 500，炉火和其他音频素材请求 200，海边 WebSocket 正常加入/离开；精选原始日志见 [runtime-network.txt](assets/home-base-01/runtime-network.txt)。**没有采集完整浏览器控制台，故不声称“无 JavaScript 控制台错误”。** 本包没有后端代码改动，未重复后端 pytest；其他任务的测试不计入本包证据。

## 截图索引

| 范围 | 真实截图 |
| --- | --- |
| 小熊桌面与三频道 | [01 进屋](assets/home-base-01/01-bear-desktop-entry.png)、[02 小岛](assets/home-base-01/02-bear-left-seat-island-tv.png)、[03 月亮](assets/home-base-01/03-bear-moon-tv.png)、[04 猫咪](assets/home-base-01/04-bear-cat-tv.png) |
| 壁炉/静音 | [05 炉火](assets/home-base-01/05-bear-fireplace.png)、[06 静音设置](assets/home-base-01/06-bear-muted-settings.png) |
| 小熊模拟手机 | [07 390px 右座](assets/home-base-01/07-bear-390-right-seat.png)、[08 320px 右座](assets/home-base-01/08-bear-320-right-seat.png) |
| 320px 提示遮挡修复 | [09 修复前](assets/home-base-01/09-before-320-tv-prompt-overlap.png)、[11 修复后](assets/home-base-01/11-after-320-tv-prompt.png) |
| 320px 人物遮挡修复 | [10 修复前门口](assets/home-base-01/10-before-320-door-player-overlap.png)、[22 最终版门口](assets/home-base-01/22-after-320-door-player.png)、[23 最终版起身](assets/home-base-01/23-after-320-safe-stand.png) |
| 她的手机/改名 | [12 320px 左座](assets/home-base-01/12-her-320-left-seat.png)、[13 390px 左座](assets/home-base-01/13-her-390-left-seat.png)、[14 改名后原座位](assets/home-base-01/14-her-renamed-seated.png) |
| 她的桌面/失焦 | [15 左座](assets/home-base-01/15-her-desktop-left-seat.png)、[16 右座](assets/home-base-01/16-her-desktop-right-seat.png)、[17 失焦后安全站立](assets/home-base-01/17-her-blur-safe-standing.png) |
| 往返/日景 | [18 家门外](assets/home-base-01/18-her-home-safe-return.png)、[19 海边](assets/home-base-01/19-her-seaside-after-home.png)、[20 再次进屋](assets/home-base-01/20-her-reentered-tv-off.png)、[21 白天预览](assets/home-base-01/21-her-day-desktop.png) |

## 待验边界与独立提交交接

- iOS Safari / Android Chrome 真机触摸、实际软键盘、设备方向/安全区、系统减少动态、强制暗色模式、加载耗时、后台/锁屏与音频解锁/无缝循环听感均未测。
- 线上 HTTPS / WSS / Secure Cookie / 反代 / 单 worker 部署、线上会话清理与弱网/断网/服务重启完整故障矩阵未测。本轮只回归海边出入；不替代历史双人共处和发布专项。
- 真实旧信/照片记忆没有用于本轮试验。发布前旧内容回归、备份恢复和回退仍按 EXP-QA / BASE-02 处理。
- 当前程序像素房间作为功能基线保留；ART-01 样板未接入，Tiled/正式图集、统一人物精修及 HOME-02 仍是后续任务。
- 原总入口引用 `evaluations/2026-10-02-home-implementation.md`，本次读取发现该文件不存在。本包不能写总入口；请主对话把本轮验收链接更新为本文件，保留历史测试日期，勿把 118 项旧后端测试当成本轮新结果。

主对话提交时，本包应同时收纳**开工前已有 HOME-01 前端成果**：`package.json`、`public/audio/SOURCES.md` / `fireplace.wav`、`App.tsx`、`audio/types.ts`、`components/AudioControls.tsx` / `IslandControls.tsx` / `InteriorControls.tsx` / `interior.css`、`game/EventBus.ts` / `game.ts` / `art/interior.ts`、`game/scenes/AudioScene.ts` / `IslandScene.ts` / `NavigationScene.ts` / `InteriorScene.ts`、`interior/navigation.ts`、`tests/audio.test.mjs` / `navigation.test.mjs` / `interior-navigation.test.mjs` / `interior-scene.test.mjs`，以及本评估和 `assets/home-base-01/`。这些路径均相对于 `frontend/`，评估路径除外；不要遗漏仍为 untracked 的室内文件或炉火 WAV。

下一步入口：主对话检查上述包并独立提交，统一更新 BASE-01 / HOME-01 的本地浏览器验收项与 CURRENT_STATE；真机/线上项继续保持未勾选。重新本地验收时创建新的临时库/上传目录，按本文同样的三个环境变量启动 8031，不能省略隔离变量后误用真实库。
