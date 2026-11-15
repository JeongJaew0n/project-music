"""곡을 숫자로 본다 — AI 는 들을 수 없으니 어디를 자를지 고를 근거, 사람에게는 파형.

ffmpeg 로 8kHz 모노 16비트로 풀어 순수 파이썬으로 센다. 4분 곡이 약 200만 샘플이라 1초 안쪽.
"""

from __future__ import annotations

import math
import subprocess
from array import array
from dataclasses import dataclass
from pathlib import Path

from .cut import CutError, _need, find_song, probe

RATE = 8000
FRAME = 0.05            # 소리 크기를 재는 단위 (초)
FLOOR_DB = -90          # 완전한 무음은 이 값으로
SILENCE_DB = -45.0      # 이보다 작으면 조용한 것으로 본다
MIN_SILENCE = 0.5       # 이만큼(초) 이어져야 조용한 구간


@dataclass(frozen=True)
class Analysis:
    path: Path
    title: str | None
    duration: float
    loudness: list[int]                     # 1초마다 RMS dBFS (0 이 최대, 반올림)
    silences: list[tuple[float, float]]     # 조용한 구간 (시작, 끝) 초

    def to_json(self) -> dict:
        return {
            "path": str(self.path),
            "file": self.path.name,
            "title": self.title,
            "duration": round(self.duration, 3),
            "loudness_db_per_second": self.loudness,
            "silences": [{"start": a, "end": b} for a, b in self.silences],
        }


def decode(path: Path) -> array:
    """mono 16비트 PCM 샘플."""
    _need("ffmpeg")
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-i", str(path),
         "-map", "0:a:0", "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
        capture_output=True,
    )
    if r.returncode != 0:
        raise CutError(f"오디오를 풀지 못했습니다: {path.name} ({r.stderr.decode(errors='replace').strip()[:200]})")
    samples = array("h")
    samples.frombytes(r.stdout[: len(r.stdout) // 2 * 2])
    return samples


def _db(sum_sq: float, n: int) -> float:
    if n == 0 or sum_sq <= 0:
        return FLOOR_DB
    return max(FLOOR_DB, 20 * math.log10(math.sqrt(sum_sq / n) / 32768))


def analyze(source: str | Path, *, silence_db: float = SILENCE_DB, min_silence: float = MIN_SILENCE) -> Analysis:
    path = find_song(source)
    info = probe(path)
    samples = decode(path)
    step = int(RATE * FRAME)
    frames = [sum(x * x for x in samples[i:i + step]) for i in range(0, len(samples), step)]
    counts = [min(step, len(samples) - i) for i in range(0, len(samples), step)]

    per = round(1 / FRAME)
    loudness = [round(_db(sum(frames[i:i + per]), sum(counts[i:i + per]))) for i in range(0, len(frames), per)]

    silences: list[tuple[float, float]] = []
    run_start = None
    for i, (sq, n) in enumerate([*zip(frames, counts), (None, None)]):
        quiet = sq is not None and _db(sq, n) < silence_db
        if quiet and run_start is None:
            run_start = i
        elif not quiet and run_start is not None:
            a, b = run_start * FRAME, min(i * FRAME, info["duration"])
            if b - a >= min_silence:
                silences.append((round(a, 2), round(b, 2)))
            run_start = None
    return Analysis(path, info["title"], info["duration"], loudness, silences)


def peaks(source: str | Path, n: int = 800) -> dict:
    """화면 파형용: 곡을 n 칸으로 나눠 칸마다 가장 큰 진폭(0~1)."""
    path = find_song(source)
    info = probe(path)
    samples = decode(path)
    n = max(1, min(int(n), 4000))
    size = max(1, math.ceil(len(samples) / n))
    out = []
    for i in range(0, len(samples), size):
        chunk = samples[i:i + size]
        out.append(round(max(max(chunk), -min(chunk)) / 32768, 3))
    return {"duration": round(info["duration"], 3), "peaks": out}
