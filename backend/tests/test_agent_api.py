"""本机回环 Donut Agent Token 鉴权、安全隔离与 /api/agent/digest 聚合接口测试。"""

from datetime import date as Date, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from .conftest import current_login, make_png

BEAR_TOKEN = "tok_bear_unit_test_secret_001"
HER_TOKEN = "tok_her_unit_test_secret_002"
TOKENS_ENV = f"bear:{BEAR_TOKEN},her:{HER_TOKEN}"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_agent_token_requires_loopback_and_config(monkeypatch):
    with TestClient(app) as anon:
        # 1. 未放行 testclient 时被判定为非回环来源 → 403
        monkeypatch.setenv("ILAND_AGENT_TOKENS", TOKENS_ENV)
        monkeypatch.delenv("ILAND_AGENT_ALLOW_TESTCLIENT", raising=False)
        res = anon.get("/api/agent/digest", headers=_auth(BEAR_TOKEN))
        assert res.status_code == 403

        # 2. 放行回环但未配置令牌表 → 401
        monkeypatch.setenv("ILAND_AGENT_ALLOW_TESTCLIENT", "1")
        monkeypatch.delenv("ILAND_AGENT_TOKENS", raising=False)
        res = anon.get("/api/agent/digest", headers=_auth(BEAR_TOKEN))
        assert res.status_code == 401

        # 3. 配置令牌表后，错误令牌 → 401
        monkeypatch.setenv("ILAND_AGENT_TOKENS", TOKENS_ENV)
        res = anon.get("/api/agent/digest", headers=_auth("wrong_token"))
        assert res.status_code == 401


def test_agent_identity_isolation_and_human_only_guards(monkeypatch):
    monkeypatch.setenv("ILAND_AGENT_TOKENS", TOKENS_ENV)
    monkeypatch.setenv("ILAND_AGENT_ALLOW_TESTCLIENT", "1")

    with TestClient(app) as anon:
        me_bear = anon.get("/api/auth/me", headers=_auth(BEAR_TOKEN))
        assert me_bear.status_code == 200
        assert me_bear.json()["user"]["account"] == "bear"

        me_her = anon.get("/api/auth/me", headers=_auth(HER_TOKEN))
        assert me_her.status_code == 200
        assert me_her.json()["user"]["account"] == "her"

        # 高危路由与真人专属路由：Agent Token 一律被 require_human_session 拦截 (403)
        assert (
            anon.post(
                "/api/auth/password",
                json={"old_password": "123456", "new_password": "abcdef"},
                headers=_auth(BEAR_TOKEN),
            ).status_code
            == 403
        )
        assert anon.post("/api/auth/logout", headers=_auth(BEAR_TOKEN)).status_code == 403
        assert (
            anon.put(
                "/api/settings/names",
                json={"bear": "小熊", "her": "她"},
                headers=_auth(BEAR_TOKEN),
            ).status_code
            == 403
        )
        assert (
            anon.put(
                "/api/world",
                json={"version": 1, "data": {}},
                headers=_auth(BEAR_TOKEN),
            ).status_code
            == 403
        )
        assert (
            anon.post(
                "/api/heartbeat",
                json={"action_note": "fake"},
                headers=_auth(BEAR_TOKEN),
            ).status_code
            == 403
        )

        # 实时房间占座仅认 Cookie，Agent Token 不能替真人占座
        join_res = anon.post(
            "/api/rooms/seaside/join",
            json={"client_id": str(uuid4())},
            headers=_auth(BEAR_TOKEN),
        )
        assert join_res.status_code == 401


