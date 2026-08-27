import json
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


def jdump(x) -> str:
    return json.dumps(x, ensure_ascii=False)


def jload(s: Optional[str], default=None):
    if not s:
        return default
    try:
        return json.loads(s)
    except (TypeError, ValueError):
        return default


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    display: str = ""
    pass_hash: str
    sprite: str = "bear"  # bear | her
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuthSession(SQLModel, table=True):
    token: Optional[str] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime


class Letter(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: str  # YYYY-MM-DD 写信日期
    title: str
    excerpt: str = ""
    author: str  # bear | her
    theme: str = ""  # 如 "qixi"
    pages_json: str = "[]"  # 图片路径列表
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Anniversary(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    date: str  # YYYY-MM-DD（农历节日记公历，逐年手动登记）
    repeat: str = "yearly"  # yearly | monthly | once
    icon: str = "heart"
    note: str = ""


class Memory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: str  # YYYY-MM-DD
    title: str
    description: str = ""
    mood: str = ""
    weather_json: str = "{}"  # {type, note}
    location: str = ""
    photos_json: str = "[]"
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Note(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    from_user: str
    to_user: str
    text: str
    mood: str = ""
    read_at: Optional[datetime] = None
    favorite: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class WorldState(SQLModel, table=True):
    """整岛游戏世界状态（作物/花瓶/装饰/彩旗…），单文档 + 乐观锁"""

    id: int = Field(default=1, primary_key=True)
    version: int = 1
    data_json: str = "{}"


class Visit(SQLModel, table=True):
    user_id: int = Field(primary_key=True, foreign_key="user.id")
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    last_pos_json: str = "{}"  # {x, y}
    action_note: str = ""
