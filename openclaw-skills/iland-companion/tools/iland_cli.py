#!/home/donut/.openclaw/tools-venv/bin/python
"""I-land 小岛伴侣统一领域 CLI（纯标准库，按工作区凭证自动绑定当前岛民身份）。"""

from __future__ import annotations

import argparse
import calendar
import sys
from datetime import date as Date, datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from _iland_http import IlandCliError, api_request, emit_json, load_config, upload_image

SHANGHAI_TZ = timezone(timedelta(hours=8))


def _today_iso() -> str:
    return datetime.now(SHANGHAI_TZ).date().isoformat()


def _month_bounds() -> tuple[str, str]:
    today = datetime.now(SHANGHAI_TZ).date()
    last_day = calendar.monthrange(today.year, today.month)[1]
    return Date(today.year, today.month, 1).isoformat(), Date(today.year, today.month, last_day).isoformat()


def _mask_unread_letter(letter: dict[str, Any], *, reveal: bool = False) -> dict[str, Any]:
    if letter.get("unread") and not reveal:
        masked = dict(letter)
        masked["body"] = ""
        masked["body_masked"] = True
        masked["hint"] = "对方未拆封信件，默认不暴露正文以保护火漆仪式感；用户明确要求代读时可加 --reveal"
        return masked
    return letter


def _cmd_digest(cfg: dict[str, str], args: argparse.Namespace) -> dict[str, Any]:
    data = api_request(cfg, "GET", "/api/agent/digest", query={"upcoming_days": args.upcoming_days})
    return {"ok": True, "digest": data}


def _cmd_rooms(cfg: dict[str, str], args: argparse.Namespace) -> dict[str, Any]:
    data = api_request(cfg, "GET", "/api/agent/digest")
    return {"ok": True, "actor": data.get("actor"), "rooms": data.get("rooms")}


def _cmd_study(cfg: dict[str, str], args: argparse.Namespace) -> dict[str, Any]:
    if args.action == "status":
        res = api_request(cfg, "GET", "/api/study/overview")
        return {"ok": True, **res}
    if args.action == "stats":
        query = {"days": args.days, "limit": args.limit}
        res = api_request(cfg, "GET", "/api/study/sessions", query=query)
        return {"ok": True, **res}
    raise IlandCliError(f"未知 study 操作：{args.action}")


def _cmd_lighthouse(cfg: dict[str, str], args: argparse.Namespace) -> dict[str, Any]:
    if args.action == "get":
        return {"ok": True, **api_request(cfg, "GET", "/api/lighthouse")}
    body = {"preset": args.preset, "message": args.message or ""}
    return {"ok": True, **api_request(cfg, "PUT", "/api/lighthouse", payload=body)}


def _cmd_letters(cfg: dict[str, str], args: argparse.Namespace) -> dict[str, Any]:
    if args.action == "list":
        res = api_request(cfg, "GET", "/api/letters")
        items = [_mask_unread_letter(x, reveal=False) for x in res.get("letters", [])]
        if args.unread:
            items = [x for x in items if x.get("unread")]
        return {"ok": True, "unread_count": res.get("unread_count", 0), "letters": items}
    if args.action == "get":
        res = api_request(cfg, "GET", f"/api/letters/{args.id}")
        return {"ok": True, "letter": _mask_unread_letter(res["letter"], reveal=args.reveal)}
    if args.action == "send":
        pages = [upload_image(cfg, p)["urls"]["display"] for p in (args.image or [])]
        payload = {
            "date": args.date or _today_iso(),
            "title": args.title,
            "excerpt": args.excerpt or "",
            "body": args.body or "",
            "theme": args.theme or "",
            "pages": pages,
        }
        res = api_request(cfg, "POST", "/api/letters", payload=payload)
        return {"ok": True, "letter": res["letter"]}
    if args.action == "mark-read":
        res = api_request(cfg, "POST", f"/api/letters/{args.id}/read")
        return {"ok": True, "letter": res["letter"]}
    if args.action == "delete":
        api_request(cfg, "DELETE", f"/api/letters/{args.id}")
        return {"ok": True, "deleted_id": args.id}
    raise IlandCliError(f"未知 letters 操作：{args.action}")


