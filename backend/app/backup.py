"""SQLite 一致性快照与附件同套备份；完整暂存、校验后才发布恢复目录。

在 backend/ 下运行：
    .venv/bin/python -m app.backup backup /备份目录
    .venv/bin/python -m app.backup restore /备份目录/iland-backup-... /恢复目标目录

备份用 SQLite backup API 包含 WAL 数据，不能直接复制运行中的主 db 文件。
恢复必须停止目标服务写入；目标须为可重命名的独立目录，不能是挂载点。
"""

import argparse
import hashlib
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


def _require_file(path: Path) -> None:
    if path.is_symlink() or not path.is_file():
        raise SystemExit(f"缺少普通文件或包含符号链接：{path}")


def _require_directory(path: Path) -> None:
    if path.is_symlink() or not path.is_dir():
        raise SystemExit(f"缺少目录或包含符号链接：{path}")


def _payload_files(root: Path) -> list[Path]:
    """只接受工具产生的独立快照与普通附件，拒绝 WAL/链接/特殊文件。"""
    _require_directory(root)
    unexpected = {p.name for p in root.iterdir()} - {MANIFEST, BACKUP_DB, BACKUP_UPLOADS}
    if unexpected:
        raise SystemExit(f"备份含有非预期内容（不能混入 WAL/SHM 等文件）：{sorted(unexpected)}")
    _require_file(root / BACKUP_DB)
    _require_directory(root / BACKUP_UPLOADS)
    files = [root / BACKUP_DB]
    for path in sorted((root / BACKUP_UPLOADS).rglob("*")):
        if path.is_symlink():
            raise SystemExit(f"附件目录不能包含符号链接：{path}")
        if not path.is_dir():
            _require_file(path)
            files.append(path)
    return files


def _hash_files(root: Path, files: list[Path]) -> dict[str, str]:
    hashes = {}
    for path in files:
        with path.open("rb") as stream:
            hashes[path.relative_to(root).as_posix()] = hashlib.file_digest(stream, "sha256").hexdigest()
    return hashes


def _validate_database(path: Path) -> None:
    # 仅检查已暂存的独立快照；只读且不创建/依赖 journal、WAL 或 SHM。
    try:
        conn = sqlite3.connect(path.resolve().as_uri() + "?mode=ro&immutable=1", uri=True)
        try:
            result = conn.execute("PRAGMA integrity_check").fetchall()
            if result != [("ok",)]:
                details = "; ".join(str(row[0]) for row in result[:3])
                raise SystemExit(f"备份数据库完整性校验失败：{details or '没有返回 ok'}")
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            missing = {"user", "memory", "letter", "attachment"} - tables
            if missing:
                raise SystemExit(f"备份快照缺少核心表 {sorted(missing)}，中止恢复")
        finally:
            conn.close()
    except sqlite3.Error as exc:
        raise SystemExit(f"备份数据库无法读取或已损坏：{exc}") from exc


def _load_manifest(backup_dir: Path) -> dict:
    manifest_path = backup_dir / MANIFEST
    _require_file(manifest_path)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or manifest.get("app") != "iland":
            raise ValueError("app 必须为 iland")
        if not isinstance(manifest.get("created_at"), str):
            raise ValueError("缺少 created_at")
        datetime.fromisoformat(manifest["created_at"])
        for key, minimum in (("db_bytes", 1), ("upload_files", 0)):
            if type(manifest.get(key)) is not int or manifest[key] < minimum:
                raise ValueError(f"{key} 必须为不小于 {minimum} 的整数")
        version = manifest.get("format_version", 1)
        if type(version) is not int or version not in (1, 2):
            raise ValueError("不支持的 format_version")
        if version == 2:
            hashes = manifest.get("sha256")
            if not isinstance(hashes, dict) or not hashes:
                raise ValueError("缺少 sha256 文件清单")
            for value in hashes.values():
                if (not isinstance(value, str) or len(value) != 64
                        or any(c not in "0123456789abcdef" for c in value)):
                    raise ValueError("sha256 校验和格式无效")
        elif "sha256" in manifest:
            raise ValueError("含校验和的备份必须声明 format_version=2")
        return manifest
    except (ValueError, UnicodeError) as exc:
        raise SystemExit(f"备份清单无效：{exc}") from exc


def _validate_backup(root: Path, manifest: dict) -> None:
    files = _payload_files(root)
    if (root / BACKUP_DB).stat().st_size != manifest["db_bytes"]:
        raise SystemExit("备份数据库大小与清单不符")
    if len(files) - 1 != manifest["upload_files"]:
        raise SystemExit("备份附件文件数与清单不符")
    if manifest.get("format_version", 1) == 2:
        if {p.relative_to(root).as_posix() for p in files} != set(manifest["sha256"]):
            raise SystemExit("备份文件路径与校验和清单不符")
        if _hash_files(root, files) != manifest["sha256"]:
            raise SystemExit("备份文件 SHA-256 校验失败")
    _validate_database(root / BACKUP_DB)


