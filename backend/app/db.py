from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from .config import DB_PATH

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


def get_db():
    with Session(engine) as session:
        yield session


def init_db():
    import app.models  # noqa: F401  确保表定义先注册

    SQLModel.metadata.create_all(engine)
    migrate_user_login_names(engine)
    migrate_anniversary_columns(engine)
    migrate_memory_columns(engine)
    migrate_letter_columns(engine)


def migrate_user_login_names(target_engine):
    """登录名与显示名统一；只补字段，保留身份、密码、会话与所有内容关联。"""
    with target_engine.begin() as conn:
        columns = {col["name"] for col in inspect(conn).get_columns("user")}
        if "login_name" not in columns:
            conn.execute(text("ALTER TABLE user ADD COLUMN login_name VARCHAR"))
        rows = conn.execute(text("SELECT id, name, display, login_name FROM user ORDER BY id")).mappings().all()
        used = {row["login_name"] for row in rows if row["login_name"]}
        # 保留内部身份键作为旧昵称冲突时的安全退路。
        reserved = {row["name"] for row in rows}
        for row in rows:
            if row["login_name"]:
                continue
            candidate = (row["display"] or row["name"]).strip()
            if (not candidate or len(candidate) > 20 or any(ord(ch) < 32 or ord(ch) == 127 for ch in candidate)
                    or candidate in used or candidate in reserved - {row["name"]}):
                candidate = row["name"]
            used.add(candidate)
            conn.execute(text("UPDATE user SET login_name=:login, display=:login WHERE id=:id"),
                         {"login": candidate, "id": row["id"]})
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_user_login_name ON user (login_name)"))


def migrate_anniversary_columns(target_engine):
    """兼容已有小岛：仅补字段，不重建表、不修改原有日期/备注。"""
    with target_engine.begin() as conn:
        columns = {col["name"] for col in inspect(conn).get_columns("anniversary")}
        additions = {
            "color": "VARCHAR NOT NULL DEFAULT 'rose'",
            "style": "VARCHAR NOT NULL DEFAULT 'letter'",
            "pinned": "BOOLEAN NOT NULL DEFAULT 0",
        }
        for name, definition in additions.items():
            if name not in columns:
                conn.execute(text(f"ALTER TABLE anniversary ADD COLUMN {name} {definition}"))


def migrate_memory_columns(target_engine):
    """旧 memory 表补齐记忆卡字段：附件引用、版本、软删除与幂等标识。"""
    with target_engine.begin() as conn:
        existing = inspect(conn).get_table_names()
        if "memory" not in existing:
            return  # 全新数据库，create_all 已建好完整结构
        columns = {col["name"] for col in inspect(conn).get_columns("memory")}
        additions = {
            "attachments_json": "VARCHAR NOT NULL DEFAULT '[]'",
            "version": "INTEGER NOT NULL DEFAULT 1",
            "updated_by": "VARCHAR NOT NULL DEFAULT ''",
            "updated_at": "DATETIME",
            "deleted_at": "DATETIME",
            "deleted_by": "VARCHAR NOT NULL DEFAULT ''",
            "client_id": "VARCHAR NOT NULL DEFAULT ''",
        }
        for name, definition in additions.items():
            if name not in columns:
                conn.execute(text(f"ALTER TABLE memory ADD COLUMN {name} {definition}"))
        indexes = {idx["name"] for idx in inspect(conn).get_indexes("memory")}
        if "ix_memory_client_id" not in indexes:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_memory_client_id ON memory (client_id)"))


def migrate_letter_columns(target_engine):
    """旧 letter 表补齐正文与拆封状态字段；历史旧信默认视为已读，避免突然全标未拆。"""
    with target_engine.begin() as conn:
        existing = inspect(conn).get_table_names()
        if "letter" not in existing:
            return
        columns = {col["name"] for col in inspect(conn).get_columns("letter")}
        if "body" not in columns:
            conn.execute(text("ALTER TABLE letter ADD COLUMN body VARCHAR NOT NULL DEFAULT ''"))
        if "read_at" not in columns:
            conn.execute(text("ALTER TABLE letter ADD COLUMN read_at DATETIME"))
            fallback = "COALESCE(created_at, CURRENT_TIMESTAMP)" if "created_at" in columns else "CURRENT_TIMESTAMP"
            conn.execute(text(f"UPDATE letter SET read_at = {fallback} WHERE read_at IS NULL"))
