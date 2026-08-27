import hashlib
import secrets

_ITER = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITER).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, expect = stored.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITER).hex()
    return secrets.compare_digest(digest, expect)


def new_token() -> str:
    return secrets.token_urlsafe(32)
