"""纯标准库 HTTP 与凭证加载辅助模块（供 iland_cli.py 使用）。"""

from __future__ import annotations

import json
import mimetypes
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any
from uuid import uuid4

DEFAULT_TIMEOUT = 15


class IlandCliError(Exception):
    def __init__(self, message: str, status: int = 0, detail: Any = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.detail = detail


def load_config() -> dict[str, str]:
    """按当前工具所属工作区自动定位 .iland-agent.json（不接受跨账号覆盖）。"""
    override = os.getenv("ILAND_AGENT_CONFIG", "").strip()
    cfg_path = (
        Path(override)
        if override
        else Path(__file__).resolve().parent.parent / ".iland-agent.json"
    )
    if not cfg_path.is_file():
        raise IlandCliError(f"未找到小岛 Agent 凭证文件：{cfg_path}", status=0)
    try:
        raw = json.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise IlandCliError(f"凭证文件解析失败：{exc}", status=0) from exc
    base_url = str(raw.get("base_url") or "http://127.0.0.1:8000").rstrip("/")
    token = str(raw.get("token") or "").strip()
    if not token:
        raise IlandCliError("凭证文件缺少 token 字段", status=0)
    return {"base_url": base_url, "token": token}


def _decode_json_body(raw_bytes: bytes) -> Any:
    if not raw_bytes:
        return {}
    text = raw_bytes.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except ValueError:
        return {"raw": text}


def _extract_error_message(body: Any, fallback: str) -> str:
    if isinstance(body, dict):
        detail = body.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail
        if isinstance(detail, dict) and isinstance(detail.get("message"), str):
            return detail["message"]
        if isinstance(detail, list) and detail:
            first = detail[0]
            if isinstance(first, dict) and first.get("msg"):
                return str(first["msg"])
    return fallback


def api_request(
    cfg: dict[str, str],
    method: str,
    path: str,
    *,
    query: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Any:
    url = f"{cfg['base_url']}{path}"
    if query:
        clean_q = {k: v for k, v in query.items() if v is not None and v != ""}
        if clean_q:
            url = f"{url}?{urllib.parse.urlencode(clean_q)}"
    headers = {
        "Authorization": f"Bearer {cfg['token']}",
        "Accept": "application/json",
    }
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return _decode_json_body(resp.read())
    except urllib.error.HTTPError as err:
        body = _decode_json_body(err.read())
        msg = _extract_error_message(body, f"HTTP {err.code}")
        raise IlandCliError(msg, status=err.code, detail=body) from err
    except urllib.error.URLError as err:
        raise IlandCliError(f"无法连接小岛服务：{err.reason}", status=0) from err


def upload_image(
    cfg: dict[str, str],
    file_path: str,
    *,
    timeout: int = 30,
) -> dict[str, Any]:
    """以标准 multipart/form-data 上传本地图片至 /api/uploads，返回 attachment 对象。"""
    path = Path(file_path).expanduser()
    if not path.is_file():
        raise IlandCliError(f"找不到要上传的图片文件：{path}", status=0)
    content = path.read_bytes()
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    boundary = f"----IlandCliBoundary{uuid4().hex}"
    safe_name = path.name.replace('"', "").replace("\r", "").replace("\n", "")

    parts = [
        f"--{boundary}\r\n".encode("ascii"),
        (
            f'Content-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode("utf-8"),
        content,
        f"\r\n--{boundary}--\r\n".encode("ascii"),
    ]
    body = b"".join(parts)
    headers = {
        "Authorization": f"Bearer {cfg['token']}",
        "Accept": "application/json",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    req = urllib.request.Request(
        f"{cfg['base_url']}/api/uploads",
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            parsed = _decode_json_body(resp.read())
            return parsed["attachment"]
    except urllib.error.HTTPError as err:
        parsed = _decode_json_body(err.read())
        msg = _extract_error_message(parsed, f"图片上传失败（HTTP {err.code}）")
        raise IlandCliError(msg, status=err.code, detail=parsed) from err
    except urllib.error.URLError as err:
        raise IlandCliError(f"图片上传连接失败：{err.reason}", status=0) from err


def emit_json(data: dict[str, Any], *, pretty: bool = False) -> None:
    if pretty:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
