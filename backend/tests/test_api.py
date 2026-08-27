"""M0 验收：登录 → API 数据面（letters / world / heartbeat）全链路"""

import os
import tempfile
from pathlib import Path

import pytest

# 必须在 import app 之前改环境：测试用独立的临时数据库
_tmp = tempfile.mkdtemp(prefix="iland-test-")
os.environ["ILAND_DB_PATH"] = str(Path(_tmp) / "test.db")
os.environ["ILAND_UPLOADS_DIR"] = str(Path(_tmp) / "uploads")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    # with 上下文才会触发 lifespan（建表 + 种子用户）
    with TestClient(app) as c:
        yield c


def login(client, name="bear", password="123456"):
    r = client.post("/api/auth/login", json={"name": name, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["user"]


def test_ping(client):
    r = client.get("/api/ping")
    assert r.status_code == 200 and r.json()["pong"] is True


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"name": "bear", "password": "nope"})
    assert r.status_code == 401


def test_me_requires_login(client):
    client.post("/api/auth/logout")
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_login_and_me(client):
    user = login(client)
    assert user["name"] == "bear"
    r = client.get("/api/auth/me")
    assert r.status_code == 200 and r.json()["user"]["name"] == "bear"


def test_meta(client):
    r = client.get("/api/meta")
    assert r.status_code == 200
    assert r.json()["start_date"]  # 种子默认值存在


def test_letters_crud(client):
    login(client)
    r = client.get("/api/letters")
    assert r.status_code == 200 and r.json()["letters"] == []

    r = client.post(
        "/api/letters",
        json={
            "date": "2026-08-16",
            "title": "第一封信 · 欢迎光临",
            "excerpt": "点开这封信，我教你玩～",
            "author": "bear",
            "pages": ["uploads/letters/guide/page-1.svg"],
        },
    )
    assert r.status_code == 200
    letter = r.json()["letter"]
    assert letter["pages"] == ["uploads/letters/guide/page-1.svg"]

    r = client.get("/api/letters")
    assert len(r.json()["letters"]) == 1

    r = client.delete(f"/api/letters/{letter['id']}")
    assert r.status_code == 200
    assert client.get("/api/letters").json()["letters"] == []


def test_world_optimistic_lock(client):
    login(client)
    v0 = client.get("/api/world").json()["version"]
    r = client.put("/api/world", json={"version": v0, "data": {"site_title": "我们的岛", "start_date": "2026-06-10"}})
    assert r.status_code == 200 and r.json()["version"] == v0 + 1

    # 旧版本写入必须 409（她刚改过世界的场景）
    r = client.put("/api/world", json={"version": v0, "data": {}})
    assert r.status_code == 409


def test_heartbeat_and_presence(client):
    login(client, "bear")
    client.post("/api/heartbeat", json={"action_note": "浇了花", "last_pos": {"x": 100, "y": 200}})
    r = client.get("/api/presence")
    assert r.status_code == 200
    # 只有 bear 登岛过，对方视角应为空
    assert r.json()["visit"] is None

    login(client, "her")
    r = client.get("/api/presence")
    visit = r.json()["visit"]
    assert visit is not None and visit["action_note"] == "浇了花"