def _cmd_anniversaries(cfg: dict[str, str], args: argparse.Namespace) -> dict[str, Any]:
    if args.action == "list":
        return {"ok": True, **api_request(cfg, "GET", "/api/anniversaries")}
    if args.action == "upcoming":
        data = api_request(cfg, "GET", "/api/agent/digest", query={"upcoming_days": args.days})
        return {"ok": True, "upcoming_anniversaries": data.get("upcoming_anniversaries", [])}
    if args.action == "add":
        payload = {
            "name": args.name,
            "date": args.date,
            "repeat": args.repeat,
            "icon": args.icon,
            "color": args.color,
            "style": args.style,
            "note": args.note or "",
            "pinned": bool(args.pinned),
        }
        res = api_request(cfg, "POST", "/api/anniversaries", payload=payload)
        return {"ok": True, "anniversary": res["anniversary"]}
    if args.action == "update":
        current = api_request(cfg, "GET", f"/api/anniversaries/{args.id}")["anniversary"]
        payload = {
            "name": args.name if args.name is not None else current["name"],
            "date": args.date if args.date is not None else current["date"],
            "repeat": args.repeat if args.repeat is not None else current["repeat"],
            "icon": args.icon if args.icon is not None else current["icon"],
            "color": args.color if args.color is not None else current["color"],
            "style": args.style if args.style is not None else current["style"],
            "note": args.note if args.note is not None else current["note"],
            "pinned": current["pinned"] if args.pinned is None else bool(args.pinned),
        }
        res = api_request(cfg, "PUT", f"/api/anniversaries/{args.id}", payload=payload)
        return {"ok": True, "anniversary": res["anniversary"]}
    if args.action == "delete":
        api_request(cfg, "DELETE", f"/api/anniversaries/{args.id}")
        return {"ok": True, "deleted_id": args.id}
    raise IlandCliError(f"未知 anniversaries 操作：{args.action}")


