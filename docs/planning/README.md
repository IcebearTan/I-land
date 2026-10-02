# I-land 开发规划中心

所有阶段计划、功能评估与验收记录统一放在本目录。声音、场景框架与双人看海已本地实现；当前执行顺序：
**小屋室内 → 真机/线上验收**。
2026-10-01 按用户新需求调整优先级；M2 写信回信及其余原路线保留在后续队列，发布的数据保护要求继续适用。

## 阅读入口

| 文档 | 用途 | 谁需要读 |
| --- | --- | --- |
| [CURRENT_STATE.md](CURRENT_STATE.md) | 当前实现、部署状态、证据与未验证事项 | 开工与交接前必读 |
| [ROADMAP.md](ROADMAP.md) | 阶段顺序、依赖、范围和模型分工建议 | 规划下一阶段时 |
| [NEXT_STAGE_EXPERIENCE.md](NEXT_STAGE_EXPERIENCE.md) | 当前阶段：声音、双人看海、可调景色 tick、小屋；任务包与验收 | 当前执行入口 |
| [NEXT_STAGE_M2.md](NEXT_STAGE_M2.md) | 后续双向信箱产品规则、接口与任务包 | 执行 M2 时 |
| [ACCEPTANCE.md](ACCEPTANCE.md) | 可靠性与 M2 验收清单；当前新体验发布用 EXP-QA | M2 测试与共用数据保护参考 |
| [evaluations/2026-09-30-progress-review.md](evaluations/2026-09-30-progress-review.md) | 整理前的功能评估与建议快照 | 查历史结论时 |
| [evaluations/2026-09-30-mailbox-import-preview.md](evaluations/2026-09-30-mailbox-import-preview.md) | 真实旧信本地迁入与阅读预览记录 | 查看迁入范围与展示方案时 |
| [evaluations/2026-10-01-characters-and-login-names.md](evaluations/2026-10-01-characters-and-login-names.md) | 双人角色重绘与名字同步登录账号 | 查看角色来源与改名兼容策略时 |
| [evaluations/2026-10-01-progress-and-experience-plan.md](evaluations/2026-10-01-progress-and-experience-plan.md) | 本轮代码盘点、61/10 项检查与新主线调整依据 | 查看实际进度与检查边界时 |
| [evaluations/2026-10-01-audio-implementation.md](evaluations/2026-10-01-audio-implementation.md) | 默认开启、设置内音量、昼夜音乐及鸟鸣/虫鸣/海浪，82/9/10 项检查 | 当前声音实现与验收边界 |
| [evaluations/2026-10-02-seaside-implementation.md](evaluations/2026-10-02-seaside-implementation.md) | 单人海天构图、坐姿、场景导航/时钟、41 项前端检查、模拟手机 | 当前看海实现与双人接入边界 |
| [evaluations/2026-10-02-shared-seaside.md](evaluations/2026-10-02-shared-seaside.md) | 真实双人入座/依靠、共享时钟、租约与重连；118 项后端 / 70 项前端检查 | 当前双人看海实现与本地/线上边界 |
| [archive/2026-09-28-memory-plan.md](archive/2026-09-28-memory-plan.md) | 上一阶段记忆卡方案及实施记录 | 查设计缘由和旧验收时 |

项目规范仍见根目录 [AGENTS.md](../../AGENTS.md) 与 [DESIGN.md](../../DESIGN.md)。
实际部署、改密、备份与恢复命令见 [运维手册](../OPERATIONS.md)。
运维手册是操作指南，不混入历史规划；根 README 保留简明里程碑。

## 使用规则

1. 开新任务先读当前状态与对应阶段计划，不直接执行历史文件里的待办。
2. 当前结论更新 `CURRENT_STATE.md`；任务清单更新阶段计划；实际验收写进 `evaluations/`。
3. 「代码已实现」「本地检查通过」「用户确认部署」「真机/线上验收通过」分开记录。未执行项目不勾选。
4. 完成一个任务包，记录改动、验证、限制与提交，再更新根 README 里程碑；不能因一部分完成就勾选整个 M2。
5. 阶段结束后将其计划归档，更新本页的执行入口。历史记录保留原日期与结论，不用新结果覆盖旧测试记录。
6. 验收文件命名为 `YYYY-MM-DD-主题.md`，不写服务器密码、Cookie、真实信件正文或照片。日期用实际执行日期。
7. 默认每次只交给执行模型一个任务包，串行合并；本文件不要求并行代理开发。

## 整理记录

2026-09-30：根目录 `DEVELOPMENT_PLAN.md` 移入 `archive/`；
`docs/PROGRESS_AND_NEXT_STAGE.md` 移入 `evaluations/`。保留原内容，并修正迁移后的路径。
新阶段任务尚未实施；本次工作只整理文档与制定计划。

2026-10-01：核对 c2c0097 及前两轮角色/旧信交付，重新执行自动检查；新建体验阶段计划，更新当前状态/路线与根设计入口。三个新功能尚未实施。

2026-10-01 后续实施：SOUND-01 已本地实现。按用户新反馈改为默认开启、登录页轻音乐、音量收进设置、昼夜编配与虫鸣交接；更新当前状态，保留先前规划盘点作为历史证据。

2026-10-02：按首轮试听反馈，移除像消息提示音的合成虫鸣，替换为 CC0 午夜蟋蟀实录循环；作者/许可与源文件入库，重新通过前端构建及声音测试，后续听感/真机/线上验收继续保留。

2026-10-02 后续：SCENE-01 + SEA-01 本地完成；新建单人看海全景、两位角色各自的坐姿/站姿、内存景色时钟和避开人物的控件；主岛入口/安全返回接通。真实双人共处与小屋继续列为待开发，真机/线上仍未验收。

2026-10-02 双人接入：ROOM-01 + SEA-02 已本地实现。隔离 Cookie 的两位身份可先后入座、依靠、共同调速；REST 持久化景色时钟，成员/姿势使用单 worker 内存租约。自动与浏览器证据写入本轮评估，下一开发包 HOME-01；真机与线上 WSS 保留待验。
