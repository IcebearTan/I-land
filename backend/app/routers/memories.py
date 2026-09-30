"""每日记忆卡：按日期区间查询、创建、编辑（乐观锁）、软删除与恢复。

约定（见 DEVELOPMENT_PLAN §6）：
- date 是用户选择的日历日（本地日期字符串，不做 UTC 偏移）；创建/修改时刻统一存 UTC；
- 创建者/修改者/删除者由服务端当前登录身份确定，不接受客户端指定；
- 附件只收服务端签发的 Attachment 标识，顺序即照片顺序；
- 创建支持 client_id 幂等：网络超时重试不会生成重复记忆；
- 修改走版本条件更新（原子），冲突返回 409 + 服务器最新内容，绝不静默覆盖。
"""

from datetime import date as Date
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import update
from sqlmodel import Session, select

from ..attachments import mark_attachments_linked
from ..config import MAX_MEMORY_PHOTOS, MEMORY_TRASH_DAYS
from ..db import get_db
from ..deps import get_current_user
from ..models import Attachment, Memory, User, jdump, jload

router = APIRouter(prefix="/api/memories", tags=["memories"], dependencies=[Depends(get_current_user)])

WEATHER_TYPES = {"sunny", "cloudy", "rain", "snow", "wind", "fog"}


def _valid_calendar_date(value: str) -> bool:
    try:
        parsed = Date.fromisoformat(value)
    except ValueError:
        return False
    return 1900 <= parsed.year <= 2199


def _weather_json(weather_type: str, weather_note: str) -> str:
    if not weather_type and not weather_note:
        return "{}"
    return jdump({"type": weather_type, "note": weather_note})


class MemoryIn(BaseModel):
    date: str
    title: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=5000)
    mood: str = Field(default="", max_length=16)
    weather_type: str = ""
    weather_note: str = Field(default="", max_length=60)
    location: str = Field(default="", max_length=60)
    attachments: List[str] = []
    client_id: str = Field(default="", max_length=64)

    @field_validator("date")
    @classmethod
    def real_date(cls, value):
        if not _valid_calendar_date(value):
            raise ValueError("请选择一个有效的日期（1900–2199 年）")
        return value

    @field_validator("weather_type")
    @classmethod
    def known_weather(cls, value):
        if value and value not in WEATHER_TYPES:
            raise ValueError("请选择有效的天气")
        return value

    def has_content(self) -> bool:
        """照片与描述至少填一项。"""
        return bool(self.attachments) or bool(self.description.strip())


class MemoryUpdate(MemoryIn):
    version: int


def memory_out(memory: Memory) -> dict:
    weather = jload(memory.weather_json, {})
    return {
        "id": memory.id,
        "date": memory.date,
        "title": memory.title,
        "description": memory.description,
        "mood": memory.mood,
        "weather": {"type": weather.get("type", ""), "note": weather.get("note", "")},
        "location": memory.location,
        "photos": jload(memory.photos_json, []),  # 旧数据路径，仅兼容展示
        "attachments": jload(memory.attachments_json, []),
        "created_by": memory.created_by,
        "created_at": memory.created_at.isoformat(),
        "version": memory.version,
        "updated_by": memory.updated_by,
        "updated_at": memory.updated_at.isoformat() if memory.updated_at else None,
        "deleted": memory.deleted_at is not None,
        "deleted_by": memory.deleted_by,
        "deleted_at": memory.deleted_at.isoformat() if memory.deleted_at else None,
    }


def find_or_404(db: Session, memory_id: int) -> Memory:
    memory = db.get(Memory, memory_id)
    if memory is None:
        raise HTTPException(404, "这条记忆不存在，可能已被移除")
    return memory


def check_attachments(db: Session, attachment_ids: List[str]) -> None:
    if len(attachment_ids) > MAX_MEMORY_PHOTOS:
        raise HTTPException(422, f"一条记忆最多放 {MAX_MEMORY_PHOTOS} 张照片")
    for attachment_id in dict.fromkeys(attachment_ids):
        if db.get(Attachment, attachment_id) is None:
            raise HTTPException(422, "有照片已失效，请移除后重试")


def _dump_attachments(attachment_ids: List[str]) -> str:
    return jdump(list(dict.fromkeys(attachment_ids)))  # 去重保序，顺序即照片顺序