def _cmd_memories(cfg: dict[str, str], args: argparse.Namespace) -> dict[str, Any]:
    if args.action == "list":
        default_start, default_end = _month_bounds()
        query = {"start": args.start or default_start, "end": args.end or default_end}
        return {"ok": True, **api_request(cfg, "GET", "/api/memories", query=query)}
    if args.action == "trash":
        return {"ok": True, **api_request(cfg, "GET", "/api/memories/deleted")}
    if args.action == "add":
        att_ids = [upload_image(cfg, p)["id"] for p in (args.image or [])]
        payload = {
            "date": args.date or _today_iso(),
            "title": args.title or "",
            "description": args.desc or "",
            "mood": args.mood or "",
            "weather_type": args.weather_type or "",
            "weather_note": args.weather_note or "",
            "location": args.location or "",
            "attachments": att_ids,
            "client_id": args.client_id or f"agent-{uuid4().hex[:16]}",
        }
        res = api_request(cfg, "POST", "/api/memories", payload=payload)
        return {"ok": True, "memory": res["memory"]}
    if args.action == "update":
        cur = api_request(cfg, "GET", f"/api/memories/{args.id}")["memory"]
        new_atts = [upload_image(cfg, p)["id"] for p in (args.add_image or [])]
        weather = cur.get("weather") or {}
        payload = {
            "date": args.date if args.date is not None else cur["date"],
            "title": args.title if args.title is not None else cur["title"],
            "description": args.desc if args.desc is not None else cur["description"],
            "mood": args.mood if args.mood is not None else cur["mood"],
            "weather_type": args.weather_type if args.weather_type is not None else weather.get("type", ""),
            "weather_note": args.weather_note if args.weather_note is not None else weather.get("note", ""),
            "location": args.location if args.location is not None else cur["location"],
            "attachments": list(cur.get("attachments") or []) + new_atts,
            "version": cur["version"],
        }
        res = api_request(cfg, "PUT", f"/api/memories/{args.id}", payload=payload)
        return {"ok": True, "memory": res["memory"]}
    if args.action == "delete":
        api_request(cfg, "DELETE", f"/api/memories/{args.id}")
        return {"ok": True, "deleted_id": args.id}
    if args.action == "restore":
        res = api_request(cfg, "POST", f"/api/memories/{args.id}/restore")
        return {"ok": True, "memory": res["memory"]}
    raise IlandCliError(f"未知 memories 操作：{args.action}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="iland_cli.py", description="I-land 小岛伴侣统一 CLI")
    parser.add_argument("--pretty", action="store_true", help="格式化缩进输出 JSON")
    sub = parser.add_subparsers(dest="domain", required=True)

    p_digest = sub.add_parser("digest", help="拉取全岛状态速览")
    p_digest.add_argument("--upcoming-days", type=int, default=14)

    p_rooms = sub.add_parser("rooms", help="只读查看海边、客厅与阁楼书房状态")
    p_rooms.add_subparsers(dest="action", required=True).add_parser("status")

    p_study = sub.add_parser("study", help="星光阁楼书房（双人自习室）状态与共学统计")
    study_sub = p_study.add_subparsers(dest="action", required=True)
    study_sub.add_parser("status", help="查看当前书房在场、双方番茄钟与今日概览")
    study_stats = study_sub.add_parser("stats", help="查看近期共学时长与专注足迹记录")
    study_stats.add_argument("--days", type=int, default=7)
    study_stats.add_argument("--limit", type=int, default=20)

    p_lh = sub.add_parser("lighthouse", help="灯语信号塔")
    lh_sub = p_lh.add_subparsers(dest="action", required=True)
    lh_sub.add_parser("get")
    lh_set = lh_sub.add_parser("set")
    lh_set.add_argument("--preset", required=True, choices=["amber", "coral", "lavender", "sea", "ivory"])
    lh_set.add_argument("--message", default="")

    p_let = sub.add_parser("letters", help="小屋信箱")
    let_sub = p_let.add_subparsers(dest="action", required=True)
    let_ls = let_sub.add_parser("list")
    let_ls.add_argument("--unread", action="store_true")
    let_get = let_sub.add_parser("get")
    let_get.add_argument("id", type=int)
    let_get.add_argument("--reveal", action="store_true")
    let_send = let_sub.add_parser("send")
    let_send.add_argument("--title", required=True)
    let_send.add_argument("--date", default="")
    let_send.add_argument("--excerpt", default="")
    let_send.add_argument("--body", default="")
    let_send.add_argument("--theme", default="classic", choices=["classic", "seaside", "blossom", "qixi"])
    let_send.add_argument("--image", action="append", default=[])
    let_sub.add_parser("mark-read").add_argument("id", type=int)
    let_sub.add_parser("delete").add_argument("id", type=int)

    p_ann = sub.add_parser("anniversaries", help="记忆日历纪念日")
    ann_sub = p_ann.add_subparsers(dest="action", required=True)
    ann_sub.add_parser("list")
    ann_up = ann_sub.add_parser("upcoming")
    ann_up.add_argument("--days", type=int, default=30)
    ann_add = ann_sub.add_parser("add")
    ann_add.add_argument("--name", required=True)
    ann_add.add_argument("--date", required=True)
    ann_add.add_argument("--repeat", default="yearly", choices=["yearly", "monthly", "once"])
    ann_add.add_argument("--icon", default="heart")
    ann_add.add_argument("--color", default="rose")
    ann_add.add_argument("--style", default="letter")
    ann_add.add_argument("--note", default="")
    ann_add.add_argument("--pinned", action="store_true")
    ann_upd = ann_sub.add_parser("update")
    ann_upd.add_argument("id", type=int)
    ann_upd.add_argument("--name")
    ann_upd.add_argument("--date")
    ann_upd.add_argument("--repeat", choices=["yearly", "monthly", "once"])
    ann_upd.add_argument("--icon")
    ann_upd.add_argument("--color")
    ann_upd.add_argument("--style")
    ann_upd.add_argument("--note")
    ann_upd.add_argument("--pinned", action=argparse.BooleanOptionalAction, default=None)
    ann_sub.add_parser("delete").add_argument("id", type=int)

    p_mem = sub.add_parser("memories", help="每日记忆卡")
    mem_sub = p_mem.add_subparsers(dest="action", required=True)
    mem_ls = mem_sub.add_parser("list")
    mem_ls.add_argument("--start", default="")
    mem_ls.add_argument("--end", default="")
    mem_sub.add_parser("trash")
    mem_add = mem_sub.add_parser("add")
    mem_add.add_argument("--date", default="")
    mem_add.add_argument("--title", default="")
    mem_add.add_argument("--desc", default="")
    mem_add.add_argument("--mood", default="")
    mem_add.add_argument("--weather-type", default="")
    mem_add.add_argument("--weather-note", default="")
    mem_add.add_argument("--location", default="")
    mem_add.add_argument("--image", action="append", default=[])
    mem_add.add_argument("--client-id", default="")
    mem_upd = mem_sub.add_parser("update")
    mem_upd.add_argument("id", type=int)
    mem_upd.add_argument("--date")
    mem_upd.add_argument("--title")
    mem_upd.add_argument("--desc")
    mem_upd.add_argument("--mood")
    mem_upd.add_argument("--weather-type")
    mem_upd.add_argument("--weather-note")
    mem_upd.add_argument("--location")
    mem_upd.add_argument("--add-image", action="append", default=[])
    mem_sub.add_parser("delete").add_argument("id", type=int)
    mem_sub.add_parser("restore").add_argument("id", type=int)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    handlers = {
        "digest": _cmd_digest,
        "rooms": _cmd_rooms,
        "study": _cmd_study,
        "lighthouse": _cmd_lighthouse,
        "letters": _cmd_letters,
        "anniversaries": _cmd_anniversaries,
        "memories": _cmd_memories,
    }
    try:
        cfg = load_config()
        result = handlers[args.domain](cfg, args)
        emit_json(result, pretty=args.pretty)
        return 0
    except IlandCliError as err:
        emit_json({"ok": False, "status": err.status, "error": err.message}, pretty=args.pretty)
        return 1


if __name__ == "__main__":
    sys.exit(main())
