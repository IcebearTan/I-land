"""小岛设置：名字即登录账号，内部身份不变（任意一方可改，两人共享）。"""

from fastapi import APIRouter, Depends, HTTPException
from math import isfinite
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.dialects.sqlite import insert
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from ..db import get_db
from ..deps import get_current_user, require_human_session
from ..models import User, UserPreference
from .auth import user_public

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(get_current_user)])

MAX_NAME = 20


class AudioIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    music_enabled: bool | None = Field(default=None, strict=True)
    ambience_enabled: bool | None = Field(default=None, strict=True)
    muted: bool | None = Field(default=None, strict=True)
    music_volume: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False, strict=True)
    ambience_volume: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False, strict=True)

    @model_validator(mode="before")
    @classmethod
    def finite_json(cls, value):
        # JSON 解码器可能接受 NaN/Infinity；以安全错误输入拒绝，避免 422 的错误体自身无法编码。
        if isinstance(value, dict):
            value = value.copy()
            for key in ("music_volume", "ambience_volume"):
                number = value.get(key)
                if isinstance(number, float) and not isfinite(number):
                    value[key] = str(number)
        return value

    @field_validator("music_enabled", "ambience_enabled", "muted", "music_volume", "ambience_volume")
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError("声音设置不能为 null")
        return value


def _audio_settings(db: Session, user_id: int) -> dict:
    row = db.get(UserPreference, user_id) or UserPreference(user_id=user_id)
    return row.model_dump(include=set(AudioIn.model_fields))


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


@router.get("/audio")
def get_audio(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # 没保存过就返回默认值；GET 不创建记录，也不暴露对方偏好。
    return {"settings": _audio_settings(db, user.id)}


@router.put("/audio")
def update_audio(body: AudioIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    updates = body.model_dump(exclude_unset=True)
    if updates:
        # 原子局部更新：两个标签同时首次保存也只建一行，未来非音频字段不受影响。
        statement = insert(UserPreference).values(user_id=user.id, **updates)
        db.execute(statement.on_conflict_do_update(index_elements=[UserPreference.user_id], set_=updates))
        db.commit()
    return {"settings": _audio_settings(db, user.id)}


@router.put("/names")
def update_names(body: NamesIn, db: Session = Depends(get_db), user: User = Depends(require_human_session)):
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
