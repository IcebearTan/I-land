"""迁入工具的来源解析、路径边界、重跑与响应丢失测试，全部使用临时数据。"""

import json

import pytest
from sqlmodel import Session

from app.attachments import list_orphan_attachments
from app.db import engine
from app.import_letters import import_records, parse_mailbox, source_records

from .conftest import make_png


def source(tmp_path):
    root = tmp_path / "source"
    (root / "data").mkdir(parents=True)
    (root / "letters").mkdir()
    (root / "letters" / "1.png").write_bytes(make_png())
    (root / "data" / "letters.js").write_text(
        "window.MAILBOX = " + json.dumps({"letters": [
            {"id": "guide", "pages": ["letters/guide.svg"]},
            {"id": "real", "date": "2026-08-17", "title": "迁入测试信", "theme": "qixi", "pages": ["letters/1.png"]},
        ]}, ensure_ascii=False) + ";", encoding="utf-8",
    )
    return root


def test_literal_parser_preserves_comments_inside_strings():
    assert parse_mailbox('/* header */ window.MAILBOX = { title: "//literal", list: [1, true,], }; // tail') == {
        "title": "//literal", "list": [1, True],
    }


@pytest.mark.parametrize("code", [
    "window.MAILBOX = {letters: fetch('https://example.com')};",
    "window.MAILBOX = {}; alert('extra');",
    "window.MAILBOX = {x: 1 + 2};",
    "window.MAILBOX = {x: `template`};",
])
def test_parser_rejects_executable_js(code):
    with pytest.raises(ValueError):
        parse_mailbox(code)


def test_source_omits_guide_and_rejects_escape_before_any_upload(tmp_path):
    root = source(tmp_path)
    records = source_records(root)
    assert [r["source_id"] for r in records] == ["real"]
    config = root / "data" / "letters.js"
    config.write_text(config.read_text().replace("letters/1.png", "../outside.png"))
    (tmp_path / "outside.png").write_bytes(make_png())
    with pytest.raises(ValueError, match="越出"):
        source_records(root)


def test_import_retry_keeps_source_and_letter_reference(client, tmp_path):
    root = source(tmp_path)
    original = (root / "letters" / "1.png").read_bytes()
    records = source_records(root)
    journal = tmp_path / "private" / "journal.json"
    client.cookies.clear()
    client.post("/api/auth/login", json={"name": "bear", "password": "123456"})
    first = import_records(client, records, journal)
    second = import_records(client, records, journal)
    assert first[0]["letter_id"] == second[0]["letter_id"]
    assert second[0]["status"] == "已有，跳过"
    assert (root / "letters" / "1.png").read_bytes() == original
    row = client.get(f"/api/letters/{first[0]['letter_id']}").json()["letter"]
    assert row["author"] == "bear" and row["theme"] == "qixi"
    assert client.get(row["pages"][0]).status_code == 200
    attachment_id = row["pages"][0].split("/")[3]
    with Session(engine) as db:
        assert attachment_id not in {r["id"] for r in list_orphan_attachments(db, -1)}
    records[0]["signature"] = "changed"
    with pytest.raises(ValueError, match="内容改变"):
        import_records(client, records, journal)


def test_create_response_lost_does_not_duplicate_letter(client, tmp_path):
    records = source_records(source(tmp_path))
    journal = tmp_path / "journal.json"
    client.cookies.clear()
    client.post("/api/auth/login", json={"name": "bear", "password": "123456"})

    class LostResponse:
        base_url = client.base_url

        def get(self, *args, **kwargs):
            return client.get(*args, **kwargs)

        def post(self, url, **kwargs):
            response = client.post(url, **kwargs)
            if url == "/api/letters":
                raise RuntimeError("simulate lost response")
            return response

    with pytest.raises(RuntimeError):
        import_records(LostResponse(), records, journal)
    recovered = import_records(client, records, journal)
    assert recovered[0]["status"] == "已有，跳过"
    pages = json.loads(journal.read_text())["entries"]["real"]["pages"]
    assert sum(row["pages"] == pages for row in client.get("/api/letters").json()["letters"]) == 1
