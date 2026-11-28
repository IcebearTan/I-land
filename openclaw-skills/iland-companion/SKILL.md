---
name: iland-companion
description: I-land 双人像素小岛官方技能。当用户想查看小岛动态、有没有新信或快到的纪念日、切换灯语信号塔、给另一半写信、把照片或日常记到小岛记忆日历、查看对方足迹或海边/客厅在场状态时使用。严格通过本工作区独立凭证调用本机 I-land API，绝不直写数据库。
---

# I-land 小岛伴侣操作规范（Official I-land Companion）

所有小岛读写一律通过 `tools/iland_cli.py` 完成。**严禁直接操作 `iland.db` 或尝试跨工作区读取对方凭证**；CLI 会自动绑定当前工作区 `.iland-agent.json` 对应的岛民身份（小熊或 yearning）。

## 1. 全岛速览与房间只读状态

```bash
# 一次拉取建岛天数、未读信数、灯语信号、近 14 天纪念日、对方足迹与海边/客厅在线状态
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py digest

# 仅查看海边与客厅当前谁在、姿势、海边时间倍率及电视频道
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py rooms status
```

## 2. 灯语信号塔（实时同步对方足迹气泡）

合法 5 档灯色：`amber`（暖金·想你了）、`coral`（珊瑚·来海边）、`lavender`（星紫·晚安）、`sea`（海蓝·在忙中）、`ivory`（月白·静静守候）。灯语最多 48 字。

```bash
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py lighthouse get
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py lighthouse set --preset sea --message "在开会，晚上回来找你"
```

## 3. 小屋信箱

```bash
# 查看信件列表（对方未读信自动遮蔽正文，仅返回标题与信封寄语）
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py letters list
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py letters list --unread

# 查看某封信（对方未读信默认不暴露正文；仅用户明确要求代读才加 --reveal）
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py letters get 12

# 投递新信（theme: classic | seaside | blossom | qixi；可附多张 --image）
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py letters send \
  --title "今晚的风很软" --excerpt "给你留了一点晚霞" --body "正文..." --theme seaside

# 仅在用户明确说“帮我拆开/标为已读”时才调用
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py letters mark-read 12

# 仅能删除自己写的信（删除前须向用户确认）
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py letters delete 12
```

## 4. 记忆日历（纪念日 + 每日记忆卡）

```bash
# 纪念日（repeat: yearly | monthly | once）
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py anniversaries list
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py anniversaries upcoming --days 30
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py anniversaries add \
  --name "在一起两周年" --date 2026-12-05 --repeat yearly --icon heart --color rose --pinned
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py anniversaries update 3 --note "记得订餐厅"
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py anniversaries delete 3

# 每日记忆卡（weather-type: sunny | cloudy | rain | snow | wind | fog；--image 可重复）
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py memories list --start 2026-11-01 --end 2026-11-30
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py memories add \
  --date 2026-11-28 --title "海边散步" --desc "喝了热拿铁" --weather-type sunny --image /path/to/photo.jpg
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py memories update 8 --desc "补充一句"
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py memories delete 8
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py memories trash
/home/donut/.openclaw/tools-venv/bin/python tools/iland_cli.py memories restore 8
```

## 5. 仪式感与安全红线

1. **保护未拆封火漆**：查到对方发来的未读信时，只告知**标题与信封寄语**并邀请用户亲自上岛拆信；**绝不静默调用 `letters mark-read` 或擅自加 `--reveal` 剧透正文**，除非用户明确说“帮我直接读内容 / 标为已读”。
2. **写信先展示草稿**：执行 `letters send` 前，必须先向用户展示标题、日期、寄语和正文草稿，获得确认后再投递。
3. **删除前核对**：执行 `letters delete`、`anniversaries delete`、`memories delete` 前，先向用户核对条目标题与日期。
4. **明确不暴露的真人操作**：改密码、改双方登录名、替真人占海边/客厅座位、伪造在线心跳与裸覆写 `WorldState` 均已在后端禁止，如需调整请引导用户本人上岛操作。
