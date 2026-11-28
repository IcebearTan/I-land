"""两位岛民的短期房间：单 worker 内串行，景色时钟与电视状态持久化。

锁内只做同步的状态/小型数据库操作，不等待网络。每个 WS 拥有独立队列和
绑定代数，广播经所在 loop 投递，迟到的 finally 无法清除后来接管的连接。
"""

import asyncio
from collections import OrderedDict, deque
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
from .models import AuthSession, RoomClock, RoomTelevision, User
from .study_service import (
    NUDGE_COOLDOWN_MS,
    build_study_room_extra,
    serialize_timer,
    settle_study_timers,
)

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
    seat: int | None
    expires_mono: float
    connection_generation: int = 1
    pose: str = "seated"
    socket: SocketBinding | None = None


class RoomCoordinator:
    """同一身份跨房间转移共用锁；同页进场代数防止迟到的首次 join。"""

    def __init__(self):
        self.lock = RLock()
        self.rooms: dict[str, RoomRuntime] = {}
        self.entries: OrderedDict[tuple[int, str], tuple[int, str, str]] = OrderedDict()

    def check_entry(self, user_id, page_id, generation, room, client_id):
        if page_id is None:
            return
        key = (user_id, page_id)
        previous = self.entries.get(key)
        if previous and (generation < previous[0] or
                         (generation == previous[0] and previous[1:] != (room, client_id))):
            raise RoomRuntime._lost("taken_over")

    def record_entry(self, user_id, page_id, generation, room, client_id):
        if page_id is None:
            return
        key = (user_id, page_id)
        self.entries[key] = (generation, room, client_id)
        self.entries.move_to_end(key)
        while len(self.entries) > 256:
            self.entries.popitem(last=False)


