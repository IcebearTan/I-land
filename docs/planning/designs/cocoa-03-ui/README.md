# 热可可 · 受控面板与本地规则原型

2026-11-07，交付版本 `cocoa-ui-v1.1`，最终对齐 **`cocoa-protocol-v1.1`**。

打开 [index.html](index.html) 可以试玩独立规则原型。它只使用本机模拟：A/B 是演示视角，不代表真实在线用户；不调用游戏 API，不保存真实作品。组件接入游戏后使用服务端数据和 `mode="live"`，不能把此原型的模型当成联机实现。

## 展示顺序

发起 / 明确加入 → 选自己的杯型和 0–3 种配料 → 选择工位 → 小火/中火/关火与轻搅配合 → 暂停或继续 → 分杯并命名 → 领取 / 递杯回应 / 碰杯邀请 → 作品回看。

- 奶油/青绿两种杯型；棉花糖、可可粉、肉桂可组合，也可原味。另一位的杯子可看，不可代改。
- 制作时温度、进度和自己的操作相邻，工位成员信息使用紧凑行；杯子选择收起为次要入口，避免正常玩法变成长控制台。
- 控温和搅拌都不要求连续点击；输入续期属于真实控制器，组件只发起或停止意图。搅拌有独立“停下”按钮，不依赖上一条输入是否已经确认。
- 交换工位、递杯、碰杯都有明确回应。点击请求不会立即换位置、领取杯子或显示碰杯成功。
- 成果的制作人、日期、领取和手持状态来自传入数据；单人制作不会把预留杯的另一位算作制作人。

## 组件入口

```tsx
import { CocoaPanel, type CocoaPanelState, type CocoaAction } from './cocoa/ui'

<CocoaPanel
  open={open}
  state={mappedViewState}
  onAction={handleCocoaIntent}
  mode="live"
/>
```

组件自己的接口定义在 `frontend/src/cocoa/ui/types.ts`，不 import 公共房间网络类型，不修改协议。`open/state/onAction` 完全受控；配方名、当前页、选中的杯子和选择区展开状态也由父层维护。默认 mode 为 live；独立原型明确传 prototype，所有预览都有“规则原型”标记。

父层打开/关闭面板时负责现有 `PANEL_OPENED/PANEL_CLOSED` 与游戏输入停用。组件复用 `useDialogFocus` 管理 Tab/Esc 和焦点返回，不直接访问 Phaser。

### 快照映射

| UI 字段 | 真实来源与限制 |
| --- | --- |
| `sessionId` | 当前 run id 的字符串表示；无局为 null。组件阶段使用 **pouring**，已经和服务端一致，不再需要 portioning 别名。 |
| `self` | Cookie/当前租约确认的稳定 account 与当前显示名。 |
| `participants` | 只传真实明确加入者；`presence` / `station` 来自确认的料理/房间状态。不要用 visits 或两个固定名字填满在场成员。 |
| `choices` | 两位固定收件人的杯型与 ingredients；预留杯不代表已加入。`editableCups` 仅包含当前自己，按真实阶段/权限传入。 |
| `temperature/progress/idealRange` | 服务端确认值；progress 是 0–100，未取到传 null。适宜区当前为 `[42,68]`。组件不推进、不插值、不判定成功。 |
| `inputMode` | 控制器管理的个人输入意图：`gentle/heat/stir/stop`。可及时反映用户意图以允许停止，但不能据此推断温度、进度或确认动画。 |
| `allowedActions` | 当前真实条件允许的动作名。普通按钮受 `pending` 阻塞；**set-input 不受普通 pending 阻塞**。不要因为普通请求 pending 就从权限里删除 set-input。 |
| `invitations` | 服务端确认的 swap/cheers offer，包含不可猜测 id、from/to 和该用户可接受/拒绝/取消的权限。pass offer 放在对应杯子的 `offer` 中。 |
| `result/collection.items` | 真实配方与两杯成果；makers 只来自真实制作记录，createdAtLabel 使用真实服务端创建时间，不用景色时钟。 |
| `cup.claimed` | 持久领取记录。`heldBy` 只在当前房间确认该人手持这杯时填写；历史领取不能填成当前在线手持。离线历史通常 `heldBy:null`、allowedActions 为空。 |
| `issue/toastFeedback` | 冲突/错误和已确认碰杯事件的文案。不能在发请求后立即写成功文案。 |

### 动作映射建议

