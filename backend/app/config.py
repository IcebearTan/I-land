import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/

DB_PATH = Path(os.getenv("ILAND_DB_PATH", str(BASE_DIR / "iland.db")))
UPLOADS_DIR = Path(os.getenv("ILAND_UPLOADS_DIR", str(BASE_DIR / "uploads")))

# 种子用户格式: "name:password:display,name:password:display"
SEED_USERS = os.getenv("ILAND_SEED_USERS", "bear:123456:小熊,her:123456:她")

SESSION_COOKIE = "iland_session"
SESSION_DAYS = 30
