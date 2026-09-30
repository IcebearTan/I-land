"""迁入旧信箱扫描件。默认只预览，--apply 通过登录 API 上传和建信。

只解析 window.MAILBOX 数据字面量，不执行 JS。guide/demo 默认不迁入。
旧文件保持只读；--apply 前备份目标数据，日志保存在忽略的 uploads/.imports。
这是现有阅读接口的迁入工具，不实现新写信、未读或删除恢复功能。
"""

import argparse
import ast
import fcntl
import getpass
import hashlib
import json
import os
import re
from datetime import date
from pathlib import Path

import httpx
from PIL import Image

from .config import MAX_IMAGE_PIXELS, MAX_UPLOAD_BYTES, UPLOADS_DIR


TOKEN = re.compile(
    r'\s+|//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|'
    r"'(?:\\.|[^'\\])*'|[A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?|[{}\[\]:,;.=]"
)


def parse_mailbox(text: str) -> dict:
    """解析有限 JS 字面量；拒绝函数调用、表达式和额外语句。"""
    tokens, cursor = [], 0
    while cursor < len(text):
        match = TOKEN.match(text, cursor)
        if not match:
            raise ValueError("配置含不支持的代码，只允许 window.MAILBOX 数据字面量")
        token = match.group()
        cursor = match.end()
        if not token.isspace() and not token.startswith(("//", "/*")):
            tokens.append(token)
    if tokens[:4] != ["window", ".", "MAILBOX", "="]:
        raise ValueError("找不到 window.MAILBOX 配置")
    pos = 4

    def value():
        nonlocal pos
        if pos >= len(tokens):
            raise ValueError("配置不完整")
        token = tokens[pos]
        pos += 1
        if token in ("{", "["):
            end = "}" if token == "{" else "]"
            result = {} if token == "{" else []
            while pos < len(tokens) and tokens[pos] != end:
                if token == "{":
                    key = tokens[pos]
                    pos += 1
                    if key.startswith(('"', "'")):
                        key = ast.literal_eval(key)
                    elif not re.fullmatch(r"[A-Za-z_$][\w$]*", key):
                        raise ValueError("键名无效")
                    if key in result or pos >= len(tokens) or tokens[pos] != ":":
                        raise ValueError("配置键重复或缺少冒号")
                    pos += 1
                    result[key] = value()
                else:
                    result.append(value())
                if pos < len(tokens) and tokens[pos] == ",":
                    pos += 1
                elif pos >= len(tokens) or tokens[pos] != end:
                    raise ValueError("配置缺少逗号")
            if pos >= len(tokens):
                raise ValueError("配置缺少结束括号")
            pos += 1
            return result
        if token.startswith(('"', "'")):
            return ast.literal_eval(token)
        if token in ("true", "false", "null"):
            return {"true": True, "false": False, "null": None}[token]
        if re.fullmatch(r"-?\d+(?:\.\d+)?", token):
            return json.loads(token)
        raise ValueError("配置不能包含表达式")

    result = value()
    if not isinstance(result, dict) or tokens[pos:] not in ([], [";"]):
        raise ValueError("根配置或配置尾部无效")
    return result


