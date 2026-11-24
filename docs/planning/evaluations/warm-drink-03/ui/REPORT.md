# 第三轮暖饮 UI 交付

2026-11-07，版本 `cocoa-ui-v1.1`；最终适配依据 **cocoa-protocol-v1.1**。本包仅交付受控展示与清楚标注的本地规则原型，真实玩法/保存/场景接入由整合者完成。

## 实现范围

- `frontend/src/cocoa/ui/`：CocoaPanel、杯子控件图标、CSS、独立 props/action 类型和定向测试。没有修改 App、EventBus、Phaser、后端、公共协议或全站 tokens。
- 覆盖发起/明确加入、两种杯型、原味或三种以内配料组合、控温/搅拌工位、小火/中火/关火、42–68°C 适宜区、进度、暂停恢复、空工位、交换回应、分杯命名、真实制作人/日期展示、作品回看、领取/递杯回应/取消与碰杯邀请。
- 组件不 fetch、不读写 localStorage、不推进温度/进度、不自行创建成果或“保存成功”。杯子的持久 `claimed` 与真实当前 `heldBy` 分开，历史领取不冒充当前在线手持。
- 所有可变内容由父层 props 控制；UI 只发动作。制作中的输入停止独立于普通 pending；blur/hidden/关闭/清理会发带原 session/account 的停止意图，租约与续期由整合者处理。
- `docs/planning/designs/cocoa-03-ui/`：完整可离线打开的规则原型、可编辑 TSX/模型/CSS、独立类型检查配置、离线渲染脚本、打包产物和 13 张预览。模拟成员都叫“演示者 A/B”，所有预览明确标记本地规则原型。

具体 props、动作到 REST 的对应、输入续期与显示占位见 [原型与适配说明](../../../designs/cocoa-03-ui/README.md)。UI 的分杯阶段已经使用 **pouring**；最终没有保留 cool / 单选 topping / portioning 旧接口。

## 实际检查

| 检查 | 结果与证据 |
| --- | --- |
| 定向组件/规则检查 | `node --test frontend/src/cocoa/ui/cocoa-panel.test.mjs`，**9/9 通过**。包含受控不变更 props、不伪造制作者/完成、断线禁用、普通 pending 不阻塞停火、交换/碰杯确认、单人先暖后搅完成、两工位温度影响、过热/暂停/长间隔不刷进度、个人配料组合/原味、递杯取消/过时接受、释放输入与监听清理。输出见 [tests.txt](tests.txt)。其中原型规则测试不是后端测试。 |
| 独立原型 TS | `tsc -p docs/planning/designs/cocoa-03-ui/tsconfig.json --noEmit` 通过；没有安装依赖。 |
| 独立组件打包 | 使用现有 esbuild 打包 prototype.tsx，含真实 CocoaPanel 与其 CSS，产物在原型目录 build/，可离线打开。 |
| 必要项目类型检查/构建 | `npm run build -- --outDir /tmp/iland-cocoa-ui-03-ready` 通过；90 modules，CSS 71.65 kB / gzip 12.79 kB，JS 1,890.67 kB / gzip 448.41 kB。CocoaPanel 尚未挂到游戏入口，项目构建验证源码类型；独立原型打包验证该组件的实际可运行产物。frontend/dist 未被覆盖。保留既有 Phaser 大包提示。 |
| 离线布局实测 | 10 个固定阶段样本，视口 320×568、390×844、1024×900；页面 scrollWidth 均等于视口宽，正文 computed font 为 16px，采集到的按钮/输入无小于 44×44px 目标。短屏长内容局部滚动。真实指标见 [layout-evidence.json](../../../designs/cocoa-03-ui/previews/layout-evidence.json)。 |
| 静态差异检查 | `git diff --check` 对本包三个独占目录通过。无交付哈希生成/核验，无全量回归。 |

离线渲染使用专门启动并关闭的 headless 进程、独立临时 profile，只打开规则原型 file://；没有控制已有应用浏览器或验收服务，没有读取真实 DB/uploads。已实看关键预览：制作时温度与操作相邻，320px 分杯字段/按钮通过滚动可达，碰杯有独立接受/拒绝区。

## 关键预览

| 步骤 | 文件 |
| --- | --- |
| 发起 | [390px](../../../designs/cocoa-03-ui/previews/idle-390.png) |
| 准备/个人选择 | [320px](../../../designs/cocoa-03-ui/previews/preparing-320.png)、[底部工位/开始](../../../designs/cocoa-03-ui/previews/preparing-320-bottom.png) |
| 制作 | [390px 温度/火力](../../../designs/cocoa-03-ui/previews/brewing-390.png)、[底部暂停/换位](../../../designs/cocoa-03-ui/previews/brewing-390-bottom.png) |
| 暂停、断线 | [暂停 320px](../../../designs/cocoa-03-ui/previews/paused-320.png)、[断线 320px](../../../designs/cocoa-03-ui/previews/offline-320.png) |
| 分杯与作品 | [命名 320px](../../../designs/cocoa-03-ui/previews/pouring-320.png)、[历史桌面](../../../designs/cocoa-03-ui/previews/collection-1024.png) |
| 递杯 | [390px](../../../designs/cocoa-03-ui/previews/offer-390.png)、[底部](../../../designs/cocoa-03-ui/previews/offer-390-bottom.png) |
| 交换、碰杯 | [交换 320px](../../../designs/cocoa-03-ui/previews/swap-320.png)、[碰杯 390px](../../../designs/cocoa-03-ui/previews/cheers-390.png) |

## 接入注意与未验项

1. `set-input` 的续期不在面板内。整合控制器需维护个人意图、500ms 续期、递增 seq、1.5s 服务端有效期；stop 不能排在普通请求后。面板提供 release-input，但不能替代控制器处理断网、租约更换和旧回调保护。
2. join 需要映射真实入工位动作。不能先本地向 participants 填上两位固定身份，再假装加入成功；对方的预留杯与参与制作是不同事实。
3. `portion` 映射 finish。UI 不承诺幂等事务或持久化已完成；只接确认 recipe/cups。`createdAtLabel` 用真实创建日期；`makers` 严格来自服务端。
4. 逐杯/邀请权限由适配器提供。历史 claimed 不等于 heldBy；heldBy 仅从当前确认的房间手持状态映射。碰杯反馈仅来自服务器已确认事件，发起邀请不能本地提前播放成功。
5. 打开/关闭 CocoaPanel 时由父层发面板事件并暂停/恢复游戏输入；React 不读取 canvas。杯子图标是 DOM 控件图标，不替代 ART 料理台/手持动作资产。
6. 尚未做应用内真实双 Cookie、WebSocket、服务重启恢复、抢工位/输入乱序、数据库保存/重试/作品回看、实际角色遮挡、手机软键盘/真机、线上验收。离线原型不代表这些已通过。
7. 未切分支、暂存、提交、推送或部署；没有使用重置卡、付费额度或换账号/模型。保留所有同伴改动。

READY 写出后本包冻结，后续适配与定向返工权移交 HOME-02/暖饮整合者；不等待其他任务，也不跨对话发消息。
