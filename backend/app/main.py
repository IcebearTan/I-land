import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .config import FRONTEND_DIST, UPLOADS_DIR
from .db import engine, init_db
from .routers import (
    agent_router,
    anniversaries_router,
    auth_router,
    letters_router,
    lighthouse_router,
    memories_router,
    misc_router,
    settings_router,
    uploads_router,
    world_router,
    rooms_router,
)
from .room_runtime import room_runtimes
from .seed import seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with Session(engine) as db:
        seed(db)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)  # 全新数据卷首次启动即建目录
    for runtime in room_runtimes.values():
        runtime.start()
    room_watches = [asyncio.create_task(runtime.watch()) for runtime in room_runtimes.values()]
    try:
        yield
    finally:
        for watch in room_watches:
            watch.cancel()
        with suppress(asyncio.CancelledError):
            await asyncio.gather(*room_watches, return_exceptions=True)
        for runtime in room_runtimes.values():
            runtime.stop()


app = FastAPI(title="I-land API", version="0.2.0", lifespan=lifespan)

app.include_router(misc_router)
app.include_router(auth_router)
app.include_router(letters_router)
app.include_router(lighthouse_router)
app.include_router(world_router)
app.include_router(anniversaries_router)
app.include_router(memories_router)
app.include_router(uploads_router)
app.include_router(settings_router)
app.include_router(rooms_router)
app.include_router(agent_router)

# 照片、信纸等私人内容一律走登录校验的 /api 接口（见 routers/uploads.py），
# uploads 目录不做公开静态挂载。

# 生产模式：同端口托管前端构建产物（vite build 后生效）。
# 路径由 ILAND_FRONTEND_DIST 对齐（本地默认 backend/../frontend/dist，容器 /app/frontend/dist），
# 挂载在导入期一次完成——镜像里目录固定存在，全新数据卷首次启动即可用，无需重启。
if FRONTEND_DIST.is_dir() and any(FRONTEND_DIST.iterdir()):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
