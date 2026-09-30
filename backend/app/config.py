import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/

DB_PATH = Path(os.getenv("ILAND_DB_PATH", str(BASE_DIR / "iland.db")))
UPLOADS_DIR = Path(os.getenv("ILAND_UPLOADS_DIR", str(BASE_DIR / "uploads")))

# 前端构建产物目录：本地默认 backend/../frontend/dist，容器内用环境变量对齐
FRONTEND_DIST = Path(os.getenv("ILAND_FRONTEND_DIST", str(BASE_DIR.parent / "frontend" / "dist")))

# 种子用户格式: "name:password:display,name:password:display"
SEED_USERS = os.getenv("ILAND_SEED_USERS", "bear:123456:小熊,her:123456:她")

SESSION_COOKIE = "iland_session"
SESSION_DAYS = 30
# HTTPS 反向代理（如 Caddy/Nginx TLS）部署时设 ILAND_COOKIE_SECURE=1，
# 本地 http 开发保持默认，两种环境同一份代码。
COOKIE_SECURE = os.getenv("ILAND_COOKIE_SECURE", "") == "1"

# 图片上传限制：真机验证后可再调
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 单文件 20MB
MAX_IMAGE_PIXELS = 40_000_000  # 解码像素上限（约 6300×6300），防解压炸弹
MAX_MEMORY_PHOTOS = 9  # 每条记忆最多照片数
MEMORY_TRASH_DAYS = 30  # 「最近删除」恢复窗口
