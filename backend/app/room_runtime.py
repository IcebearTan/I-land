"""两位岛民的短期房间：单 worker 内串行，只有景色时钟持久化。

锁内只做同步的状态/小型数据库操作，不等待网络。每个 WS 拥有独立队列和
绑定代数，广播经所在 loop 投递，迟到的 finally 无法清除后来接管的连接。
"""

import asyncio
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from threading import RLock
from time import monotonic, time
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.dialects.sqlite import insert
from sqlmodel import Session

from .db import engine
from .models import AuthSession, RoomClock, User

LEASE_SECONDS = 30
SWEEP_SECONDS = 2
ROOM = "seaside"
ACCOUNTS = {"bear", "her"}


@dataclass
class SocketBinding:
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=1))
    id: str = field(default_factory=lambda: str(uuid4()))


@dataclass
class Member:
    user_id: int
    account: str
    display: str
    sprite: str
    client_id: str
    session_token: str
    lease_id: str
    seat: int
    expires_mono: float
    connection_generation: int = 1
    pose: str = "seated"
    socket: SocketBinding | None = None


class RoomRuntime:
    def __init__(self, *, target_engine=engine, utc_ms=None, monotonic_seconds=None):
        self.engine = target_engine
        self.utc_ms = utc_ms or (lambda: int(time() * 1000))
        self.monotonic_seconds = monotonic_seconds or monotonic
        self.lock = RLock()
        self.epoch = str(uuid4())
        self.revision = 0
        self.members: dict[int, Member] = {}
        # 只记录接管，普通离开/后台/断线可以用相同页面 ID 重新进入。
        self.retired: deque[tuple[int, str]] = deque(maxlen=64)
        self.retired_leases: deque[tuple[int, str]] = deque(maxlen=64)
        self.starts = 0

    def start(self):
        with self.lock:
            if self.starts == 0:
                self.epoch = str(uuid4())
                self.revision = 0
                self.members.clear()
                self.retired.clear()
                self.retired_leases.clear()
            self.starts += 1

    def stop(self):
        with self.lock:
            self.starts = max(0, self.starts - 1)
            if self.starts == 0:
                for member in self.members.values():
                    self._notify(member.socket, 1001)
                self.members.clear()

    @staticmethod
    def _notify(binding: SocketBinding | None, payload: dict | int):
        if not binding or binding.loop.is_closed():
            return

        def offer():
            if binding.queue.full():
                binding.queue.get_nowait()
            binding.queue.put_nowait(payload)

        # REST 与测试可能位于其他线程/事件循环；队列只在所属 loop 内操作。
        try:
            binding.loop.call_soon_threadsafe(offer)
        except RuntimeError:
            pass  # loop 已关闭，由租约扫尾处理

    @staticmethod
    def _auth(db: Session, token: str | None) -> User:
        auth = db.get(AuthSession, token) if token else None
        if not auth or auth.expires_at <= datetime.utcnow():
            raise HTTPException(401, "登录已过期，请重新登岛")
        user = db.get(User, auth.user_id)
        if not user:
            raise HTTPException(401, "用户不存在")
        if user.name not in ACCOUNTS:
            raise HTTPException(403, "只有两位岛民可以进入这片海边")
        return user

    def _clock(self, db: Session) -> RoomClock:
        clock = db.get(RoomClock, ROOM)
        if clock is None:
            now = self.utc_ms()
            db.execute(insert(RoomClock).values(
                room=ROOM, virtual_base_ms=now, real_anchor_utc_ms=now,
                rate=1, version=1, following_real=True, time_zone="Asia/Shanghai",
            ).on_conflict_do_nothing(index_elements=[RoomClock.room]))
            db.commit()
            clock = db.get(RoomClock, ROOM)
        return clock

    def _snapshot(self, db: Session) -> dict:
        clock = self._clock(db)
        return {
            "room": ROOM, "epoch": self.epoch, "revision": self.revision,
            "server_now_ms": self.utc_ms(),
            "clock": clock.model_dump(exclude={"room"}),
            "members": [{
                "user_id": member.user_id, "account": member.account,
                "display": member.display, "sprite": member.sprite,
                "seat": member.seat, "pose": member.pose,
            } for member in sorted(self.members.values(), key=lambda item: item.seat)],
        }

    def _publish(self, db: Session, *, changed: bool = True) -> dict:
        if changed:
            self.revision += 1
        snapshot = self._snapshot(db)
        for member in self.members.values():
            self._notify(member.socket, snapshot)
        return snapshot

    def _end_leaning(self) -> bool:
        if len(self.members) == 2 and all(
            member.pose in ("seated", "leaning") for member in self.members.values()
        ):
            return False
        changed = False
        for member in self.members.values():
            if member.pose == "leaning":
                member.pose = "seated"
                changed = True
        return changed

    def _clean(self, db: Session):
        now = self.monotonic_seconds()
        changed = False
        for user_id, member in list(self.members.items()):
            try:
                user = self._auth(db, member.session_token)
                invalid = user.id != user_id
            except HTTPException:
                user = None
                invalid = True
            if invalid or member.expires_mono <= now:
                self.members.pop(user_id)
                self._notify(member.socket, 4401 if invalid else 4410)
                changed = True
            elif (member.display, member.sprite) != (user.display, user.name):
                # sprite 固定身份，改名字不换人；不信客户端的 sprite/author。
                member.display, member.sprite = user.display, user.name
                changed = True
        changed = self._end_leaning() or changed
        if changed:
            self._publish(db)

    @staticmethod
    def _lost(reason: str = "ended"):
        return HTTPException(409, {"code": "lease_lost", "reason": reason,
                                   "message": "这个页面的座位已结束，请重新进入海边"})

    def _member(self, user: User, token: str, lease_id: str) -> Member:
        owner = next((item for item in self.members.values() if item.lease_id == lease_id), None)
        if ((owner and owner.user_id != user.id) or any(
            retired_user != user.id and retired_lease == lease_id
            for retired_user, retired_lease in self.retired_leases
        )):
            raise HTTPException(403, {"code": "identity_mismatch", "message": "这不是当前身份的座位，请重新上岛"})
        member = self.members.get(user.id)
        if member and member.lease_id == lease_id and member.session_token != token:
            raise HTTPException(401, "当前页面的登录会话已经改变，请重新上岛")
        if not member or member.lease_id != lease_id or member.session_token != token:
            raise self._lost("taken_over" if (user.id, lease_id) in self.retired_leases else "ended")
        return member

    def snapshot(self, token: str | None) -> dict:
        with self.lock, Session(self.engine) as db:
            self._clean(db)
            self._auth(db, token)
            return self._snapshot(db)

    def join(self, token: str | None, client_id: str, connection_generation: int | None = None,
             expected_account: str | None = None) -> dict:
        with self.lock, Session(self.engine) as db:
            self._clean(db)
            user = self._auth(db, token)
            # 客户端只声明进入意图，身份仍取 Cookie；旧页换号不得先接管再补偿 leave。
            if expected_account is not None and user.name != expected_account:
                raise HTTPException(401, {"code": "identity_changed", "message": "登录身份已经改变，请重新上岛"})
            current = self.members.get(user.id)
            own = {"user_id": user.id, "account": user.name}
            if current and current.client_id == client_id and current.session_token == token:
                generation = connection_generation if connection_generation is not None else current.connection_generation
                if generation < current.connection_generation:
                    raise self._lost("ended")  # 旧迟到 join 不可重新旋转新连接的租约
                if generation > current.connection_generation:
                    previous = current.socket
                    current.socket = None
                    current.lease_id = str(uuid4())
                    current.connection_generation = generation
                    self._notify(previous, 4410)
                current.expires_mono = self.monotonic_seconds() + LEASE_SECONDS
                return {"snapshot": self._snapshot(db), "lease_id": current.lease_id, "self": own}
            if (user.id, client_id) in self.retired:
                raise self._lost("taken_over")
            if current and current.client_id == client_id and current.session_token != token:
                raise HTTPException(401, "当前页面的登录会话已经改变，请重新上岛")
            occupied = {member.seat for member in self.members.values() if member.user_id != user.id}
            seat = current.seat if current else next(seat for seat in (0, 1) if seat not in occupied)
            if current:
                self.retired.append((current.user_id, current.client_id))
                self.retired_leases.append((current.user_id, current.lease_id))
                self._notify(current.socket, 4409)
                self.members.pop(user.id)
                self._end_leaning()  # 接管也结束旧页面参与的依靠，再让新页面入座
            member = Member(
                user_id=user.id, account=user.name, display=user.display, sprite=user.name,
                client_id=client_id, session_token=token, lease_id=str(uuid4()), seat=seat,
                expires_mono=self.monotonic_seconds() + LEASE_SECONDS,
                connection_generation=connection_generation or 1,
            )
            self.members[user.id] = member
            self._end_leaning()
            return {"snapshot": self._publish(db), "lease_id": member.lease_id, "self": own}

    def heartbeat(self, token: str | None, lease_id: str) -> dict:
        with self.lock, Session(self.engine) as db:
            self._clean(db)
            user = self._auth(db, token)
            member = self._member(user, token, lease_id)
            member.expires_mono = self.monotonic_seconds() + LEASE_SECONDS
            return {"snapshot": self._snapshot(db)}

    def leave(self, token: str | None, lease_id: str) -> dict:
        with self.lock, Session(self.engine) as db:
            self._clean(db)
            user = self._auth(db, token)
            member = self.members.get(user.id)
            if member and member.lease_id == lease_id and member.session_token == token:
                self.members.pop(user.id)
                self._notify(member.socket, 4410)
                self._end_leaning()
                return {"snapshot": self._publish(db)}
            return {"snapshot": self._snapshot(db)}  # 旧 leave 无副作用、可重试

    def pose(self, token: str | None, lease_id: str, pose: str) -> dict:
        with self.lock, Session(self.engine) as db:
            self._clean(db)
            user = self._auth(db, token)
            member = self._member(user, token, lease_id)
            if pose == "leaning" and (
                len(self.members) != 2 or member.pose == "standing" or any(
                    other.pose == "standing" for other in self.members.values()
                )
            ):
                raise HTTPException(409, {"code": "pose_unavailable", "message": "等两个人都坐下，再轻轻靠近"})
            changed = member.pose != pose
            member.pose = pose
            changed = self._end_leaning() or changed
            return {"snapshot": self._publish(db, changed=changed)}

    def change_clock(self, token: str | None, lease_id: str, version: int,
                     action: str, rate: int | None = None) -> dict:
        with self.lock, Session(self.engine) as db:
            self._clean(db)
            user = self._auth(db, token)
            self._member(user, token, lease_id)
            old = self._clock(db)
            if old.version != version:
                raise HTTPException(409, {
                    "code": "clock_conflict", "message": "海边时间刚刚被调整了，已同步最新景色",
                    "snapshot": self._snapshot(db),
                })
            now = self.utc_ms()
            virtual_now = old.virtual_base_ms + (now - old.real_anchor_utc_ms) * old.rate
            values = {
                "virtual_base_ms": now if action == "reset" else virtual_now,
                "real_anchor_utc_ms": now, "rate": 1 if action == "reset" else rate,
                "version": version + 1, "changed_by": user.name,
                "following_real": True if action == "reset" else old.following_real and rate == 1,
            }
            result = db.execute(update(RoomClock).where(
                RoomClock.room == ROOM, RoomClock.version == version,
            ).values(**values))
            if result.rowcount != 1:
                db.rollback()
                db.expire_all()
                raise HTTPException(409, {
                    "code": "clock_conflict", "message": "海边时间刚刚被调整了，请重试",
                    "snapshot": self._snapshot(db),
                })
            db.commit()
            db.expire_all()
            return {"snapshot": self._publish(db)}

    def connect(self, token: str | None, lease_id: str,
                loop: asyncio.AbstractEventLoop) -> SocketBinding:
        with self.lock, Session(self.engine) as db:
            self._clean(db)
            user = self._auth(db, token)
            member = self._member(user, token, lease_id)
            binding = SocketBinding(loop=loop)
            previous, member.socket = member.socket, binding
            member.expires_mono = self.monotonic_seconds() + LEASE_SECONDS
            self._notify(previous, 4409)
            self._notify(binding, self._snapshot(db))
            return binding

    def disconnect(self, token: str | None, lease_id: str, binding: SocketBinding):
        with self.lock, Session(self.engine) as db:
            # token 可能已经失效，清理仍需执行；所有代数都必须匹配。
            member = next((item for item in self.members.values() if item.lease_id == lease_id), None)
            if member and member.session_token == token and member.socket is binding:
                self.members.pop(member.user_id)
                self._end_leaning()
                self._publish(db)

    def sweep(self):
        with self.lock, Session(self.engine) as db:
            self._clean(db)

    async def watch(self):
        while True:
            await asyncio.sleep(SWEEP_SECONDS)
            self.sweep()


room_runtime = RoomRuntime()
