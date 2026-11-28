import hmac
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlmodel import Session, select

from .config import SESSION_DAYS, is_loopback_host, parse_agent_tokens
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


def _auth_via_agent_token(request: Request, authorization: str, db: Session) -> User:
    client_host = request.client.host if request.client else None
    if not is_loopback_host(client_host):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Agent 令牌仅限本机回环访问")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Agent 令牌无效")
    tokens = parse_agent_tokens()
    matched_account: Optional[str] = None
    for expected_token, account in tokens.items():
        if hmac.compare_digest(token, expected_token):
            matched_account = account
    if not matched_account:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Agent 令牌无效或未启用")
    user = db.exec(select(User).where(User.name == matched_account)).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户不存在")
    request.state.auth_via = "agent"
    return user


def get_current_user(
    request: Request,
    iland_session: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if iland_session:
        auth = db.get(AuthSession, iland_session)
        if not auth or auth.expires_at < datetime.utcnow():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "登录已过期")
        user = db.get(User, auth.user_id)
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户不存在")
        request.state.auth_via = "cookie"
        return user
    if authorization and authorization.lower().startswith("bearer "):
        return _auth_via_agent_token(request, authorization, db)
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "未登录")


def require_human_session(
    request: Request,
    user: User = Depends(get_current_user),
) -> User:
    """高危/真人专属路由守卫：禁止本机 Agent Token 调用。"""
    if getattr(request.state, "auth_via", None) != "cookie":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "此操作仅允许岛民本人登录后执行")
    return user
