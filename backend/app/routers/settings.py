"""小岛设置：两位岛民的显示名字（登录后任意一方可改，两人共享）。"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from ..db import get_db
from ..deps import get_current_user
from ..models import User

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
        return value


def _display_names(db: Session) -> dict:
    rows = db.exec(select(User).where(User.name.in_(["bear", "her"]))).all()  # type: ignore[attr-defined]
    by_account = {row.name: row.display for row in rows}
    return {"bear": by_account.get("bear") or "小熊", "her": by_account.get("her") or "她"}


@router.get("/names")
def get_names(db: Session = Depends(get_db)):
    return {"names": _display_names(db)}


@router.put("/names")
def update_names(body: NamesIn, db: Session = Depends(get_db)):
    for account, display in (("bear", body.bear), ("her", body.her)):
        row = db.exec(select(User).where(User.name == account)).first()
        if row is not None:
            row.display = display
            db.add(row)
    db.commit()
    return {"names": _display_names(db)}
