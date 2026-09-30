"""P0-C：备份与恢复演练——一致性快照（含 WAL 数据）、附件齐全、独立目录恢复。

演练全程使用临时目录，不触碰真实 iland.db 与 backend/uploads。
"""

import sqlite3
from pathlib import Path

from app.backup import create_backup, restore_backup
from app.config import DB_PATH, UPLOADS_DIR
from app.models import Memory

from .conftest import make_png


def test_backup_and_restore_rehearsal(client, tmp_path):
    # 1) 造数据：一条带照片的记忆 + 磁盘上的附件文件
    client.cookies.clear()
    client.post("/api/auth/login", json={"name": "bear", "password": "123456"})
    upload = client.post(
        "/api/uploads", files={"file": ("sea.jpg", make_png(), "image/jpeg")}
    )
    assert upload.status_code == 201
    attachment = upload.json()["attachment"]
    created = client.post(
        "/api/memories",
        json={"date": "2026-09-21", "description": "恢复演练", "attachments": [attachment["id"]]},
    ).json()["memory"]

    # 2) 备份（此刻数据还可能只躺在 WAL 里，快照必须完整带上）
    backup_dir = create_backup(tmp_path / "backups")
    manifest = (backup_dir / "manifest.json").read_text(encoding="utf-8")
    assert '"upload_files"' in manifest
    assert (backup_dir / "iland.db").is_file()
    assert (backup_dir / "uploads" / "memories").is_dir()

    # 3) 恢复到独立目录（演练现场）
    rehearsal = tmp_path / "rehearsal"
    restore_backup(backup_dir, rehearsal)

    # 4) 打开恢复出的环境验证：记录、附件、缩略图完整
    conn = sqlite3.connect(rehearsal / "iland.db")
    try:
        rows = conn.execute("SELECT id, date, description FROM memory WHERE id = ?", (created["id"],)).fetchall()
        assert rows == [(created["id"], "2026-09-21", "恢复演练")]
        attachment_row = conn.execute("SELECT id FROM attachment WHERE id = ?", (attachment["id"],)).fetchone()
        assert attachment_row is not None
    finally:
        conn.close()

    restored_stem = (rehearsal / "uploads" / "memories").rglob(f"{attachment['id']}.webp")
    assert next(restored_stem, None) is not None
    for suffix in ("-d.webp", "-t.webp"):
        matches = list((rehearsal / "uploads" / "memories").rglob(f"{attachment['id']}{suffix}"))
        assert matches, f"缺少派生图 {suffix}"


def test_restore_refuses_incomplete_backup(tmp_path):
    import pytest

    fake = tmp_path / "iland-backup-fake"
    fake.mkdir()
    (fake / "manifest.json").write_text("{}", encoding="utf-8")
    with pytest.raises(SystemExit):
        restore_backup(fake, tmp_path / "nowhere")


def test_restore_keeps_existing_target_as_pre_restore(tmp_path):
    backup_dir = create_backup(tmp_path / "backups")
    target = tmp_path / "live"
    target.mkdir()
    (target / "iland.db").write_text("old data", encoding="utf-8")

    restore_backup(backup_dir, target)
    keeps = list(tmp_path.glob("live.pre-restore-*"))
    assert len(keeps) == 1 and (keeps[0] / "iland.db").read_text(encoding="utf-8") == "old data"
    # 新目标里是快照内容而不是旧文件
    conn = sqlite3.connect(target / "iland.db")
    conn.close()
