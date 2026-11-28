"""星光阁楼书房（双人自习室）后端测试：实时占座、番茄钟同频与结算、截图轻聊与冷却轻互动。"""

from datetime import datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.attachments import list_orphan_attachments
from app.db import engine
from app.main import app
from app.models import Attachment
from app.room_runtime import study_runtime
from .conftest import current_login, make_png


def _login(client: TestClient, account: str) -> None:
    res = client.post(
        "/api/auth/login",
        json={"name": current_login(client, account), "password": "123456"},
    )
    assert res.status_code == 200


def test_study_room_fixed_seats_timer_sync_and_settle(monkeypatch):
    fake_now = [1_764_336_000_000]
    monkeypatch.setattr(study_runtime, "utc_ms", lambda: fake_now[0])

    with TestClient(app) as bear_c, TestClient(app) as her_c, TestClient(app) as tester_c:
        _login(bear_c, "bear")
        _login(her_c, "her")
        _login(tester_c, "tester")

        # 非双人账号禁止使用书房接口与占座
        assert tester_c.post("/api/study/timer", json={"action": "start_focus"}).status_code == 403
        assert tester_c.post("/api/rooms/study/join", json={"client_id": str(uuid4())}).status_code == 403

        # 固定座位：小熊左席(0)、她右席(1)
        j_bear = bear_c.post("/api/rooms/study/join", json={"client_id": str(uuid4())})
        assert j_bear.status_code == 200
        bear_lease = j_bear.json()["lease_id"]
        assert j_bear.json()["snapshot"]["members"][0]["seat"] == 0

        j_her = her_c.post("/api/rooms/study/join", json={"client_id": str(uuid4())})
        assert j_her.status_code == 200
        her_lease = j_her.json()["lease_id"]
        seats = {m["account"]: m["seat"] for m in j_her.json()["snapshot"]["members"]}
        assert seats == {"bear": 0, "her": 1}

        try:
            # 1. 她开启 25/5 番茄钟，屋顶天窗点亮
            start_res = her_c.post(
                "/api/study/timer",
                json={"action": "start_focus", "focus_minutes": 25, "break_minutes": 5, "goal_text": "看文献第3章"},
            )
            assert start_res.status_code == 200
            her_timer = start_res.json()["timer"]
            assert her_timer["phase"] == "focusing"
            assert her_timer["ends_at_ms"] == fake_now[0] + 25 * 60_000

            ov = bear_c.get("/api/study/overview").json()
            assert ov["roof_lit"] is True
            assert ov["online_count"] == 2

            # 2. 小熊过 5 分钟后点击「跟随她的节奏」，结束时间戳严格对齐
            fake_now[0] += 5 * 60_000
            sync_res = bear_c.post(
                "/api/study/timer",
                json={"action": "sync_partner", "goal_text": "写代码重构"},
            )
            assert sync_res.status_code == 200
            bear_timer = sync_res.json()["timer"]
            assert bear_timer["phase"] == "focusing"
            assert bear_timer["ends_at_ms"] == her_timer["ends_at_ms"]
            assert bear_timer["synced_with"] == "her"

            # 3. 推进到专注结束：双双进入 5 分钟休息，并各记入 1 条共学足迹（她 25m，小熊 20m）
            fake_now[0] = her_timer["ends_at_ms"] + 500
            settled = bear_c.post("/api/study/timer", json={"action": "settle"}).json()
            assert settled["timers"]["her"]["phase"] == "resting"
            assert settled["timers"]["bear"]["phase"] == "resting"

            sessions_res = bear_c.get("/api/study/sessions").json()
            assert sessions_res["today"]["her_minutes"] >= 25
            assert sessions_res["today"]["bear_minutes"] >= 20
            assert sessions_res["today"]["together_count"] >= 2

            # 4. 休息结束后自动回到 idle；随后不足 5 分钟提前停止不留任何失败或短记录
            fake_now[0] += 6 * 60_000
            after_break = bear_c.get("/api/study/overview").json()
            assert after_break["timers"]["bear"]["phase"] == "idle"
            assert after_break["timers"]["her"]["phase"] == "idle"

            before_count = bear_c.get("/api/study/sessions").json()["today"]["sessions_count"]
            bear_c.post("/api/study/timer", json={"action": "start_focus", "focus_minutes": 25})
            fake_now[0] += 2 * 60_000
            bear_c.post("/api/study/timer", json={"action": "stop"})
            after_count = bear_c.get("/api/study/sessions").json()["today"]["sessions_count"]
            assert after_count == before_count
        finally:
            bear_c.post("/api/rooms/study/leave", json={"lease_id": bear_lease})
            her_c.post("/api/rooms/study/leave", json={"lease_id": her_lease})


