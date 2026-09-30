"""P0-A：私人内容与身份校验——未登录拦截、身份冒用、越权与路径穿越。"""

from fastapi.testclient import TestClient

from app.main import app


def login(client, name="bear", password="123456"):
    r = client.post("/api/auth/login", json={"name": name, "password": password})
    assert r.status_code == 200, r.text


def test_private_endpoints_require_login(client):
    """未登录读不到任何私人内容：信件、世界状态、记忆、附件。"""
    client.cookies.clear()
    guarded = [
        ("GET", "/api/letters"),
        ("GET", "/api/letters/1"),
        ("GET", "/api/world"),
        ("GET", "/api/memories?start=2026-01-01&end=2026-01-31"),
        ("GET", "/api/memories/1"),
        ("GET", "/api/memories/deleted"),
        ("GET", "/api/files/whatever/original"),
        ("GET", "/api/uploads/letters/guide/page-1.svg"),
        ("POST", "/api/uploads"),
    ]
    for method, path in guarded:
        r = client.request(method, path)
        assert r.status_code == 401, f"{method} {path} 应该要求登录，实际 {r.status_code}"


def test_uploads_dir_not_publicly_mounted(client):
    """uploads 不再公开静态挂载：即使文件真实存在，直接路径也拿不到。"""
    from app.config import UPLOADS_DIR

    (UPLOADS_DIR / "letters" / "guide").mkdir(parents=True, exist_ok=True)
    secret = UPLOADS_DIR / "letters" / "guide" / "page-1.svg"
    secret.write_text("<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8")
    anonymous = TestClient(app)
    assert anonymous.get("/uploads/letters/guide/page-1.svg").status_code == 404

    # 登录后走兼容接口可以读到旧信纸
    login(client)
    r = client.get("/api/uploads/letters/guide/page-1.svg")
    assert r.status_code == 200 and "svg" in r.headers["content-type"]


def test_legacy_upload_path_traversal_blocked(client):
    """兼容接口拒绝目录穿越。"""
    login(client)
    for sneaky in (
        "../iland.db",
        "letters/../../../../etc/passwd",
        "..%2f..%2fetc%2fpasswd",
        "memories/../../iland.db-wal",
    ):
        r = client.get(f"/api/uploads/{sneaky}")
        assert r.status_code == 404, f"穿越路径 {sneaky} 不应被访问"


def test_letter_author_cannot_be_spoofed(client):
    """寄信作者由登录身份决定；客户端传的 author 一律忽略。"""
    login(client, "her")
    r = client.post(
        "/api/letters",
        json={"date": "2026-09-01", "title": "她的信", "author": "bear", "pages": []},
    )
    assert r.status_code == 200
    assert r.json()["letter"]["author"] == "her"


def test_letter_delete_only_by_author(client, second_client):
    """仅作者可删信，避免误删对方来信。"""
    login(client, "her")
    letter = client.post(
        "/api/letters", json={"date": "2026-09-02", "title": "写给小熊", "pages": []}
    ).json()["letter"]

    login(second_client, "bear")
    r = second_client.delete(f"/api/letters/{letter['id']}")
    assert r.status_code == 403

    login(client, "her")
    assert client.delete(f"/api/letters/{letter['id']}").status_code == 200
    assert client.get(f"/api/letters/{letter['id']}").status_code == 404
