from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .config import UPLOADS_DIR
from .db import engine, init_db
from .routers import auth_router, letters_router, misc_router, world_router
from .seed import seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with Session(engine) as db:
        seed(db)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="I-land API", version="0.1.0", lifespan=lifespan)

app.include_router(misc_router)
app.include_router(auth_router)
app.include_router(letters_router)
app.include_router(world_router)


# 上传文件（照片 / 信件扫描件），有目录才挂载，方便测试
if UPLOADS_DIR.exists():
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# 生产模式：同端口托管前端构建产物（vite build 后生效）
DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