def test_study_chat_attachment_protection_ws_and_nudge_cooldown(monkeypatch):
    fake_now = [1_764_340_000_000]
    monkeypatch.setattr(study_runtime, "utc_ms", lambda: fake_now[0])

    with TestClient(app) as bear_c, TestClient(app) as her_c:
        _login(bear_c, "bear")
        _login(her_c, "her")

        joined = her_c.post("/api/rooms/study/join", json={"client_id": str(uuid4())})
        her_lease = joined.json()["lease_id"]

        try:
            with her_c.websocket_connect(
                f"/api/rooms/study/events?lease_id={her_lease}",
                headers={"origin": "http://testserver"},
            ) as ws:
                initial_snap = ws.receive_json()
                assert initial_snap["room"] == "study"

                # 1. 小熊上传题目截图并在书房发送消息（幂等 client_id）
                up = bear_c.post(
                    "/api/uploads",
                    files={"file": ("problem.png", make_png(), "image/png")},
                )
                assert up.status_code == 201
                att_id = up.json()["attachment"]["id"]

                msg_res = bear_c.post(
                    "/api/study/messages",
                    json={"body": "这道高数题帮我看一眼", "attachment_id": att_id, "client_id": "study-msg-001"},
                )
                assert msg_res.status_code == 201
                msg_id = msg_res.json()["message"]["id"]
                assert msg_res.json()["message"]["attachment"]["id"] == att_id

                # 重复提交相同 client_id 幂等返回同一条
                dup = bear_c.post(
                    "/api/study/messages",
                    json={"body": "这道高数题帮我看一眼", "attachment_id": att_id, "client_id": "study-msg-001"},
                )
                assert dup.json()["message"]["id"] == msg_id

                # 她的单通道 WS 立即收到新的 latest_message_id 游标并按 after_id 拉取增量
                pushed_snap = ws.receive_json()
                assert pushed_snap["latest_message_id"] == msg_id
                delta = her_c.get(f"/api/study/messages?after_id={msg_id - 1}").json()
                assert any(item["id"] == msg_id for item in delta["messages"])

                # 截图已被标记为正式引用，即使超过宽限期也不会进入孤儿附件清理列表
                with Session(engine) as db:
                    att = db.get(Attachment, att_id)
                    assert att is not None and att.linked is True
                    att.created_at = datetime.utcnow() - timedelta(days=10)
                    db.add(att)
                    db.commit()
                    orphans = list_orphan_attachments(db, older_than_days=2)
                    assert all(o["id"] != att_id for o in orphans)

                # 2. 桌边轻互动与 15 秒冷却
                nudge1 = bear_c.post("/api/study/nudge", json={"kind": "tea"})
                assert nudge1.status_code == 200
                nudge_snap = ws.receive_json()
                assert nudge_snap["last_nudge"]["kind"] == "tea"
                assert nudge_snap["last_nudge"]["from_account"] == "bear"

                # 冷却期内再次触发返回 429
                fake_now[0] += 5_000
                assert bear_c.post("/api/study/nudge", json={"kind": "pat"}).status_code == 429

                # 满 15 秒后可正常发送下一次轻互动
                fake_now[0] += 11_000
                nudge2 = bear_c.post("/api/study/nudge", json={"kind": "flower"})
                assert nudge2.status_code == 200
                assert ws.receive_json()["last_nudge"]["kind"] == "flower"

                # 3. 撤回消息权限校验
                assert her_c.delete(f"/api/study/messages/{msg_id}").status_code == 403
                assert bear_c.delete(f"/api/study/messages/{msg_id}").status_code == 200
        finally:
            her_c.post("/api/rooms/study/leave", json={"lease_id": her_lease})
