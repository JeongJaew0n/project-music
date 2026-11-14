"""uv run ytmp3-web — 브라우저에서 링크를 넣고 mp3 를 받는 로컬 화면.

API
  POST /api/jobs            {"url": ..., "out_dir": ...?}  → 작업 하나 (대기열에 넣음)
  GET  /api/jobs            → 이번 실행에서 만든 작업 목록 (최신 먼저)
  GET  /api/jobs/<id>       → 작업 상태
  GET  /api/jobs/<id>/audio → 결과 mp3 (Range 지원 — 재생 위치 이동용, ?download=1 이면 내려받기)
  POST /api/jobs/<id>/reveal→ Finder 에서 보기 (맥 앞에서 직접 열었을 때만)
  GET  /api/config          → {"out_dir", "can_change_out", "can_reveal"}

화면은 상대 경로(api/...)만 쓴다 — 홈 서버의 /apps/<id>/ 같은 하위 경로 뒤에서도 열리게.

보안 — 인증이 없고 POST 하나로 이 맥에서 yt-dlp 가 돈다.
- 기본으로 [::1] 에만 바인딩한다. 이 맥의 tailscaled(userspace)는 tailnet 에서 온 연결을
  127.0.0.1:<포트> 로 넘기므로, 127.0.0.1 에 바인딩하면 tailnet 의 모든 기기에 그대로 열린다.
- POST 는 JSON 만 받고, 다른 출처(Origin·Sec-Fetch-Site)에서 온 것은 거부한다 — 다른 사이트가
  브라우저를 시켜 작업을 넣지 못하게.
- 프록시를 거친 요청(X-Forwarded-*)은 저장 폴더를 바꾸거나 Finder 를 열 수 없다.
  `--fixed-out`·`--no-reveal` 로 항상 막을 수도 있다.
"""

from __future__ import annotations

import argparse
import json
import socket
import mimetypes
import queue
import re
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse

from .extract import DEFAULT_OUT_DIR, ExtractError, check_url, extract_mp3

STATIC = Path(__file__).parent / "static"
PERCENT = re.compile(r"^\s*(\d+)%$")


@dataclass
class Job:
    id: str
    url: str
    out_dir: Path
    status: str = "queued"  # queued → running → done | error
    message: str = "대기 중"
    percent: int | None = None
    error: str | None = None
    title: str | None = None
    path: Path | None = None
    duration: float | None = None
    already_existed: bool = False
    created: float = field(default_factory=time.time)

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "out_dir": str(self.out_dir),
            "status": self.status,
            "message": self.message,
            "percent": self.percent,
            "error": self.error,
            "title": self.title,
            "file": self.path.name if self.path else None,
            "path": str(self.path) if self.path else None,
            "duration": self.duration,
            "already_existed": self.already_existed,
        }


class Runner:
    """작업을 한 번에 하나씩 차례로 돌린다 (같은 파일을 동시에 쓰지 않도록)."""

    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._queue: queue.Queue[Job] = queue.Queue()
        threading.Thread(target=self._loop, daemon=True).start()

    def submit(self, url: str, out_dir: Path) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], url=url, out_dir=out_dir)
        with self._lock:
            self.jobs[job.id] = job
        self._queue.put(job)
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self.jobs.get(job_id)

    def all(self) -> list[Job]:
        with self._lock:
            return sorted(self.jobs.values(), key=lambda j: j.created, reverse=True)

    def _loop(self) -> None:
        while True:
            self._run(self._queue.get())

    def _run(self, job: Job) -> None:
        job.status = "running"
        job.message = "시작"

        def progress(msg: str) -> None:
            m = PERCENT.match(msg)
            if m:
                job.percent = int(m.group(1))
                job.message = "받는 중"
                return
            msg = msg.strip()
            if msg.startswith("받는 중: "):
                job.title = msg.removeprefix("받는 중: ")
                job.percent = 0
                msg = "받는 중"
            job.message = msg

        try:
            r = extract_mp3(job.url, job.out_dir, progress=progress)
        except ExtractError as e:
            job.status, job.error, job.message = "error", str(e), "실패"
            return
        except Exception as e:  # 예상 못 한 실패도 화면에 보여준다
            job.status, job.error, job.message = "error", f"알 수 없는 오류: {e}", "실패"
            return
        job.title, job.path, job.duration = r.title, r.path, r.duration
        job.already_existed = r.already_existed
        job.percent = 100
        job.message = "이미 있던 파일" if r.already_existed else "완료"
        job.status = "done"


