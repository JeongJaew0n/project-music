"""songcut — 곡 구간 자르기 명령줄. 사람도 AI 도 쓴다 (AI 는 --json).

  songcut info <곡> [--json]                 길이 · 초당 소리 크기 · 조용한 구간
  songcut cut  <곡> -s 1:23 -e 2:05 [...]    구간을 잘라 studio/works/cuts/ 에 저장

<곡> 은 파일 경로, 또는 studio/downloads/ 안의 파일 이름.
시간: 83 · 83.5 · 1:23 · 1:23.5 · 0:01:23. 음수는 곡 끝에서 거꾸로(-10 = 끝나기 10초 전).
"""

from __future__ import annotations

import argparse
import json
import sys

from .analyze import MIN_SILENCE, SILENCE_DB, analyze
from .cut import DEFAULT_OUT_DIR, CutError, cut_song, format_time


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="songcut", description="곡에서 구간을 잘라 새 파일로 저장합니다.",
                                formatter_class=argparse.RawDescriptionHelpFormatter,
                                epilog=__doc__.split("\n\n", 1)[1])
    sub = p.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("info", help="길이·초당 소리 크기(dBFS)·조용한 구간 — 어디를 자를지 고를 때")
    pi.add_argument("song")
    pi.add_argument("--silence-db", type=float, default=SILENCE_DB, help=f"이보다 작으면 조용함 (기본 {SILENCE_DB})")
    pi.add_argument("--min-silence", type=float, default=MIN_SILENCE, help=f"조용한 구간 최소 길이 초 (기본 {MIN_SILENCE})")
    pi.add_argument("--json", action="store_true", help="결과를 JSON 으로")

    pc = sub.add_parser("cut", help="구간을 잘라 저장")
    pc.add_argument("song")
    pc.add_argument("-s", "--start", default="0", help="시작 (기본 0)")
    pc.add_argument("-e", "--end", default=None, help="끝 (기본 곡 끝). 음수면 곡 끝에서 거꾸로")
    pc.add_argument("--fade-in", type=float, default=0.0, help="시작 페이드 초 (기본 0)")
    pc.add_argument("--fade-out", type=float, default=0.0, help="끝 페이드 초 (기본 0)")
    pc.add_argument("-o", "--out", default=None,
                    help=f"저장 폴더 또는 파일(.mp3·.wav·.flac). 기본 {DEFAULT_OUT_DIR}")
    pc.add_argument("--json", action="store_true", help="결과를 JSON 으로")

    args = p.parse_args(_allow_negative(argv if argv is not None else sys.argv[1:]))
    try:
        if args.cmd == "info":
            a = analyze(args.song, silence_db=args.silence_db, min_silence=args.min_silence)
            if args.json:
                print(json.dumps(a.to_json(), ensure_ascii=False))
            else:
                _print_info(a)
        else:
            c = cut_song(args.song, args.start, args.end, fade_in=args.fade_in, fade_out=args.fade_out, out=args.out)
            if args.json:
                print(json.dumps(c.to_json(), ensure_ascii=False))
            else:
                print(f"{format_time(c.start)} ~ {format_time(c.end)} ({c.duration:g}초)", file=sys.stderr)
                print(c.path)
    except CutError as e:
        if getattr(args, "json", False):
            print(json.dumps({"error": str(e)}, ensure_ascii=False))
        print(f"실패: {e}", file=sys.stderr)
        return 1
    return 0


def _allow_negative(argv: list[str]) -> list[str]:
    """'-e -10' 처럼 음수 시간을 옵션 값으로 받게 '-e=-10' 으로 붙인다 ('-0:10' 은 argparse 가 옵션으로 본다)."""
    out: list[str] = []
    it = iter(argv)
    for a in it:
        if a in ("-s", "--start", "-e", "--end"):
            nxt = next(it, None)
            if nxt is not None and nxt.startswith("-") and nxt[1:2].isdigit():
                out.append(f"{a}={nxt}")
                continue
            out.append(a)
            if nxt is not None:
                out.append(nxt)
        else:
            out.append(a)
    return out


def _print_info(a) -> None:
    print(f"{a.path.name}")
    if a.title:
        print(f"제목: {a.title}")
    print(f"길이: {format_time(a.duration)} ({a.duration:.2f}초)")
    if a.silences:
        print("조용한 구간: " + ", ".join(f"{format_time(s)}~{format_time(e)}" for s, e in a.silences))
    else:
        print("조용한 구간: 없음")
    print("초당 소리 크기 (dBFS, 0 이 최대):")
    for i in range(0, len(a.loudness), 10):
        row = " ".join(f"{v:4d}" for v in a.loudness[i:i + 10])
        print(f"  {format_time(i):>7}  {row}")


if __name__ == "__main__":
    sys.exit(main())
