"""P0-C：改密流程——旧密码校验、旧会话失效、新密码可登录。用 tester 账号避免影响共享登录态。"""


def login(client, name="tester", password="123456"):
    r = client.post("/api/auth/login", json={"name": name, "password": password})
    assert r.status_code == 200, r.text


def test_change_password_flow(client, second_client):
    login(client)  # 当前设备
    login(second_client)  # 另一台设备（旧会话）

    r = client.post(
        "/api/auth/password", json={"old_password": "wrong", "new_password": "new-secret-1"}
    )
    assert r.status_code == 401

    r = client.post(
        "/api/auth/password", json={"old_password": "123456", "new_password": "123456"}
    )
    assert r.status_code == 422  # 新旧相同

    r = client.post(
        "/api/auth/password",
        json={"old_password": "123456", "new_password": "our-island-2026"},
    )
    assert r.status_code == 200

    # 当前会话保留，其他设备的旧会话全部失效
    assert client.get("/api/auth/me").status_code == 200
    assert second_client.get("/api/auth/me").status_code == 401

    # 旧密码不能再登录，新密码可以
    client.cookies.clear()
    assert (
        client.post("/api/auth/login", json={"name": "tester", "password": "123456"}).status_code
        == 401
    )
    login(client, "tester", "our-island-2026")

    # 改回默认密码，别影响其他用例
    r = client.post(
        "/api/auth/password",
        json={"old_password": "our-island-2026", "new_password": "123456"},
    )
    assert r.status_code == 200


def test_password_change_requires_login(client):
    client.cookies.clear()
    r = client.post(
        "/api/auth/password", json={"old_password": "123456", "new_password": "abcdef"}
    )
    assert r.status_code == 401
