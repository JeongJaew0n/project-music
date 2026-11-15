import shutil
import subprocess

import pytest


@pytest.fixture
def make_song():
    """ffmpeg 로 시험 곡을 만든다: 소리 3초 · 무음 1.5초 · 소리 3초 = 7.5초."""
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg 없음")

    def make(path, title="시험곡"):
        path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=3",
             "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
             "-filter_complex", "[1]atrim=0:1.5[s];[0][s][0]concat=n=3:v=0:a=1",
             "-metadata", f"title={title}", "-c:a", "libmp3lame", "-q:a", "2", str(path)],
            check=True,
        )
        return path

    return make


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)
