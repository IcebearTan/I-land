"""M0 验收：登录 → API 数据面（letters / world / heartbeat）全链路。

数据库与种子用户由 conftest.py 统一配置（测试间共享同一实例，注意用例间状态）。
"""

from .conftest import current_login

import pytest


def login(client, name="bear", password="123456"):
    r = client.post("/api/auth/login", json={"name": current_login(client, name), "password": password})
    assert r.status_code == 200, r.text
    return r.json()["user"]


def test_ping(client):
    r = client.get("/api/ping")
    assert r.status_code == 200 and r.json()["pong"] is True


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"name": current_login(client, "bear"), "password": "nope"})
    assert r.status_code == 401


def test_me_requires_login(client):
    client.post("/api/auth/logout")
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_login_and_me(client):
    user = login(client)
    assert user["name"] == user["display"] == "小熊"
    assert user["account"] == "bear"
    r = client.get("/api/auth/me")
    assert r.status_code == 200 and r.json()["user"]["account"] == "bear"


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


def test_letters_body_unread_and_migration(client):
    login(client, "bear")
    res = client.post(
        "/api/letters",
        json={
            "date": "2026-11-27",
            "title": "写给夜晚的你",
            "excerpt": "拆开前只露这一句",
            "body": "这是拆开火漆之后才能看到的长正文。",
            "theme": "seaside",
            "pages": [],
        },
    )
    assert res.status_code == 200, res.text
    letter = res.json()["letter"]
    assert letter["body"] == "这是拆开火漆之后才能看到的长正文。"
    assert letter["theme"] == "seaside"
    assert letter["unread"] is False  # 自己写的信不算未拆

    # 切到对方账号：应显示 1 封未拆，且对方无法删除
    login(client, "her")
    listed = client.get("/api/letters").json()
    assert listed["unread_count"] == 1
    assert listed["letters"][0]["unread"] is True
    assert client.delete(f"/api/letters/{letter['id']}").status_code == 403

    # 拆开火漆标记已读
    read_res = client.post(f"/api/letters/{letter['id']}/read")
    assert read_res.status_code == 200
    assert read_res.json()["letter"]["unread"] is False
    assert read_res.json()["letter"]["read_at"] is not None
    assert client.get("/api/letters").json()["unread_count"] == 0

    # 空白标题与非法主题应被拒绝
    assert client.post("/api/letters", json={"date": "2026-11-27", "title": "   "}).status_code == 422
    assert client.post("/api/letters", json={"date": "2026-11-27", "title": "错主题", "body": "hi", "theme": "bad"}).status_code == 422

    # 清理测试信件
    login(client, "bear")
    assert client.delete(f"/api/letters/{letter['id']}").status_code == 200

    # 旧表迁移保留老数据并默认标已读
    from sqlalchemy import text
    from sqlmodel import create_engine
    from app.db import migrate_letter_columns

    old = create_engine("sqlite://")
    with old.begin() as conn:
        conn.execute(text(
            "CREATE TABLE letter (id INTEGER PRIMARY KEY, date VARCHAR, title VARCHAR, "
            "excerpt VARCHAR, author VARCHAR, theme VARCHAR, pages_json VARCHAR, created_at DATETIME)"
        ))
        conn.execute(text(
            "INSERT INTO letter VALUES (1, '2026-08-17', '旧信', '摘录', 'bear', 'qixi', '[]', '2026-08-17 12:00:00')"
        ))
    migrate_letter_columns(old)
    migrate_letter_columns(old)
    with old.connect() as conn:
        row = conn.execute(text("SELECT * FROM letter")).mappings().one()
        assert row["body"] == "" and row["read_at"] is not None
    old.dispose()


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


def test_anniversary_shared_crud_and_design(client):
    client.post('/api/auth/logout')
    assert client.get('/api/anniversaries').status_code == 401
    assert client.post('/api/anniversaries', json={}).status_code == 401
    login(client, 'bear')
    body = dict(name='  第一次旅行  ', date='2026-10-01', repeat='yearly', icon='plane',
                color='sea', style='ticket', note='一起看海', pinned=True)
    response = client.post('/api/anniversaries', json=body)
    assert response.status_code == 201
    created = response.json()['anniversary']
    assert created['name'] == '第一次旅行'
    item_id = created['id']
    login(client, 'her')
    assert client.get(f'/api/anniversaries/{item_id}').json()['anniversary']['note'] == '一起看海'
    body.update(name='每月的小约定', repeat='monthly', icon='coffee', color='cocoa', style='garden')
    changed = client.put(f'/api/anniversaries/{item_id}', json=body)
    assert changed.status_code == 200
    assert changed.json()['anniversary']['style'] == 'garden'
    other = client.post('/api/anniversaries', json={**body, 'name': '另一个置顶日子'}).json()['anniversary']
    records = client.get('/api/anniversaries').json()['anniversaries']
    assert [x['id'] for x in records if x['pinned']] == [other['id']]
    client.put(f'/api/anniversaries/{item_id}', json=body)
    records = client.get('/api/anniversaries').json()['anniversaries']
    assert [x['id'] for x in records if x['pinned']] == [item_id]
    for record in records:
        assert client.delete(f"/api/anniversaries/{record['id']}").status_code == 200
    assert client.get(f'/api/anniversaries/{item_id}').status_code == 404
    assert client.put(f'/api/anniversaries/{item_id}', json=body).status_code == 404
    assert client.delete(f'/api/anniversaries/{item_id}').status_code == 404


@pytest.mark.parametrize('change', [
    {'name': '  '}, {'name': 'a' * 61}, {'date': '2025-02-29'}, {'date': '2200-01-01'},
    {'repeat': 'weekly'}, {'icon': 'unknown'}, {'color': 'invalid'}, {'style': 'unknown'}, {'note': 'x' * 1001},
])
def test_anniversary_validation(client, change):
    login(client)
    body = {'name': '生日', 'date': '2024-02-29', **change}
    assert client.post('/api/anniversaries', json=body).status_code == 422


def test_calendar_migration_preserves_old_rows():
    from sqlalchemy import text
    from sqlmodel import create_engine
    from app.db import migrate_anniversary_columns
    old = create_engine('sqlite://')
    with old.begin() as conn:
        conn.execute(text("CREATE TABLE anniversary (id INTEGER PRIMARY KEY, name VARCHAR, date VARCHAR, repeat VARCHAR, icon VARCHAR, note VARCHAR)"))
        conn.execute(text("INSERT INTO anniversary VALUES (1, '原来的纪念日', '2024-02-29', 'yearly', 'heart', '不能丢的记忆')"))
    migrate_anniversary_columns(old)
    migrate_anniversary_columns(old)
    with old.connect() as conn:
        row = conn.execute(text('SELECT * FROM anniversary')).mappings().one()
        assert row['note'] == '不能丢的记忆' and row['date'] == '2024-02-29'
        assert row['color'] == 'rose' and row['style'] == 'letter' and row['pinned'] == 0
    old.dispose()