def source_records(source: Path, selected: list[str] | None = None) -> list[dict]:
    root = source.resolve()
    config = root / "data" / "letters.js"
    if config.stat().st_size > 2_000_000:
        raise ValueError("配置文件太大")
    entries = parse_mailbox(config.read_text(encoding="utf-8")).get("letters")
    if not isinstance(entries, list):
        raise ValueError("letters 必须是数组")
    records, seen = [], set()
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str) or not entry["id"]:
            raise ValueError("源 ID 无效")
        key = entry["id"]
        if key in seen:
            raise ValueError("源 ID 重复")
        seen.add(key)
        if (selected and key not in selected) or (not selected and key in {"guide", "demo"}):
            continue
        metadata = {name: entry.get(name, "") for name in ("date", "title", "excerpt", "theme")}
        if not all(isinstance(v, str) for v in metadata.values()):
            raise ValueError("信件字段必须是文字")
        if date.fromisoformat(metadata["date"]).isoformat() != metadata["date"] or not metadata["title"].strip():
            raise ValueError("日期或标题无效")
        pages = entry.get("pages")
        if not isinstance(pages, list) or not all(isinstance(p, str) for p in pages):
            raise ValueError("信纸路径必须是文字列表")
        if not 1 <= len(pages) <= 9 or len(set(pages)) != len(pages):
            raise ValueError("扫描件须有 1–9 页且不可重复")
        files, hashes = [], []
        for name in pages:
            path = (root / name).resolve()
            if not path.is_relative_to(root) or not path.is_file():
                raise ValueError("信纸缺失或越出来源目录")
            if path.stat().st_size > MAX_UPLOAD_BYTES:
                raise ValueError("信纸超过 20MB")
            with Image.open(path) as im:
                if im.format not in {"JPEG", "PNG", "WEBP", "MPO"} or im.width * im.height > MAX_IMAGE_PIXELS:
                    raise ValueError("仅迁入 JPEG/PNG/WebP 扫描件，不迁入 SVG 指南")
                im.verify()
            files.append(path)
            hashes.append(hashlib.sha256(path.read_bytes()).hexdigest())
        signature = hashlib.sha256(json.dumps([metadata, hashes], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        records.append({"source_id": key, "metadata": metadata, "files": files, "signature": signature})
    if selected and set(selected) - seen:
        raise ValueError("指定源 ID 不存在")
    if not records:
        raise ValueError("没有可迁入的扫描件信")
    return records


def _save(path: Path, data: dict):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(path)


def import_records(client, records: list[dict], journal_path: Path) -> list[dict]:
    """日志保留页上传结果；同日志重跑/建信响应丢失可精确比对后跳过。

    工具锁串行化本机同日志调用，不代替公共创建 API 的数据库并发幂等。
    """
    journal_path.parent.mkdir(parents=True, exist_ok=True)
    with journal_path.with_suffix(".lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        response = client.get("/api/auth/me")
        response.raise_for_status()
        author = response.json()["user"]["name"]
        endpoint = str(client.base_url)
        journal = json.loads(journal_path.read_text()) if journal_path.exists() else {"author": author, "endpoint": endpoint, "entries": {}}
        if journal["author"] != author or journal["endpoint"] != endpoint:
            raise ValueError("迁入日志不属于当前账号或目标服务")
        results = []
        for record in records:
            state = journal["entries"].setdefault(record["source_id"], {"signature": record["signature"], "pages": []})
            if state["signature"] != record["signature"]:
                raise ValueError("同源 ID 内容改变，请核对，不覆盖既有信件")
            for page in state["pages"]:
                client.get(page).raise_for_status()
            for path in record["files"][len(state["pages"]):]:
                with path.open("rb") as stream:
                    response = client.post("/api/uploads", files={"file": (path.name, stream, "application/octet-stream")})
                response.raise_for_status()
                state["pages"].append(response.json()["attachment"]["urls"]["original"])
                _save(journal_path, journal)
            payload = {**record["metadata"], "pages": state["pages"]}
            response = client.get("/api/letters")
            response.raise_for_status()
            matches = [row for row in response.json()["letters"] if row["author"] == author and all(row.get(k) == v for k, v in payload.items())]
            if state.get("letter_id") and not any(row["id"] == state["letter_id"] for row in matches):
                raise ValueError("已迁入信件被修改或删除，请核对，不自动重建")
            if len(matches) > 1:
                raise ValueError("发现重复记录，请人工核对")
            if matches:
                letter, status = matches[0], "已有，跳过"
            else:
                response = client.post("/api/letters", json=payload)
                response.raise_for_status()
                letter, status = response.json()["letter"], "迁入成功"
            state["letter_id"] = letter["id"]
            _save(journal_path, journal)
            results.append({"source_id": record["source_id"], "letter_id": letter["id"], "pages": len(state["pages"]), "status": status})
        return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--id", action="append", dest="ids")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--user", default="bear", choices=("bear", "her"))
    args = parser.parse_args()
    try:
        records = source_records(args.source, args.ids)
        if not args.apply:
            print(json.dumps([{"source_id": r["source_id"], **r["metadata"], "pages": len(r["files"])} for r in records], ensure_ascii=False, indent=2))
            return
        password = os.environ.get("ILAND_IMPORT_PASSWORD") or getpass.getpass("登录暗号：")
        target = hashlib.sha256(args.url.encode()).hexdigest()[:12]
        journal_path = UPLOADS_DIR / ".imports" / f"mailbox-{args.user}-{target}.json"
        with httpx.Client(base_url=args.url, timeout=120, follow_redirects=False) as client:
            client.post("/api/auth/login", json={"name": args.user, "password": password}).raise_for_status()
            try:
                print(json.dumps(import_records(client, records, journal_path), ensure_ascii=False, indent=2))
            finally:
                client.post("/api/auth/logout")
    except (ValueError, OSError, httpx.HTTPError) as error:
        raise SystemExit(f"迁入未完成：{error}") from None


if __name__ == "__main__":
    main()
