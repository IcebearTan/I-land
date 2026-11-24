from .anniversaries import router as anniversaries_router
from .auth import router as auth_router
from .letters import router as letters_router
from .memories import router as memories_router
from .misc import router as misc_router
from .settings import router as settings_router
from .uploads import router as uploads_router
from .world import router as world_router
from .rooms import router as rooms_router
from .cocoa import router as cocoa_router

__all__ = [
    "anniversaries_router",
    "auth_router",
    "letters_router",
    "memories_router",
    "misc_router",
    "settings_router",
    "uploads_router",
    "world_router",
    "rooms_router",
    "cocoa_router",
]
