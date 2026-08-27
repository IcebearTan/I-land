import json

from .config import SEED_USERS
from .db import Session
from .models import User, WorldState
from .security import hash_password

DEFAULT_WORLD = {
    "site_title": "I-land · 我们的岛",
    "start_date": "2026-06-10",  # ★ 在一起的日子
}


def seed(db: Session) -> None:
    if db.get(WorldState, 1) is None:
        db.add(WorldState(id=1, version=1, data_json=json.dumps(DEFAULT_WORLD, ensure_ascii=False)))
    for entry in SEED_USERS.split(","):
        entry = entry.strip()
        if not entry:
            continue
        parts = entry.split(":")
        name, password = parts[0], parts[1]
        display = parts[2] if len(parts) > 2 else name
        existing = db.query(User).filter(User.name == name).one_or_none()
        if existing is None:
            db.add(User(name=name, display=display, pass_hash=hash_password(password), sprite=name))
    db.commit()