class RoomRuntime:
    def __init__(self, *, target_engine=engine, utc_ms=None, monotonic_seconds=None,
                 room=ROOM, coordinator=None):
        if room not in ("seaside", "interior", "study"):
            raise ValueError("未知房间")
        self.room = room
        self.coordinator = coordinator or RoomCoordinator()
        self.coordinator.rooms[room] = self
        self.engine = target_engine
        self.utc_ms = utc_ms or (lambda: int(time() * 1000))
        self.monotonic_seconds = monotonic_seconds or monotonic
        self.lock = self.coordinator.lock
        self.epoch = str(uuid4())
        self.revision = 0
        self.members: dict[int, Member] = {}
        # 只记录接管，普通离开/后台/断线可以用相同页面 ID 重新进入。
        self.retired: deque[tuple[int, str]] = deque(maxlen=64)
        self.retired_leases: deque[tuple[int, str]] = deque(maxlen=64)
        self.nudge_seq = 0
        self.last_nudge: dict | None = None
        self.nudge_cooldown_ms: dict[str, int] = {}
        self.starts = 0

    def start(self):
        with self.lock:
            if self.starts == 0:
                if all(runtime.starts == 0 for runtime in self.coordinator.rooms.values()):
                    self.coordinator.entries.clear()
                self.epoch = str(uuid4())
                self.revision = 0
                self.members.clear()
                self.retired.clear()
                self.retired_leases.clear()
                self.nudge_seq = 0
                self.last_nudge = None
                self.nudge_cooldown_ms.clear()
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
            raise HTTPException(403, "只有两位岛民可以进入这个房间")
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
        if self.room == "seaside":
            state = {"clock": self._clock(db).model_dump(exclude={"room"})}
        elif self.room == "interior":
            state = {"television": self._television(db).model_dump(exclude={"room"})}
        else:
            online_accounts = {member.account for member in self.members.values()}
            state = build_study_room_extra(db, self.utc_ms(), online_accounts, self.last_nudge)
        return {
            "room": self.room, "epoch": self.epoch, "revision": self.revision,
            "server_now_ms": self.utc_ms(),
            **state,
            "members": [{
                "user_id": member.user_id, "account": member.account,
                "display": member.display, "sprite": member.sprite,
                "seat": member.seat, "pose": member.pose,
            } for member in sorted(self.members.values(), key=lambda item: (
                item.seat if item.seat is not None else 2, item.user_id))],
        }

    def _television(self, db: Session) -> RoomTelevision:
        television = db.get(RoomTelevision, "interior")
        if television is None:
            db.execute(insert(RoomTelevision).values(
                room="interior", powered=False, channel=0, position_ms=0,
                anchor_utc_ms=self.utc_ms(), version=1,
            ).on_conflict_do_nothing(index_elements=[RoomTelevision.room]))
            db.commit()
            television = db.get(RoomTelevision, "interior")
        return television

    def _publish(self, db: Session, *, changed: bool = True) -> dict:
        if changed:
            self.revision += 1
        snapshot = self._snapshot(db)
        for member in self.members.values():
            self._notify(member.socket, snapshot)
        return snapshot

    def _end_leaning(self) -> bool:
        if self.room != "seaside":
            return False
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
        if self.room == "study" and self.members:
            _, timer_changed = settle_study_timers(
                db, self.utc_ms(), {member.account for member in self.members.values()}
            )
            changed = timer_changed or changed
        if changed:
            self._publish(db)

    @staticmethod
    def _lost(reason: str = "ended"):
        return HTTPException(409, {"code": "lease_lost", "reason": reason,
                                   "message": "这个页面的房间连接已结束，请重新加入"})

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

    def read_summary(self, db: Session | None = None) -> dict:
        """无副作用只读摘要（供 /api/agent/digest 使用，不要求房间租约或 Cookie）。"""
        with self.lock:
            if db is None:
                with Session(self.engine) as own_db:
                    return self._read_summary_locked(own_db)
            return self._read_summary_locked(db)

    def _read_summary_locked(self, db: Session) -> dict:
        self._clean(db)
        members = [
            {
                "account": member.account,
                "display": member.display,
                "seat": member.seat,
                "pose": member.pose,
            }
            for member in sorted(
                self.members.values(),
                key=lambda item: (item.seat if item.seat is not None else 2, item.user_id),
            )
        ]
        summary: dict = {"online_count": len(members), "members": members}
        if self.room == "seaside":
            clock = self._clock(db)
            summary["clock_rate"] = clock.rate
            summary["following_real"] = clock.following_real
        elif self.room == "interior":
            tv = self._television(db)
            summary["tv_powered"] = tv.powered
            summary["tv_channel"] = tv.channel
        else:
            rows, _ = settle_study_timers(
                db, self.utc_ms(), {item["account"] for item in members}
            )
            timers = {acc: serialize_timer(row) for acc, row in rows.items()}
            summary["timers"] = timers
            summary["roof_lit"] = bool(members) or any(
                t["phase"] in ("focusing", "stopwatch") for t in timers.values()
            )
        return summary

    def join(self, token: str | None, client_id: str, connection_generation: int | None = None,
             expected_account: str | None = None, page_id: str | None = None,
             entry_generation: int | None = None) -> dict:
        with self.lock, Session(self.engine) as db:
            self._clean(db)
            user = self._auth(db, token)
            # 客户端只声明进入意图，身份仍取 Cookie；旧页换号不得先接管再补偿 leave。
            if expected_account is not None and user.name != expected_account:
                raise HTTPException(401, {"code": "identity_changed", "message": "登录身份已经改变，请重新上岛"})
            self.coordinator.check_entry(user.id, page_id, entry_generation, self.room, client_id)
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
            # 校验新意图后才释放另一房间；全部运行时共用锁，不会出现双重占位。
            for other in self.coordinator.rooms.values():
                if other is self:
                    continue
                previous = other.members.pop(user.id, None)
                if previous:
                    other.retired.append((user.id, previous.client_id))
                    other.retired_leases.append((user.id, previous.lease_id))
                    other._notify(previous.socket, 4409)
                    other._end_leaning()
                    other._publish(db)
            occupied = {member.seat for member in self.members.values() if member.user_id != user.id}
            if self.room == "seaside":
                seat = current.seat if current else next(seat for seat in (0, 1) if seat not in occupied)
                default_pose = "seated"
            elif self.room == "study":
                seat = 0 if user.name == "bear" else 1
                default_pose = "seated"
            else:
                seat = None
                default_pose = "standing"
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
                pose=default_pose,
            )
            self.members[user.id] = member
            self.coordinator.record_entry(user.id, page_id, entry_generation, self.room, client_id)
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

    def change_seat(self, token: str | None, lease_id: str, seat: int | None) -> dict:
        with self.lock, Session(self.engine) as db:
            self._clean(db)
            user = self._auth(db, token)
            member = self._member(user, token, lease_id)
            if seat is not None and any(other.user_id != user.id and other.seat == seat
                                        for other in self.members.values()):
                raise HTTPException(409, {"code": "seat_occupied", "message": "这个位置有人坐着，选另一个吧。",
                                          "snapshot": self._snapshot(db)})
            changed = member.seat != seat
            member.seat, member.pose = seat, "seated" if seat is not None else "standing"
            return {"snapshot": self._publish(db, changed=changed)}

    def change_television(self, token: str | None, lease_id: str, version: int, action: str) -> dict:
        with self.lock, Session(self.engine) as db:
            self._clean(db)
            user = self._auth(db, token)
            self._member(user, token, lease_id)
            old = self._television(db)
            def conflict():
                return HTTPException(409, {"code": "television_conflict", "message": "电视刚被调整，已同步最新节目。",
                                            "snapshot": self._snapshot(db)})
            if old.version != version:
                raise conflict()
            if action == "next" and not old.powered:
                raise HTTPException(409, {"code": "television_off", "message": "先打开电视，再选择节目。"})
            now = self.utc_ms()
            position = (old.position_ms + (max(0, now - old.anchor_utc_ms) if old.powered else 0)) % 24000
            result = db.execute(update(RoomTelevision).where(
                RoomTelevision.room == "interior", RoomTelevision.version == version,
            ).values(
                powered=not old.powered if action == "toggle" else old.powered,
                channel=(old.channel + 1) % 3 if action == "next" else old.channel,
                position_ms=0 if action == "next" else position, anchor_utc_ms=now,
                version=version + 1, changed_by=user.name,
            ))
            if result.rowcount != 1:
                db.rollback(); db.expire_all()
                raise conflict()
            db.commit(); db.expire_all()
            return {"snapshot": self._publish(db)}

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

    def publish_external(self, db: Session) -> dict:
        with self.lock:
            return self._publish(db)

    def emit_nudge(
        self,
        db: Session,
        *,
        from_account: str,
        from_display: str,
        kind: str,
        label: str,
    ) -> tuple[dict, dict]:
        with self.lock:
            now = self.utc_ms()
            last_at = self.nudge_cooldown_ms.get(from_account, 0)
            if last_at and now - last_at < NUDGE_COOLDOWN_MS:
                wait_sec = max(1, (NUDGE_COOLDOWN_MS - (now - last_at) + 999) // 1000)
                raise HTTPException(429, f"轻互动冷却中，{wait_sec} 秒后再试吧")
            self.nudge_cooldown_ms[from_account] = now
            self.nudge_seq += 1
            self.last_nudge = {
                "seq": self.nudge_seq,
                "kind": kind,
                "label": label,
                "from_account": from_account,
                "from_display": from_display,
                "at_ms": now,
            }
            return self.last_nudge, self._publish(db)

    def sweep(self):
        with self.lock, Session(self.engine) as db:
            self._clean(db)

    async def watch(self):
        while True:
            await asyncio.sleep(SWEEP_SECONDS)
            self.sweep()


room_runtime = RoomRuntime()
home_runtime = RoomRuntime(room="interior", coordinator=room_runtime.coordinator)
study_runtime = RoomRuntime(room="study", coordinator=room_runtime.coordinator)
room_runtimes = {"seaside": room_runtime, "interior": home_runtime, "study": study_runtime}
