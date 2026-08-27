from sqlalchemy import event
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
