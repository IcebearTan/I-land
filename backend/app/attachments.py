"""图片上传处理：内容校验、EXIF 转正与去敏、三档派生图、原子落盘。

对外约定：
- 只接受真实的 JPEG / PNG / WebP（Pillow 识别实际内容，不看扩展名）；
- iPhone 的 HEIC 目前不支持，给出可操作的提示；
- 全部重编码为 WebP，EXIF（含 GPS 定位）天然不带入派生图；
- 原件 = 去敏后的清洁版（最长边 4096），另派生展示图（1600）与缩略图（360）；
- 文件先写临时名再 os.replace 原子落盘，保证 uploads 目录内永远只有完整文件
  （备份与读取不会看到写了一半的图片）。
"""

import io
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import List

from PIL import Image, ImageOps
from sqlmodel import Session, select

from .config import MAX_IMAGE_PIXELS, MAX_UPLOAD_BYTES, UPLOADS_DIR
from .models import Attachment, Memory, jload

VARIANTS = ("original", "display", "thumb")
# 各档最长边；原图超过 4096 时等比收进（手机全景等超大图）
VARIANT_MAX_SIDE = {"original": 4096, "display": 1600, "thumb": 360}
VARIANT_SUFFIX = {"original": "", "display": "-d", "thumb": "-t"}
# 允许的输入格式（MPO 是 iPhone 连拍的 JPEG 多帧容器，按第一帧处理）
_ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO"}
_HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"}


class UploadError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def _looks_like_heic(data: bytes) -> bool:
    # ISO BMFF：偏移 4 起 'ftyp'，brand 在 8–12
    return len(data) > 12 and data[4:8] == b"ftyp" and data[8:12] in _HEIC_BRANDS


def _looks_like_svg(data: bytes) -> bool:
    head = data[:512].lstrip()
    return head.startswith(b"<svg") or head.startswith(b"<?xml") and b"<svg" in head


def variant_path(attachment: Attachment, variant: str = "original") -> Path:
    stem = Path(attachment.file_stem)
    return UPLOADS_DIR / f"{stem}{VARIANT_SUFFIX[variant]}.webp"


def attachment_out(attachment: Attachment) -> dict:
    return {
        "id": attachment.id,
        "owner": attachment.owner,
        "content_type": attachment.content_type,
        "size": attachment.size,
        "width": attachment.width,
        "height": attachment.height,
        "original_name": attachment.original_name,
        "urls": {variant: f"/api/files/{attachment.id}/{variant}" for variant in VARIANTS},
        "created_at": attachment.created_at.isoformat(),
    }


def _render_variant(image: Image.Image, max_side: int) -> bytes:
    frame = image.copy()
    if frame.mode == "CMYK":
        frame = frame.convert("RGB")
    elif frame.mode == "P":
        frame = frame.convert("RGBA" if "transparency" in frame.info else "RGB")
    frame.thumbnail((max_side, max_side), Image.LANCZOS)
    buffer = io.BytesIO()
    # 重编码即去 EXIF；RGBA 透明通道 WebP 原生保留
    frame.save(buffer, format="WEBP", quality=88 if max_side > 1000 else 82, method=6)
    return buffer.getvalue()


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{secrets.token_hex(4)}.tmp")
    try:
        tmp.write_bytes(data)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def process_image_upload(data: bytes, original_name: str, owner: str) -> Attachment:
    """校验并落盘一张图片，返回未入库的 Attachment（由路由负责 add/commit）。"""
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadError("这张照片超过 20MB，请挑一张小一点的", 413)
    if not data:
        raise UploadError("文件是空的")

    try:
        probe = Image.open(io.BytesIO(data))
        fmt = (probe.format or "").upper()
        if fmt not in _ALLOWED_FORMATS:
            raise UploadError(f"暂不支持 {fmt or '这种'} 图片，请用 JPG / PNG / WebP")
        width, height = probe.size  # 只读头部，不解码全图
    except UploadError:
        raise
    except Exception:
        if _looks_like_heic(data):
            raise UploadError(
                "这张是 iPhone 的 HEIC 照片，暂时打不开。选择照片时关掉「原图」，或先在相册转成 JPG",
            )
        if _looks_like_svg(data):
            raise UploadError("请上传照片（JPG / PNG / WebP），不能收其他文件")
        raise UploadError("这不是一张有效的图片，请重新选择")
    if width * height > MAX_IMAGE_PIXELS:
        raise UploadError("这张照片的像素太大啦，换一张或压缩后再传", 413)

    with Image.open(io.BytesIO(data)) as raw:
        frame = ImageOps.exif_transpose(raw)  # 按拍摄方向转正；MPO 取第一帧
        blobs = {variant: _render_variant(frame, side) for variant, side in VARIANT_MAX_SIDE.items()}

    token = secrets.token_urlsafe(12)
    stem = f"memories/{datetime.utcnow():%Y/%m}/{token}"
    paths = {variant: UPLOADS_DIR / f"{stem}{VARIANT_SUFFIX[variant]}.webp" for variant in VARIANTS}
    written: List[Path] = []
    try:
        for variant in VARIANTS:
            _atomic_write(paths[variant], blobs[variant])
            written.append(paths[variant])
    except Exception:
        for path in written:
            path.unlink(missing_ok=True)
        raise UploadError("照片保存失败，请重试", 500)

    return Attachment(
        id=token,
        owner=owner,
        original_name=original_name[:200],
        content_type="image/webp",
        size=len(blobs["original"]),
        width=frame.width,
        height=frame.height,
        file_stem=stem,
    )


def mark_attachments_linked(db: Session, attachment_ids: List[str]) -> None:
    """记忆保存后把引用的附件标记为已关联（未关联的进入待清理登记）。"""
    for attachment_id in dict.fromkeys(attachment_ids):  # 去重保序
        attachment = db.get(Attachment, attachment_id)
        if attachment is not None and not attachment.linked:
            attachment.linked = True
            db.add(attachment)


def list_orphan_attachments(db: Session, older_than_days: int = 2) -> List[dict]:
    """登记未被任何记忆引用（且越过宽限期）的附件，供后续人工清理；本阶段不自动删除。"""
    referenced = set()
    for memory in db.exec(select(Memory)).all():
        referenced.update(jload(memory.attachments_json, []))
    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    orphans: List[dict] = []
    for attachment in db.exec(select(Attachment)).all():
        if attachment.id in referenced or attachment.linked:
            continue  # 已被正式引用，保守不动
        if attachment.created_at > cutoff:
            continue  # 宽限期内，可能正在编辑器里排队保存
        orphans.append(
            {
                **attachment_out(attachment),
                "on_disk": all(variant_path(attachment, v).exists() for v in VARIANTS),
            }
        )
    return orphans
