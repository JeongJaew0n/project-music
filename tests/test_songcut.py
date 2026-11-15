import json
import subprocess

import pytest

from songcut import CutError, analyze, cut_song, format_time, parse_time, peaks
from songcut.__main__ import main
from songcut.cut import resolve_range

from .conftest import duration


@pytest.mark.parametrize("text,sec", [
    ("83", 83), ("83.5", 83.5), ("1:23", 83), ("1:23.5", 83.5), ("0:01:23", 83), ("1:00:00", 3600),
    ("-10", -10), ("-0:10", -10), (" 2:05 ", 125), (12, 12), (1.5, 1.5),
])
def test_parse_time(text, sec):
    assert parse_time(text) == sec


@pytest.mark.parametrize("bad", ["", "abc", "1:60", "1:75:00", "1::2", "1:2:3:4", True])
def test_parse_time_rejects(bad):
    with pytest.raises(CutError):
        parse_time(bad)


@pytest.mark.parametrize("sec,text", [(0, "0:00"), (83, "1:23"), (83.5, "1:23.5"), (83.25, "1:23.25"), (3600, "60:00")])
def test_format_time(sec, text):
    assert format_time(sec) == text


def test_resolve_range():
    assert resolve_range(10, None, 100) == (10, 100)
    assert resolve_range(10, -10, 100) == (10, 90)
    assert resolve_range(-30, None, 100) == (70, 100)
    assert resolve_range(10, 500, 100) == (10, 100)  # 곡 끝으로 맞춤
    with pytest.raises(CutError, match="곡 길이"):
        resolve_range(100, None, 100)
    with pytest.raises(CutError, match="뒤여야"):
        resolve_range(50, 40, 100)


def test_cut_mp3(tmp_path, make_song):
    src = make_song(tmp_path / "곡.mp3")
    c = cut_song(src, "0:01.25", -1, fade_out=0.5, out=tmp_path / "out")
    assert c.path == tmp_path / "out" / "곡 [0m01.25s-0m06.5s].mp3"
    assert (c.start, c.end, c.duration) == (1.25, 6.5, 5.25)
    assert abs(duration(c.path) - 5.25) < 0.05
    tags = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags=title", "-of", "csv=p=0", str(c.path)],
                          capture_output=True, text=True).stdout.strip()
    assert tags == "시험곡 [0:01.25-0:06.5]"
    assert src.stat().st_size > 0  # 원본은 그대로

    again = cut_song(src, 1.25, 6.5, out=tmp_path / "out")
    assert again.path.name == "곡 [0m01.25s-0m06.5s] (2).mp3"


def test_cut_to_named_wav(tmp_path, make_song):
    src = make_song(tmp_path / "곡.mp3")
    c = cut_song(src, 0, 2, out=tmp_path / "앞부분.wav")
    assert c.path == tmp_path / "앞부분.wav" and abs(duration(c.path) - 2) < 0.01
    with pytest.raises(CutError, match="이미 있는"):
        cut_song(src, 0, 2, out=tmp_path / "앞부분.wav")
    with pytest.raises(CutError, match="mp3·wav·flac"):
        cut_song(src, 0, 2, out=tmp_path / "x.ogg")


def test_cut_errors(tmp_path, make_song):
    src = make_song(tmp_path / "곡.mp3")
    with pytest.raises(CutError, match="곡 파일이 없습니다"):
        cut_song(tmp_path / "없음.mp3", 0, 1)
    with pytest.raises(CutError, match="곡 길이"):
        cut_song(src, 8, out=tmp_path)
    with pytest.raises(CutError, match="페이드"):
        cut_song(src, 0, 1, fade_in=0.6, fade_out=0.6, out=tmp_path)
    (tmp_path / "가짜.mp3").write_bytes(b"not audio")
    with pytest.raises(CutError, match="읽지 못했습니다"):
        cut_song(tmp_path / "가짜.mp3", 0, 1, out=tmp_path)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["가짜.mp3", "곡.mp3"]


def test_analyze_finds_silence(tmp_path, make_song):
    a = analyze(make_song(tmp_path / "곡.mp3"))
    assert abs(a.duration - 7.5) < 0.05 and a.title == "시험곡"
    assert len(a.silences) == 1
    s, e = a.silences[0]
    assert abs(s - 3) <= 0.1 and abs(e - 4.5) <= 0.1
    assert len(a.loudness) == 8 and a.loudness[3] < -60 < a.loudness[0]

    w = peaks(tmp_path / "곡.mp3", 75)
    assert len(w["peaks"]) == 75 and all(0 <= p <= 1 for p in w["peaks"])
    assert w["peaks"][35] < 0.01 < w["peaks"][10]  # 3~4.5초 무음 칸


def test_cli_json(tmp_path, make_song, capsys):
    src = make_song(tmp_path / "곡.mp3")
    assert main(["info", str(src), "--json"]) == 0
    info = json.loads(capsys.readouterr().out)
    assert info["silences"][0]["start"] == pytest.approx(3, abs=0.1)

    assert main(["cut", str(src), "-s", "4.5", "-e", "-0:01", "-o", str(tmp_path), "--json"]) == 0
    r = json.loads(capsys.readouterr().out)
    assert (r["start"], r["end"]) == (4.5, 6.5) and (tmp_path / r["file"]).exists()

    assert main(["cut", str(src), "-s", "9", "--json"]) == 1
    out = capsys.readouterr()
    assert "곡 길이" in json.loads(out.out)["error"] and "실패" in out.err


def test_bare_name_found_in_downloads(tmp_path, make_song, monkeypatch):
    from songcut import cut as cutmod
    monkeypatch.setattr(cutmod, "DOWNLOADS_DIR", tmp_path / "downloads")
    make_song(tmp_path / "downloads" / "받은 곡.mp3")
    assert cutmod.find_song("받은 곡.mp3") == tmp_path / "downloads" / "받은 곡.mp3"


def test_cuts_dir_is_in_studio_works():
    from shared.paths import CUTS_DIR, WORKS_DIR
    from songcut import DEFAULT_OUT_DIR
    assert DEFAULT_OUT_DIR == CUTS_DIR == WORKS_DIR / "cuts"
