"""유튜브 링크 → mp3. yt-dlp 로 가장 좋은 오디오를 받아 ffmpeg 로 mp3 변환한다."""

from __future__ import annotations

import shutil
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import yt_dlp
from yt_dlp.utils import DownloadError

from .paths import DOWNLOADS_DIR

DEFAULT_OUT_DIR = DOWNLOADS_DIR  # 작업실의 받은 곡 폴더 (studio/downloads)

# LAME VBR 품질. 0 이 최고(V0, 약 245kbps). 유튜브 원본이 opus ~160kbps 라 이 이상은 의미 없다.
MP3_QUALITY = "0"

ProgressFn = Callable[[str], None]


class ExtractError(Exception):
    """사용자에게 그대로 보여줄 수 있는 실패."""


@dataclass(frozen=True)
class Extracted:
    url: str
    title: str
    path: Path
    duration: float | None
    already_existed: bool


def check_url(url: str) -> str:
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ExtractError(f"링크가 아닙니다: {url!r} (https:// 로 시작하는 유튜브 주소를 주세요)")
    return url


def build_options(out_dir: Path) -> dict:
    """yt-dlp CLI 인자를 옵션 dict 로 바꾼다. CLI 가 붙이는 후처리(썸네일 변환 등)를 그대로 쓰려고."""
    argv = [
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", MP3_QUALITY,
        "--embed-metadata",
        "--embed-thumbnail",
        "--no-playlist",
        "--no-overwrites",
        "--paths", str(out_dir),
        "--output", "%(title)s.%(ext)s",
        "--quiet",
        "--no-warnings",
        "--no-progress",
    ]
    return yt_dlp.parse_options(argv).ydl_opts


def extract_mp3(
    url: str,
    out_dir: Path | str = DEFAULT_OUT_DIR,
    progress: ProgressFn | None = None,
) -> Extracted:
    url = check_url(url)
    if shutil.which("ffmpeg") is None:
        raise ExtractError("ffmpeg 가 없습니다. `brew install ffmpeg` 로 설치하세요.")
    out_dir = Path(out_dir).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    say = progress or (lambda _msg: None)

    before = set(out_dir.iterdir())
    stem: dict[str, str] = {}  # 이번 영상의 파일 이름(확장자 뺀 것) — 실패 시 정리할 범위
    try:
        for attempt in range(1, ATTEMPTS + 1):
            try:
                return _extract_once(url, out_dir, say, stem)
            except DownloadError as e:
                if attempt < ATTEMPTS and _is_transient(e):
                    say(f"유튜브가 내려받기를 거절해 다시 시도합니다 ({attempt + 1}/{ATTEMPTS})")
                    continue
                raise ExtractError(_clean_error(e)) from e
        raise AssertionError("unreachable")
    except BaseException:
        _remove_leftovers(out_dir, before, stem.get("name"))
        raise


# 유튜브는 가끔 내려받기 주소를 403 으로 거절한다 (같은 영상이 3번에 1번꼴).
# 정보를 새로 읽으면 새 주소를 받아 대개 바로 된다.
ATTEMPTS = 3


def _is_transient(e: DownloadError) -> bool:
    msg = str(e)
    return any(s in msg for s in ("HTTP Error 403", "timed out", "Connection reset", "IncompleteRead"))


def _extract_once(url: str, out_dir: Path, say: ProgressFn, stem: dict[str, str]) -> Extracted:
    opts = build_options(out_dir)
    opts["ignoreerrors"] = False  # CLI 기본값('only_download')은 정보 읽기 실패를 None 으로 삼킨다
    opts["logger"] = _QuietLogger()  # 오류는 예외로 받아 한국어로 알린다 — yt-dlp 원문을 따로 찍지 않는다
    opts["progress_hooks"] = [_download_hook(say)]
    opts["postprocessor_hooks"] = [_postprocess_hook(say)]

    with yt_dlp.YoutubeDL(opts) as ydl:
        say("영상 정보를 읽는 중…")
        info = ydl.extract_info(url, download=False)
        if info is None:
            raise ExtractError(f"영상 정보를 읽지 못했습니다: {url}")
        if info.get("_type") == "playlist":
            raise ExtractError("재생목록 링크입니다. 영상 하나의 링크를 주세요.")

        title = info.get("title") or info.get("id") or "audio"
        target = _mp3_path(ydl, info)
        if target.exists():
            return Extracted(url, title, target, info.get("duration"), already_existed=True)

        stem["name"] = target.stem
        say(f"받는 중: {title}")
        info = ydl.process_ie_result(info, download=True)

    path = _final_path(info) or target
    if not path.exists():
        raise ExtractError(f"mp3 파일이 만들어지지 않았습니다: {path}")
    return Extracted(url, title, path, info.get("duration"), already_existed=False)


def _remove_leftovers(out_dir: Path, before: set[Path], stem: str | None) -> None:
    """실패했을 때 이번 실행이 만든 중간 파일(썸네일·.part·원본 오디오)만 지운다.

    저장 폴더를 -o 로 ~/Downloads 같은 곳으로 주면 다른 프로그램도 쓴다 — 새로 생겼고 이름이 이 영상 것인 파일만 건드린다.
    """
    if not stem or not out_dir.is_dir():
        return
    for p in set(out_dir.iterdir()) - before:
        if p.is_file() and p.name.startswith(stem + "."):
            p.unlink(missing_ok=True)


def _mp3_path(ydl: yt_dlp.YoutubeDL, info: dict) -> Path:
    return Path(ydl.prepare_filename(info)).with_suffix(".mp3")


def _final_path(info: dict) -> Path | None:
    for d in info.get("requested_downloads") or []:
        if d.get("filepath"):
            return Path(d["filepath"])
    return None


def _download_hook(say: ProgressFn):
    last = {"pct": -10}

    def hook(d: dict) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                pct = int(d.get("downloaded_bytes", 0) * 100 / total)
                if pct >= last["pct"] + 10:
                    last["pct"] = pct - pct % 10
                    say(f"  {last['pct']}%")
        elif d.get("status") == "finished":
            say("  내려받기 끝")

    return hook


def _postprocess_hook(say: ProgressFn):
    names = {"ExtractAudio": "mp3 로 변환 중…", "EmbedThumbnail": "앨범아트 넣는 중…"}
    announced: set[str] = set()

    def hook(d: dict) -> None:
        # 후처리기 클래스가 부모·자식 양쪽에서 run 을 감싸 같은 단계가 두 번 온다.
        pp = d.get("postprocessor")
        if d.get("status") == "started" and pp in names and pp not in announced:
            announced.add(pp)
            say(names[pp])

    return hook


class _QuietLogger:
    def debug(self, msg: str) -> None: ...
    def info(self, msg: str) -> None: ...
    def warning(self, msg: str) -> None: ...
    def error(self, msg: str) -> None: ...


def _clean_error(e: DownloadError) -> str:
    msg = str(e).removeprefix("ERROR: ").strip()
    if "Unsupported URL" in msg:
        return f"지원하지 않는 링크입니다: {msg.split('Unsupported URL:')[-1].strip()}"
    if "unavailable" in msg or "Private video" in msg:
        return f"볼 수 없는 영상입니다 (비공개·삭제·지역 제한): {msg}"
    if "Sign in to confirm" in msg:
        return f"유튜브가 로그인 확인을 요구합니다 (연령 제한 등): {msg}"
    return msg
