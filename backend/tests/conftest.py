"""测试公共配置：独立临时数据库 + 种子用户（含测试专用第三账号）。

环境必须在任何 `app` 导入之前设置，因此放在 conftest.py 顶部——
pytest 会先加载 conftest 再收集测试文件。
"""

import os
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="iland-test-")
os.environ["ILAND_DB_PATH"] = str(Path(_tmp) / "test.db")
os.environ["ILAND_UPLOADS_DIR"] = str(Path(_tmp) / "uploads")
os.environ["ILAND_FRONTEND_DIST"] = str(Path(_tmp) / "empty-dist")  # 不存在 → 不挂托管
# tester：改密等会破坏共享登录态的用例专用，避免影响 bear/her 的默认密码
os.environ["ILAND_SEED_USERS"] = "bear:123456:小熊,her:123456:她,tester:123456:测试者"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    # with 上下文才会触发 lifespan（建表 + 种子用户 + uploads 目录）
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def second_client():
    """独立 cookie 的第二个客户端（模拟对方同时在线/另一台设备）。"""
    with TestClient(app) as c:
        yield c


def make_png(width=80, height=60, color=(200, 120, 140), fmt="PNG") -> bytes:
    """构造真实图片字节；fmt 也可传 JPEG/WEBP 测格式白名单。"""
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, format=fmt)
    return buffer.getvalue()
