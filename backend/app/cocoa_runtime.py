"""固定料理台：服务器推进、短输入租约、可恢复的一锅与两杯成果。"""
import asyncio
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .models import CocoaCup, CocoaRecipe, CocoaRun, User, jdump, jload
from .room_runtime import home_runtime

INPUT_SECONDS = 1.5
TICK_SECONDS = .25
IDEAL_LOW, IDEAL_HIGH = 42.0, 68.0


@dataclass
class Intent:
    user_id: int
    lease_id: str
    station: str
    mode: str
    start: float
    until: float


@dataclass
class Offer:
    id: str
    kind: str
    run_id: int
    sender: int
    receiver: int
    sender_lease: str
    receiver_lease: str
    sender_station: str
    receiver_station: str
    cup_id: int | None = None


class CocoaRuntime:
    def __init__(self, room):
        self.room = room
        room.cocoa = self
        self.inputs: dict[int, Intent] = {}
        self.sequences: dict[str, int] = {}
        self.offers: dict[str, Offer] = {}
        self.answered: OrderedDict[str, tuple[int, bool]] = OrderedDict()
        self.cheers = None
        self.receiving: dict[int, int] = {}
        self.running = False
        self.starts = 0
        self.last_tick = self.now()
        self.last_activity = self.last_tick

    def now(self):
        return self.room.monotonic_seconds()

    @staticmethod
    def current(db):
        return db.exec(select(CocoaRun).order_by(CocoaRun.id.desc())).first()

    @staticmethod
    def choices(run):
        data = jload(run.choices_json, {}) if run else {}
        return {account: data.get(account, {"cup_type": "cream", "ingredients": []}) for account in ("bear", "her")}

    def start(self):
        with self.room.lock:
            if self.starts == 0:
                self.inputs.clear(); self.sequences.clear(); self.offers.clear(); self.answered.clear()
                self.cheers = None; self.running = False; self.last_tick = self.now()
                self.receiving.clear()
                with Session(self.room.engine) as db:
                    run = self.current(db)
                    if run and run.phase == "brewing":
                        self.pause(db, run, "服务刚刚恢复，进度留好了。重新到工位继续吧。")
            self.starts += 1

    def stop(self):
        with self.room.lock:
            self.starts = max(0, self.starts - 1)
            if self.starts == 0:
                with Session(self.room.engine) as db:
                    run = self.current(db)
                    if run and run.phase == "brewing":
                        self.pause(db, run, "这一锅已暂停，回来时可以继续。")
                self.inputs.clear(); self.offers.clear(); self.running = False

    def pause(self, db, run, reason):
        self.inputs.clear(); self.running = False; self.last_tick = self.now()
        if run.phase != "brewing":
            return
        run.phase = "paused"; run.reason = reason; run.version += 1
        db.add(run); db.commit()

    def remember(self, offer_id, actor, accepted):
        self.answered[offer_id] = (actor, accepted)
        self.answered.move_to_end(offer_id)
        while len(self.answered) > 128:
            self.answered.popitem(last=False)

    def cancel_member_offers(self, user_id):
        for oid, offer in list(self.offers.items()):
            if user_id in (offer.sender, offer.receiver):
                self.offers.pop(oid)
                self.remember(oid, offer.receiver, False)

    def member_left(self, db, member):
        changed = member.station is not None or member.held_cup_id is not None or member.user_id in self.inputs
        self.inputs.pop(member.user_id, None)
        self.cancel_member_offers(member.user_id)
        member.station = None; member.held_cup_id = None
        self.receiving.pop(member.user_id, None)
        if self.cheers and member.user_id in self.cheers["users"]:
            self.cheers = None
        if changed:
            run = self.current(db)
            if run and run.phase == "brewing":
                self.pause(db, run, "有人先休息了，进度已留好。准备好可以继续。")
        return changed

    def active_inputs(self, now):
        return {uid: value for uid, value in self.inputs.items()
                if value.until > now and (member := self.room.members.get(uid))
                and member.lease_id == value.lease_id and member.station == value.station}

    def member_pose(self, member):
        if member.station is None:
            return None
        if self.cheers and self.cheers["until_ms"] > self.room.utc_ms() and member.user_id in self.cheers["users"]:
            return "cheers"
        if self.receiving.get(member.user_id, 0) > self.room.utc_ms() and member.held_cup_id is not None:
            return "receiving"
        if any(o.kind == "pass" and o.sender == member.user_id for o in self.offers.values()):
            return "offering"
        if member.held_cup_id is not None:
            return "holding"
        return "working" if member.user_id in self.active_inputs(self.now()) else "waiting"

    def recipe_out(self, db, recipe):
        if recipe is None:
            return None
        makers = [db.get(User, uid) for uid in jload(recipe.makers_json, [])]
        cups = db.exec(select(CocoaCup).where(CocoaCup.run_id == recipe.run_id).order_by(CocoaCup.id)).all()
        return {
            "run_id": recipe.run_id, "name": recipe.name, "created_at": recipe.created_at.isoformat() + "Z",
            "makers": [{"user_id": u.id, "account": u.name, "display": u.display} for u in makers if u],
            "cheered_at": recipe.cheered_at.isoformat() + "Z" if recipe.cheered_at else None,
            "cups": [{"id": cup.id, "recipient_id": cup.recipient_id,
                      "recipient_account": db.get(User, cup.recipient_id).name,
                      "recipient_display": db.get(User, cup.recipient_id).display,
                      "cup_type": cup.cup_type, "ingredients": jload(cup.ingredients_json, []),
                      "claimed": cup.claimed} for cup in cups],
        }

    def snapshot(self, db):
        run = self.current(db)
        active = self.active_inputs(self.now())
        makers = [db.get(User, uid) for uid in jload(run.makers_json, [])] if run else []
        def account(uid):
            user = db.get(User, uid)
            return user.name if user else ""
        visible_ids = {m.held_cup_id for m in self.room.members.values() if m.held_cup_id is not None}
        visible_ids.update(o.cup_id for o in self.offers.values() if o.cup_id is not None)
        visible_cups = [db.get(CocoaCup, cid) for cid in sorted(visible_ids)]
        return {
            "run": {"id": run.id, "phase": run.phase, "version": run.version,
                    "temperature": round(run.temperature, 2), "progress": round(run.progress, 2),
                    "choices": self.choices(run), "maker_accounts": [u.name for u in makers if u],
                    "reason": run.reason, "created_at": run.created_at.isoformat() + "Z"} if run else None,
            "operators": [{"account": m.account, "station": m.station,
                           "intent": active[m.user_id].mode if m.user_id in active else None}
                          for m in self.room.members.values() if m.station],
            "offers": [{"id": o.id, "kind": o.kind, "run_id": o.run_id, "from_account": account(o.sender),
                        "to_account": account(o.receiver), "cup_id": o.cup_id} for o in self.offers.values()],
            "recipe": self.recipe_out(db, db.get(CocoaRecipe, run.id)) if run and run.phase == "complete" else None,
            "visible_cups": [{"id": cup.id, "run_id": cup.run_id, "recipient_account": account(cup.recipient_id),
                              "cup_type": cup.cup_type, "ingredients": jload(cup.ingredients_json, [])}
                             for cup in visible_cups if cup],
            "cheers": {k: v for k, v in self.cheers.items() if k != "users"}
                      if self.cheers and self.cheers["until_ms"] > self.room.utc_ms() else None,
        }

    def conflict(self, db, code, message):
        return HTTPException(409, {"code": code, "message": message, "snapshot": self.room._snapshot(db)})

    def require_current(self, db, run_id):
        run = self.current(db)
        if not run or run.id != run_id:
            raise self.conflict(db, "cocoa_changed", "料理台已经换到另一锅了，已同步当前状态。")
        return run

    def require_station(self, db, member):
        if member.station is None:
            raise self.conflict(db, "station_required", "先到料理台的一个工位，再操作这一锅。")

    def station(self, db, member, station):
        if member.seat is not None:
            raise self.conflict(db, "seat_active", "先从沙发起身，再来料理台。")
        if any(m.user_id != member.user_id and m.station == station for m in self.room.members.values()):
            raise self.conflict(db, "station_occupied", "这个工位有人，选空位或请求交换吧。")
        if member.station != station:
            self.inputs.pop(member.user_id, None)
            self.cancel_member_offers(member.user_id)
            member.station = station; member.held_cup_id = None
            self.last_tick = self.now()

    def input(self, db, member, run, seq, mode):
        live_leases = {m.lease_id for m in self.room.members.values()}
        self.sequences = {lease: value for lease, value in self.sequences.items() if lease in live_leases}
        previous = self.sequences.get(member.lease_id, -1)
        if seq <= previous:
            return  # 旧续期/重试绝不能延长输入有效期，也不能覆盖松手。
        self.sequences[member.lease_id] = seq
        if mode == "stop":
            self.inputs.pop(member.user_id, None)
            return
        self.require_station(db, member)
        if run.phase != "brewing":
            raise self.conflict(db, "not_brewing", "这一锅还没开始或已经暂停，先确认当前步骤。")
        if (mode in ("gentle", "heat") and member.station != "heat") or (mode == "stir" and member.station != "stir"):
            raise self.conflict(db, "wrong_station", "工位已经变了，请在当前工位重新操作。")
        now = self.now(); old = self.inputs.get(member.user_id)
        start = old.start if old and old.mode == mode and old.until > now and old.lease_id == member.lease_id else now
        self.inputs[member.user_id] = Intent(member.user_id, member.lease_id, member.station, mode, start, now + INPUT_SECONDS)
        self.last_activity = now

    @staticmethod
    def warm_seconds(temperature, rate, seconds):
        if rate == 0:
            return seconds if IDEAL_LOW <= temperature <= IDEAL_HIGH else 0
        low, high = sorted(((IDEAL_LOW - temperature) / rate, (IDEAL_HIGH - temperature) / rate))
        return max(0, min(seconds, high) - max(0, low))

    def tick(self):
        with self.room.lock, Session(self.room.engine) as db:
            expired = [uid for uid, until in self.receiving.items() if until <= self.room.utc_ms()]
            for uid in expired:
                self.receiving.pop(uid)
            if expired:
                self.room._publish(db)
            if self.cheers and self.cheers["until_ms"] <= self.room.utc_ms():
                self.cheers = None
                self.room._publish(db)
            if not self.running:
                return
            self.room._clean(db)
            run = self.current(db)
            if not run or run.phase != "brewing":
                self.running = False; return
            now = self.now(); before = self.last_tick; self.last_tick = now
            if now <= before:
                return
            if now - before > 2:
                self.pause(db, run, "连接暂歇了一会儿，已安全暂停，没有补算离开的时间。")
                self.room._publish(db); return
            if now - self.last_activity > 15:
                self.pause(db, run, "先歇一会儿，温度和进度都留好了。")
                self.room._publish(db); return
            before = max(before, now - .5)
            valid = {uid: value for uid, value in self.inputs.items()
                     if (m := self.room.members.get(uid)) and m.lease_id == value.lease_id and m.station == value.station}
            points = sorted({before, now, *[t for v in valid.values() for t in (v.start, v.until) if before < t < now]})
            makers = set(jload(run.makers_json, []))
            old_values = (run.temperature, run.progress, run.phase)
            for start, end in zip(points, points[1:]):
                acting = [v for v in valid.values() if v.start <= start and v.until > start]
                heat = next((v for v in acting if v.station == "heat"), None)
                stir = next((v for v in acting if v.mode == "stir"), None)
                rate = (4.0 if heat and heat.mode == "heat" else 1.8 if heat else -.3) - (1.3 if stir else 0)
                seconds = end - start
                gained = 8 * self.warm_seconds(run.temperature, rate, seconds) if stir else 0
                temperature = max(20, min(85, run.temperature + rate * seconds))
                if temperature != run.temperature or gained > 0:
                    makers.update(v.user_id for v in acting)
                run.temperature = temperature; run.progress = min(100, run.progress + gained)
                if run.progress >= 100:
                    run.phase = "pouring"; run.reason = "可可融合好了，给这一锅起个名字吧。"; run.version += 1
                    self.running = False; self.inputs.clear(); break
            run.makers_json = jdump(sorted(makers))
            if old_values != (run.temperature, run.progress, run.phase):
                db.add(run); db.commit(); self.room._publish(db)

    def finish(self, db, member, run_id, name, version):
        recipe = db.get(CocoaRecipe, run_id)
        if recipe:
            return recipe  # 网络重试返回原结果，不重命名或再发杯。
        run = self.require_current(db, run_id)
        self.require_station(db, member)
        if run.phase != "pouring" or run.progress < 100:
            raise self.conflict(db, "not_ready", "先让可可融合好，再分成两杯。")
        if run.version != version:
            raise self.conflict(db, "cocoa_conflict", "制作状态刚更新了，请按当前步骤继续。")
        choices = self.choices(run)
        recipe = CocoaRecipe(run_id=run.id, name=name.strip(), makers_json=run.makers_json)
        db.add(recipe)
        users = db.exec(select(User).where(User.name.in_(["bear", "her"]))).all()
        if len(users) != 2:
            raise HTTPException(409, "需要两位固定岛民的账号，才能为彼此预留两杯。")
        for user in users:
            choice = choices[user.name]
            db.add(CocoaCup(run_id=run.id, recipient_id=user.id, cup_type=choice["cup_type"], ingredients_json=jdump(choice["ingredients"])))
        run.phase = "complete"; run.active_slot = None; run.version += 1; run.reason = "两杯都留好了。"
        db.add(run)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            recipe = db.get(CocoaRecipe, run_id)
            if not recipe:
                raise
        return recipe

    def claim(self, db, member, cup_id):
        self.require_station(db, member)
        current = self.current(db)
        if current and current.phase == "brewing":
            raise self.conflict(db, "pot_busy", "先暂停或完成这一锅，再拿杯子。")
        cup = db.get(CocoaCup, cup_id)
        if not cup or cup.recipient_id != member.user_id:
            raise HTTPException(403, "只能拿起为自己预留的那杯。")
        cup.claimed = True; db.add(cup); db.commit()
        if member.held_cup_id != cup.id:
            self.cheers = None
            self.receiving.pop(member.user_id, None)
        member.held_cup_id = cup.id
        for oid, offer in list(self.offers.items()):
            if offer.cup_id == cup.id or offer.kind == "cheers":
                self.offers.pop(oid); self.remember(oid, offer.receiver, False)
        return cup

    def offer(self, db, member, kind, run_id, cup_id=None):
        self.require_station(db, member)
        other = next((m for m in self.room.members.values() if m.user_id != member.user_id), None)
        if not other or other.station is None:
            raise self.conflict(db, "partner_away", "等对方也来到料理台，再一起回应。")
        if kind == "swap":
            run = self.require_current(db, run_id)
            if run.phase not in ("preparing", "brewing", "paused"):
                raise self.conflict(db, "swap_unavailable", "这一锅已经融合好了，不用再交换工位。")
        else:
            if not db.get(CocoaRecipe, run_id):
                raise self.conflict(db, "not_ready", "这一锅还没分杯。")
            if kind == "pass":
                cup = db.get(CocoaCup, cup_id)
                if not cup or cup.run_id != run_id or cup.recipient_id != other.user_id or cup.claimed:
                    raise self.conflict(db, "cup_unavailable", "只能递出对方还没领取的预留杯。")
            else:
                self.require_held_pair(db, member, other, run_id)
        old = next((o for o in self.offers.values() if o.kind == kind and o.sender == member.user_id and o.run_id == run_id and o.cup_id == cup_id), None)
        if old:
            return old
        if any(o.kind == kind for o in self.offers.values()):
            raise self.conflict(db, "offer_pending", "先回应已经发出的邀请吧。")
        if kind == "pass":
            member.held_cup_id = None  # 自己那杯先放桌上，领取归属保留。
        result = Offer(str(uuid4()), kind, run_id, member.user_id, other.user_id,
                       member.lease_id, other.lease_id, member.station, other.station, cup_id)
        self.offers[result.id] = result
        return result

    def require_held_pair(self, db, first, second, run_id):
        for member in (first, second):
            cup = db.get(CocoaCup, member.held_cup_id) if member.held_cup_id else None
            if not cup or not cup.claimed or cup.run_id != run_id or cup.recipient_id != member.user_id:
                raise self.conflict(db, "cups_required", "两个人都拿好这一锅留给自己的杯子，再轻轻碰杯。")

    def respond(self, db, member, offer_id, accept):
        if offer_id in self.answered:
            actor, previous = self.answered[offer_id]
            if actor == member.user_id and previous == accept:
                return
            raise self.conflict(db, "offer_ended", "这次邀请已经结束，杯子和进度都还在。")
        offer = self.offers.get(offer_id)
        if not offer or offer.receiver != member.user_id:
            raise self.conflict(db, "offer_ended", "这次邀请已结束，或不是递给你的。")
        sender = self.room.members.get(offer.sender)
        if (not sender or sender.lease_id != offer.sender_lease or member.lease_id != offer.receiver_lease
                or sender.station != offer.sender_station or member.station != offer.receiver_station):
            self.offers.pop(offer_id, None)
            raise self.conflict(db, "offer_ended", "工位或连接已改变，重新邀请就好。")
        if accept:
            if offer.kind == "swap":
                run = self.require_current(db, offer.run_id)
                if run.phase not in ("preparing", "brewing", "paused"):
                    raise self.conflict(db, "offer_ended", "这一锅的步骤已经改变。")
                self.inputs.clear(); self.last_tick = self.now()
                sender.station, member.station = member.station, sender.station
            elif offer.kind == "pass":
                self.claim(db, member, offer.cup_id)
                self.receiving[member.user_id] = self.room.utc_ms() + 1000
            else:
                self.require_held_pair(db, sender, member, offer.run_id)
                recipe = db.get(CocoaRecipe, offer.run_id)
                if recipe.cheered_at is None:
                    recipe.cheered_at = datetime.utcnow(); db.add(recipe); db.commit()
                self.cheers = {"id": offer.id, "run_id": offer.run_id,
                               "until_ms": self.room.utc_ms() + 1800, "users": [sender.user_id, member.user_id]}
        self.offers.pop(offer_id, None)
        self.remember(offer_id, member.user_id, accept)

    def action(self, token, body):
        with self.room.lock, Session(self.room.engine) as db:
            self.room._clean(db)
            user = self.room._auth(db, token)
            member = self.room._member(user, token, str(body["lease_id"]))
            action = body["action"]
            if action in ("start", "station", "leave"):
                sequence = body["activity_seq"]
                if sequence <= member.cocoa_seq:
                    return {"snapshot": self.room._snapshot(db)}
                member.cocoa_seq = sequence
            recipe = None
            if action == "start":
                if member.seat is not None:
                    raise self.conflict(db, "seat_active", "先从沙发起身，再来料理台。")
                run = db.exec(select(CocoaRun).where(CocoaRun.request_id == str(body["request_id"]))).first()
                if run is None:
                    run = self.current(db)
                    if run is None or run.phase == "complete":
                        run = CocoaRun(request_id=str(body["request_id"]))
                        db.add(run); db.commit(); db.refresh(run)
                        # 新一锅必须重新确认加入；旧杯保留在作品记录，不带人自动参加。
                        for person in self.room.members.values():
                            self.cancel_member_offers(person.user_id)
                            person.station = None; person.held_cup_id = None
                        self.inputs.clear()
                        self.cheers = None
                        self.receiving.clear()
                if run.phase != "complete":
                    free = next((s for s in ("heat", "stir") if all(m.station != s or m.user_id == user.id for m in self.room.members.values())), None)
                    if free:
                        self.station(db, member, member.station or free)
            elif action == "leave":
                self.member_left(db, member)
            elif action == "claim":
                self.claim(db, member, body["cup_id"])
            elif action == "offer":
                self.offer(db, member, body["kind"], body["run_id"], body.get("cup_id"))
            elif action == "respond":
                self.respond(db, member, str(body["offer_id"]), body["accept"])
            elif action == "cancel":
                oid = str(body["offer_id"]); offer = self.offers.get(oid)
                if offer and offer.sender != user.id:
                    raise HTTPException(403, "只能收回自己发出的邀请。")
                if offer:
                    self.offers.pop(oid); self.remember(oid, offer.receiver, False)
            elif action == "finish":
                recipe = self.finish(db, member, body["run_id"], body["name"], body["version"])
            else:
                run = self.require_current(db, body["run_id"])
                if action == "station":
                    self.station(db, member, body["station"])
                elif action == "input":
                    self.input(db, member, run, body["seq"], body["mode"])
                else:
                    self.require_station(db, member)
                    if run.version != body["version"]:
                        raise self.conflict(db, "cocoa_conflict", "制作状态刚更新，已同步当前步骤。")
                    if action == "choice":
                        if run.phase == "complete":
                            raise self.conflict(db, "already_complete", "完成的配方保留下来；下一锅可以换一种味道。")
                        choices = self.choices(run); choices[user.name] = {"cup_type": body["cup_type"], "ingredients": body["ingredients"]}
                        run.choices_json = jdump(choices)
                    elif action in ("begin", "resume"):
                        if run.phase != ("preparing" if action == "begin" else "paused"):
                            raise self.conflict(db, "phase_changed", "这一锅已经进入另一个步骤。")
                        run.phase = "brewing"; run.reason = ""; self.inputs.clear(); self.running = True
                        for person in self.room.members.values():
                            self.cancel_member_offers(person.user_id)
                            person.held_cup_id = None
                        self.last_tick = self.last_activity = self.now()
                    elif action == "pause":
                        self.pause(db, run, "先歇一会儿，进度会等你。")
                        return {"snapshot": self.room._publish(db)}
                    run.version += 1; db.add(run); db.commit()
            result = {"snapshot": self.room._publish(db)}
            if recipe:
                result["recipe"] = self.recipe_out(db, recipe)
            return result

    def recipes(self, token, run_id=None):
        with self.room.lock, Session(self.room.engine) as db:
            self.room._auth(db, token)
            if run_id is not None:
                recipe = db.get(CocoaRecipe, run_id)
                if not recipe:
                    raise HTTPException(404, "还没有这份配方")
                return {"recipe": self.recipe_out(db, recipe)}
            recipes = db.exec(select(CocoaRecipe).order_by(CocoaRecipe.run_id.desc()).limit(20)).all()
            return {"recipes": [self.recipe_out(db, recipe) for recipe in recipes]}

    async def watch(self):
        while True:
            await asyncio.sleep(TICK_SECONDS)
            self.tick()


cocoa_runtime = CocoaRuntime(home_runtime)
