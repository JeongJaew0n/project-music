import os
import shutil
import subprocess

import pytest

from ytmp3 import ExtractError, extract_mp3
from ytmp3.__main__ import main
from ytmp3.extract import build_options, check_url

# 19초짜리 유튜브 첫 영상 "Me at the zoo".
SHORT_VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw"


@pytest.mark.parametrize("bad", ["", "abc", "youtube.com/watch?v=x", "ftp://x/y", "https://"])
def test_check_url_rejects_non_links(bad):
    with pytest.raises(ExtractError):
        check_url(bad)


def test_check_url_strips_whitespace():
    assert check_url(f"  {SHORT_VIDEO}\n") == SHORT_VIDEO


def test_options_extract_mp3_single_video(tmp_path):
    opts = build_options(tmp_path)
    assert opts["noplaylist"] is True
    assert opts["format"].startswith("bestaudio")
    assert opts["paths"]["home"] == str(tmp_path)
    keys = [pp["key"] for pp in opts["postprocessors"]]
    assert "FFmpegExtractAudio" in keys
    assert "EmbedThumbnail" in keys
    audio = next(pp for pp in opts["postprocessors"] if pp["key"] == "FFmpegExtractAudio")
    assert audio["preferredcodec"] == "mp3"


def test_cli_bad_url_exits_1(capsys, tmp_path):
    assert main(["not-a-link", "-o", str(tmp_path)]) == 1
    assert "링크가 아닙니다" in capsys.readouterr().err
    assert list(tmp_path.iterdir()) == []


network = pytest.mark.skipif(os.environ.get("YTMP3_NETWORK") != "1",
                             reason="YTMP3_NETWORK=1 일 때만 실제 유튜브에 접속")


@pytest.mark.network
@network
def test_extract_real_video(tmp_path):
    r = extract_mp3(SHORT_VIDEO, tmp_path)
    assert r.path.suffix == ".mp3" and r.path.parent == tmp_path and r.path.exists()
    assert not r.already_existed
    assert list(tmp_path.iterdir()) == [r.path]  # 원본 오디오·썸네일 같은 중간 파일이 남지 않는다

    if shutil.which("ffprobe"):
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=format_name,duration",
             "-of", "default=nw=1", str(r.path)],
            capture_output=True, text=True, check=True,
        ).stdout
        assert "format_name=mp3" in out
        duration = float(out.split("duration=")[1].split()[0])
        assert 15 < duration < 25

    again = extract_mp3(SHORT_VIDEO, tmp_path)
    assert again.already_existed and again.path == r.path


@pytest.mark.network
@network
def test_unavailable_video_gives_clear_error(tmp_path):
    with pytest.raises(ExtractError, match="볼 수 없는 영상"):
        extract_mp3("https://www.youtube.com/watch?v=xxxxxxxxxxx", tmp_path)
    assert list(tmp_path.iterdir()) == []
