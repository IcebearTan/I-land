from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import LighthouseSignal, User, Visit

router = APIRouter(prefix="/api/lighthouse", tags=["lighthouse"])

LIGHTHOUSE_PRESETS: list[dict[str, str]] = [
    {"id": "amber", "label": "暖金 · 想你了", "color": "#ffd98a", "hint": "亮一盏暖光，告诉你我在想你"},
    {"id": "coral", "label": "珊瑚 · 来海边", "color": "#ff9f8c", "hint": "海风刚好，有空一起去海边坐坐"},
    {"id": "lavender", "label": "星紫 · 晚安", "color": "#c7b2ff", "hint": "今天辛苦啦，祝你一夜好梦"},
    {"id": "sea", "label": "海蓝 · 在忙中", "color": "#8ad4f5", "hint": "正在专注做事，忙完马上来找你"},
    {"id": "ivory", "label": "月白 · 静静守候", "color": "#fff4d6", "hint": "不催不急，小岛一直亮着灯等你"},
]
PRESET_MAP = {p["id"]: p for p in LIGHTHOUSE_PRESETS}


def _serialize(row: LighthouseSignal) -> dict:
    meta = PRESET_MAP.get(row.preset, LIGHTHOUSE_PRESETS[0])
    return {
        "preset": meta["id"],
        "label": meta["label"],
        "color": meta["color"],
        "message": row.message or "",
        "updated_by": row.updated_by or "",
        "updated_by_display": row.updated_by_display or "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _get_or_init(db: Session) -> LighthouseSignal:
    row = db.get(LighthouseSignal, 1)
    if row is None:
        row = LighthouseSignal(id=1, preset="amber", message="")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("")
def get_lighthouse(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = _get_or_init(db)
    return {"signal": _serialize(row), "presets": LIGHTHOUSE_PRESETS}


class LighthousePut(BaseModel):
    preset: str = Field(min_length=1, max_length=24)
    message: str = Field(default="", max_length=48)


@router.put("")
def put_lighthouse(
    body: LighthousePut,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    preset = body.preset.strip()
    if preset not in PRESET_MAP:
        raise HTTPException(status_code=400, detail="未知的灯语颜色")
    clean_msg = " ".join(body.message.strip().split())[:48]
    now = datetime.utcnow()
    row = _get_or_init(db)
    row.preset = preset
    row.message = clean_msg
    row.updated_by = user.name
    row.updated_by_display = user.display or user.name
    row.updated_at = now
    db.add(row)

    # 同步刷新足迹摘要，方便对方在顶部足迹气泡里看到灯语动态
    visit = db.get(Visit, user.id)
    note = f"点亮了灯塔（{PRESET_MAP[preset]['label']}）"
    if visit is None:
        visit = Visit(user_id=user.id, last_seen=now, action_note=note)
    else:
        visit.last_seen = now
        visit.action_note = note
    db.add(visit)
    db.commit()
    db.refresh(row)
    return {"ok": True, "signal": _serialize(row)}
