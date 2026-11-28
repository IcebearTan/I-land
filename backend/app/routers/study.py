"""星光阁楼书房（双人自习室）REST 接口：概览、双模番茄钟、共学足迹、轻聊与桌边轻互动。"""

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..attachments import mark_attachments_linked
from ..db import get_db
from ..deps import get_current_user
from ..models import Attachment, StudyMessage, StudySession, User, Visit
from ..room_runtime import study_runtime
from ..study_service import (
    ACCOUNTS,
    NUDGE_LABELS,
    latest_study_message_id,
    record_session_if_qualified,
    serialize_study_message,
    serialize_timer,
    settle_study_timers,
    shanghai_date_str,
    summarize_sessions_range,
    user_display_map,
)

router = APIRouter(prefix="/api/study", tags=["study"])


def _require_couple(user: User) -> str:
    if user.name not in ACCOUNTS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "只有两位岛民可以使用阁楼书房")
    return user.name


class StudyTimerIn(BaseModel):
    action: Literal["start_focus", "start_stopwatch", "start_break", "sync_partner", "stop", "settle"]
    focus_minutes: int = Field(default=25, ge=5, le=120)
    break_minutes: int = Field(default=5, ge=0, le=30)
    goal_text: str = Field(default="", max_length=24)


class StudyMessageIn(BaseModel):
    body: str = Field(default="", max_length=1000)
    attachment_id: str = Field(default="", max_length=64)
    client_id: str = Field(default="", max_length=64)


class StudyNudgeIn(BaseModel):
    kind: Literal["tea", "pat", "poke", "flower"]