@router.get("")
def list_memories(start: str, end: str, db: Session = Depends(get_db)):
    if not _valid_calendar_date(start) or not _valid_calendar_date(end) or start > end:
        raise HTTPException(422, "日期区间不对")
    if Date.fromisoformat(end) - Date.fromisoformat(start) > timedelta(days=366):
        raise HTTPException(422, "一次最多查询一年")
    rows = db.exec(
        select(Memory)
        .where(Memory.deleted_at.is_(None), Memory.date >= start, Memory.date <= end)
        .order_by(Memory.date, Memory.created_at, Memory.id)
    ).all()
    return {"memories": [memory_out(row) for row in rows]}


@router.get("/deleted")
def list_deleted(db: Session = Depends(get_db)):
    """「最近删除」：恢复窗口内的软删除记忆。"""
    cutoff = datetime.utcnow() - timedelta(days=MEMORY_TRASH_DAYS)
    rows = db.exec(
        select(Memory)
        .where(Memory.deleted_at.is_not(None), Memory.deleted_at >= cutoff)
        .order_by(Memory.deleted_at.desc())
    ).all()
    items = []
    now = datetime.utcnow()
    for row in rows:
        days_left = max(0, MEMORY_TRASH_DAYS - (now - row.deleted_at).days)
        items.append({**memory_out(row), "days_left": days_left})
    return {"memories": items, "keep_days": MEMORY_TRASH_DAYS}


@router.get("/{memory_id}")
def get_memory(memory_id: int, db: Session = Depends(get_db)):
    return {"memory": memory_out(find_or_404(db, memory_id))}


@router.post("", status_code=201)
def create_memory(
    body: MemoryIn,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not body.has_content():
        raise HTTPException(422, "至少放一张照片或写一句描述")
    check_attachments(db, body.attachments)

    # 幂等：同一 client_id 的重试直接返回已建的那条，不重复建卡
    if body.client_id:
        existing = db.exec(
            select(Memory).where(Memory.client_id == body.client_id).order_by(Memory.id)
        ).first()
        if existing is not None:
            response.status_code = 200  # 命中已创建的记录，不是新建
            return {"memory": memory_out(existing)}

    memory = Memory(
        date=body.date,
        title=body.title.strip(),
        description=body.description,
        mood=body.mood,
        weather_json=_weather_json(body.weather_type, body.weather_note),
        location=body.location.strip(),
        attachments_json=_dump_attachments(body.attachments),
        created_by=user.name,
        client_id=body.client_id,
    )
    db.add(memory)
    mark_attachments_linked(db, body.attachments)
    db.commit()
    db.refresh(memory)
    return {"memory": memory_out(memory)}


@router.put("/{memory_id}")
def update_memory(
    memory_id: int,
    body: MemoryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not body.has_content():
        raise HTTPException(422, "至少放一张照片或写一句描述")
    check_attachments(db, body.attachments)
    memory = find_or_404(db, memory_id)
    if memory.deleted_at is not None:
        raise HTTPException(404, "这条记忆在回收站里，先恢复再编辑")

    # 原子版本条件更新：对方刚保存过时这里影响行数为 0，绝不静默覆盖
    result = db.execute(
        update(Memory)  # type: ignore[arg-type]
        .where(Memory.id == memory_id, Memory.version == body.version, Memory.deleted_at.is_(None))
        .values(
            date=body.date,
            title=body.title.strip(),
            description=body.description,
            mood=body.mood,
            weather_json=_weather_json(body.weather_type, body.weather_note),
            location=body.location.strip(),
            attachments_json=_dump_attachments(body.attachments),
            version=Memory.version + 1,
            updated_by=user.name,
            updated_at=datetime.utcnow(),
        )
    )
    if result.rowcount == 0:
        fresh = db.get(Memory, memory_id)
        db.rollback()
        if fresh is None or fresh.deleted_at is not None:
            raise HTTPException(404, "这条记忆不存在，可能已被移除")
        raise HTTPException(
            409,
            detail={"message": "对方刚刚更新了这条记忆，先看看她的版本再保存", "memory": memory_out(fresh)},
        )
    mark_attachments_linked(db, body.attachments)
    db.commit()
    db.refresh(memory)
    return {"memory": memory_out(memory)}


@router.delete("/{memory_id}")
def delete_memory(memory_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    memory = find_or_404(db, memory_id)
    if memory.deleted_at is None:
        memory.deleted_at = datetime.utcnow()
        memory.deleted_by = user.name
        db.add(memory)
        db.commit()  # 软删除：附件保持关联，恢复窗口内文件一律不动
    return {"ok": True}


@router.post("/{memory_id}/restore")
def restore_memory(memory_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    memory = find_or_404(db, memory_id)
    if memory.deleted_at is not None:
        memory.deleted_at = None
        memory.deleted_by = ""
        db.add(memory)
        db.commit()
        db.refresh(memory)
    return {"memory": memory_out(memory)}
