"""设置控制台：岛民名字读写与校验（登录保护、双账号共享、meta 同步）。"""


def login(client, name="bear", password="123456"):
    r = client.post("/api/auth/login", json={"name": name, "password": password})
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
