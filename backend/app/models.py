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
    name: str = Field(unique=True, index=True)  # 不变的身份键，信件/附件仍关联 bear/her
    login_name: Optional[str] = Field(default=None, unique=True, index=True)
    display: str = ""
    pass_hash: str
    sprite: str = "bear"  # bear | her
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuthSession(SQLModel, table=True):
    token: Optional[str] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime


class UserPreference(SQLModel, table=True):
    """个人偏好按不变 user_id 保存；新增表不会改写旧信、记忆或账号。"""

    user_id: int = Field(primary_key=True, foreign_key="user.id")
    music_enabled: bool = True
    ambience_enabled: bool = True
    muted: bool = False  # 默认开启；浏览器仍遵守首次交互解锁
    music_volume: float = 0.35
    ambience_volume: float = 0.55


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
    color: str = "rose"
    style: str = "letter"
    pinned: bool = False


class Memory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: str  # YYYY-MM-DD（用户选择的日历日，不做时区偏移）
    title: str
    description: str = ""
    mood: str = ""
    weather_json: str = "{}"  # {type, note}
    location: str = ""
    photos_json: str = "[]"  # 旧数据：uploads 路径列表（只读兼容）
    attachments_json: str = "[]"  # 有序 Attachment id 列表（新体系）
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    version: int = 1  # 乐观锁：每次修改 +1
    updated_by: str = ""
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None  # 软删除时间；空 = 正常
    deleted_by: str = ""
    client_id: str = Field(default="", index=True)  # 创建幂等标识，防超时重试重复建卡


class Attachment(SQLModel, table=True):
    """上传文件元数据；实际字节存 UPLOADS_DIR，通过 /api/files/{id}/{variant} 访问"""

    id: str = Field(primary_key=True)  # 服务端生成的随机标识（token_urlsafe）
    owner: str = ""  # 上传者账号名
    original_name: str = ""  # 用户原始文件名（仅记录）
    content_type: str = "image/webp"  # 统一转 webp 后的类型
    size: int = 0  # 原件字节大小
    width: int = 0
    height: int = 0
    file_stem: str = ""  # UPLOADS_DIR 内的相对路径主干，三档图按后缀推导
    linked: bool = False  # 是否已被记忆等正式记录引用（未引用 = 待清理候选）
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
