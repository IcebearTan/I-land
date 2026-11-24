# WARM-DRINK-03 · 权威玩法协议

2026-11-07，版本 `cocoa-protocol-v1.1`。先固定最小规则，再实现；本文件不代表完成验收。UI 继续提供受控组件，最终通过 EventBus/整合适配器连接。

## 规则与阶段

- 房间仍是 `interior`，使用已有 Cookie、稳定账号 bear/her、当前租约和进场/连接代数。料理仅在两个固定工位发生：`heat`（控温）、`stir`（搅拌）。做料理与坐沙发互斥；远端只画确认工位人物，不虚构其走到台前的轨迹。
- 阶段：`preparing → brewing ↔ paused → pouring → complete`；无当前局时为 idle。准备、暂停、分杯都可以长期保留。完成后可发起下一局，历史配方/杯子仍可回看。
- 初温 24°C，夹在 20–85°C。控温选择小火 +1.8°C/s 或中火 +4°C/s，关火自然缓降 −0.3°C/s；持续搅拌额外 −1.3°C/s。适宜区 **42–68°C**；此区内实际搅拌以 **8%/s** 增长进度。区外进度不倒退，过热不烧毁、不扣分。
- 这使两种操作相互影响：一直加热会越过温区，搅拌一面推进一面降温；控温者可以关小火或关火。一人可先加热到约65°C，再换到搅拌，顺序完成；不要求同时有两个人按住。
- 服务器每250ms推进；单次最多承认0.5秒，调度间隔超过2秒则安全暂停，不补算睡眠/断线时间。连续15秒无实际输入自动暂停，温度/进度保留。
- 操作采用开关，不用密集点击或一直按住；前台输入意图每500ms续期，服务端最长有效 **1.5秒**。`seq` 按租约单调递增，包括 stop，旧续期不能覆盖较新的松手。后台、断网、工位离开、换号、租约更换均结束持续输入；任何操作方离开时制作安全暂停。

## 选择、工位和保存

- 每人只配置自己那杯：`cup_type=cream|teal`，`ingredients` 从 marshmallow/cocoa/cinnamon 中选0–3种、不可重复。默认奶油杯/原味；未参与者也有预留杯，但不会被记为制作人。完成前允许晚加入者修改自己的选择，不改变另一人的字段。
- 工位空闲时可选择/切换；对方占用时请求交换，由对方回应后原子互换并停止双方输入。拒绝、取消、离开不会改变现有工位。
- `start` 带 UUID `request_id`；同一请求不创建第二局，当前有未完成局时返回它。阶段/选择/恢复信息由 REST 操作保存，服务器的权威推进落盘；客户端不能上报 dt、温度、进度或成功标记。
- 离开/后台保留当前制作步骤；重启把 brewing 恢复为 paused，清空输入与在线工位，明确再次加入/继续后操作。没有离线产量。
- 离开料理台会把手中杯子留在作品记录里，持久领取归属不丢；本轮不做可携带的通用背包。

## 成果与杯子

- 真正产生过控温/搅拌效果的人才进入 `makers`，只加入/选杯不冒充制作人。保存稳定 user_id/account；显示名字读取当前共享名字，改名不改归属。
- 进度100%后进入 pouring。填写1–40字配方名再完成；同一局以 `recipe.run_id` 主键和 `(cup.run_id, recipient_id)` 唯一约束，在一个事务内创建 **一份配方、恰好两杯** 并完成本局。重复完成返回原结果，不改名、不复制杯子。
- 配方记录真实创建时间、实际制作人、两杯各自杯型/配料及领取状态。提供简短历史列表/详情；不写入相册或日历，不声称已实现纪念卡。
- 只有杯子的固定收件人可领取；重试领取返回原杯。领取只是设置自己的固定杯归属和台前持杯姿势，不转让给其他用户。
- 递杯是把**对方尚未领取的预留杯**递给对方，双方须真实在场。对方明确接受才标记其领取；取消/拒绝/离开/重启后预留杯仍在，不先从物品表扣除。
- 碰杯须双方真实在工位且各持有本局自己的杯子；发出邀约，对方接受后同时播放确认动作。只记录首次真实碰杯时间，不增发奖励或杯子。

## 接口与快照

新 REST 前缀 `/api/rooms/interior/cocoa`：

- `GET /recipes`：私密历史配方列表（最多20条）；`GET /recipes/{run_id}`：详情。
- `PUT /action`：严格的 action 类型、当前 `lease_id`；制作动作带 `run_id`，选择/阶段切换带版本。动作：`start`、`station`、`leave`、`choice`、`begin`、`pause`、`resume`、`input`、`finish`、`claim`、`offer`、`respond`、`cancel`。
- `input` 只接受 `{run_id, lease_id, seq, mode:gentle|heat|stir|stop}`。独立于普通按钮 pending，可立即发送松手，不等待旧按住响应。
- `offer.kind=swap|pass|cheers`，返回不透明 offer id；`respond` 只有指定接收者可答复。过时请求不得再次交换/接杯/碰杯。

所有成功动作返回最新 `snapshot`，与现有房间客户端一致。冲突409含可理解原因，适用时附最新快照。接口具体字段由后端严格模型固定，前端公共类型由整合者维护，UI组件自己的 props/action 类型通过适配层连接。

`HomeSnapshot` 增加 `cocoa`，成员增加 `station:heat|stir|null`、`held_cup_id:number|null` 和确认的料理动作；海边结构保持原行为。料理快照主要包含：

```text
cocoa.run: null | { id, phase, version, temperature, progress, reason,
                   choices:{bear:{cup_type,ingredients},her:{cup_type,ingredients}},
                   maker_accounts, created_at }
cocoa.operators: [{account, station, intent:gentle|heat|stir|null}]
cocoa.offers: [{id, kind, from_account, to_account, run_id, cup_id?}]
cocoa.recipe: null | {run_id, name, created_at, makers:[{user_id,account,display}],
                     cups:[{id,recipient_id,recipient_account,recipient_display,
                            cup_type,ingredients,claimed}], cheered_at}
cocoa.cheers: null | {id, run_id, until_ms}
```

位置不进此快照；角色位置取已确认工位在 Tiled 中的固定脚锚。台面放在电视右下、沙发右侧的空地，最终尺寸/占地以 ART 交付和可达性验证为准，不重排原房间。

## 生命周期与验证边界

- 料理复用房间协调锁、身份和租约；输入、工位、邀请和手持姿势是临时状态，配方、杯子、选择和进度是持久状态。单 worker 约束继续保留。
- 只运行新状态机/身份/幂等、持续输入、恢复、领取/递杯/取消与直接受影响房间/布局的明确测试文件。必要构建保留，不全量回归或计算交付哈希。
- UI/ART 的 `warm-drink-03` READY 均冻结后接入；真实临时双 Cookie 界面验收一局和单人顺序玩法。全程使用临时 DB/uploads，关闭本轮服务/浏览器后交接。真机/线上另列，不使用额度重置卡。

展示对齐说明：v1.1 对齐已落盘的受控 UI 使用小火/中火/关火与开关式搅拌，输入续期、超时与停止规则不变。配料允许原味或三种之内的组合；服务端只接受当前账号自己的选择。UI 中 portioning 对应服务端 pouring，可由适配层转换。交换与碰杯仍须另一位明确回应。

加入/退出补充：start、station、leave 由场景添加当前房间租约内递增的 activity_seq。较新的退出会封住迟到的加入，不依赖普通请求的 pending；这与持续输入的 seq 分开。快照额外提供 visible_cups（仅确认的手持/递出杯元数据）与短暂 receiving 姿势，接受之前不会画出已收到的杯子。
