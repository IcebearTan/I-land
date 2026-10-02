"""私人海边房间：Cookie 身份，REST 动作，WS 只推送完整快照。"""

import asyncio
import os
from contextlib import suppress
from math import isfinite
from typing import Annotated, Literal
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Cookie, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from starlette.requests import HTTPConnection

from ..config import SESSION_COOKIE
from ..room_runtime import room_runtime

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


class RoomIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def finite_json(cls, value):
        # 非标准 JSON 的 NaN/Infinity 也必须成为可编码的 422，而不是错误体 500。
        def clean(item):
            if isinstance(item, float) and not isfinite(item):
                return str(item)
            if isinstance(item, dict):
                return {key: clean(child) for key, child in item.items()}
            if isinstance(item, list):
                return [clean(child) for child in item]
            return item
        return clean(value)


class JoinIn(RoomIn):
    client_id: UUID
    connection_generation: int | None = Field(default=None, strict=True, ge=1)
    expected_account: Literal["bear", "her"] | None = None


class LeaseIn(RoomIn):
    lease_id: UUID


class PoseIn(LeaseIn):
    pose: Literal["seated", "standing", "leaning"]


class RateIn(LeaseIn):
    version: int = Field(strict=True, ge=1)
    action: Literal["rate"]
    rate: Literal[0, 1, 30, 120]

    @field_validator("rate", mode="before")
    @classmethod
    def strict_rate(cls, value):
        if type(value) is not int or value not in (0, 1, 30, 120):
            raise ValueError("景色倍率只接受 0、1、30、120 的整数")
        return value


class ResetIn(LeaseIn):
    version: int = Field(strict=True, ge=1)
    action: Literal["reset"]


ClockIn = Annotated[RateIn | ResetIn, Field(discriminator="action")]


def _origin(value: str) -> tuple | None:
    try:
        parsed = urlsplit(value)
        if (parsed.scheme not in ("http", "https") or not parsed.hostname
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in ("", "/")):
            return None
        return (parsed.scheme, parsed.hostname.lower(),
                parsed.port or (443 if parsed.scheme == "https" else 80))
    except ValueError:
        return None


def check_source(connection: HTTPConnection, *, websocket: bool = False):
    # 不信任任意 X-Forwarded-*。反代应使用 uvicorn 的可信 proxy headers，
    # 或部署者明确指定 ILAND_ROOM_ORIGINS（逗号分隔的完整 http(s) origin）。
    source = connection.headers.get("origin")
    if not source:
        if websocket or connection.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403, "请从小岛自己的页面进入海边")
        return  # 本地工具/无 Origin 的同源 GET 仍走严格 Cookie 身份校验
    scheme = {"ws": "http", "wss": "https"}.get(connection.url.scheme, connection.url.scheme)
    expected = _origin(f"{scheme}://{connection.url.netloc}")
    allowed = {expected}
    allowed.update(filter(None, (
        _origin(value.strip()) for value in os.getenv("ILAND_ROOM_ORIGINS", "").split(",")
    )))
    if _origin(source) not in allowed or _origin(source) is None:
        raise HTTPException(403, "海边请求来源不匹配")


@router.get("/seaside")
def get_seaside(request: Request, iland_session: str | None = Cookie(default=None)):
    check_source(request)
    return room_runtime.snapshot(iland_session)


@router.post("/seaside/join")
def join_seaside(body: JoinIn, request: Request, iland_session: str | None = Cookie(default=None)):
    check_source(request)
    return room_runtime.join(iland_session, str(body.client_id), body.connection_generation, body.expected_account)


@router.post("/seaside/heartbeat")
def heartbeat_seaside(body: LeaseIn, request: Request, iland_session: str | None = Cookie(default=None)):
    check_source(request)
    return room_runtime.heartbeat(iland_session, str(body.lease_id))


@router.post("/seaside/leave")
def leave_seaside(body: LeaseIn, request: Request, iland_session: str | None = Cookie(default=None)):
    check_source(request)
    return room_runtime.leave(iland_session, str(body.lease_id))


@router.put("/seaside/pose")
def pose_seaside(body: PoseIn, request: Request, iland_session: str | None = Cookie(default=None)):
    check_source(request)
    return room_runtime.pose(iland_session, str(body.lease_id), body.pose)


@router.put("/seaside/clock")
def clock_seaside(body: ClockIn, request: Request, iland_session: str | None = Cookie(default=None)):
    check_source(request)
    return room_runtime.change_clock(
        iland_session, str(body.lease_id), body.version, body.action,
        body.rate if isinstance(body, RateIn) else None,
    )


@router.websocket("/seaside/events")
async def events_seaside(websocket: WebSocket, lease_id: str = ""):
    try:
        check_source(websocket, websocket=True)
        lease_id = str(UUID(lease_id))
        token = websocket.cookies.get(SESSION_COOKIE)
        binding = room_runtime.connect(token, lease_id, asyncio.get_running_loop())
    except (HTTPException, ValueError) as error:
        code = (4401 if isinstance(error, HTTPException) and error.status_code == 401 else
                4403 if isinstance(error, HTTPException) and error.status_code == 403 else
                4410 if isinstance(error, HTTPException) and isinstance(error.detail, dict)
                and error.detail.get("reason") == "ended" else 4409)
        await websocket.close(code=code)
        return

    async def send_snapshots():
        while True:
            payload = await binding.queue.get()
            if isinstance(payload, int):
                await websocket.close(code=payload)
                return
            await websocket.send_json(payload)

    async def wait_disconnect():
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                return
            # WS 是只读快照流；任何动作/心跳都必须走 REST。
            if message["type"] == "websocket.receive":
                await websocket.close(code=1008)
                return

    tasks = []
    try:
        await websocket.accept()
        tasks = [asyncio.create_task(send_snapshots()), asyncio.create_task(wait_disconnect())]
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except (WebSocketDisconnect, RuntimeError, OSError, asyncio.CancelledError):
        pass
    finally:
        # 先同步释放，再等待子任务；ASGI server 的取消不会跳过租约清理。
        room_runtime.disconnect(token, lease_id, binding)
        for task in tasks:
            task.cancel()
        if tasks:
            with suppress(asyncio.CancelledError):
                await asyncio.gather(*tasks, return_exceptions=True)
