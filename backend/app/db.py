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
    migrate_anniversary_columns(engine)
    migrate_memory_columns(engine)


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
