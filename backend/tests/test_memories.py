"""P1-B：每日记忆 API——共享读写、区间查询、幂等、版本冲突、软删除恢复、迁移。"""

import io

from PIL import Image

from .conftest import current_login, make_png


def login(client, name="bear", password="123456"):
    r = client.post("/api/auth/login", json={"name": current_login(client, name), "password": password})
    assert r.status_code == 200, r.text


def upload_photo(client, name="bear") -> str:
    login(client, name)
    r = client.post("/api/uploads", files={"file": ("p.jpg", make_png(), "image/jpeg")})
    assert r.status_code == 201, r.text
    return r.json()["attachment"]["id"]


def body(**overrides):
    payload = {"date": "2026-09-20", "description": "一起去海边", "attachments": []}
    payload.update(overrides)
    return payload


def test_shared_read_write_between_accounts(client, second_client):
    """小熊建的记忆，她能读到、也能改——共同记忆归两个人。"""
    attachment = upload_photo(client, "bear")
    r = client.post(
        "/api/memories",
        json=body(description="看日落", attachments=[attachment], mood="🥰", location="青岛"),
    )
    assert r.status_code == 201, r.text
    created = r.json()["memory"]
    assert created["created_by"] == "bear"
    assert created["attachments"] == [attachment]
    assert created["version"] == 1

    login(second_client, "her")
    r = second_client.get("/api/memories?start=2026-09-20&end=2026-09-20")
    assert [m["id"] for m in r.json()["memories"]] == [created["id"]]

    r = second_client.put(
        f"/api/memories/{created['id']}",
        json=body(description="看日落，风有点大", version=1, weather_type="wind"),
    )
    assert r.status_code == 200
    updated = r.json()["memory"]
    assert updated["version"] == 2 and updated["updated_by"] == "her"
    assert updated["weather"] == {"type": "wind", "note": ""}


def test_same_day_multiple_memories_and_range(client):
    login(client)
    for i in range(3):
        r = client.post("/api/memories", json=body(description=f"小事 {i}", date="2026-10-05"))
        assert r.status_code == 201
    client.post("/api/memories", json=body(description="另一天", date="2026-10-06"))
    client.post("/api/memories", json=body(description="更早", date="2026-09-30"))

    r = client.get("/api/memories?start=2026-10-01&end=2026-10-31")
    dates = [m["date"] for m in r.json()["memories"]]
    assert dates == ["2026-10-05", "2026-10-05", "2026-10-05", "2026-10-06"]

    r = client.get("/api/memories?start=2026-10-05&end=2026-10-05")
    assert len(r.json()["memories"]) == 3

    # 界外日期被拒
    assert client.get("/api/memories?start=2026-10-01&end=2026-9-01").status_code == 422
    assert client.get("/api/memories?start=bad&end=2026-10-01").status_code == 422
    assert client.get("/api/memories?start=2020-01-01&end=2026-10-01").status_code == 422  # 超一年


def test_validation(client):
    login(client)
    bad_bodies = [
        body(description="   "),  # 无照片无描述
        body(description="x", date="2026-02-29"),  # 不存在的日期
        body(description="x", date="2026-13-01"),
        body(description="x", date="1800-01-01"),
        body(description="x", weather_type="typhoon"),  # 非法天气
        body(description="长" * 5001),
        body(description="x", title="t" * 121),
        body(description="x", attachments=["ghost-id"]),  # 不存在的附件
    ]
    for payload in bad_bodies:
        assert client.post("/api/memories", json=payload).status_code == 422, payload

    # 超过每条记忆照片数上限
    ids = [upload_photo(client) for _ in range(10)]
    assert client.post("/api/memories", json=body(attachments=ids)).status_code == 422

    # 合法最小输入：无标题、只有一句描述
    assert client.post("/api/memories", json=body(description="路过一家很香的花店")).status_code == 201


def test_client_id_idempotent(client):
    """网络超时重试：同一 client_id 只建一条。"""
    login(client)
    payload = body(description="幂等的记忆", client_id="retry-token-1")
    first = client.post("/api/memories", json=payload)
    assert first.status_code == 201
    second = client.post("/api/memories", json=payload)
    assert second.status_code == 200  # 命中已有记录
    assert second.json()["memory"]["id"] == first.json()["memory"]["id"]

    r = client.get("/api/memories?start=2026-09-20&end=2026-09-20")
    assert len([m for m in r.json()["memories"] if m["description"] == "幂等的记忆"]) == 1


