"""图片上传与受保护的附件访问。

uploads 目录不再公开静态挂载——照片、展示图、缩略图统一走登录校验的
`/api/files/{id}/{variant}`；旧信纸（数据库里存的 uploads 相对路径）走
`/api/uploads/{path}` 兼容接口，同样要求登录并做目录穿越防护。
"""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session

from ..attachments import VARIANTS, UploadError, attachment_out, process_image_upload, variant_path
from ..config import MAX_UPLOAD_BYTES, UPLOADS_DIR
from ..db import get_db
from ..deps import get_current_user
from ..models import Attachment, User

router = APIRouter(prefix="/api", tags=["uploads"], dependencies=[Depends(get_current_user)])


def _file_response(path: Path) -> FileResponse:
    # 内容不变（attachment id 不可变、派生图一次性生成），可放心长缓存；
    # private：只允许浏览器私有缓存，代理不得留存
    headers = {"Cache-Control": "private, max-age=31536000, immutable"}
    return FileResponse(path, media_type="image/webp", headers=headers)


@router.post("/uploads", status_code=201)
def upload_image(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = file.file.read(MAX_UPLOAD_BYTES + 1)  # 多读 1 字节用于判断超限，不做无界读
    try:
        attachment = process_image_upload(data, file.filename or "", user.name)
    except UploadError as error:
        raise HTTPException(error.status, str(error))
    db.add(attachment)
    db.commit()
    return {"attachment": attachment_out(attachment)}


@router.get("/files/{attachment_id}/{variant}")
def get_file(attachment_id: str, variant: str, db: Session = Depends(get_db)):
    if variant not in VARIANTS:
        raise HTTPException(422, "图片规格不对，请刷新页面重试")
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(404, "这张照片不存在")
    path = variant_path(attachment, variant)
    if not path.is_file():
        raise HTTPException(404, "照片文件缺失，请重新上传")
    return _file_response(path)


@router.get("/uploads/{file_path:path}")
def get_legacy_upload(file_path: str):
    """旧数据的兼容访问：数据库里存的是 uploads/xxx 相对路径的信纸等。"""
    root = UPLOADS_DIR.resolve()
    target = (root / file_path).resolve()
    try:
        target.relative_to(root)  # 防目录穿越：解析后必须仍在 uploads 内
    except ValueError:
        raise HTTPException(404, "文件不存在")
    if not target.is_file():
        raise HTTPException(404, "文件不存在")
    media = "image/svg+xml" if target.suffix == ".svg" else None
    headers = {"Cache-Control": "private, max-age=86400"}
    return FileResponse(target, media_type=media, headers=headers)
