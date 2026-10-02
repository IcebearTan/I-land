"""ROOM-01：独立 Cookie、并发占座、租约代数、会话及共享时钟。

conftest 在导入 app 前将数据库和附件全部重定向到临时目录。
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlmodel import Session, select
from starlette.websockets import WebSocketDisconnect

from app.config import SESSION_COOKIE
from app.db import engine
from app.deps import create_session
from app.main import app
from app.models import AuthSession, RoomClock, User
from app.room_runtime import RoomRuntime, room_runtime
from app.security import hash_password

from .conftest import current_login

BASE = "/api/rooms/seaside"
ORIGIN = {"origin": "http://testserver"}


def login(client, account):
    response = client.post("/api/auth/login", json={
        "name": current_login(client, account), "password": "123456",
    })
    assert response.status_code == 200, response.text
    return response.json()["user"]


def join(client, client_id=None, generation=None):
    body = {"client_id": client_id or str(uuid4())}
    if generation is not None:
        body["connection_generation"] = generation
    response = client.post(f"{BASE}/join", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def pose(client, lease, target):
    return client.put(f"{BASE}/pose", json={"lease_id": lease, "pose": target})


def clock(client, lease, version, rate=None, action="rate"):
    body = {"lease_id": lease, "version": version, "action": action}
    if action == "rate":
        body["rate"] = rate
    return client.put(f"{BASE}/clock", json=body)


@pytest.fixture(autouse=True)
def room_test(client, second_client):
    with room_runtime.lock, Session(engine) as db:
        room_runtime.members.clear()
        room_runtime.retired.clear()
        room_runtime.retired_leases.clear()
        db.exec(delete(RoomClock))
        db.commit()
    old_utc, old_mono = room_runtime.utc_ms, room_runtime.monotonic_seconds
    yield
    room_runtime.utc_ms, room_runtime.monotonic_seconds = old_utc, old_mono
    with room_runtime.lock:
        room_runtime.members.clear()
        room_runtime.retired.clear()
        room_runtime.retired_leases.clear()


def test_anonymous_third_identity_and_unknown_room_rejected(client):
    client.cookies.clear()
    assert client.get(BASE).status_code == 401
    assert client.post(f"{BASE}/join", json={"client_id": str(uuid4())}).status_code == 401
    login(client, "tester")
    assert client.get(BASE).status_code == 403
    assert client.post(f"{BASE}/join", json={"client_id": str(uuid4())}).status_code == 403
    assert client.get("/api/rooms/interior").status_code == 404
    assert client.post("/api/rooms/interior/join", json={"client_id": str(uuid4())}).status_code == 404


def test_rest_source_and_identity_spoofing_rejected(client, monkeypatch):
    login(client, "bear")
    assert client.get(BASE, headers=ORIGIN).status_code == 200
    for origin in ("https://evil.invalid", "null", "http://testserver.evil.invalid", "http://u@testserver"):
        assert client.get(BASE, headers={"origin": origin}).status_code == 403
        assert client.post(f"{BASE}/join", json={"client_id": str(uuid4())},
                           headers={"origin": origin}).status_code == 403
    assert client.get(BASE, headers={"sec-fetch-site": "cross-site"}).status_code == 403
    assert client.post(f"{BASE}/join", json={"client_id": str(uuid4()), "account": "her"}).status_code == 422
    # 仅显式部署配置能跨 proxy scheme，不信任伪造 forwarded headers。
    assert client.get(BASE, headers={"origin": "https://island.example", "x-forwarded-proto": "https"}).status_code == 403
    monkeypatch.setenv("ILAND_ROOM_ORIGINS", "https://island.example")
    assert client.get(BASE, headers={"origin": "https://island.example"}).status_code == 200


def test_join_assigns_arrival_seats_identity_and_retry_is_idempotent(client, second_client):
    her = login(client, "her")
    bear = login(second_client, "bear")
    page = str(uuid4())
    first = join(client, page)
    retry = join(client, page)
    assert retry["lease_id"] == first["lease_id"]
    assert retry["self"] == first["self"] == {"user_id": her["id"], "account": "her"}
    assert retry["snapshot"]["revision"] == first["snapshot"]["revision"]
    second = join(second_client)
    members = second["snapshot"]["members"]
    assert [(row["account"], row["seat"], row["sprite"]) for row in members] == [
        ("her", 0, "her"), ("bear", 1, "bear"),
    ]
    assert [row["user_id"] for row in members] == [her["id"], bear["id"]]
    assert all(row["pose"] == "seated" for row in members)
    assert "lease_id" not in str(second["snapshot"]) and "client_id" not in str(second["snapshot"])
    assert second["snapshot"]["revision"] > first["snapshot"]["revision"]


def test_concurrent_first_join_cannot_allocate_same_seat(client, second_client):
    login(client, "bear")
    login(second_client, "her")
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(join, (client, second_client)))
    snapshot = client.get(BASE).json()
    assert sorted(member["seat"] for member in snapshot["members"]) == [0, 1]
    assert len({result["lease_id"] for result in results}) == 2


def test_takeover_blocks_old_heartbeat_pose_clock_leave_and_late_join(client):
    login(client, "bear")
    old_page, new_page = str(uuid4()), str(uuid4())
    first = join(client, old_page)
    second = join(client, new_page)
    old, new = first["lease_id"], second["lease_id"]
    assert old != new
    assert first["snapshot"]["members"][0]["seat"] == second["snapshot"]["members"][0]["seat"]
    for response in (
        client.post(f"{BASE}/heartbeat", json={"lease_id": old}),
        pose(client, old, "standing"),
        clock(client, old, second["snapshot"]["clock"]["version"], 30),
        client.post(f"{BASE}/join", json={"client_id": old_page}),
    ):
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "lease_lost"
        assert response.json()["detail"]["reason"] == "taken_over"
    assert client.post(f"{BASE}/leave", json={"lease_id": old}).status_code == 200
    heartbeat = client.post(f"{BASE}/heartbeat", json={"lease_id": new})
    assert heartbeat.status_code == 200 and len(heartbeat.json()["snapshot"]["members"]) == 1


def test_cannot_control_partner_lease_and_leave_is_retry_safe(client, second_client):
    login(client, "bear")
    login(second_client, "her")
    bear, her = join(client), join(second_client)
    assert pose(client, her["lease_id"], "standing").status_code == 403
    assert client.post(f"{BASE}/heartbeat", json={"lease_id": her["lease_id"]}).status_code == 403
    assert client.post(f"{BASE}/leave", json={"lease_id": her["lease_id"]}).status_code == 200
    assert len(second_client.get(BASE).json()["members"]) == 2
    for _ in range(2):
        assert client.post(f"{BASE}/leave", json={"lease_id": bear["lease_id"]}).status_code == 200
    assert [row["account"] for row in second_client.get(BASE).json()["members"]] == ["her"]


def test_takeover_ends_partner_leaning_before_new_page_sits(client, second_client):
    login(client, "bear")
    login(second_client, "her")
    join(client)
    her = join(second_client)
    pose(second_client, her["lease_id"], "leaning")
    snapshot = join(client)["snapshot"]
    assert [member["pose"] for member in snapshot["members"]] == ["seated", "seated"]


def test_lean_only_while_both_sit_and_standing_or_leaving_releases_it(client, second_client):
    login(client, "bear")
    login(second_client, "her")
    bear = join(client)
    assert pose(client, bear["lease_id"], "leaning").status_code == 409
    her = join(second_client)
    assert pose(client, bear["lease_id"], "leaning").status_code == 200
    snapshot = pose(second_client, her["lease_id"], "standing").json()["snapshot"]
    assert [row["pose"] for row in snapshot["members"]] == ["seated", "standing"]
    assert pose(second_client, her["lease_id"], "leaning").status_code == 409
    pose(second_client, her["lease_id"], "seated")
    pose(client, bear["lease_id"], "leaning")
    snapshot = second_client.post(f"{BASE}/leave", json={"lease_id": her["lease_id"]}).json()["snapshot"]
    assert snapshot["members"][0]["pose"] == "seated"


def test_expiry_uses_real_monotonic_time_and_rejoin_same_page_allowed(client, second_client):
    login(client, "bear")
    login(second_client, "her")
    now = [100.0]
    room_runtime.monotonic_seconds = lambda: now[0]
    page = str(uuid4())
    bear, her = join(client, page), join(second_client)
    pose(client, bear["lease_id"], "leaning")
    clock(client, bear["lease_id"], bear["snapshot"]["clock"]["version"], 120)
    now[0] += 29
    assert client.post(f"{BASE}/heartbeat", json={"lease_id": bear["lease_id"]}).status_code == 200
    now[0] += 2
    room_runtime.sweep()
    snapshot = client.get(BASE).json()
    assert len(snapshot["members"]) == 1 and snapshot["members"][0]["pose"] == "seated"
    now[0] += 30
    assert client.post(f"{BASE}/heartbeat", json={"lease_id": bear["lease_id"]}).status_code == 409
    retry = join(client, page)
    assert retry["lease_id"] != bear["lease_id"] and len(retry["snapshot"]["members"]) == 1


def test_clock_continuity_pause_normal_and_reset_with_version_conflict(client):
    login(client, "bear")
    utc = [1_800_000_000_000]
    room_runtime.utc_ms = lambda: utc[0]
    room = join(client)
    lease = room["lease_id"]
    first = room["snapshot"]["clock"]
    assert first["rate"] == 1 and first["following_real"]
    utc[0] += 9000
    fast = clock(client, lease, first["version"], 120).json()["snapshot"]["clock"]
    assert fast["virtual_base_ms"] == utc[0] and not fast["following_real"]
    utc[0] += 1000
    paused = clock(client, lease, fast["version"], 0).json()["snapshot"]["clock"]
    assert paused["virtual_base_ms"] == fast["virtual_base_ms"] + 120_000
    utc[0] += 86_400_000
    normal = clock(client, lease, paused["version"], 1).json()["snapshot"]["clock"]
    assert normal["virtual_base_ms"] == paused["virtual_base_ms"] and not normal["following_real"]
    conflict = clock(client, lease, paused["version"], 30)
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "clock_conflict"
    assert conflict.json()["detail"]["snapshot"]["clock"] == normal
    utc[0] += 2500
    reset = clock(client, lease, normal["version"], action="reset").json()["snapshot"]["clock"]
    assert reset["virtual_base_ms"] == utc[0] == reset["real_anchor_utc_ms"]
    assert reset["rate"] == 1 and reset["following_real"]
    assert reset["changed_by"] == "bear" and reset["time_zone"] == "Asia/Shanghai"


def test_concurrent_clock_updates_accept_exactly_one_and_report_latest(client, second_client):
    login(client, "bear")
    login(second_client, "her")
    bear, her = join(client), join(second_client)
    version = bear["snapshot"]["clock"]["version"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        one = pool.submit(clock, client, bear["lease_id"], version, 30)
        two = pool.submit(clock, second_client, her["lease_id"], version, 120)
        results = [one.result(), two.result()]
    assert sorted(response.status_code for response in results) == [200, 409]
    latest = client.get(BASE).json()["clock"]
    rejected = next(response for response in results if response.status_code == 409)
    assert rejected.json()["detail"]["snapshot"]["clock"] == latest
    assert latest["version"] == version + 1


@pytest.mark.parametrize("invalid", [-1, 2, 999999999, True, "30", 30.0, None])
def test_clock_rejects_unsupported_or_coerced_rates(client, invalid):
    login(client, "bear")
    room = join(client)
    assert clock(client, room["lease_id"], room["snapshot"]["clock"]["version"], invalid).status_code == 422


@pytest.mark.parametrize("invalid", ["NaN", "Infinity", "-Infinity"])
def test_nonfinite_json_clock_returns_422_not_server_error(client, invalid):
    login(client, "bear")
    room = join(client)
    body = ('{"lease_id":"' + room["lease_id"] + '","action":"rate","version":1,"rate":' + invalid + '}')
    assert client.put(f"{BASE}/clock", content=body, headers={"content-type": "application/json"}).status_code == 422


def test_restart_changes_epoch_keeps_clock_but_never_restores_members(client):
    login(client, "bear")
    room = join(client)
    saved = clock(client, room["lease_id"], room["snapshot"]["clock"]["version"], 0).json()["snapshot"]
    fresh = RoomRuntime()
    snapshot = fresh.snapshot(client.cookies.get(SESSION_COOKIE))
    assert snapshot["epoch"] != saved["epoch"]
    assert snapshot["members"] == [] and snapshot["clock"] == saved["clock"]
    with Session(engine) as db:
        assert len(db.exec(select(RoomClock)).all()) == 1


def test_snapshot_refreshes_names_without_identity_or_seat_change(client):
    login(client, "bear")
    joined = join(client)
    original = joined["snapshot"]["members"][0]
    with Session(engine) as db:
        user = db.get(User, original["user_id"])
        saved_display = user.display
        user.display = "测试新昵称"
        db.add(user)
        db.commit()
    try:
        heartbeat = client.post(f"{BASE}/heartbeat", json={"lease_id": joined["lease_id"]}).json()["snapshot"]
        member = heartbeat["members"][0]
        assert member["display"] == "测试新昵称"
        assert member["account"] == original["account"] and member["seat"] == original["seat"]
        assert heartbeat["revision"] > joined["snapshot"]["revision"]
    finally:
        with Session(engine) as db:
            user = db.get(User, original["user_id"])
            user.display = saved_display
            db.add(user)
            db.commit()


def test_own_expired_session_on_heartbeat_is_removed_immediately(client, second_client):
    login(client, "bear")
    login(second_client, "her")
    bear, her = join(client), join(second_client)
    pose(second_client, her["lease_id"], "leaning")
    with Session(engine) as db:
        auth = db.get(AuthSession, client.cookies.get(SESSION_COOKIE))
        auth.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.add(auth)
        db.commit()
    response = client.post(f"{BASE}/heartbeat", json={"lease_id": bear["lease_id"]})
    assert response.status_code == 401
    snapshot = second_client.get(BASE).json()
    assert [(member["account"], member["pose"]) for member in snapshot["members"]] == [("her", "seated")]


def test_logout_and_password_revoke_other_device_room_members(client, second_client):
    bear_user = login(client, "bear")
    login(second_client, "her")
    bear, her = join(client), join(second_client)
    pose(second_client, her["lease_id"], "leaning")
    # 改密设备与海边设备是不同 Cookie；当前改密会话保留，海边旧会话被撤销。
    other_device = TestClient(app)
    login(other_device, "bear")
    try:
        response = other_device.post("/api/auth/password", json={
            "old_password": "123456", "new_password": "room-test-pass",
        })
        assert response.status_code == 200
        with room_runtime.lock:
            assert bear_user["id"] not in room_runtime.members
        assert client.get(BASE).status_code == 401
        snapshot = second_client.get(BASE).json()
        assert snapshot["members"][0]["pose"] == "seated"
        assert other_device.get("/api/auth/me").status_code == 200
    finally:
        with Session(engine) as db:
            user = db.get(User, bear_user["id"])
            user.pass_hash = hash_password("123456")
            db.add(user)
            db.commit()
    assert second_client.post("/api/auth/logout").status_code == 200
    with room_runtime.lock:
        assert not room_runtime.members


def test_websocket_requires_cookie_origin_and_owned_lease(client, second_client):
    login(client, "bear")
    login(second_client, "her")
    room = join(client)
    url = f"{BASE}/events?lease_id={room['lease_id']}"
    for socket_client, headers, expected in (
        (client, {}, 4403), (client, {"origin": "https://evil.invalid"}, 4403),
        (second_client, ORIGIN, 4403), (TestClient(app), ORIGIN, 4401),
    ):
        with pytest.raises(WebSocketDisconnect) as error:
            with socket_client.websocket_connect(url, headers=headers):
                pass
        assert error.value.code == expected
    login(second_client, "tester")
    with pytest.raises(WebSocketDisconnect) as error:
        with second_client.websocket_connect(url, headers=ORIGIN):
            pass
    assert error.value.code == 4403


def test_websocket_pushes_full_snapshot_and_close_releases_only_self(client, second_client):
    login(client, "bear")
    login(second_client, "her")
    bear = join(client)
    with client.websocket_connect(f"{BASE}/events?lease_id={bear['lease_id']}", headers=ORIGIN) as websocket:
        initial = websocket.receive_json()
        assert initial["members"][0]["account"] == "bear"
        her = join(second_client)
        arrived = websocket.receive_json()
        assert len(arrived["members"]) == 2 and arrived["revision"] > initial["revision"]
        pose(second_client, her["lease_id"], "leaning")
        leaned = websocket.receive_json()
        assert leaned["members"][1]["pose"] == "leaning"
    snapshot = second_client.get(BASE).json()
    assert [(row["account"], row["pose"]) for row in snapshot["members"]] == [("her", "seated")]


def test_ws_takeover_closes_old_socket_without_clearing_new_lease(client):
    login(client, "bear")
    old = join(client)
    with client.websocket_connect(f"{BASE}/events?lease_id={old['lease_id']}", headers=ORIGIN) as websocket:
        websocket.receive_json()
        new = join(client)
        with pytest.raises(WebSocketDisconnect) as error:
            websocket.receive_json()
        assert error.value.code == 4409
    assert client.post(f"{BASE}/heartbeat", json={"lease_id": new["lease_id"]}).status_code == 200


def test_cookie_switch_reports_actual_self_even_with_previous_account_still_present(client, second_client):
    bear = login(second_client, "bear")
    join(second_client)
    login(client, "bear")  # 模拟旧页 UI 在另一窗口换号之前保存的小熊身份
    her = login(client, "her")
    joined = join(client, str(uuid4()), 1)
    assert {row["account"] for row in joined["snapshot"]["members"]} == {"bear", "her"}
    assert joined["self"] == {"user_id": her["id"], "account": "her"}
    assert joined["self"]["user_id"] != bear["id"]
    client.post(f"{BASE}/leave", json={"lease_id": joined["lease_id"]})
    assert [row["account"] for row in second_client.get(BASE).json()["members"]] == ["bear"]


def test_expected_account_blocks_cookie_switch_before_taking_existing_partner_seat(client, second_client):
    login(client, "bear")
    login(second_client, "her")
    bear, her = join(client), join(second_client)
    previous = second_client.get(BASE).json()
    old_page = TestClient(app)
    login(old_page, "bear")
    login(old_page, "her")  # 旧页面的画布身份仍是 bear，而同源 Cookie 已变 her
    denied = old_page.post(f"{BASE}/join", json={
        "client_id": str(uuid4()), "connection_generation": 7, "expected_account": "bear",
    })
    assert denied.status_code == 401 and denied.json()["detail"]["code"] == "identity_changed"
    latest = second_client.get(BASE).json()
    assert latest["members"] == previous["members"] and latest["revision"] == previous["revision"]
    assert second_client.post(f"{BASE}/heartbeat", json={"lease_id": her["lease_id"]}).status_code == 200
    assert client.post(f"{BASE}/heartbeat", json={"lease_id": bear["lease_id"]}).status_code == 200


def test_connection_generation_rotation_prevents_old_ws_finally_join_gap_and_is_idempotent(client):
    login(client, "bear")
    page = str(uuid4())
    first = join(client, page, 1)
    token = client.cookies.get(SESSION_COOKIE)

    async def replay():
        binding = room_runtime.connect(token, first["lease_id"], asyncio.get_running_loop())
        # 新 join 已经完成，但新 WS 尚未接入；这一窗口不能再复用旧 lease。
        second = room_runtime.join(token, page, 3)
        assert second["lease_id"] != first["lease_id"]
        assert second["snapshot"]["members"][0]["seat"] == first["snapshot"]["members"][0]["seat"]
        await asyncio.sleep(0)
        assert await binding.queue.get() == 4410
        room_runtime.disconnect(token, first["lease_id"], binding)
        retry = room_runtime.join(token, page, 3)
        assert retry["lease_id"] == second["lease_id"]
        new_binding = room_runtime.connect(token, second["lease_id"], asyncio.get_running_loop())
        late = client.post(f"{BASE}/join", json={"client_id": page, "connection_generation": 2})
        assert late.status_code == 409 and late.json()["detail"]["reason"] == "ended"
        assert room_runtime.heartbeat(token, second["lease_id"])["snapshot"]["members"]
        stale = client.post(f"{BASE}/heartbeat", json={"lease_id": first["lease_id"]})
        assert stale.status_code == 409 and stale.json()["detail"]["reason"] == "ended"
        room_runtime.disconnect(token, second["lease_id"], new_binding)

    asyncio.run(replay())


def test_retired_client_cannot_reclaim_after_cookie_session_changes(client):
    login(client, "bear")
    old_page = str(uuid4())
    join(client, old_page, 1)
    join(client, str(uuid4()), 1)
    login(client, "bear")  # 新 Cookie 不应绕开旧 client ID 已被接管的事实
    response = client.post(f"{BASE}/join", json={"client_id": old_page, "connection_generation": 99})
    assert response.status_code == 409 and response.json()["detail"]["reason"] == "taken_over"


def test_ordinary_lease_expiry_ws_uses_recoverable_code_and_rest_reason(client):
    login(client, "bear")
    mono = [100.0]
    room_runtime.monotonic_seconds = lambda: mono[0]
    joined = join(client, str(uuid4()), 1)
    with client.websocket_connect(f"{BASE}/events?lease_id={joined['lease_id']}", headers=ORIGIN) as websocket:
        websocket.receive_json()
        mono[0] += 31
        room_runtime.sweep()
        with pytest.raises(WebSocketDisconnect) as error:
            websocket.receive_json()
        assert error.value.code == 4410
    response = client.post(f"{BASE}/heartbeat", json={"lease_id": joined["lease_id"]})
    assert response.status_code == 409 and response.json()["detail"]["reason"] == "ended"


def test_same_lease_reconnect_late_old_finally_cannot_remove_new_binding(client):
    login(client, "bear")
    joined = join(client)
    token, lease = client.cookies.get(SESSION_COOKIE), joined["lease_id"]

    async def exercise():
        loop = asyncio.get_running_loop()
        first = room_runtime.connect(token, lease, loop)
        second = room_runtime.connect(token, lease, loop)
        room_runtime.disconnect(token, lease, first)
        assert len(room_runtime.snapshot(token)["members"]) == 1
        room_runtime.disconnect(token, lease, second)
        assert room_runtime.snapshot(token)["members"] == []

    asyncio.run(exercise())


def test_server_revalidates_session_on_sweep_and_live_ws_closes(client):
    user = login(client, "bear")
    joined = join(client)
    with client.websocket_connect(f"{BASE}/events?lease_id={joined['lease_id']}", headers=ORIGIN) as websocket:
        websocket.receive_json()
        with Session(engine) as db:
            db.exec(delete(AuthSession).where(AuthSession.user_id == user["id"]))
            db.commit()
        room_runtime.sweep()
        with pytest.raises(WebSocketDisconnect) as error:
            websocket.receive_json()
        assert error.value.code == 4401
    with room_runtime.lock:
        assert not room_runtime.members


def test_ws_actions_are_rejected_and_do_not_change_clock(client):
    login(client, "bear")
    joined = join(client)
    with client.websocket_connect(f"{BASE}/events?lease_id={joined['lease_id']}", headers=ORIGIN) as websocket:
        websocket.receive_json()
        websocket.send_json({"rate": 120})
        with pytest.raises(WebSocketDisconnect) as error:
            websocket.receive_json()
        assert error.value.code == 1008
    assert client.get(BASE).json()["clock"]["version"] == joined["snapshot"]["clock"]["version"]
