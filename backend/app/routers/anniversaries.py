from datetime import date as Date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import update
from sqlmodel import Session, select

from ..db import get_db
from ..deps import get_current_user
from ..models import Anniversary

router = APIRouter(prefix="/api/anniversaries", tags=["anniversaries"], dependencies=[Depends(get_current_user)])
COLORS = {"rose", "peach", "honey", "leaf", "sea", "lavender", "cocoa", "slate"}
ICONS = {"heart", "cake", "flower", "star", "moon", "gift", "plane", "camera", "home", "ring", "coffee", "music", "sun", "book", "sparkles", "flag", "leaf", "letter"}
STYLES = {"letter", "ticket", "garden", "starry"}


class AnniversaryIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    date: Date
    repeat: Literal["yearly", "monthly", "once"] = "yearly"
    icon: str = "heart"
    note: str = Field(default="", max_length=1000)
    color: str = "rose"
    style: str = "letter"
    pinned: bool = False

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError("请填写节日名称")
        return value.strip()

    @field_validator("date")
    @classmethod
    def supported_date(cls, value):
        if not 1900 <= value.year <= 2199:
            raise ValueError("日期须在 1900–2199 年之间")
        return value

    @field_validator("color", "icon", "style")
    @classmethod
    def design_choice(cls, value, info):
        choices = {"color": COLORS, "icon": ICONS, "style": STYLES}
        if value not in choices[info.field_name]:
            raise ValueError("请选择有效的样式选项")
        return value

    def record(self):
        return {**self.model_dump(), "date": self.date.isoformat()}


def find_or_404(db: Session, anniversary_id: int):
    item = db.get(Anniversary, anniversary_id)
    if item is None:
        raise HTTPException(404, "这个节日已不存在，请刷新日历")
    return item


@router.get("")
def list_anniversaries(db: Session = Depends(get_db)):
    return {"anniversaries": db.exec(select(Anniversary).order_by(Anniversary.date, Anniversary.id)).all()}


@router.get("/{anniversary_id}")
def get_anniversary(anniversary_id: int, db: Session = Depends(get_db)):
    return {"anniversary": find_or_404(db, anniversary_id)}


@router.post("", status_code=201)
def create_anniversary(body: AnniversaryIn, db: Session = Depends(get_db)):
    if body.pinned:
        db.exec(update(Anniversary).values(pinned=False))
    item = Anniversary(**body.record())
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"anniversary": item}


@router.put("/{anniversary_id}")
def update_anniversary(anniversary_id: int, body: AnniversaryIn, db: Session = Depends(get_db)):
    item = find_or_404(db, anniversary_id)
    if body.pinned:
        db.exec(update(Anniversary).values(pinned=False))
    for key, value in body.record().items():
        setattr(item, key, value)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"anniversary": item}


@router.delete("/{anniversary_id}")
def delete_anniversary(anniversary_id: int, db: Session = Depends(get_db)):
    item = find_or_404(db, anniversary_id)
    db.delete(item)
    db.commit()
    return {"ok": True}
