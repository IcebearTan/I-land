"""P1-A：共用图片上传——格式校验、EXIF 处理、三档派生图与受保护访问。"""

import io

from PIL import Image


def login(client, name="bear", password="123456"):
    r = client.post("/api/auth/login", json={"name": name, "password": password})
    assert r.status_code == 200, r.text


def make_image(width=80, height=60, fmt="PNG", color=(180, 90, 120), exif=None) -> bytes:
    buffer = io.BytesIO()
    image = Image.new("RGB", (width, height), color)
    if exif is not None:
        image.save(buffer, format=fmt, exif=exif)
    else:
        image.save(buffer, format=fmt)  # JPEG 插件不接受 exif=None
    return buffer.getvalue()


def upload(client, data: bytes, filename="photo.jpg"):
    return client.post("/api/uploads", files={"file": (filename, data, "application/octet-stream")})


def test_upload_and_variants(client):
    login(client)
    r = upload(client, make_image(400, 300, "JPEG"))
    assert r.status_code == 201, r.text
    attachment = r.json()["attachment"]
    assert attachment["width"] == 400 and attachment["height"] == 300
    assert attachment["owner"] == "bear"

    for variant, max_side in (("original", 400), ("display", 400), ("thumb", 360)):
        url = attachment["urls"][variant]
        assert url == f"/api/files/{attachment['id']}/{variant}"
        res = client.get(url)
        assert res.status_code == 200, f"{variant}: {res.status_code}"
        assert res.headers["content-type"].startswith("image/webp")
        with Image.open(io.BytesIO(res.content)) as img:
            assert max(img.size) <= max_side
            assert not img.getexif()  # EXIF（含 GPS）不进入派生图


def test_upload_rotates_by_exif_orientation(client):
    """竖拍横存的 JPEG（orientation=6）转正后宽高交换。"""
    login(client)
    from PIL import ImageOps

    exif = Image.Exif()
    exif[274] = 6  # Orientation: 顺时针 90°
    raw = make_image(320, 240, "JPEG", exif=exif.tobytes())
    with Image.open(io.BytesIO(raw)) as probe:
        assert probe.size == (320, 240)  # 原始存储是横向的

    r = upload(client, raw)
    assert r.status_code == 201, r.text
    assert r.json()["attachment"]["width"] == 240
    assert r.json()["attachment"]["height"] == 320


def test_upload_rejects_non_image(client):
    login(client)
    r = upload(client, b"just some plain text, definitely not an image")
    assert r.status_code == 422
    assert "有效" in r.json()["detail"] or "图片" in r.json()["detail"]


def test_upload_rejects_svg(client):
    login(client)
    svg = b"<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'></svg>"
    r = upload(client, svg, "drawing.svg")
    assert r.status_code == 422


def test_upload_rejects_heic_with_hint(client):
    login(client)
    heic = b"\x00\x00\x00\x20ftypheic" + b"\x00" * 64  # 伪造 HEIC 头 + 无效载荷
    r = upload(client, heic, "IMG_0001.HEIC")
    assert r.status_code == 422
    assert "HEIC" in r.json()["detail"]


def test_upload_rejects_oversize(client):
    login(client)
    r = upload(client, b"\x00" * (20 * 1024 * 1024 + 1), "huge.bin")
    assert r.status_code == 413


def test_upload_rejects_huge_pixels(client):
    login(client)
    # 6600×6600 ≈ 43.5M 像素，超过解码上限（纯色 JPEG 足够小）
    r = upload(client, make_image(6600, 6600, "JPEG", color=(90, 120, 200)), "panorama.jpg")
    assert r.status_code == 413


def test_upload_variants_of_other_attachment_id(client):
    login(client)
    r = upload(client, make_image(60, 40, "PNG"))
    assert r.status_code == 201
    attachment_id = r.json()["attachment"]["id"]

    assert client.get(f"/api/files/{attachment_id}/nano").status_code == 422  # 未知规格
    assert client.get(f"/api/files/no-such-id/original").status_code == 404


def test_png_with_alpha_kept(client):
    login(client)
    buffer = io.BytesIO()
    Image.new("RGBA", (64, 64), (255, 100, 120, 128)).save(buffer, format="PNG")
    r = upload(client, buffer.getvalue(), "sticker.png")
    assert r.status_code == 201
    res = client.get(r.json()["attachment"]["urls"]["thumb"])
    with Image.open(io.BytesIO(res.content)) as img:
        assert img.mode in ("RGBA",)  # 透明通道保留