| CocoaAction | 整合者处理 |
| --- | --- |
| `start` | `action:start`，由控制器生成/复用 request_id。已完成后可再发起；不清除旧作品。 |
| `join` / `choose-station` | 明确加入 / `action:station`。协议没有独立 join 请求时，由整合器映射到一个真实可加入的工位，不能只在本地添加 participant。空位竞争按服务器冲突反馈。 |
| `set-cup` / `set-ingredients` | `action:choice`，先验证 owner 等于当前稳定 account；ingredients 去重、最多三种。UI 已防止重复勾选，服务端仍是最终校验者。 |
| `begin/pause/resume/leave` | 同名阶段/离开动作。输入必须在阶段、工位、租约变化时清理。 |
| `set-input` | `action:input` 的 `mode:gentle/heat/stir/stop`。见下方续期约定。 |
| `swap-stations` / `toast` | `offer.kind:swap/cheers`；不本地交换或播放确认动作。 |
| `respond-invitation` / `cancel-invitation` | `respond/cancel`，使用传回的 offerId；过时 offer 不能替换成新 id 重试。 |
| `portion` | `action:finish`，提交 1–40 字 name，只有服务端结果到达后才显示 complete/result。 |
| `claim/offer/accept-offer/decline-offer/cancel-offer` | 当前杯子的 claim / pass offer / respond / cancel。cupId、offerId 都来自快照；只给真实权限，不能推断对方已接杯。 |
| `show-activity/show-collection/select-recipe` | 父层切展示页；必要时取私密列表/详情。`select-recipe` 的空字符串表示返回列表。 |
| `select-cup/set-choices-open/change-recipe-name` | 父层临时展示/草稿状态，不能每次输入就发保存成功或创建成果。 |
| `refresh` | 重新取最新状态/显式重入/重新登录，按 connection 状态决定；UI 不擅自抢占租约。 |
| `close/release-input` | 先取消输入续期，再结束意图/关闭面板；不要等待普通按钮请求结束。 |

输入续期约定：父控制器收到 set-input 后维护自己的当前意图，前台每 500ms 续期，发送递增 seq；stop 也必须拥有更新的 seq。**先取消续期，再发 stop；不能等旧输入 HTTP 返回才松手。** 后端 1.5 秒超时、租约/代数与 seq 拒绝迟到输入。组件在 blur、hidden、换局/换身份/切展示页的清理、卸载以及关闭时发送 release-input，携带捕获的 sessionId/account；父层必须绑定原生命周期，不能让旧清理停止新租约。重复 stop 按幂等意图处理。

## 本地规则原型

`prototype-model.ts` 只服务这张演示页和定向测试，不被游戏入口引用。原型使用 v1.1 的初温 24°C、范围 20–85°C、小火 +1.8 / 中火 +4 / 关火 −0.3 °C/s、搅拌额外 −1.3、适宜区 42–68°C、适宜区搅拌 8%/s。它演示热度与搅拌相互影响、单人顺序操作、无进度倒退、暂停、明确回应和不伪造制作人。

原型不模拟 Cookie、真实租约、WebSocket、数据库事务、输入网络 seq 或重启恢复；不能用原型测试代替服务端可靠性验收。切 A/B 只是切换同一页面的演示视角，不是两台设备或两个独立 Cookie。

试玩单人：发起 → 选杯/配料 → 控温工位 → 开始 → 中火升至约 65°C → 换搅拌工位 → 轻搅 → 分杯。工位切换会停止旧输入。试玩双视角：切 B 明确加入另一工位，再观察搅拌降温与融合进度；交换和碰杯需切到接收者接受。

## 构建与离线预览

已有 `build/preview.js` / `build/preview.css`，index.html 可直接离线打开。需要修改原型时在仓库根目录执行：

```bash
frontend/node_modules/.bin/tsc -p docs/planning/designs/cocoa-03-ui/tsconfig.json --noEmit
NODE_PATH="$PWD/frontend/node_modules" frontend/node_modules/.bin/esbuild docs/planning/designs/cocoa-03-ui/prototype.tsx --bundle --outfile=docs/planning/designs/cocoa-03-ui/build/preview.js --jsx=automatic --minify
node --test frontend/src/cocoa/ui/cocoa-panel.test.mjs
```

`render-previews.mjs` 使用独立临时 profile 的 headless Chrome，只打开本目录 file:// 页面，固定真实 CSS 视口；不连接/控制应用浏览器、不访问游戏 API。它导出 10 个阶段样本和其中 3 个底部位置，保存 CSS 视口、面板边界、字号与操作尺寸。仅在受影响的视觉改动需要复验时使用，不替代整合者的真实双会话验收。

## 窄屏与展示边界

- 面板最大 720px，左右至少 12px；320px 时为 296px 宽。正文/输入 16px，操作 14px，辅助 12px，触控至少 44px。
- 选择、错误和长名字自然换行，长步骤在面板内滚动。正常制作把温度与操作放在一起；作品/历史不和所有制作按钮同时铺开。
- 所有原型预览保留“规则原型”标识。静帧、手绘 UI 杯子图标和本地模拟均不是已接入游戏美术、真实在线或已保存成果的证明。
- 实际游戏中的输入续期、双 Cookie、服务重启、租约接管、触屏、软键盘、安全区、角色/料理台遮挡由整合者继续验证。写 READY 后本目录与组件冻结，由整合者接管修补。
