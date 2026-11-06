"""P0-C：备份与恢复演练——一致性快照（含 WAL 数据）、附件齐全、独立目录恢复。

演练全程使用临时目录，不触碰真实 iland.db 与 backend/uploads。
"""

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import pytest

from app import backup
from app.backup import create_backup, restore_backup

from .conftest import current_login, make_png


def test_backup_and_restore_rehearsal(client, tmp_path):
    # 1) 造数据：一条带照片的记忆 + 磁盘上的附件文件
    client.cookies.clear()
    client.post("/api/auth/login", json={"name": current_login(client, "bear"), "password": "123456"})
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
    manifest = json.loads((backup_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["format_version"] == 2
    for path, digest in manifest["sha256"].items():
        assert hashlib.sha256((backup_dir / path).read_bytes()).hexdigest() == digest
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
    fake = tmp_path / "iland-backup-fake"
    fake.mkdir()
    (fake / "manifest.json").write_text("{}", encoding="utf-8")
    with pytest.raises(SystemExit):
        restore_backup(fake, tmp_path / "nowhere")


def test_restore_keeps_existing_target_as_pre_restore(backup_dir, tmp_path):
    target = tmp_path / "live"
    target.mkdir()
    (target / "iland.db").write_text("old data", encoding="utf-8")

    restore_backup(backup_dir, target)
    keeps = list(tmp_path.glob("live.pre-restore-*"))
    assert len(keeps) == 1 and (keeps[0] / "iland.db").read_text(encoding="utf-8") == "old data"
    # 新目标里是快照内容而不是旧文件
    conn = sqlite3.connect(target / "iland.db")
    conn.close()


@pytest.fixture
def backup_sources(tmp_path):
    """每项独立的最小合法快照；不依赖全套测试顺序或真实数据库。"""
    source = tmp_path / "source"
    source.mkdir()
    db = source / "iland.db"
    conn = sqlite3.connect(db)
    try:
        for table in ("user", "memory", "letter", "attachment"):
            conn.execute(f'CREATE TABLE "{table}" (id INTEGER PRIMARY KEY, value TEXT)')
        conn.execute("INSERT INTO memory (value) VALUES ('临时记忆')")
        conn.execute("CREATE INDEX memory_value ON memory(value)")
        conn.commit()
    finally:
        conn.close()
    uploads = source / "uploads"
    (uploads / "memories" / "empty").mkdir(parents=True)
    (uploads / "memories" / "photo.webp").write_bytes(b"temporary-photo")
    (uploads / "memories" / "photo-t.webp").write_bytes(b"temporary-thumb")
    return db, uploads


@pytest.fixture
def backup_dir(backup_sources, tmp_path):
    return create_backup(tmp_path / "backups", *backup_sources)


def _snapshot(root):
    result = {}
    for path in root.rglob("*"):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            result[relative] = ("link", os.readlink(path))
        elif path.is_dir():
            result[relative] = ("dir",)
        else:
            result[relative] = ("file", path.read_bytes())
    return result


def _existing_target(tmp_path):
    target = tmp_path / "live"
    (target / "uploads").mkdir(parents=True)
    for name in ("iland.db", "iland.db-wal", "iland.db-shm", "uploads/old.webp", "operator-note"):
        (target / name).write_bytes(f"original:{name}".encode())
    return target


def _manifest(backup_dir, **updates):
    path = backup_dir / "manifest.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data.update(updates)
    path.write_text(json.dumps(data), encoding="utf-8")


def _legacy_manifest(backup_dir):
    path = backup_dir / "manifest.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data.pop("format_version")
    data.pop("sha256")
    path.write_text(json.dumps(data), encoding="utf-8")


def _assert_rejected_without_changes(backup_dir, tmp_path, match=None):
    target = _existing_target(tmp_path)
    before = _snapshot(target)
    source_before = _snapshot(backup_dir)
    with pytest.raises(SystemExit, match=match):
        restore_backup(backup_dir, target)
    assert _snapshot(target) == before
    assert _snapshot(backup_dir) == source_before
    assert not list(tmp_path.glob("live.pre-restore-*"))
    assert not list(tmp_path.glob(".live.restore-*"))


@pytest.mark.parametrize("contents", [b"{", b"[]", b"null", b"{}", b"\xff"])
def test_restore_rejects_invalid_manifest(backup_dir, tmp_path, contents):
    (backup_dir / "manifest.json").write_bytes(contents)
    _assert_rejected_without_changes(backup_dir, tmp_path, "清单无效")


@pytest.mark.parametrize("updates", [
    {"app": "another-app"}, {"created_at": None}, {"created_at": "not-a-date"},
    {"db_bytes": 0}, {"db_bytes": True}, {"upload_files": -1}, {"upload_files": "2"},
    {"format_version": 3}, {"format_version": True}, {"format_version": 1},
    {"sha256": None}, {"sha256": {}}, {"sha256": {"iland.db": "invalid"}},
])
def test_restore_rejects_invalid_manifest_fields(backup_dir, tmp_path, updates):
    _manifest(backup_dir, **updates)
    _assert_rejected_without_changes(backup_dir, tmp_path, "清单无效")


@pytest.mark.parametrize("name", ["manifest.json", "iland.db", "uploads"])
def test_restore_rejects_missing_parts(backup_dir, tmp_path, name):
    path = backup_dir / name
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()
    _assert_rejected_without_changes(backup_dir, tmp_path)
    absent = tmp_path / "absent"
    with pytest.raises(SystemExit):
        restore_backup(backup_dir, absent)
    assert not absent.exists()


@pytest.mark.parametrize("change", ["truncate-db", "delete-photo", "change-photo", "rename-photo", "extra-photo"])
def test_restore_rejects_changed_payload(backup_dir, tmp_path, change):
    photo = backup_dir / "uploads" / "memories" / "photo.webp"
    if change == "truncate-db":
        db = backup_dir / "iland.db"
        db.write_bytes(db.read_bytes()[:512])
    elif change == "delete-photo":
        photo.unlink()
    elif change == "change-photo":
        photo.write_bytes(b"X" * photo.stat().st_size)  # 数量、长度均没变仍须拒绝
    elif change == "rename-photo":
        photo.rename(photo.with_name("wrong.webp"))
    else:
        (photo.parent / "extra.webp").write_bytes(b"extra")
    _assert_rejected_without_changes(backup_dir, tmp_path)


@pytest.mark.parametrize("name", ["iland.db-wal", "iland.db-shm", "iland.db-journal"])
def test_restore_rejects_database_sidecars(backup_dir, tmp_path, name):
    (backup_dir / name).write_bytes(b"unexpected-sidecar")
    _assert_rejected_without_changes(backup_dir, tmp_path, "非预期内容")


@pytest.mark.parametrize("name", ["manifest.json", "iland.db", "uploads", "uploads/memories/photo.webp", "uploads/memories/empty"])
def test_restore_rejects_symlinks(backup_dir, tmp_path, name):
    path = backup_dir / name
    outside = tmp_path / "outside"
    path.rename(outside)
    path.symlink_to(outside, target_is_directory=outside.is_dir())
    _assert_rejected_without_changes(backup_dir, tmp_path, "符号链接")


def test_restore_rejects_special_upload_file(backup_dir, tmp_path):
    os.mkfifo(backup_dir / "uploads" / "pipe")
    target = _existing_target(tmp_path)
    before = _snapshot(target)
    with pytest.raises(SystemExit, match="普通文件"):
        restore_backup(backup_dir, target)
    assert _snapshot(target) == before
    assert not list(tmp_path.glob(".live.restore-*"))


def _damage_index(db):
    # 清空索引页，但保留表数据/表结构/文件长度。SQLite 可打开并返回多条校验错误。
    conn = sqlite3.connect(db)
    try:
        page = conn.execute("SELECT rootpage FROM sqlite_master WHERE name='memory_value'").fetchone()[0]
        page_size = conn.execute("PRAGMA page_size").fetchone()[0]
    finally:
        conn.close()
    data = bytearray(db.read_bytes())
    start = (page - 1) * page_size
    data[start:start + page_size] = (
        b"\x0a\x00\x00\x00\x00" + page_size.to_bytes(2, "big") + b"\x00" * (page_size - 7)
    )
    db.write_bytes(data)


def test_restore_rejects_integrity_errors_returned_without_exception(backup_dir, tmp_path):
    _legacy_manifest(backup_dir)  # 绕开 v2 哈希，单独证明 integrity_check 确实判错
    db = backup_dir / "iland.db"
    _damage_index(db)
    conn = sqlite3.connect(db)
    try:
        assert conn.execute("SELECT value FROM memory NOT INDEXED").fetchall() == [("临时记忆",)]
        errors = conn.execute("PRAGMA integrity_check").fetchall()
        assert len(errors) > 1 and errors != [("ok",)]
    finally:
        conn.close()
    _assert_rejected_without_changes(backup_dir, tmp_path, "完整性校验失败")


@pytest.mark.parametrize("kind", ["bad-header", "missing-table", "empty"])
def test_restore_rejects_unreadable_or_incomplete_database(backup_dir, tmp_path, kind):
    _legacy_manifest(backup_dir)
    db = backup_dir / "iland.db"
    if kind == "bad-header":
        db.write_bytes(b"not-a-sqlite-database")
    elif kind == "empty":
        db.write_bytes(b"")
    else:
        conn = sqlite3.connect(db)
        try:
            conn.execute("DROP TABLE attachment")
            conn.commit()
        finally:
            conn.close()
    _manifest(backup_dir, db_bytes=db.stat().st_size)
    _assert_rejected_without_changes(backup_dir, tmp_path)


def test_restore_accepts_legacy_backup_with_explicit_warning(backup_dir, tmp_path, capsys):
    _legacy_manifest(backup_dir)
    target = restore_backup(backup_dir, tmp_path / "restored")
    assert (target / "iland.db").read_bytes() == (backup_dir / "iland.db").read_bytes()
    assert _snapshot(target / "uploads") == _snapshot(backup_dir / "uploads")
    assert "旧格式备份没有文件校验和" in capsys.readouterr().out


@pytest.mark.parametrize("updates", [{"db_bytes": 1}, {"upload_files": 999}])
def test_legacy_backup_still_checks_size_and_count(backup_dir, tmp_path, updates):
    _legacy_manifest(backup_dir)
    _manifest(backup_dir, **updates)
    _assert_rejected_without_changes(backup_dir, tmp_path, "清单不符")


@pytest.mark.parametrize("relation", ["same", "target-inside-backup", "backup-inside-target"])
def test_restore_rejects_overlapping_paths(backup_dir, tmp_path, relation):
    if relation == "same":
        target = backup_dir
    elif relation == "target-inside-backup":
        target = backup_dir / "restored"
    else:
        target = backup_dir.parent
    before = _snapshot(tmp_path)
    with pytest.raises(SystemExit, match="互相包含"):
        restore_backup(backup_dir, target)
    assert _snapshot(tmp_path) == before


@pytest.mark.parametrize("kind", ["file", "symlink", "dangling-symlink", "mount"])
def test_restore_rejects_invalid_target(backup_dir, tmp_path, monkeypatch, kind):
    target = tmp_path / "invalid-target"
    if kind == "file":
        target.write_bytes(b"original")
    elif kind in ("symlink", "dangling-symlink"):
        real = tmp_path / "real-target"
        if kind == "symlink":
            real.mkdir()
        target.symlink_to(real, target_is_directory=True)
    else:
        target.mkdir()
        original = Path.is_mount
        monkeypatch.setattr(Path, "is_mount", lambda path: path == target or original(path))
    before = _snapshot(tmp_path)
    with pytest.raises(SystemExit):
        restore_backup(backup_dir, target)
    assert _snapshot(tmp_path) == before


@pytest.mark.parametrize("step,existing", [
    ("copy-db", False), ("copy-db", True),
    ("copy-uploads", False), ("copy-uploads", True),
    ("move-old", True), ("publish", False), ("publish", True),
])
def test_restore_io_failure_preserves_target(backup_dir, tmp_path, monkeypatch, step, existing):
    target = _existing_target(tmp_path) if existing else tmp_path / "live"
    before = _snapshot(target) if existing else None
    source_before = _snapshot(backup_dir)
    if step == "copy-db":
        def fail_copy(*args, **kwargs):
            raise OSError("injected-copy-db")
        monkeypatch.setattr(backup.shutil, "copy2", fail_copy)
    elif step == "copy-uploads":
        def partial_copy(src, dst, **kwargs):
            Path(dst).mkdir()
            (Path(dst) / "partial").write_bytes(b"partial")
            raise OSError("injected-copy-uploads")
        monkeypatch.setattr(backup.shutil, "copytree", partial_copy)
    else:
        original = Path.rename
        def fail_rename(path, dest):
            if (step == "move-old" and path == target) or (step == "publish" and path.name == "payload"):
                raise OSError(f"injected-{step}")
            return original(path, dest)
        monkeypatch.setattr(Path, "rename", fail_rename)
    with pytest.raises(SystemExit, match="恢复失败"):
        restore_backup(backup_dir, target)
    assert (_snapshot(target) if target.exists() else None) == before
    assert _snapshot(backup_dir) == source_before
    assert not list(tmp_path.glob("live.pre-restore-*"))
    assert not list(tmp_path.glob(".live.restore-*"))


def test_failed_rollback_keeps_original_data_and_reports_path(backup_dir, tmp_path, monkeypatch):
    target = _existing_target(tmp_path)
    before = _snapshot(target)
    original = Path.rename
    def fail_publish_and_rollback(path, dest):
        if Path(dest) == target:
            raise OSError("injected-publish-and-rollback")
        return original(path, dest)
    monkeypatch.setattr(Path, "rename", fail_publish_and_rollback)
    with pytest.raises(SystemExit, match="自动回退失败") as error:
        restore_backup(backup_dir, target)
    keeps = list(tmp_path.glob("live.pre-restore-*"))
    assert len(keeps) == 1 and _snapshot(keeps[0]) == before
    assert str(keeps[0]) in str(error.value)
    assert not target.exists()


def test_same_second_restores_preserve_distinct_previous_targets(backup_dir, tmp_path, monkeypatch):
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls):
            return cls(2026, 11, 6, 12, 0, 0)
    monkeypatch.setattr(backup, "datetime", FrozenDateTime)
    target = _existing_target(tmp_path)
    first = _snapshot(target)
    restore_backup(backup_dir, target)
    (target / "second-marker").write_bytes(b"second")
    second = _snapshot(target)
    restore_backup(backup_dir, target)
    keeps = list(tmp_path.glob("live.pre-restore-*"))
    assert len(keeps) == 2
    assert first in [_snapshot(p) for p in keeps]
    assert second in [_snapshot(p) for p in keeps]
    assert _snapshot(target / "uploads") == _snapshot(backup_dir / "uploads")


def test_backup_includes_committed_wal_data(backup_sources, tmp_path):
    db, uploads = backup_sources
    conn = sqlite3.connect(db)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA wal_autocheckpoint=0")
        conn.execute("INSERT INTO memory (value) VALUES ('仍在 WAL 中')")
        conn.commit()
        assert Path(str(db) + "-wal").stat().st_size > 0
        bundle = create_backup(tmp_path / "backups", db, uploads)
        restored = restore_backup(bundle, tmp_path / "restored")
        probe = sqlite3.connect(restored / "iland.db")
        try:
            assert probe.execute("SELECT value FROM memory ORDER BY id").fetchall() == [("临时记忆",), ("仍在 WAL 中",)]
        finally:
            probe.close()
        assert conn.execute("SELECT count(*) FROM memory").fetchone() == (2,)
    finally:
        conn.close()


@pytest.mark.parametrize("kind", ["missing-db", "missing-uploads", "bad-db", "bad-index", "symlink-upload"])
def test_create_refuses_invalid_sources_without_publishing(backup_sources, tmp_path, kind):
    db, uploads = backup_sources
    if kind == "missing-db":
        db.unlink()
    elif kind == "missing-uploads":
        shutil.rmtree(uploads)
    elif kind == "bad-db":
        db.write_bytes(b"not sqlite")
    elif kind == "bad-index":
        _damage_index(db)
    else:
        (uploads / "link").symlink_to(db)
    before = _snapshot(tmp_path / "source")
    root = tmp_path / "backups"
    with pytest.raises(SystemExit):
        create_backup(root, db, uploads)
    assert not root.exists() or not list(root.iterdir())
    assert _snapshot(tmp_path / "source") == before


def test_create_refuses_destination_within_uploads(backup_sources):
    db, uploads = backup_sources
    before = _snapshot(uploads)
    with pytest.raises(SystemExit, match="源附件目录"):
        create_backup(uploads / "backups", db, uploads)
    assert _snapshot(uploads) == before


def test_create_copy_failure_does_not_publish_partial_backup(backup_sources, tmp_path, monkeypatch):
    def partial_copy(src, dest, **kwargs):
        Path(dest).mkdir()
        (Path(dest) / "partial").write_bytes(b"partial")
        raise OSError("injected disk full")
    monkeypatch.setattr(backup.shutil, "copytree", partial_copy)
    before = _snapshot(tmp_path / "source")
    root = tmp_path / "backups"
    with pytest.raises(SystemExit, match="创建备份失败"):
        create_backup(root, *backup_sources)
    assert not list(root.iterdir())
    assert _snapshot(tmp_path / "source") == before


def test_restore_publishes_the_validated_copy(backup_dir, tmp_path, monkeypatch):
    db_before = (backup_dir / "iland.db").read_bytes()
    uploads_before = _snapshot(backup_dir / "uploads")
    validate = backup._validate_backup
    def validate_then_change_source(stage, manifest):
        validate(stage, manifest)
        (backup_dir / "iland.db").write_bytes(b"changed after validation")
        (backup_dir / "uploads" / "memories" / "photo.webp").write_bytes(b"changed")
    monkeypatch.setattr(backup, "_validate_backup", validate_then_change_source)
    target = restore_backup(backup_dir, tmp_path / "restored")
    assert (target / "iland.db").read_bytes() == db_before
    assert _snapshot(target / "uploads") == uploads_before


def test_empty_uploads_and_repeated_backups_are_supported(backup_sources, tmp_path, monkeypatch):
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls):
            return cls(2026, 11, 6, 12, 0, 0)
    monkeypatch.setattr(backup, "datetime", FrozenDateTime)
    db, uploads = backup_sources
    shutil.rmtree(uploads)
    uploads.mkdir()
    first = create_backup(tmp_path / "backups", db, uploads)
    before = _snapshot(first)
    second = create_backup(tmp_path / "backups", db, uploads)
    assert first != second and _snapshot(first) == before
    target = restore_backup(second, tmp_path / "restored")
    assert (target / "uploads").is_dir() and not list((target / "uploads").iterdir())


def test_cli_round_trip_and_failure_exit(backup_sources, tmp_path):
    db, uploads = backup_sources
    environment = {
        **os.environ, "ILAND_DB_PATH": str(db), "ILAND_UPLOADS_DIR": str(uploads),
    }
    def run(*args):
        return subprocess.run(
            [sys.executable, "-m", "app.backup", *map(str, args)],
            env=environment, text=True, capture_output=True, timeout=20,
        )
    created = run("backup", tmp_path / "backups")
    assert created.returncode == 0, created.stderr
    bundle, = list((tmp_path / "backups").glob("iland-backup-*"))
    target = tmp_path / "restored"
    restored = run("restore", bundle, target)
    assert restored.returncode == 0, restored.stderr
    assert "已恢复到" in restored.stdout
    before = _snapshot(target)
    (bundle / "uploads" / "memories" / "photo.webp").unlink()
    rejected = run("restore", bundle, target)
    assert rejected.returncode != 0
    assert "备份附件文件数与清单不符" in rejected.stderr
    assert "Traceback" not in rejected.stderr
    assert _snapshot(target) == before