def test_agent_end_to_end_business_flow_and_digest(monkeypatch):
    monkeypatch.setenv("ILAND_AGENT_TOKENS", TOKENS_ENV)
    monkeypatch.setenv("ILAND_AGENT_ALLOW_TESTCLIENT", "1")
    today = Date.today()
    soon = (today + timedelta(days=3)).isoformat()

    with TestClient(app) as agent, TestClient(app) as human_her:
        ann_id = None
        mem_id = None
        letter_id = None
        lease_id = None
        try:
            # 1. bear 通过 Agent 换灯塔色与灯语
            lh = agent.put(
                "/api/lighthouse",
                json={"preset": "sea", "message": "正在开会，晚上回来"},
                headers=_auth(BEAR_TOKEN),
            )
            assert lh.status_code == 200
            assert lh.json()["signal"]["updated_by"] == "bear"

            # 2. bear 通过 Agent 新建 3 天后的纪念日
            ann = agent.post(
                "/api/anniversaries",
                json={"name": "一起吃火锅", "date": soon, "repeat": "once", "pinned": False},
                headers=_auth(BEAR_TOKEN),
            )
            assert ann.status_code == 201
            ann_id = ann.json()["anniversary"]["id"]

            # 3. bear 通过 Agent 上传图片并新建每日记忆卡
            up = agent.post(
                "/api/uploads",
                files={"file": ("snack.png", make_png(), "image/png")},
                headers=_auth(BEAR_TOKEN),
            )
            assert up.status_code == 201
            att_id = up.json()["attachment"]["id"]
            mem = agent.post(
                "/api/memories",
                json={
                    "date": today.isoformat(),
                    "title": "晚霞散步",
                    "description": "海风很轻",
                    "attachments": [att_id],
                    "client_id": "agent-test-mem-001",
                },
                headers=_auth(BEAR_TOKEN),
            )
            assert mem.status_code == 201
            mem_data = mem.json()["memory"]
            mem_id = mem_data["id"]
            assert mem_data["created_by"] == "bear"
            assert mem_data["attachments"] == [att_id]

            # 4. bear 通过 Agent 写一封信给 her
            sent = agent.post(
                "/api/letters",
                json={
                    "date": today.isoformat(),
                    "title": "测试火漆信",
                    "excerpt": "记得亲自拆开",
                    "body": "这是未拆封的正文秘密",
                    "theme": "seaside",
                },
                headers=_auth(BEAR_TOKEN),
            )
            assert sent.status_code == 200
            letter_id = sent.json()["letter"]["id"]
            assert sent.json()["letter"]["author"] == "bear"

            # 5. her 浏览器登录并进入客厅（无占座冲突），验证 digest 能只读看到她在客厅
            login = human_her.post(
                "/api/auth/login",
                json={"name": current_login(human_her, "her"), "password": "123456"},
            )
            assert login.status_code == 200
            joined = human_her.post("/api/rooms/interior/join", json={"client_id": str(uuid4())})
            assert joined.status_code == 200
            lease_id = joined.json()["lease_id"]

            # 6. her 通过 Agent 拉取 digest：应看到 bear 的未读信元数据（且不含 body）、灯语、即将到来的纪念日与自己在客厅
            digest_res = agent.get("/api/agent/digest", headers=_auth(HER_TOKEN))
            assert digest_res.status_code == 200
            digest = digest_res.json()
            assert digest["actor"]["account"] == "her"
            assert digest["companion"]["account"] == "bear"
            assert digest["lighthouse"]["preset"] == "sea"
            assert digest["lighthouse"]["updated_by"] == "bear"
            assert digest["mailbox"]["unread_count"] >= 1
            assert digest["mailbox"]["latest_unread"]["id"] == letter_id
            assert "body" not in digest["mailbox"]["latest_unread"]
            assert any(item["id"] == ann_id for item in digest["upcoming_anniversaries"])
            assert digest["recent_memories_count_7d"] >= 1
            assert digest["rooms"]["interior"]["online_count"] == 1
            assert digest["rooms"]["interior"]["members"][0]["account"] == "her"

            # 7. her 无法删 bear 的信（403）；bear 自己能删（200）
            assert agent.delete(f"/api/letters/{letter_id}", headers=_auth(HER_TOKEN)).status_code == 403
            assert agent.delete(f"/api/letters/{letter_id}", headers=_auth(BEAR_TOKEN)).status_code == 200
            letter_id = None
        finally:
            if lease_id:
                human_her.post("/api/rooms/interior/leave", json={"lease_id": lease_id})
            if letter_id:
                agent.delete(f"/api/letters/{letter_id}", headers=_auth(BEAR_TOKEN))
            if ann_id:
                agent.delete(f"/api/anniversaries/{ann_id}", headers=_auth(BEAR_TOKEN))
            if mem_id:
                agent.delete(f"/api/memories/{mem_id}", headers=_auth(BEAR_TOKEN))
