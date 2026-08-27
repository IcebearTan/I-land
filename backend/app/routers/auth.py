from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import SESSION_COOKIE, SESSION_DAYS
from ..db import get_db
from ..deps import create_session, get_current_user
from ..models import AuthSession, User
from ..security import verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    name: str
    password: str


def user_public(user: User) -> dict:
    return {"id": user.id, "name": user.name, "display": user.display, "sprite": user.sprite}


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.exec(select(User).where(User.name == body.name)).first()
    if not user or not verify_password(body.password, user.pass_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "名字或密码不对哦")
    token = create_session(db, user.id)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
    )
    return {"ok": True, "user": user_public(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user": user_public(user)}


@router.post("/logout")
def logout(
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(AuthSession).where(AuthSession.user_id == user.id).delete()
    db.commit()
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}
