from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete as sa_delete
from sqlmodel import Session, select

from ..config import COOKIE_SECURE, SESSION_COOKIE, SESSION_DAYS
from ..db import get_db
from ..deps import create_session, get_current_user
from ..models import AuthSession, User
from ..security import hash_password, verify_password
from ..room_runtime import room_runtime

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    name: str
    password: str


class PasswordChangeIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6, max_length=72)


def user_public(user: User) -> dict:
    return {"id": user.id, "account": user.name, "name": user.login_name,
            "display": user.display, "sprite": user.sprite}


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,  # HTTPS 部署设 ILAND_COOKIE_SECURE=1；本地 http 保持关闭
    )


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.exec(select(User).where(User.login_name == body.name.strip())).first()
    if not user or not verify_password(body.password, user.pass_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "名字或密码不对哦")
    token = create_session(db, user.id)
    _set_session_cookie(response, token)
    return {"ok": True, "user": user_public(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user": user_public(user)}


@router.post("/password")
def change_password(
    body: PasswordChangeIn,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    iland_session: Optional[str] = Cookie(default=None),
):
    """改密：校验旧密码 → 换新密码 → 其他设备的旧会话全部失效（保留当前会话）。"""
    if not verify_password(body.old_password, user.pass_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "现在的密码不对，再想想")
    if body.old_password == body.new_password:
        raise HTTPException(422, "新密码和现在的一样，换一个吧")
    user.pass_hash = hash_password(body.new_password)
    db.add(user)
    db.exec(
        sa_delete(AuthSession).where(  # type: ignore[arg-type]
            AuthSession.user_id == user.id, AuthSession.token != (iland_session or "")
        )
    )
    db.commit()
    room_runtime.sweep()  # 其他设备被撤销的会话立即退出房间；当前会话保留
    return {"ok": True}


@router.post("/logout")
def logout(
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.exec(sa_delete(AuthSession).where(AuthSession.user_id == user.id))  # type: ignore[arg-type]
    db.commit()
    room_runtime.sweep()  # 退出撤销此账号所有会话，同时解除座位与依靠
    response.delete_cookie(SESSION_COOKIE, secure=COOKIE_SECURE)
    return {"ok": True}