@router.get("/overview")
def get_study_overview(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    with study_runtime.lock:
        summary = study_runtime.read_summary(db)
        now_ms = study_runtime.utc_ms()
        latest_msg_id = latest_study_message_id(db)

    today_iso = shanghai_date_str(now_ms)
    week_start = shanghai_date_str(now_ms - 6 * 86_400_000)

    recent_goals: list[str] = []
    if user.name in ACCOUNTS:
        own_goal = (summary["timers"].get(user.name, {}).get("goal_text") or "").strip()
        if own_goal:
            recent_goals.append(own_goal)
        recent_rows = db.exec(
            select(StudySession)
            .where(StudySession.account == user.name)
            .order_by(StudySession.id.desc())
            .limit(15)
        ).all()
        for item in recent_rows:
            g = (item.goal_text or "").strip()
            if g and g not in recent_goals:
                recent_goals.append(g)
            if len(recent_goals) >= 3:
                break

    return {
        "server_now_ms": now_ms,
        "roof_lit": summary["roof_lit"],
        "online_count": summary["online_count"],
        "members": summary["members"],
        "timers": summary["timers"],
        "today": {"date": today_iso, **summarize_sessions_range(db, today_iso, today_iso)},
        "week": summarize_sessions_range(db, week_start, today_iso),
        "recent_goals": recent_goals,
        "latest_message_id": latest_msg_id,
    }


@router.post("/timer")
def update_study_timer(
    body: StudyTimerIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = _require_couple(user)
    partner_acc = "her" if account == "bear" else "bear"
    clean_goal = " ".join(body.goal_text.strip().split())[:24]

    with study_runtime.lock:
        now_ms = study_runtime.utc_ms()
        online_accounts = {m.account for m in study_runtime.members.values()} | {account}
        rows, settled = settle_study_timers(db, now_ms, online_accounts)
        own = rows[account]
        partner = rows[partner_acc]
        both_active = len(online_accounts) >= 2 or partner.phase in ("focusing", "stopwatch", "resting")

        if body.action == "settle":
            snapshot = study_runtime._publish(db, changed=settled)
            return {
                "ok": True,
                "timer": serialize_timer(own),
                "timers": {acc: serialize_timer(r) for acc, r in rows.items()},
                "snapshot": snapshot,
            }

        if body.action == "sync_partner" and partner.phase not in ("focusing", "resting", "stopwatch"):
            raise HTTPException(status.HTTP_409_CONFLICT, "对方当前还没开启番茄钟哦")

        if own.phase in ("focusing", "stopwatch") and own.started_at_ms > 0:
            end_ms = min(now_ms, own.ends_at_ms) if own.ends_at_ms > 0 else now_ms
            record_session_if_qualified(
                db,
                account=account,
                goal_text=own.goal_text,
                started_at_ms=own.started_at_ms,
                end_at_ms=end_ms,
                cap_minutes=own.focus_minutes if own.phase == "focusing" else 240,
                together=both_active or bool(own.synced_with),
            )

        if body.action == "start_focus":
            own.phase = "focusing"
            own.focus_minutes = body.focus_minutes
            own.break_minutes = body.break_minutes
            own.started_at_ms = now_ms
            own.ends_at_ms = now_ms + body.focus_minutes * 60_000
            own.goal_text = clean_goal
            own.synced_with = ""
        elif body.action == "start_stopwatch":
            own.phase = "stopwatch"
            own.started_at_ms = now_ms
            own.ends_at_ms = 0
            own.goal_text = clean_goal
            own.synced_with = ""
        elif body.action == "start_break":
            brk = max(1, body.break_minutes or own.break_minutes or 5)
            own.phase = "resting"
            own.break_minutes = brk
            own.started_at_ms = now_ms
            own.ends_at_ms = now_ms + brk * 60_000
            own.synced_with = ""
        elif body.action == "sync_partner":
            own.phase = partner.phase
            own.focus_minutes = partner.focus_minutes
            own.break_minutes = partner.break_minutes
            own.started_at_ms = now_ms
            own.ends_at_ms = partner.ends_at_ms
            own.goal_text = clean_goal or own.goal_text or partner.goal_text
            own.synced_with = partner_acc
        elif body.action == "stop":
            own.phase = "idle"
            own.started_at_ms = 0
            own.ends_at_ms = 0
            own.synced_with = ""

        own.version += 1
        own.updated_at = datetime.utcnow()
        db.add(own)

        if own.phase in ("focusing", "stopwatch") and user.id is not None:
            note = f"正在阁楼自习（{own.goal_text}）" if own.goal_text else "正在阁楼书房专注"
            visit = db.get(Visit, user.id)
            if visit is None:
                visit = Visit(user_id=user.id, last_seen=own.updated_at, action_note=note)
            else:
                visit.last_seen = own.updated_at
                visit.action_note = note
            db.add(visit)

        db.commit()
        snapshot = study_runtime._publish(db)

    today_iso = shanghai_date_str(now_ms)
    return {
        "ok": True,
        "timer": serialize_timer(own),
        "timers": {acc: serialize_timer(r) for acc, r in rows.items()},
        "today": {"date": today_iso, **summarize_sessions_range(db, today_iso, today_iso)},
        "snapshot": snapshot,
    }


@router.get("/sessions")
def list_study_sessions(
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=30, ge=1, le=100),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now_ms = study_runtime.utc_ms()
    today_iso = shanghai_date_str(now_ms)
    start_iso = shanghai_date_str(now_ms - (days - 1) * 86_400_000)
    displays = user_display_map(db)
    rows = db.exec(
        select(StudySession)
        .where(StudySession.date >= start_iso, StudySession.date <= today_iso)
        .order_by(StudySession.id.desc())
        .limit(limit)
    ).all()
    return {
        "today": {"date": today_iso, **summarize_sessions_range(db, today_iso, today_iso)},
        "range": {"start_date": start_iso, "end_date": today_iso, **summarize_sessions_range(db, start_iso, today_iso)},
        "sessions": [
            {
                "id": row.id,
                "account": row.account,
                "display": displays.get(row.account, row.account),
                "goal_text": row.goal_text,
                "duration_minutes": row.duration_minutes,
                "together": row.together,
                "date": row.date,
                "completed_at": f"{row.completed_at.isoformat()}Z",
            }
            for row in rows
        ],
    }


@router.delete("/sessions/{session_id}")
def delete_study_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = _require_couple(user)
    row = db.get(StudySession, session_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "自习记录不存在")
    if row.account != account:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "只能移除自己的自习记录")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/messages")
def list_study_messages(
    after_id: Optional[int] = Query(default=None, ge=0),
    before_id: Optional[int] = Query(default=None, ge=1),
    limit: int = Query(default=40, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_couple(user)
    displays = user_display_map(db)
    has_more = False
    if after_id is not None:
        rows = list(
            db.exec(
                select(StudyMessage)
                .where(StudyMessage.id > after_id)
                .order_by(StudyMessage.id.asc())
                .limit(limit)
            ).all()
        )
    else:
        stmt = select(StudyMessage)
        if before_id is not None:
            stmt = stmt.where(StudyMessage.id < before_id)
        fetched = list(db.exec(stmt.order_by(StudyMessage.id.desc()).limit(limit + 1)).all())
        has_more = len(fetched) > limit
        rows = list(reversed(fetched[:limit]))

    return {
        "messages": [serialize_study_message(db, msg, displays) for msg in rows],
        "has_more": has_more,
        "latest_message_id": latest_study_message_id(db),
    }


@router.post("/messages", status_code=status.HTTP_201_CREATED)
def create_study_message(
    payload: StudyMessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sender = _require_couple(user)
    clean_body = payload.body.strip()
    clean_att = payload.attachment_id.strip()
    clean_cid = payload.client_id.strip()
    if not clean_body and not clean_att:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "请输入聊天内容或选择一张截图")

    displays = user_display_map(db)
    if clean_cid:
        existing = db.exec(
            select(StudyMessage).where(StudyMessage.sender == sender, StudyMessage.client_id == clean_cid)
        ).first()
        if existing is not None:
            return {"ok": True, "message": serialize_study_message(db, existing, displays)}

    if clean_att:
        att = db.get(Attachment, clean_att)
        if att is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "截图附件不存在或已失效")
        mark_attachments_linked(db, [clean_att])

    msg = StudyMessage(sender=sender, body=clean_body, attachment_id=clean_att, client_id=clean_cid)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    snapshot = study_runtime.publish_external(db)
    return {"ok": True, "message": serialize_study_message(db, msg, displays), "snapshot": snapshot}


@router.delete("/messages/{message_id}")
def delete_study_message(
    message_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sender = _require_couple(user)
    msg = db.get(StudyMessage, message_id)
    if msg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "消息不存在")
    if msg.sender != sender:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "只能撤回自己发送的消息")
    db.delete(msg)
    db.commit()
    study_runtime.publish_external(db)
    return {"ok": True}


@router.post("/nudge")
def send_study_nudge(
    payload: StudyNudgeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sender = _require_couple(user)
    label = NUDGE_LABELS[payload.kind]
    nudge, snapshot = study_runtime.emit_nudge(
        db,
        from_account=sender,
        from_display=user.display or ("小熊" if sender == "bear" else "她"),
        kind=payload.kind,
        label=label,
    )
    return {"ok": True, "nudge": nudge, "snapshot": snapshot}
