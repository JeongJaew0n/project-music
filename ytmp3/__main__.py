"""uv run ytmp3 <URL> [<URL> ...] [-o 폴더]"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .extract import DEFAULT_OUT_DIR, ExtractError, extract_mp3


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ytmp3", description="유튜브 링크에서 mp3 를 뽑는다.")
    p.add_argument("urls", nargs="+", metavar="URL", help="유튜브 영상 링크 (여러 개 가능)")
    p.add_argument("-o", "--out", type=Path, default=DEFAULT_OUT_DIR,
                   help=f"저장 폴더 (기본: {DEFAULT_OUT_DIR})")
    args = p.parse_args(argv)

    def say(msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)

    failed = 0
    for url in args.urls:
        try:
            r = extract_mp3(url, args.out, progress=say)
        except ExtractError as e:
            failed += 1
            say(f"실패: {e}")
            continue
        note = " (이미 있음, 다시 받지 않음)" if r.already_existed else ""
        print(f"{r.path}{note}", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
