"""小岛设置：名字即登录账号，内部身份不变（任意一方可改，两人共享）。"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from ..db import get_db
from ..deps import get_current_user
from ..models import User
from .auth import user_public

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(get_current_user)])

MAX_NAME = 20


class NamesIn(BaseModel):
    bear: str = Field(max_length=MAX_NAME)
    her: str = Field(max_length=MAX_NAME)

    @field_validator("bear", "her")
    @classmethod
    def clean(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("名字不能为空")
        if any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
            raise ValueError("名字不能包含换行或控制字符")
        return value


def _display_names(db: Session) -> dict:
    rows = db.exec(select(User).where(User.name.in_(["bear", "her"]))).all()  # type: ignore[attr-defined]
    by_account = {row.name: row.display for row in rows}
    return {"bear": by_account.get("bear") or "小熊", "her": by_account.get("her") or "她"}


@router.get("/names")
def get_names(db: Session = Depends(get_db)):
    return {"names": _display_names(db)}


@router.put("/names")
def update_names(body: NamesIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.bear == body.her:
        raise HTTPException(409, "两个人需要不同的名字，才能分清登录账号")
    rows = db.exec(select(User).where(User.name.in_(["bear", "her"]))).all()
    if len(rows) != 2:
        raise HTTPException(409, "两位岛民账号尚未配置完整")
    conflict = db.exec(select(User).where(
        User.name.notin_(["bear", "her"]), User.login_name.in_([body.bear, body.her]),
    )).first()
    if conflict:
        raise HTTPException(409, "这个名字已被其他账号使用，请换一个")
    try:
        # 在同一事务中腾出旧名字，支持两人互换名字；中途不会对外可见。
        for row in rows:
            row.login_name = None
            db.add(row)
        db.flush()
        for row in rows:
            row.login_name = row.display = getattr(body, row.name)
            db.add(row)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "名字已被使用，请刷新后重新选择") from None
    db.refresh(user)
    return {"names": _display_names(db), "user": user_public(user)}