def create_backup(dest_root: Path, db_path: Path = DB_PATH, uploads_dir: Path = UPLOADS_DIR) -> Path:
    """暂存一致性快照与附件，验证后发布带文件 SHA-256 清单的备份。"""
    _require_file(db_path)
    _require_directory(uploads_dir)
    if dest_root.resolve().is_relative_to(uploads_dir.resolve()):
        raise SystemExit("备份输出不能放在源附件目录内")
    dest_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    try:
        with tempfile.TemporaryDirectory(prefix=".iland-backup-", dir=dest_root) as tmp:
            stage = Path(tmp) / "payload"
            stage.mkdir()
            dest_db = stage / BACKUP_DB
            src = sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True)
            try:
                dst = sqlite3.connect(dest_db)
                try:
                    src.backup(dst)
                finally:
                    dst.close()
            finally:
                src.close()
            # 保留链接到暂存区再拒绝，不能默默跟随链接复制目录外的文件。
            shutil.copytree(uploads_dir, stage / BACKUP_UPLOADS, symlinks=True)
            files = _payload_files(stage)
            _validate_database(dest_db)
            manifest = {
                "format_version": 2,
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "app": "iland",
                "db_bytes": dest_db.stat().st_size,
                "upload_files": len(files) - 1,
                "sha256": _hash_files(stage, files),
            }
            (stage / MANIFEST).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
            dest = dest_root / f"iland-backup-{stamp}-{Path(tmp).name.removeprefix('.iland-backup-')}"
            stage.rename(dest)
            return dest
    except (OSError, sqlite3.Error) as exc:
        raise SystemExit(f"创建备份失败，未发布完整备份：{exc}") from exc


def _publish_restore(stage: Path, target_root: Path) -> Path | None:
    keep = None
    if target_root.exists():
        # mkdtemp 预留独有空目录；同秒重试也不能覆盖或嵌套进已有回退目录。
        prefix = f"{target_root.name}.pre-restore-{datetime.now():%Y%m%d-%H%M%S}-"
        keep = Path(tempfile.mkdtemp(prefix=prefix, dir=target_root.parent))
        try:
            target_root.rename(keep)
        except BaseException:
            keep.rmdir()
            raise
    try:
        stage.rename(target_root)
    except BaseException as exc:
        if keep is not None:
            try:
                if target_root.exists():
                    raise OSError("目标已重新出现，不能覆盖")
                keep.rename(target_root)
            except OSError as rollback_error:
                raise SystemExit(
                    f"发布失败（{exc}），且自动回退失败（{rollback_error}）。"
                    f"原数据完整保留在 {keep}；保持停服，手工核对并回退。"
                ) from exc
        raise
    return keep


def restore_backup(backup_dir: Path, target_root: Path) -> Path:
    """完整暂存与校验后切换目录；发布失败回退，原目标保留为 pre-restore。"""
    _require_directory(backup_dir)
    if target_root.is_symlink() or (target_root.exists() and not target_root.is_dir()):
        raise SystemExit("恢复目标必须为普通目录，不能是文件或符号链接")
    backup_dir = backup_dir.resolve()
    target_root = target_root.resolve()
    if backup_dir.is_relative_to(target_root) or target_root.is_relative_to(backup_dir):
        raise SystemExit("备份目录与恢复目标不能相同或互相包含")
    if target_root.is_mount():
        raise SystemExit("恢复目标不能是挂载点；请恢复到挂载点内新的独立子目录")
    try:
        manifest = _load_manifest(backup_dir)
        _payload_files(backup_dir)
        target_root.parent.mkdir(parents=True, exist_ok=True)
        # 暂存与目标同一文件系统；数据库和附件均检查这份最终待发布副本。
        with tempfile.TemporaryDirectory(prefix=f".{target_root.name}.restore-", dir=target_root.parent) as tmp:
            stage = Path(tmp) / "payload"
            stage.mkdir()
            shutil.copy2(backup_dir / BACKUP_DB, stage / BACKUP_DB)
            shutil.copytree(backup_dir / BACKUP_UPLOADS, stage / BACKUP_UPLOADS, symlinks=True)
            _validate_backup(stage, manifest)
            keep = _publish_restore(stage, target_root)
        if keep is not None:
            print(f"现有数据已保留到 {keep}")
        if manifest.get("format_version", 1) == 1:
            print("注意：旧格式备份没有文件校验和，仅核对数据库完整性、大小与附件数；请人工核对照片和信件。")
        print(f"已恢复到 {target_root}（备份时间 {manifest['created_at']}，附件 {manifest['upload_files']} 个文件）")
        print("下次以 ILAND_DB_PATH/ILAND_UPLOADS_DIR 指向该目录启动即得到恢复环境。")
        return target_root
    except OSError as exc:
        raise SystemExit(f"恢复失败（未完成发布；已有目标已保留或回退）：{exc}") from exc


def main(argv=None):
    parser = argparse.ArgumentParser(description="I-land 备份 / 恢复")
    sub = parser.add_subparsers(dest="command", required=True)
    backup_cmd = sub.add_parser("backup", help="生成一致性备份")
    backup_cmd.add_argument("dest", type=Path, help="备份根目录（不能位于 uploads 内）")
    restore_cmd = sub.add_parser("restore", help="校验并恢复到独立目录（目标服务必须停写）")
    restore_cmd.add_argument("backup_dir", type=Path, help="备份目录（iland-backup-*）")
    restore_cmd.add_argument("target", type=Path, help="恢复目录；已有目录将保留为 pre-restore，不能为挂载点")
    args = parser.parse_args(argv)
    if args.command == "backup":
        print(f"备份完成：{create_backup(args.dest)}")
    elif args.command == "restore":
        restore_backup(args.backup_dir, args.target)


if __name__ == "__main__":
    sys.exit(main())
