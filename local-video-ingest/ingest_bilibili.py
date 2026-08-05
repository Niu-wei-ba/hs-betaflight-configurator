#!/usr/bin/env python3
"""Compatibility entrypoint for the subtitle-first Bilibili tutorial ingester.

The implementation lives in the repository skill and consumes only MCP subtitle
JSON, Codex-calibrated subtitle JSON, optional official VTT/SRT, Markdown, and
Bilibili metadata. It never downloads media.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / ".codex/skills/video-tutorial-catalog-import/scripts/ingest_bilibili_tutorial.mjs"


def main() -> int:
    if not SCRIPT.exists():
        print(f"找不到联合入库脚本：{SCRIPT}", file=sys.stderr)
        return 1
    env = os.environ.copy()
    # Keep credentials in the caller's environment; never read or write .env.
    completed = subprocess.run(["node", str(SCRIPT), *sys.argv[1:]], env=env)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