# 홈 서버 proxy 는 X-Forwarded-Prefix: /apps/ytmp3 를 붙인다.
FORWARD_HEADERS = ("X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Forwarded-Prefix", "Forwarded")


class Handler(BaseHTTPRequestHandler):
    runner: Runner
    default_out: Path
    allow_reveal: bool = True
    fixed_out: bool = False

    # ---- 라우팅 ----
    def do_GET(self) -> None:
        parts = self._parts()
        if parts in ([], ["index.html"]):
            return self._static("index.html")
        if parts == ["api", "config"]:
            return self._json({
                "out_dir": str(self.default_out),
                "can_change_out": self._can_change_out(),
                "can_reveal": self._can_reveal(),
            })
        if parts == ["api", "jobs"]:
            return self._json([j.to_json() for j in self.runner.all()])
        if len(parts) == 3 and parts[:2] == ["api", "jobs"]:
            job = self._job(parts[2])
            return job and self._json(job.to_json())
        if len(parts) == 4 and parts[:2] == ["api", "jobs"] and parts[3] == "audio":
            job = self._job(parts[2])
            return job and self._audio(job)
        if len(parts) == 2 and parts[0] == "static":
            return self._static(parts[1])
        self._error(HTTPStatus.NOT_FOUND, "없는 주소입니다")

    def do_POST(self) -> None:
        if not self._same_origin():
            return self._error(HTTPStatus.FORBIDDEN, "다른 사이트에서 온 요청은 받지 않습니다")
        if (self.headers.get("Content-Type") or "").split(";")[0].strip() != "application/json":
            return self._error(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "JSON 요청만 받습니다")
        parts = self._parts()
        if parts == ["api", "jobs"]:
            return self._create()
        if len(parts) == 4 and parts[:2] == ["api", "jobs"] and parts[3] == "reveal":
            if not self._can_reveal():
                return self._error(HTTPStatus.FORBIDDEN, "Finder 열기는 이 맥에서 직접 연 화면에서만 됩니다")
            job = self._job(parts[2])
            if job is None:
                return
            if not (job.path and job.path.exists()):
                return self._error(HTTPStatus.NOT_FOUND, "파일이 없습니다")
            subprocess.run(["open", "-R", str(job.path)], check=False)
            return self._json({"ok": True})
        self._error(HTTPStatus.NOT_FOUND, "없는 주소입니다")

    # ---- 처리 ----
    def _create(self) -> None:
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        except json.JSONDecodeError:
            return self._error(HTTPStatus.BAD_REQUEST, "요청 형식이 잘못됐습니다")
        try:
            url = check_url(str(body.get("url") or ""))
        except ExtractError as e:
            return self._error(HTTPStatus.BAD_REQUEST, str(e))
        out = str(body.get("out_dir") or "").strip()
        out_dir = Path(out).expanduser() if out else self.default_out
        if out_dir != self.default_out and not self._can_change_out():
            return self._error(HTTPStatus.FORBIDDEN, "이 화면에서는 저장 폴더를 바꿀 수 없습니다")
        if not out_dir.is_absolute():
            return self._error(HTTPStatus.BAD_REQUEST, f"저장 폴더는 절대 경로여야 합니다: {out}")
        job = self.runner.submit(url, out_dir)
        self._json(job.to_json(), HTTPStatus.CREATED)

    def _audio(self, job: Job) -> None:
        if job.status != "done" or not job.path or not job.path.exists():
            return self._error(HTTPStatus.NOT_FOUND, "아직 파일이 없습니다")
        size = job.path.stat().st_size
        start, end = 0, size - 1
        rng = re.match(r"bytes=(\d*)-(\d*)$", self.headers.get("Range") or "")
        if rng and (rng.group(1) or rng.group(2)):
            if rng.group(1):
                start = int(rng.group(1))
                end = int(rng.group(2)) if rng.group(2) else size - 1
            else:  # bytes=-N : 끝에서 N 바이트
                start = max(0, size - int(rng.group(2)))
            end = min(end, size - 1)
            if start > end:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            self.send_response(HTTPStatus.PARTIAL_CONTENT)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(HTTPStatus.OK)
        length = end - start + 1
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        disposition = "attachment" if "download=1" in self.path.split("?", 1)[-1] else "inline"
        self.send_header("Content-Disposition", f"{disposition}; filename*=UTF-8''{quote(job.path.name)}")
        self.end_headers()
        with job.path.open("rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return  # 브라우저가 재생 위치를 옮기며 연결을 끊는 건 정상
                remaining -= len(chunk)

    # ---- 보안 ----
    def _via_proxy(self) -> bool:
        return any(self.headers.get(h) for h in FORWARD_HEADERS)

    def _can_change_out(self) -> bool:
        return not self.fixed_out and not self._via_proxy()

    def _can_reveal(self) -> bool:
        return self.allow_reveal and not self._via_proxy()

    def _same_origin(self) -> bool:
        """브라우저가 다른 출처에서 보낸 POST 를 거른다. 브라우저가 아닌 도구(curl)는 Origin 이 없어 통과."""
        if (self.headers.get("Sec-Fetch-Site") or "same-origin") not in ("same-origin", "none"):
            return False
        origin = self.headers.get("Origin")
        if not origin:
            return True
        hosts = {h.strip().lower() for h in (self.headers.get("Host"), self.headers.get("X-Forwarded-Host")) if h}
        return urlparse(origin).netloc.lower() in hosts

    # ---- 도우미 ----
    def _parts(self) -> list[str]:
        return [p for p in self.path.split("?", 1)[0].split("/") if p]

    def _job(self, job_id: str) -> Job | None:
        job = self.runner.get(job_id)
        if job is None:
            self._error(HTTPStatus.NOT_FOUND, "없는 작업입니다")
        return job

    def _static(self, name: str) -> None:
        path = (STATIC / name).resolve()
        if path.parent != STATIC.resolve() or not path.is_file():
            return self._error(HTTPStatus.NOT_FOUND, "없는 파일입니다")
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        self.send_header("Content-Type", f"{ctype}; charset=utf-8" if ctype.startswith("text/") else ctype)
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, obj, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _error(self, status: HTTPStatus, message: str) -> None:
        self._json({"error": message}, status)

    def log_message(self, fmt: str, *args) -> None:
        if self.command != "POST":
            return  # 화면이 진행률을 0.6초마다 묻는다 — GET 까지 찍으면 로그가 묻힌다
        sys.stderr.write(f"{self.address_string()} {fmt % args}\n")


class ThreadingHTTPServerV6(ThreadingHTTPServer):
    address_family = socket.AF_INET6


def make_server(
    host: str, port: int, default_out: Path, *, allow_reveal: bool = True, fixed_out: bool = False
) -> ThreadingHTTPServer:
    handler = type("BoundHandler", (Handler,), {
        "runner": Runner(), "default_out": default_out,
        "allow_reveal": allow_reveal, "fixed_out": fixed_out,
    })
    cls = ThreadingHTTPServerV6 if ":" in host else ThreadingHTTPServer
    server = cls((host, port), handler)
    server.daemon_threads = True
    return server


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ytmp3-web", description="유튜브 → mp3 로컬 웹 화면")
    p.add_argument("--host", default="::1",
                   help="바인딩 주소 (기본 ::1). 127.0.0.1 은 이 맥의 tailscaled 가 tailnet 에 그대로 연다")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("-o", "--out", type=Path, default=DEFAULT_OUT_DIR,
                   help=f"기본 저장 폴더 (기본: {DEFAULT_OUT_DIR}). ~/Downloads 처럼 macOS 가 보호하는 폴더는 백그라운드 실행에서 멈춘다")
    p.add_argument("--no-open", action="store_true", help="브라우저를 자동으로 열지 않음")
    p.add_argument("--fixed-out", action="store_true", help="화면에서 저장 폴더를 바꾸지 못하게 함")
    p.add_argument("--no-reveal", action="store_true", help="Finder 에서 보기를 끔")
    args = p.parse_args(argv)

    server = make_server(args.host, args.port, args.out.expanduser(),
                         allow_reveal=not args.no_reveal, fixed_out=args.fixed_out)
    port = server.server_address[1]
    url = f"http://[{args.host}]:{port}/" if ":" in args.host else f"http://{args.host}:{port}/"
    print(f"ytmp3 웹 화면: {url}  (끝내려면 Ctrl+C)", flush=True)
    if not args.no_open:
        threading.Timer(0.5, webbrowser.open, (url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
