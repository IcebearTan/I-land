from datetime import datetime, timedelta
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, status
from sqlmodel import Session, select

from .config import SESSION_COOKIE, SESSION_DAYS
from .db import get_db
from .models import AuthSession, User
from .security import new_token


def create_session(db: Session, user_id: int) -> str:
    token = new_token()
    db.add(
        AuthSession(
            token=token,
            user_id=user_id,
            expires_at=datetime.utcnow() + timedelta(days=SESSION_DAYS),
        )
    )
    db.commit()
    return token


def get_current_user(
    iland_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not iland_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "未登录")
    auth = db.get(AuthSession, iland_session)
    if not auth or auth.expires_at < datetime.utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "登录已过期")
    user = db.get(User, auth.user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户不存在")
    return user
