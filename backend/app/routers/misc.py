from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import User, Visit, jdump, jload

router = APIRouter(prefix="/api", tags=["misc"])


@router.get("/ping")
def ping():
    return {"pong": True}


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    from ..models import WorldState

    world = db.get(WorldState, 1)
    data = jload(world.data_json, {}) if world else {}
    return {
        "site_title": data.get("site_title", "I-land"),
        "start_date": data.get("start_date", ""),
    }


class HeartbeatIn(BaseModel):
    action_note: Optional[str] = None
    last_pos: Optional[dict] = None


@router.post("/heartbeat")
def heartbeat(
    body: HeartbeatIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from datetime import datetime

    visit = db.get(Visit, user.id)
    if visit is None:
        visit = Visit(user_id=user.id)
    visit.last_seen = datetime.utcnow()
    if body.last_pos is not None:
        visit.last_pos_json = jdump(body.last_pos)
    if body.action_note is not None:
        visit.action_note = body.action_note
    db.add(visit)
    db.commit()
    return {"ok": True}


@router.get("/presence")
def presence(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """对方最近一次登岛信息（异步共岛的存在感）"""
    other = db.query(Visit).filter(Visit.user_id != user.id).first()
    if other is None:
        return {"visit": None}
    return {
        "visit": {
            "user_id": other.user_id,
            "last_seen": other.last_seen.isoformat(),
            "last_pos": jload(other.last_pos_json, {}),
            "action_note": other.action_note,
        }
    }
