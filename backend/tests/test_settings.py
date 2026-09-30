"""设置控制台：岛民名字读写与校验（登录保护、双账号共享、meta 同步）。"""

from .conftest import current_login


def login(client, name="bear", password="123456"):
    r = client.post("/api/auth/login", json={"name": current_login(client, name), "password": password})
    assert r.status_code == 200, r.text


def test_names_require_login(client):
    client.cookies.clear()
    assert client.put("/api/settings/names", json={"bear": "熊", "her": "兔"}).status_code == 401
    assert client.get("/api/settings/names").status_code == 401


def test_meta_contains_default_names(client):
    client.cookies.clear()
    names = client.get("/api/meta").json()["names"]
    assert names == {"bear": "小熊", "her": "她"}


def test_update_names_shared_and_validated(client, second_client):
    login(client, "bear")
    for bad in [
        {"bear": "  ", "her": "她"},  # 空
        {"bear": "x" * 21, "her": "她"},  # 超长
        {"bear": "熊", "her": ""},  # 空
    ]:
        assert client.put("/api/settings/names", json=bad).status_code == 422

    r = client.put("/api/settings/names", json={"bear": "熊崽", "her": "小兔子"})
    assert r.status_code == 200
    assert r.json()["names"] == {"bear": "熊崽", "her": "小兔子"}

    # meta（登录页与各面板的数据源）同步；她自己也能改
    assert client.get("/api/meta").json()["names"]["her"] == "小兔子"
    login(second_client, "her")
    r = second_client.put("/api/settings/names", json={"bear": "熊崽", "her": "兔子小姐"})
    assert r.json()["names"]["her"] == "兔子小姐"

    # 登录身份里的 display 一并更新
    assert second_client.get("/api/auth/me").json()["user"]["display"] == "兔子小姐"

    # 收尾：恢复默认名，避免影响其他用例与共享 meta
    client.put("/api/settings/names", json={"bear": "小熊", "her": "她"})
    assert client.get("/api/meta").json()["names"] == {"bear": "小熊", "her": "她"}


def test_rename_preserves_sessions_content_and_ownership(client, second_client):
    from .conftest import make_png

    login(client, 'bear')
    login(second_client, 'her')
    attachment = client.post('/api/uploads', files={'file': ('name.png', make_png(), 'image/png')}).json()['attachment']
    letter = client.post('/api/letters', json={
        'date': '2040-01-01', 'title': '改名回归信', 'pages': [attachment['urls']['display']],
    }).json()['letter']
    memory = client.post('/api/memories', json={
        'date': '2040-01-01', 'description': '身份不能因为昵称改变', 'attachments': [attachment['id']],
    }).json()['memory']
    before = client.get('/api/auth/me').json()['user']
    try:
        response = client.put('/api/settings/names', json={'bear': '  Icebear  ', 'her': '小黑'})
        assert response.status_code == 200, response.text
        assert response.json()['names'] == {'bear': 'Icebear', 'her': '小黑'}
        identity = response.json()['user']
        assert identity['id'] == before['id'] and identity['account'] == 'bear'
        assert identity['name'] == identity['display'] == 'Icebear'
        assert second_client.get('/api/auth/me').json()['user']['name'] == '小黑'
        assert client.get(f"/api/letters/{letter['id']}").json()['letter']['author'] == 'bear'
        assert client.get(f"/api/memories/{memory['id']}").json()['memory']['created_by'] == 'bear'
        assert second_client.get(attachment['urls']['display']).status_code == 200
        assert second_client.delete(f"/api/letters/{letter['id']}").status_code == 403

        for old in ['bear', 'her', '小熊', '她']:
            assert client.post('/api/auth/login', json={'name': old, 'password': '123456'}).status_code == 401
        for new, account in [('Icebear', 'bear'), ('小黑', 'her')]:
            response = client.post('/api/auth/login', json={'name': new, 'password': '123456'})
            assert response.status_code == 200 and response.json()['user']['account'] == account
        # 重启的种子逻辑不能重复建账号、覆盖名字或修改密码。
        from app.db import engine
        from app.seed import seed
        from app.models import User
        from sqlmodel import Session, select
        with Session(engine) as db:
            seed(db)
            assert len(db.exec(select(User)).all()) == 3
        login(client, 'bear')
        assert client.delete(f"/api/letters/{letter['id']}").status_code == 200
    finally:
        client.put('/api/settings/names', json={'bear': '小熊', 'her': '她'})


def test_name_collision_is_atomic_and_names_can_swap(client):
    login(client)
    defaults = {'bear': '小熊', 'her': '她'}
    for invalid in [
        {'bear': '同名', 'her': '同名'},
        {'bear': '测试者', 'her': '新的她'},
    ]:
        assert client.put('/api/settings/names', json=invalid).status_code == 409
        assert client.get('/api/meta').json()['names'] == defaults
    assert client.put('/api/settings/names', json={'bear': '换\n行', 'her': '她'}).status_code == 422
    try:
        response = client.put('/api/settings/names', json={'bear': '她', 'her': '小熊'})
        assert response.status_code == 200, response.text
        assert response.json()['user']['name'] == '她'
        assert client.post('/api/auth/login', json={'name': '她', 'password': '123456'}).json()['user']['account'] == 'bear'
        assert client.post('/api/auth/login', json={'name': '小熊', 'password': '123456'}).json()['user']['account'] == 'her'
    finally:
        client.put('/api/settings/names', json=defaults)


def test_login_name_migration_preserves_legacy_identity_and_is_repeatable():
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError
    from sqlmodel import create_engine
    from app.db import migrate_user_login_names
    import pytest

    legacy = create_engine('sqlite://')
    with legacy.begin() as conn:
        conn.execute(text('CREATE TABLE user (id INTEGER PRIMARY KEY, name VARCHAR UNIQUE, display VARCHAR, pass_hash VARCHAR, sprite VARCHAR)'))
        conn.execute(text("INSERT INTO user VALUES (1, 'bear', 'Icebear', '旧密码散列', 'bear'), (2, 'her', '小黑', '她的散列', 'her'), (3, 'guest', '小黑', '第三人', 'guest')"))
        conn.execute(text('CREATE TABLE letter (id INTEGER PRIMARY KEY, author VARCHAR)'))
        conn.execute(text("INSERT INTO letter VALUES (1, 'bear')"))
    migrate_user_login_names(legacy)
    migrate_user_login_names(legacy)
    with legacy.connect() as conn:
        rows = conn.execute(text('SELECT * FROM user ORDER BY id')).mappings().all()
        assert [(r['name'], r['login_name'], r['display']) for r in rows] == [
            ('bear', 'Icebear', 'Icebear'), ('her', '小黑', '小黑'), ('guest', 'guest', 'guest'),
        ]
        assert rows[0]['pass_hash'] == '旧密码散列' and rows[1]['sprite'] == 'her'
        assert conn.execute(text('SELECT author FROM letter')).scalar() == 'bear'
    with pytest.raises(IntegrityError), legacy.begin() as conn:
        conn.execute(text("UPDATE user SET login_name='Icebear' WHERE name='her'"))
    legacy.dispose()
