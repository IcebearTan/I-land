# ROOM-02 / HOME-02 实施协议

2026-11-06，阶段 A。实现与验收结果另记，不以本协议代表完成。

- 房间 ID：`seaside` 与 `interior`。沿用 Cookie 稳定身份、Origin 校验、单 worker 内存租约（30s）、10s 心跳、独立 WS 全量快照。两房间共用一把短同步锁，数据库/网络边界沿用现有实现。
- 每位身份同时最多持有一个房间租约。新房间 join 在鉴权、身份/代数校验后原子释放本人的另一房间租约，通知旧流并更新旧房间；迟到 leave/disconnect 仍按 lease/socket 精确匹配。
- 新客户端 join 额外提供内存 `page_id`、递增 `entry_generation`，二者成对出现；同页面切场景单调递增，重连保持进场代数、增加 connection_generation。同页旧进场 join 拒绝，不能重新接管新房间。保留旧海边客户端接口兼容；同账号另页接管仍关闭旧连接，旧页不得自动夺回。
- 小屋 join 默认为 `pose: standing, seat: null`，表示在屋内自由活动，位置不广播。只有 `pose: seated, seat: 0|1` 的确认成员可以绘制远端人物；起身不宣称离开屋子。
- 小屋 `PUT /api/rooms/interior/seat`：`lease_id, seat: 0|1|null`。锁内检查目标是否空闲；冲突 409 `seat_occupied` 带当前快照，不移动任何人。null 释放座位并保持成员身份。相同座位幂等。
- 小屋 `PUT /api/rooms/interior/television`：`lease_id, version, action: toggle|next`。新 `RoomTelevision` 表只有共享开关、频道 0–2、position_ms、anchor_utc_ms、version、changed_by。24 秒节目按服务器真实 UTC + 客户端单调时间播放，不使用海边景色时钟。关机保存进度，开机从保存点继续；换台从新节目 0 开始，关机时拒绝换台。
- 电视写入使用数据库 `UPDATE ... WHERE version=?` CAS；冲突 409 `television_conflict` 带最新快照。成员即使未入座也可从电视前操作；服务端不伪造未同步的位置权限。进屋只读现状，不重置；重启只恢复电视，成员清空。
- 小屋快照：`room, epoch, revision, server_now_ms, television, members`。成员仅公开 user_id/account/display/sprite/pose/seat，不公开租约或会话。前端校验身份、唯一座位、epoch/revision/电视 version；WS 首帧确认前不画同伴、不启用共享操作。
- 断线/后台/过期/接管清理未确认成员与坐姿，恢复后重新确认。共享操作不乐观更改电视或坐姿；失败显示可恢复状态。个人音频设置不入房间快照。
- 跨层仍通过 EventBus。Phaser 负责位置、脚锚、碰撞和确认人物；React 只展示成员、连接状态与控制按钮。
- 阶段 B 前只准备适配；核对 UI 与 ART 的 READY.json 版本、文件路径、尺寸/接口说明和检查证据后接入最终素材。2026-11-07 用户更新：不再生成或重算交接哈希，不跑全量回归；只运行改动与直接依赖的明确测试文件及必要类型检查/构建。此前已完成的全量检查保留为当时证据，不因此重跑。唯一最终构建/浏览器验收由本对话执行。
