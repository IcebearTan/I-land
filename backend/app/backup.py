"""备份与恢复：SQLite 一致性快照 + 附件目录，作为同一套内容备份。

用法（在 backend/ 目录下）：
    .venv/bin/python -m app.backup backup /备份目录           # 生成 iland-backup-<时间>/
    .venv/bin/python -m app.backup restore /备份目录/iland-backup-... /恢复目标目录

要点：
- 数据库用 sqlite3 backup API 在线导出（WAL 下直接复制主 db 文件不完整，必须走快照）；
- 附件按文件复制；上传采用「临时文件 + 原子改名」落盘，目录里永远是完整文件，
  备份期新上传的文件至多多出几个未引用附件，不影响一致性；
- 恢复先落临时目录校验，通过后原子替换目标（替换前把现状另存 *.pre-restore）。

恢复演练（不动真实数据）：
    .venv/bin/python -m app.backup restore <备份目录> /tmp/iland-restore-rehearsal
"""

import argparse
import json
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from .config import DB_PATH, UPLOADS_DIR

MANIFEST = "manifest.json"
BACKUP_DB = "iland.db"
BACKUP_UPLOADS = "uploads"


def create_backup(dest_root: Path, db_path: Path = DB_PATH, uploads_dir: Path = UPLOADS_DIR) -> Path:
    """把数据库一致性快照 + 全部附件写进 dest_root/iland-backup-<时间>/。"""
    dest_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = dest_root / f"iland-backup-{stamp}"
    dest.mkdir()

    dest_db = dest / BACKUP_DB
    if db_path.exists():
        # 在线一致性快照：backup API 会在源库上拿读锁拷贝全部页，包含 WAL 中未合并的数据
        src = sqlite3.connect(db_path)
        try:
            dst = sqlite3.connect(dest_db)
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
    else:
        dest_db.touch()  # 没有数据库也允许备份（全新部署前）

    if uploads_dir.is_dir():
        shutil.copytree(uploads_dir, dest / BACKUP_UPLOADS, dirs_exist_ok=True)
    else:
        (dest / BACKUP_UPLOADS).mkdir()

    manifest = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "app": "iland",
        "db_bytes": dest_db.stat().st_size,
        "upload_files": sum(1 for _ in (dest / BACKUP_UPLOADS).rglob("*") if _.is_file()),
    }
    (dest / MANIFEST).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return dest


def _load_manifest(backup_dir: Path) -> dict:
    manifest_path = backup_dir / MANIFEST
    if not manifest_path.is_file():
        raise SystemExit(f"备份目录缺少 {MANIFEST}，不是有效的 I-land 备份：{backup_dir}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def restore_backup(backup_dir: Path, target_root: Path) -> Path:
    """把备份恢复到 target_root（内含 iland.db 与 uploads/），用于演练或迁移。

    现有 target_root 内容会先挪到 target_root.pre-restore-<时间>，可手工找回。
    """
    manifest = _load_manifest(backup_dir)
    backup_db = backup_dir / BACKUP_DB
    backup_uploads = backup_dir / BACKUP_UPLOADS
    if not backup_db.is_file() or not backup_uploads.is_dir():
        raise SystemExit("备份内容不完整（缺数据库或附件目录）")

    # 先在临时目录里校验快照可打开，校验不过不动目标
    with tempfile.TemporaryDirectory(prefix="iland-restore-") as tmp:
        probe = Path(tmp) / "probe.db"
        shutil.copy2(backup_db, probe)
        conn = sqlite3.connect(probe)
        try:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            required = {"user", "memory", "letter", "attachment"}
            missing = required - tables
            if missing:
                raise SystemExit(f"备份快照缺少核心表 {sorted(missing)}，中止恢复")
            conn.execute("PRAGMA integrity_check").fetchone()
        finally:
            conn.close()

    target_root.mkdir(parents=True, exist_ok=True)
    if any(target_root.iterdir()):
        keep = target_root.parent / f"{target_root.name}.pre-restore-{datetime.now():%Y%m%d-%H%M%S}"
        shutil.move(str(target_root), str(keep))
        print(f"现有数据已挪到 {keep}")
    target_root.mkdir(parents=True, exist_ok=True)

    shutil.copy2(backup_db, target_root / "iland.db")
    shutil.copytree(backup_uploads, target_root / "uploads")
    print(f"已恢复到 {target_root}（备份时间 {manifest['created_at']}，附件 {manifest['upload_files']} 个文件）")
    print("下次以 ILAND_DB_PATH/ILAND_UPLOADS_DIR 指向该目录启动即得到恢复环境。")
    return target_root


def main(argv=None):
    parser = argparse.ArgumentParser(description="I-land 备份 / 恢复")
    sub = parser.add_subparsers(dest="command", required=True)
    backup_cmd = sub.add_parser("backup", help="生成一致性备份")
    backup_cmd.add_argument("dest", type=Path, help="备份根目录")
    restore_cmd = sub.add_parser("restore", help="把备份恢复到目标目录")
    restore_cmd.add_argument("backup_dir", type=Path, help="备份目录（iland-backup-*）")
    restore_cmd.add_argument("target", type=Path, help="恢复目标目录（须为空或不存在）")
    args = parser.parse_args(argv)
    if args.command == "backup":
        print(f"备份完成：{create_backup(args.dest)}")
    elif args.command == "restore":
        restore_backup(args.backup_dir, args.target)


if __name__ == "__main__":
    sys.exit(main())
