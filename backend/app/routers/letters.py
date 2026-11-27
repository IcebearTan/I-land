from datetime import date as Date, datetime
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..attachments import mark_attachments_linked
from ..db import get_db
from ..deps import get_current_user
from ..models import Letter, User, jdump, jload

router = APIRouter(prefix="/api/letters", tags=["letters"], dependencies=[Depends(get_current_user)])

ALLOWED_THEMES = {"", "classic", "seaside", "blossom", "qixi"}
MAX_PAGES = 12
_ATTACHMENT_URL_RE = re.compile(r"^/api/files/([A-Za-z0-9_-]+)/(?:original|display|thumb)$")


class LetterIn(BaseModel):
    date: str
    title: str
    excerpt: str = ""
    body: str = ""
    theme: str = ""
    pages: List[str] = []


def _validate_page_url(url: str) -> str:
    cleaned = url.strip()
    if _ATTACHMENT_URL_RE.fullmatch(cleaned):
        return cleaned
    if cleaned.startswith("uploads/") and ".." not in cleaned and "\\" not in cleaned:
        return cleaned
    raise HTTPException(422, "信纸图片地址无效，请重新上传后再投递")


def letter_out(letter: Letter, viewer: str | None = None) -> dict:
    return {
        "id": letter.id,
        "date": letter.date,
        "title": letter.title,
        "excerpt": letter.excerpt,
        "body": letter.body,
        "author": letter.author,
        "theme": letter.theme,
        "pages": jload(letter.pages_json, []),
        "read_at": letter.read_at.isoformat() if letter.read_at else None,
        "unread": bool(viewer and letter.author != viewer and letter.read_at is None),
        "created_at": letter.created_at.isoformat(),
    }


@router.get("")
def list_letters(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    letters = db.exec(select(Letter).order_by(Letter.date.desc(), Letter.id.desc())).all()
    items = [letter_out(x, user.name) for x in letters]
    unread_count = sum(1 for item in items if item["unread"])
    return {"letters": items, "unread_count": unread_count}


@router.get("/{letter_id}")
def get_letter(
    letter_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    letter = db.get(Letter, letter_id)
    if not letter:
        raise HTTPException(404, "信不存在")
    return {"letter": letter_out(letter, user.name)}


@router.post("")
def create_letter(
    body: LetterIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    raw_date = body.date.strip()
    try:
        Date.fromisoformat(raw_date)
    except ValueError:
        raise HTTPException(422, "写信日期格式不正确")

    title = body.title.strip()
    if not title:
        raise HTTPException(422, "给这封信起一个标题吧")
    if len(title) > 80:
        raise HTTPException(422, "信件标题最多 80 个字")

    excerpt = body.excerpt.strip()
    if len(excerpt) > 200:
        raise HTTPException(422, "信封寄语最多 200 个字")

    content = body.body.strip()
    if len(content) > 10000:
        raise HTTPException(422, "信件正文最多 10000 个字")

    theme = body.theme.strip()
    if theme not in ALLOWED_THEMES:
        raise HTTPException(422, "不支持这种信封主题")

    if len(body.pages) > MAX_PAGES:
        raise HTTPException(422, f"一封信最多附 {MAX_PAGES} 页信纸图片")

    pages = [_validate_page_url(p) for p in body.pages if isinstance(p, str) and p.strip()]

    # 发件人 = 当前登录账号，客户端不能替对方署名
    letter = Letter(
        date=raw_date,
        title=title,
        excerpt=excerpt,
        body=content,
        author=user.name,
        theme="" if theme == "classic" else theme,
        pages_json=jdump(pages),
    )
    db.add(letter)

    attachment_ids = []
    for page in pages:
        match = _ATTACHMENT_URL_RE.fullmatch(page)
        if match:
            attachment_ids.append(match[1])
    if attachment_ids:
        mark_attachments_linked(db, attachment_ids)

    db.commit()
    db.refresh(letter)
    return {"letter": letter_out(letter, user.name)}


@router.post("/{letter_id}/read")
def mark_letter_read(
    letter_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    letter = db.get(Letter, letter_id)
    if not letter:
        raise HTTPException(404, "信不存在")
    if letter.author != user.name and letter.read_at is None:
        letter.read_at = datetime.utcnow()
        db.add(letter)
        db.commit()
        db.refresh(letter)
    return {"letter": letter_out(letter, user.name)}


@router.delete("/{letter_id}")
def delete_letter(
    letter_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    letter = db.get(Letter, letter_id)
    if not letter:
        raise HTTPException(404, "信不存在")
    if letter.author != user.name:
        raise HTTPException(403, "这封信是对方写的，舍不得删就留着吧")
    db.delete(letter)
    db.commit()
    return {"ok": True}
