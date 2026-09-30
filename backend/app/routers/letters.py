from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_db
from ..deps import get_current_user
from ..models import Letter, User, jdump, jload

router = APIRouter(prefix="/api/letters", tags=["letters"], dependencies=[Depends(get_current_user)])


class LetterIn(BaseModel):
    date: str
    title: str
    excerpt: str = ""
    theme: str = ""
    pages: List[str] = []


def letter_out(letter: Letter) -> dict:
    return {
        "id": letter.id,
        "date": letter.date,
        "title": letter.title,
        "excerpt": letter.excerpt,
        "author": letter.author,
        "theme": letter.theme,
        "pages": jload(letter.pages_json, []),
        "created_at": letter.created_at.isoformat(),
    }


@router.get("")
def list_letters(db: Session = Depends(get_db)):
    letters = db.exec(select(Letter).order_by(Letter.date.desc(), Letter.id.desc())).all()
    return {"letters": [letter_out(x) for x in letters]}


@router.get("/{letter_id}")
def get_letter(letter_id: int, db: Session = Depends(get_db)):
    letter = db.get(Letter, letter_id)
    if not letter:
        raise HTTPException(404, "信不存在")
    return {"letter": letter_out(letter)}


@router.post("")
def create_letter(
    body: LetterIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 发件人 = 当前登录账号，客户端不能替对方署名
    letter = Letter(
        date=body.date,
        title=body.title,
        excerpt=body.excerpt,
        author=user.name,
        theme=body.theme,
        pages_json=jdump(body.pages),
    )
    db.add(letter)
    db.commit()
    db.refresh(letter)
    return {"letter": letter_out(letter)}


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