def test_version_conflict_returns_latest(client, second_client):
    """后提交者不会被静默覆盖：旧版本更新被拒，409 带服务器最新内容。"""
    login(client, "bear")
    created = client.post("/api/memories", json=body(description="初版")).json()["memory"]

    login(second_client, "her")
    r = second_client.put(
        f"/api/memories/{created['id']}", json=body(description="她的新版本", version=1)
    )
    assert r.status_code == 200

    login(client, "bear")
    stale = client.put(
        f"/api/memories/{created['id']}", json=body(description="小熊的旧版本", version=1)
    )
    assert stale.status_code == 409
    detail = stale.json()["detail"]
    assert detail["memory"]["description"] == "她的新版本"
    assert detail["memory"]["version"] == 2

    # 拿到最新版本后可以正常保存
    fresh = client.put(
        f"/api/memories/{created['id']}",
        json=body(description="合并后的版本", version=detail["memory"]["version"]),
    )
    assert fresh.status_code == 200
    assert fresh.json()["memory"]["version"] == 3
    assert fresh.json()["memory"]["updated_by"] == "bear"


def test_soft_delete_restore_keeps_attachments(client):
    attachment = upload_photo(client, "bear")
    created = client.post(
        "/api/memories", json=body(description="有照片的记忆", attachments=[attachment])
    ).json()["memory"]

    # 删除是软删除：列表消失、回收站可见、照片文件原样可读
    assert client.delete(f"/api/memories/{created['id']}").status_code == 200
    r = client.get("/api/memories?start=2026-09-01&end=2026-09-30")
    assert created["id"] not in [m["id"] for m in r.json()["memories"]]

    trash = client.get("/api/memories/deleted").json()
    item = next(m for m in trash["memories"] if m["id"] == created["id"])
    assert item["deleted"] is True and item["deleted_by"] == "bear"
    assert 0 <= item["days_left"] <= trash["keep_days"]

    assert client.get(f"/api/files/{attachment}/original").status_code == 200
    assert client.get(f"/api/files/{attachment}/thumb").status_code == 200

    # 已删除的记忆不能直接编辑
    assert (
        client.put(f"/api/memories/{created['id']}", json=body(description="x", version=1)).status_code
        == 404
    )

    # 恢复后回到列表，附件关联完整
    restored = client.post(f"/api/memories/{created['id']}/restore").json()["memory"]
    assert restored["deleted"] is False and restored["attachments"] == [attachment]
    r = client.get("/api/memories?start=2026-09-20&end=2026-09-20")
    assert created["id"] in [m["id"] for m in r.json()["memories"]]


def test_attachments_marked_linked_and_orphans_tracked(client):
    from sqlmodel import Session

    from app.attachments import list_orphan_attachments
    from app.config import UPLOADS_DIR
    from app.db import engine
    from app.models import Attachment

    login(client)
    kept = upload_photo(client)
    dropped = upload_photo(client)  # 上传了但没保存进记忆 → 待清理候选
    client.post("/api/memories", json=body(description="留下一张", attachments=[kept]))

    with Session(engine) as db:
        assert db.get(Attachment, kept).linked is True
        assert db.get(Attachment, dropped).linked is False

        # 宽限期内不算孤儿；把时间拨回 3 天前再查
        orphan_row = db.get(Attachment, dropped)
        from datetime import datetime, timedelta

        orphan_row.created_at = datetime.utcnow() - timedelta(days=3)
        db.add(orphan_row)
        db.commit()

        orphans = list_orphan_attachments(db, older_than_days=2)
        assert [o["id"] for o in orphans] == [dropped]
        assert orphans[0]["on_disk"] is True
        assert (UPLOADS_DIR / "memories").is_dir()


def test_memory_migration_preserves_old_rows():
    from sqlalchemy import inspect, text
    from sqlmodel import Session, create_engine

    from app.db import migrate_memory_columns
    from app.models import Memory, jdump

    old = create_engine("sqlite://")
    with old.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE memory (id INTEGER PRIMARY KEY, date VARCHAR, title VARCHAR, "
                "description VARCHAR, mood VARCHAR, weather_json VARCHAR, location VARCHAR, "
                "photos_json VARCHAR, created_by VARCHAR, created_at DATETIME)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO memory VALUES (1, '2026-01-01', '旧记忆', '旧的描述', '❤️', "
                "'{}', '北京', '[\"uploads/memories/old.webp\"]', 'bear', '2026-01-01 10:00:00')"
            )
        )
    migrate_memory_columns(old)
    migrate_memory_columns(old)  # 幂等
    with Session(old) as session:
        row = session.get(Memory, 1)
        assert row.title == "旧记忆" and row.photos_json.startswith('["uploads')
        assert row.version == 1 and row.attachments_json == "[]" and row.deleted_at is None
    old.dispose()
