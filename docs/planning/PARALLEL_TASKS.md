# 本轮并行任务分工

## 当前批次：第二轮视觉一致性与双人客厅

上一轮三个任务已交付并由主对话本地提交：BASE-01 `a9729f0`、BASE-02 `7ed1f49`、ART-01 `25e1cd8`。均未推送或部署。
当前转入 [VISUAL_ROUND_02](VISUAL_ROUND_02.md)，该文件的写入范围、READY 交接及单一整合者约定优先于下方旧分工。
原客厅对话负责 UI-01，原美术对话负责 ART-02，原备份对话改为 ROOM-02/HOME-02 双人客厅，并负责场景适配与联合验收。UI/ART 写 READY 后向 HOME 对话移交后续整合写入权。当前是安排并行实现，不代表视觉接入或双人客厅已经完成。

## 上一轮分工与创建记录（历史）

更新：2026-11-06。用户明确要求创建几个独立对话并行推进不会冲突的任务，指定 GPT-6 Astra / xhigh / Fast。
本轮沿用本地项目工作区，按写入范围分工。当前已有未提交成果，各对话先读 AGENTS.md、DESIGN.md、CURRENT_STATE.md、NEXT_STAGE_COOP.md 和本文件，不重置或覆盖他人改动。

| 对话任务 | 可修改范围 | 交付 |
| --- | --- | --- |
| BASE-01 客厅功能收尾 | `frontend/` 中现有功能、必要测试与资源；`docs/planning/evaluations/2026-11-06-home-acceptance.md`；截图仅写 `docs/planning/evaluations/assets/home-base-01/` | 修复客厅实际问题，完成本地体验检查、构建和相关测试，记录真机/线上边界 |
| BASE-02 备份恢复可靠性 | `backend/app/backup.py`、`backend/tests/test_backup.py`、必要的新增备份专用测试；`docs/OPERATIONS.md`；`docs/planning/evaluations/2026-11-06-backup-recovery.md` | 拒绝损坏备份、可靠恢复、失败不破坏目标，测试与运维说明 |
| ART-01 壁炉旁精修样板 | 仅 `docs/planning/designs/art-01/` 下的文档、源文件、预览与图片 | 精修日/夜样板、角色/家具比例、材质与资产分层规格，后续接入清单 |

## 共享工作区约定

- 根 README、DESIGN、CURRENT_STATE、ROADMAP、NEXT_STAGE_COOP 等总入口由主对话统一更新，三个任务不要同时修改。
- 并行阶段不切分支，不执行 git add/commit/stash/reset/clean 或推送；每个任务交付文件清单与检查结果，之后由主对话按包整理提交。git status/diff/log 只读检查允许。
- 除任务表中明确拥有的文件，其他文件只读。发现越界需求时先在自己的评估中记录，继续独立可完成部分，不自行跨范围修改。
- `backend/iland.db` 和 `backend/uploads/` 是真实记忆，禁止用于测试、重置或提交；浏览器/API 验证使用临时数据库、临时上传目录。
- 只有 BASE-01 操作应用浏览器和临时验收服务。建议使用本地端口 8031，先确认端口空闲；不关闭他人的服务器或浏览器。
- BASE-02 通过命令行和临时目录验收；ART-01 通过图片/独立源文件渲染验收，不并行控制应用浏览器。
- ART-01 本轮不替换游戏内资产、不改角色/碰撞或场景代码。样板仍可完整制作，不因尚未接入而停在文字建议。
- 依赖使用现有环境；不因本包扩张修改共享锁文件。确有需要写清原因后交由主对话处理。
- 用户只要求启动并行工作，本轮不自动部署线上、不改账号/模型全局配置、不创建更多对话。

## 模型设置

创建对话时明确指定 `model=gpt-6-astra` 与 `thinking=xhigh`。当前本地配置已有 `service_tier=priority`，沿用 Fast 默认配置；创建工具没有单独的 service tier 入参，配置状态与单次请求实际服务档位不能混为一谈。

## 创建记录

三个独立对话已创建，首次状态检查均为 active / inProgress；各自已经开始读取项目与执行任务。
运行上下文已核验三者均为 `gpt-6-astra`、`xhigh`，工作目录均为当前 I-land 项目。Fast 沿用本地默认 `priority` 配置，运行上下文不回传单次实际服务档位。

| 任务 | 对话标识 | 主机 |
| --- | --- | --- |
| BASE-01 | `01a1b16c-9462-7610-84fd-e4a090c33035` | local |
| BASE-02 | `01a1b16c-95df-71e0-a7fa-b7a1fd5ca412` | local |
| ART-01 | `01a1b16c-974d-7200-9f31-b2ee1d5fd24b` | local |
