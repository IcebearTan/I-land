"""维护命令（本阶段只读登记，不自动删除任何文件）。

用法（backend/ 下）：
    .venv/bin/python -m app.maintenance orphans [--days 2]   # 列出未被记忆引用的附件
"""

import argparse
import json
import sys

from sqlmodel import Session

from .attachments import list_orphan_attachments
from .db import engine


def main(argv=None):
    parser = argparse.ArgumentParser(description="I-land 维护工具")
    sub = parser.add_subparsers(dest="command", required=True)
    orphan_cmd = sub.add_parser("orphans", help="登记未被引用的附件（待人工清理）")
    orphan_cmd.add_argument("--days", type=int, default=2, help="宽限期天数，默认 2")
    args = parser.parse_args(argv)
    if args.command == "orphans":
        with Session(engine) as db:
            orphans = list_orphan_attachments(db, older_than_days=args.days)
        print(json.dumps(orphans, ensure_ascii=False, indent=2))
        print(f"共 {len(orphans)} 个未引用附件；请人工确认后再删除对应文件与记录。")


if __name__ == "__main__":
    sys.exit(main())
