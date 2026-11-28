"""双人自习室核心状态结算、统计摘要与消息序列化服务。"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.dialects.sqlite import insert
from sqlmodel import Session, select

from .attachments import attachment_out
from .models import Attachment, StudyMessage, StudySession, StudyTimerState, User

ACCOUNTS = ("bear", "her")
SHANGHAI_TZ = timezone(timedelta(hours=8))
NUDGE_COOLDOWN_MS = 15_000
MAX_STOPWATCH_MS = 4 * 3600 * 1000
MIN_RECORD_MINUTES = 5

NUDGE_LABELS: dict[str, str] = {
    "tea": "递杯热茶",
    "pat": "摸摸头加油",
    "poke": "轻轻戳一下",
    "flower": "送朵小花",
}


def shanghai_date_str(utc_ms: int) -> str:
    return datetime.fromtimestamp(utc_ms / 1000.0, tz=SHANGHAI_TZ).date().isoformat()


def ensure_timer_rows(db: Session) -> dict[str, StudyTimerState]:
    rows = {
        row.account: row
        for row in db.exec(select(StudyTimerState).where(StudyTimerState.account.in_(ACCOUNTS))).all()
    }
    missing = [acc for acc in ACCOUNTS if acc not in rows]
    if missing:
        for acc in missing:
            db.execute(
                insert(StudyTimerState)
                .values(
                    account=acc,
                    phase="idle",
                    focus_minutes=25,
                    break_minutes=5,
                    started_at_ms=0,
                    ends_at_ms=0,
                    goal_text="",
                    synced_with="",
                    version=1,
                    updated_at=datetime.utcnow(),
                )
                .on_conflict_do_nothing(index_elements=[StudyTimerState.account])
            )
        db.commit()
        rows = {
            row.account: row
            for row in db.exec(select(StudyTimerState).where(StudyTimerState.account.in_(ACCOUNTS))).all()
        }
    return rows


def serialize_timer(row: StudyTimerState) -> dict:
    return {
        "account": row.account,
        "phase": row.phase,
        "focus_minutes": row.focus_minutes,
        "break_minutes": row.break_minutes,
        "started_at_ms": row.started_at_ms,
        "ends_at_ms": row.ends_at_ms,
        "goal_text": row.goal_text or "",
        "synced_with": row.synced_with or "",
        "version": row.version,
    }


def record_session_if_qualified(
    db: Session,
    *,
    account: str,
    goal_text: str,
    started_at_ms: int,
    end_at_ms: int,
    cap_minutes: int,
    together: bool,
) -> Optional[StudySession]:
    if started_at_ms <= 0 or end_at_ms <= started_at_ms:
        return None
    elapsed_minutes = min(cap_minutes, max(0, (end_at_ms - started_at_ms + 1_000) // 60_000))
    if elapsed_minutes < MIN_RECORD_MINUTES:
        return None
    session_row = StudySession(
        account=account,
        goal_text=(goal_text or "").strip()[:24],
        duration_minutes=int(elapsed_minutes),
        together=bool(together),
        date=shanghai_date_str(end_at_ms),
        started_at=datetime.utcfromtimestamp(started_at_ms / 1000.0),
        completed_at=datetime.utcfromtimestamp(end_at_ms / 1000.0),
    )
    db.add(session_row)
    return session_row


def settle_study_timers(
    db: Session,
    now_ms: int,
    online_accounts: set[str],
) -> tuple[dict[str, StudyTimerState], bool]:
    """按权威时间戳推进已到期的专注/休息阶段，保证锁屏或断线重连后 0 漂移、不留僵尸态。"""
    rows = ensure_timer_rows(db)
    both_active = len(online_accounts) >= 2 or all(
        r.phase in ("focusing", "stopwatch", "resting") for r in rows.values()
    )
    changed = False
    now_dt = datetime.utcnow()

    for acc, row in rows.items():
        if row.phase == "focusing" and row.ends_at_ms > 0 and now_ms >= row.ends_at_ms:
            record_session_if_qualified(
                db,
                account=acc,
                goal_text=row.goal_text,
                started_at_ms=row.started_at_ms,
                end_at_ms=row.ends_at_ms,
                cap_minutes=row.focus_minutes,
                together=both_active or bool(row.synced_with),
            )
            break_end_ms = row.ends_at_ms + row.break_minutes * 60_000
            if row.break_minutes > 0 and now_ms < break_end_ms:
                row.phase = "resting"
                row.started_at_ms = row.ends_at_ms
                row.ends_at_ms = break_end_ms
            else:
                row.phase = "idle"
                row.started_at_ms = 0
                row.ends_at_ms = 0
                row.synced_with = ""
            row.version += 1
            row.updated_at = now_dt
            db.add(row)
            changed = True
        elif row.phase == "resting" and row.ends_at_ms > 0 and now_ms >= row.ends_at_ms:
            row.phase = "idle"
            row.started_at_ms = 0
            row.ends_at_ms = 0
            row.synced_with = ""
            row.version += 1
            row.updated_at = now_dt
            db.add(row)
            changed = True
        elif row.phase == "stopwatch" and row.started_at_ms > 0 and now_ms - row.started_at_ms >= MAX_STOPWATCH_MS:
            end_ms = row.started_at_ms + MAX_STOPWATCH_MS
            record_session_if_qualified(
                db,
                account=acc,
                goal_text=row.goal_text,
                started_at_ms=row.started_at_ms,
                end_at_ms=end_ms,
                cap_minutes=240,
                together=both_active,
            )
            row.phase = "idle"
            row.started_at_ms = 0
            row.ends_at_ms = 0
            row.synced_with = ""
            row.version += 1
            row.updated_at = now_dt
            db.add(row)
            changed = True

    if changed:
        db.commit()
    return rows, changed


def latest_study_message_id(db: Session) -> int:
    top_id = db.exec(select(func.max(StudyMessage.id))).one()
    return int(top_id or 0)


def build_study_room_extra(
    db: Session,
    now_ms: int,
    online_accounts: set[str],
    last_nudge: Optional[dict],
) -> dict:
    rows, _ = settle_study_timers(db, now_ms, online_accounts)
    return {
        "timers": {acc: serialize_timer(row) for acc, row in rows.items()},
        "latest_message_id": latest_study_message_id(db),
        "last_nudge": last_nudge,
    }


def summarize_sessions_range(db: Session, start_date: str, end_date: str) -> dict:
    sessions = db.exec(
        select(StudySession).where(
            StudySession.date >= start_date,
            StudySession.date <= end_date,
        )
    ).all()
    bear_mins = sum(item.duration_minutes for item in sessions if item.account == "bear")
    her_mins = sum(item.duration_minutes for item in sessions if item.account == "her")
    together_cnt = sum(1 for item in sessions if item.together)
    return {
        "bear_minutes": bear_mins,
        "her_minutes": her_mins,
        "total_minutes": bear_mins + her_mins,
        "sessions_count": len(sessions),
        "together_count": together_cnt,
    }


def user_display_map(db: Session) -> dict[str, str]:
    users = db.exec(select(User).where(User.name.in_(ACCOUNTS))).all()
    mapping = {"bear": "小熊", "her": "她"}
    for u in users:
        if u.display:
            mapping[u.name] = u.display
    return mapping


def serialize_study_message(db: Session, msg: StudyMessage, displays: dict[str, str]) -> dict:
    att_payload = None
    if msg.attachment_id:
        att = db.get(Attachment, msg.attachment_id)
        if att is not None:
            att_payload = attachment_out(att)
    return {
        "id": msg.id,
        "sender": msg.sender,
        "sender_display": displays.get(msg.sender, msg.sender),
        "body": msg.body or "",
        "attachment_id": msg.attachment_id or "",
        "attachment": att_payload,
        "client_id": msg.client_id or "",
        "created_at": f"{msg.created_at.isoformat()}Z",
    }
