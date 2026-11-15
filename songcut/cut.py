"""곡에서 구간을 떼어 새 파일로 저장한다. 원본은 건드리지 않는다.

복사(-c copy)가 아니라 디코딩 → 자르기 → 다시 인코딩한다. mp3 를 복사로 자르면 프레임(약 26ms)
경계에서만 잘리고, 비트 저장소 때문에 첫 프레임이 깨질 수 있다.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from shared.paths import CUTS_DIR, DOWNLOADS_DIR

DEFAULT_OUT_DIR = CUTS_DIR
AUDIO_EXTS = {".mp3", ".m4a", ".aac", ".opus", ".ogg", ".webm", ".wav", ".flac"}
OUT_FORMATS = {".mp3", ".wav", ".flac"}
MP3_QUALITY = "0"  # LAME VBR V0 — ytmp3 와 같다


class CutError(Exception):
    """사용자(사람·AI)에게 그대로 보여줄 수 있는 실패."""


@dataclass(frozen=True)
class Cut:
    source: Path
    path: Path
    start: float
    end: float

    @property
    def duration(self) -> float:
        return round(self.end - self.start, 3)

    def to_json(self) -> dict:
        return {
            "source": str(self.source),
            "path": str(self.path),
            "file": self.path.name,
            "start": self.start,
            "end": self.end,
            "duration": self.duration,
        }


_TIME = re.compile(r"^(-)?(?:(?:(\d+):)?(\d+):)?(\d+(?:\.\d+)?)$")


def parse_time(value: str | float | int) -> float:
    """'83' · '83.5' · '1:23' · '1:23.5' · '0:01:23' → 초. 앞에 '-' 가 붙으면 음수(곡 끝에서 거꾸로)."""
    if isinstance(value, bool):
        raise CutError(f"시간이 아닙니다: {value!r}")
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    m = _TIME.match(text)
    if not m:
        raise CutError(f"시간이 아닙니다: {value!r} (예: 83, 1:23, 1:23.5, 0:01:23, -10)")
    neg, h, mnt, sec = m.groups()
    if mnt is not None and float(sec) >= 60:
        raise CutError(f"초는 60 보다 작아야 합니다: {value!r}")
    if h is not None and int(mnt) >= 60:
        raise CutError(f"분은 60 보다 작아야 합니다: {value!r}")
    total = int(h or 0) * 3600 + int(mnt or 0) * 60 + float(sec)
    return -total if neg else total


def format_time(t: float) -> str:
    """83.5 → '1:23.5'. 소수는 두 자리까지, 뒤의 0 은 지운다."""
    t = round(t, 2)
    m, s = divmod(t, 60)
    whole = f"{int(m)}:{int(s):02d}"
    frac = f"{s - int(s):.2f}"[1:].rstrip("0").rstrip(".")
    return whole + frac


def _name_time(t: float) -> str:
    """파일 이름용: 83.5 → '1m23.5s'. 맥 Finder 는 ':' 를 '/' 로 보여 쓰지 않는다."""
    return format_time(t).replace(":", "m") + "s"


def find_song(name: str | Path) -> Path:
    """경로가 있으면 그대로, 없는데 이름만 주면 받은 곡 폴더(studio/downloads)에서 찾는다."""
    p = Path(name).expanduser()
    if p.is_file():
        return p
    if p.name == str(name) and (DOWNLOADS_DIR / p.name).is_file():
        return DOWNLOADS_DIR / p.name
    raise CutError(f"곡 파일이 없습니다: {name}")


def probe(path: Path) -> dict:
    """ffprobe 로 길이와 태그를 읽는다."""
    _need("ffprobe")
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:format_tags=title",
         "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "json", str(path)],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise CutError(f"오디오 파일을 읽지 못했습니다: {path.name} ({r.stderr.strip()[:200]})")
    data = json.loads(r.stdout or "{}")
    fmt = data.get("format") or {}
    if not data.get("streams"):
        raise CutError(f"소리가 없는 파일입니다: {path.name}")
    try:
        duration = float(fmt["duration"])
    except (KeyError, ValueError):
        raise CutError(f"곡 길이를 알 수 없습니다: {path.name}") from None
    tags = {k.lower(): v for k, v in (fmt.get("tags") or {}).items()}
    return {"duration": duration, "title": tags.get("title")}


def resolve_range(start: float, end: float | None, duration: float) -> tuple[float, float]:
    """음수는 곡 끝에서 거꾸로. 끝이 곡 길이를 넘으면 곡 끝으로 맞춘다."""
    if start < 0:
        start += duration
    end = duration if end is None else (end + duration if end < 0 else end)
    start, end = round(max(start, 0.0), 3), round(min(end, duration), 3)
    if start >= duration:
        raise CutError(f"시작({format_time(start)})이 곡 길이({format_time(duration)}) 이상입니다")
    if end <= start:
        raise CutError(f"끝({format_time(end)})이 시작({format_time(start)})보다 뒤여야 합니다")
    return start, end


def cut_song(
    source: str | Path,
    start: str | float = 0,
    end: str | float | None = None,
    *,
    fade_in: float = 0.0,
    fade_out: float = 0.0,
    out: str | Path | None = None,
) -> Cut:
    """source 의 [start, end) 를 잘라 저장한다.

    out 이 폴더(또는 없음)면 '<원본 이름> [1m23s-2m05s].<원본 확장자>' 로 만든다. 원본 확장자가
    mp3·wav·flac 이 아니면 mp3. 같은 이름이 있으면 ' (2)' 를 붙인다 — 덮어쓰지 않는다.
    out 이 파일 이름이면 그 확장자(mp3·wav·flac)로 낸다. 그 파일이 이미 있으면 실패.
    """
    _need("ffmpeg")
    src = find_song(source)
    info = probe(src)
    a, b = resolve_range(parse_time(start), None if end in (None, "") else parse_time(end), info["duration"])
    length = b - a
    fade_in, fade_out = float(fade_in or 0), float(fade_out or 0)
    if fade_in < 0 or fade_out < 0:
        raise CutError("페이드 길이는 0 이상이어야 합니다")
    if fade_in + fade_out > length:
        raise CutError(f"페이드 길이 합({fade_in + fade_out:g}초)이 구간 길이({length:g}초)보다 깁니다")

    target = _target(src, a, b, out)
    target.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-n",
           "-ss", f"{a:.3f}", "-t", f"{length:.3f}", "-i", str(src), "-map", "0:a:0"]
    filters = []
    if fade_in:
        filters.append(f"afade=t=in:st=0:d={fade_in:.3f}")
    if fade_out:
        filters.append(f"afade=t=out:st={length - fade_out:.3f}:d={fade_out:.3f}")
    if filters:
        cmd += ["-af", ",".join(filters)]
    ext = target.suffix.lower()
    if ext == ".mp3":
        title = f"{info['title'] or src.stem} [{format_time(a)}-{format_time(b)}]"
        cmd += ["-map", "0:v:0?", "-c:v", "copy", "-disposition:v:0", "attached_pic",
                "-map_metadata", "0", "-metadata", f"title={title}", "-id3v2_version", "3",
                "-c:a", "libmp3lame", "-q:a", MP3_QUALITY]
    elif ext == ".wav":
        cmd += ["-c:a", "pcm_s16le", "-map_metadata", "-1"]
    else:  # .flac
        cmd += ["-c:a", "flac", "-map_metadata", "0"]
    cmd.append(str(target))

    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not target.is_file():
        target.unlink(missing_ok=True)
        raise CutError(f"자르기에 실패했습니다: {r.stderr.strip()[:300]}")
    return Cut(src, target, a, b)


def _target(src: Path, a: float, b: float, out: str | Path | None) -> Path:
    out_path = Path(out).expanduser() if out else DEFAULT_OUT_DIR
    if out_path.suffix.lower() in OUT_FORMATS and not out_path.is_dir():
        if out_path.exists():
            raise CutError(f"이미 있는 파일입니다: {out_path}")
        return out_path
    if out_path.suffix and not out_path.is_dir():
        raise CutError(f"저장 형식은 mp3·wav·flac 만 됩니다: {out_path.name}")
    ext = src.suffix.lower() if src.suffix.lower() in OUT_FORMATS else ".mp3"
    stem = f"{src.stem} [{_name_time(a)}-{_name_time(b)}]"
    target = out_path / f"{stem}{ext}"
    n = 2
    while target.exists():
        target = out_path / f"{stem} ({n}){ext}"
        n += 1
    return target


def _need(tool: str) -> None:
    if shutil.which(tool) is None:
        raise CutError(f"{tool} 가 없습니다. `brew install ffmpeg` 로 설치하세요.")
