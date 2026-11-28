"""只读聚合接口：供本机 Donut Agent（及前端）一次拉取全岛核心状态速览。"""

import calendar
from datetime import date as Date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from ..db import get_db
from ..deps import get_current_user
from ..models import Anniversary, Letter, Memory, User, Visit, WorldState, jload
from ..room_runtime import room_runtimes
from ..study_service import summarize_sessions_range
from .lighthouse import _get_or_init as get_lighthouse_row
from .lighthouse import _serialize as serialize_lighthouse

router = APIRouter(prefix="/api/agent", tags=["agent"], dependencies=[Depends(get_current_user)])

SHANGHAI_TZ = timezone(timedelta(hours=8))


def _today_shanghai() -> Date:
    return datetime.now(SHANGHAI_TZ).date()


def _safe_date(year: int, month: int, day: int) -> Date:
    last_day = calendar.monthrange(year, month)[1]
    return Date(year, month, min(day, last_day))


def _next_occurrence(item: Anniversary, today: Date) -> Optional[Date]:
    try:
        origin = Date.fromisoformat(item.date)
    except ValueError:
        return None
    if item.repeat == "once":
        return origin if origin >= today else None
    if item.repeat == "monthly":
        candidate = _safe_date(today.year, today.month, origin.day)
        if candidate < today:
            year = today.year + (1 if today.month == 12 else 0)
            month = 1 if today.month == 12 else today.month + 1
            candidate = _safe_date(year, month, origin.day)
        return candidate
    # 默认 yearly
    candidate = _safe_date(today.year, origin.month, origin.day)
    if candidate < today:
        candidate = _safe_date(today.year + 1, origin.month, origin.day)
    return candidate


def _upcoming_anniversaries(db: Session, today: Date, window_days: int) -> list[dict]:
    rows = db.exec(select(Anniversary).order_by(Anniversary.date, Anniversary.id)).all()
    upcoming: list[dict] = []
    for item in rows:
        next_date = _next_occurrence(item, today)
        if next_date is None:
            continue
        days_left = (next_date - today).days
        if 0 <= days_left <= window_days:
            upcoming.append(
                {
                    "id": item.id,
                    "name": item.name,
                    "date": item.date,
                    "next_date": next_date.isoformat(),
                    "days_left": days_left,
                    "repeat": item.repeat,
                    "pinned": item.pinned,
                }
            )
    upcoming.sort(key=lambda entry: (entry["days_left"], not entry["pinned"], entry["id"] or 0))
    return upcoming


def _island_meta(db: Session, today: Date) -> dict:
    world = db.get(WorldState, 1)
    data = jload(world.data_json, {}) if world else {}
    start_date = str(data.get("start_date", "") or "").strip()
    days_together: Optional[int] = None
    if start_date:
        try:
            days_together = (today - Date.fromisoformat(start_date)).days + 1
        except ValueError:
            days_together = None
    return {
        "site_title": str(data.get("site_title", "I-land") or "I-land"),
        "start_date": start_date,
        "days_together": days_together,
    }


def _mailbox_summary(db: Session, viewer: str) -> dict:
    letters = db.exec(select(Letter).order_by(Letter.date.desc(), Letter.id.desc())).all()
    unread = [item for item in letters if item.author != viewer and item.read_at is None]
    latest_unread = None
    if unread:
        top = unread[0]
        # 仅返回信封元数据，严禁在摘要中提前泄露未拆封正文
        latest_unread = {
            "id": top.id,
            "date": top.date,
            "title": top.title,
            "excerpt": top.excerpt,
            "author": top.author,
        }
    return {
        "total": len(letters),
        "unread_count": len(unread),
        "latest_unread": latest_unread,
    }


@router.get("/digest")
def get_agent_digest(
    upcoming_days: int = Query(default=14, ge=1, le=366),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """一次返回当前岛民视角下的全岛核心状态摘要。"""
    today = _today_shanghai()
    companion_account = "her" if user.name == "bear" else ("bear" if user.name == "her" else None)
    companion_user = (
        db.exec(select(User).where(User.name == companion_account)).first()
        if companion_account
        else None
    )

    week_start = (today - timedelta(days=6)).isoformat()
    today_iso = today.isoformat()
    recent_memories = db.exec(
        select(Memory).where(
            Memory.deleted_at.is_(None),
            Memory.date >= week_start,
            Memory.date <= today_iso,
        )
    ).all()

    other_visit = (
        db.get(Visit, companion_user.id)
        if companion_user and companion_user.id is not None
        else db.exec(select(Visit).where(Visit.user_id != user.id)).first()
    )
    presence = (
        {
            "last_seen": other_visit.last_seen.isoformat(),
            "action_note": other_visit.action_note,
        }
        if other_visit
        else None
    )

    study_room = room_runtimes["study"].read_summary(db)
    study_summary = {
        "roof_lit": study_room["roof_lit"],
        "online_count": study_room["online_count"],
        "members": study_room["members"],
        "timers": study_room["timers"],
        "today": {"date": today_iso, **summarize_sessions_range(db, today_iso, today_iso)},
        "week": summarize_sessions_range(db, week_start, today_iso),
    }

    return {
        "actor": {"account": user.name, "display": user.display or user.name},
        "companion": (
            {"account": companion_user.name, "display": companion_user.display or companion_user.name}
            if companion_user
            else None
        ),
        "island": _island_meta(db, today),
        "mailbox": _mailbox_summary(db, user.name),
        "lighthouse": serialize_lighthouse(get_lighthouse_row(db)),
        "upcoming_anniversaries": _upcoming_anniversaries(db, today, upcoming_days),
        "recent_memories_count_7d": len(recent_memories),
        "presence": presence,
        "study": study_summary,
        "rooms": {
            "seaside": room_runtimes["seaside"].read_summary(db),
            "interior": room_runtimes["interior"].read_summary(db),
            "study": study_room,
        },
    }
