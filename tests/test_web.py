import json
import threading
import time
import urllib.error
import urllib.request

import pytest

from ytmp3 import Extracted, ExtractError
from ytmp3 import web


@pytest.fixture
def server(tmp_path, monkeypatch):
    def fake_extract(url, out_dir, progress=None):
        progress("영상 정보를 읽는 중…")
        if "bad" in url:
            raise ExtractError("볼 수 없는 영상입니다")
        progress("받는 중: 시험 곡")
        progress("  50%")
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / "시험 곡.mp3"
        path.write_bytes(b"ID3" + bytes(range(256)) * 4)
        return Extracted(url, "시험 곡", path, 12.0, already_existed=False)

    monkeypatch.setattr(web, "extract_mp3", fake_extract)
    srv = web.make_server("127.0.0.1", 0, tmp_path, cuts_dir=tmp_path / "cuts")
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}", tmp_path
    srv.shutdown()
    srv.server_close()


def call(base, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = dict(headers or {})
    if data is not None:
        headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(base + path, data=data, headers=headers,
                                 method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def wait(base, job_id):
    for _ in range(100):
        _, _, raw = call(base, f"/api/jobs/{job_id}")
        job = json.loads(raw)
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.02)
    raise AssertionError("작업이 끝나지 않음")


def test_index_and_config(server):
    base, out = server
    status, headers, raw = call(base, "/")
    assert status == 200 and "text/html" in headers["Content-Type"] and "ytmp3".encode() in raw
    assert json.loads(call(base, "/api/config")[2]) == {
        "out_dir": str(out), "cuts_dir": str(out / "cuts"), "can_change_out": True, "can_reveal": True,
        "test_mode": False}


def test_job_done_and_audio_ranges(server):
    base, out = server
    status, _, raw = call(base, "/api/jobs", {"url": "https://youtu.be/ok"})
    assert status == 201
    job = wait(base, json.loads(raw)["id"])
    assert job["status"] == "done" and job["title"] == "시험 곡"
    assert job["path"] == str(out / "시험 곡.mp3") and job["duration"] == 12.0

    size = (out / "시험 곡.mp3").stat().st_size
    status, headers, body = call(base, f"/api/jobs/{job['id']}/audio")
    assert status == 200 and headers["Content-Type"] == "audio/mpeg" and len(body) == size
    status, headers, body = call(base, f"/api/jobs/{job['id']}/audio", headers={"Range": "bytes=3-9"})
    assert status == 206 and headers["Content-Range"] == f"bytes 3-9/{size}" and body == bytes(range(7))
    status, _, body = call(base, f"/api/jobs/{job['id']}/audio", headers={"Range": "bytes=-4"})
    assert status == 206 and len(body) == 4
    assert call(base, f"/api/jobs/{job['id']}/audio", headers={"Range": f"bytes={size}-"})[0] == 416

    assert headers["Content-Disposition"].startswith("inline")
    status, headers, _ = call(base, f"/api/jobs/{job['id']}/audio?download=1")
    assert status == 200 and headers["Content-Disposition"].startswith("attachment")

    listed = json.loads(call(base, "/api/jobs")[2])
    assert [j["id"] for j in listed] == [job["id"]]


def test_job_error_is_reported(server):
    base, _ = server
    job = wait(base, json.loads(call(base, "/api/jobs", {"url": "https://youtu.be/bad"})[2])["id"])
    assert job["status"] == "error" and job["error"] == "볼 수 없는 영상입니다"
    assert call(base, f"/api/jobs/{job['id']}/audio")[0] == 404


@pytest.mark.parametrize("body,msg", [
    ({"url": "abc"}, "링크가 아닙니다"),
    ({"url": "https://youtu.be/ok", "out_dir": "relative/dir"}, "절대 경로"),
])
def test_bad_requests(server, body, msg):
    base, _ = server
    status, _, raw = call(base, "/api/jobs", body)
    assert status == 400 and msg in json.loads(raw)["error"]


def test_out_dir_override(server, tmp_path):
    base, _ = server
    other = tmp_path / "other"
    job = wait(base, json.loads(call(base, "/api/jobs", {"url": "https://youtu.be/ok", "out_dir": str(other)})[2])["id"])
    assert job["path"] == str(other / "시험 곡.mp3")


def test_static_path_traversal_blocked(server):
    base, _ = server
    assert call(base, "/static/..%2Fweb.py")[0] == 404
    assert call(base, "/nope")[0] == 404
    assert call(base, "/api/jobs/nope")[0] == 404


def test_page_uses_only_relative_paths():
    """홈 서버 /apps/<id>/ 아래에서도 열리려면 화면이 / 로 시작하는 경로를 쓰면 안 된다."""
    html = (web.STATIC / "index.html").read_text()
    assert '"/api' not in html and "`/api" not in html and "'/api" not in html


PROXY = {"X-Forwarded-Prefix": "/apps/ytmp3", "X-Forwarded-For": "100.64.0.2"}


def test_binds_ipv6_loopback_by_default(tmp_path):
    srv = web.make_server("::1", 0, tmp_path)
    try:
        assert srv.server_address[0] == "::1"
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        port = srv.server_address[1]
        assert call(f"http://[::1]:{port}", "/api/config")[0] == 200
        with pytest.raises(urllib.error.URLError):
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/config", timeout=2)
    finally:
        srv.shutdown()
        srv.server_close()


@pytest.mark.parametrize("headers", [
    {"Origin": "https://evil.example"},
    {"Origin": "http://127.0.0.1:1"},
    {"Sec-Fetch-Site": "cross-site"},
    {"Sec-Fetch-Site": "same-site"},
])
def test_cross_origin_post_rejected(server, headers):
    base, _ = server
    status, _, raw = call(base, "/api/jobs", {"url": "https://youtu.be/ok"}, headers)
    assert status == 403 and "다른 사이트" in json.loads(raw)["error"]
    assert json.loads(call(base, "/api/jobs")[2]) == []


def test_same_origin_post_allowed(server):
    base, _ = server
    host = base.removeprefix("http://")
    status, _, _ = call(base, "/api/jobs", {"url": "https://youtu.be/ok"},
                        {"Origin": base, "Host": host, "Sec-Fetch-Site": "same-origin"})
    assert status == 201


def test_proxy_origin_matches_forwarded_host(server):
    base, _ = server
    headers = {**PROXY, "Host": "mac.tail.ts.net", "Origin": "https://mac.tail.ts.net"}
    assert call(base, "/api/jobs", {"url": "https://youtu.be/ok"}, headers)[0] == 201
    headers = {**PROXY, "Host": "[::1]:8740", "X-Forwarded-Host": "mac.tail.ts.net", "Origin": "https://mac.tail.ts.net"}
    assert call(base, "/api/jobs", {"url": "https://youtu.be/ok"}, headers)[0] == 201


def test_form_post_rejected(server):
    base, _ = server
    req = urllib.request.Request(base + "/api/jobs", data=b"url=https://youtu.be/ok", method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(req)
    assert e.value.code == 415


def test_proxy_cannot_change_folder_or_reveal(server, tmp_path):
    base, out = server
    cfg = json.loads(call(base, "/api/config", headers=PROXY)[2])
    assert cfg == {"out_dir": str(out), "cuts_dir": str(out / "cuts"), "can_change_out": False, "can_reveal": False,
                   "test_mode": False}
    status, _, raw = call(base, "/api/jobs", {"url": "https://youtu.be/ok", "out_dir": "/tmp/elsewhere"}, PROXY)
    assert status == 403 and "저장 폴더" in json.loads(raw)["error"]
    job = wait(base, json.loads(call(base, "/api/jobs", {"url": "https://youtu.be/ok"}, PROXY)[2])["id"])
    assert job["status"] == "done"
    status, _, raw = call(base, f"/api/jobs/{job['id']}/reveal", {}, PROXY)
    assert status == 403 and "Finder" in json.loads(raw)["error"]
    local = json.loads(call(base, "/api/config")[2])
    assert local["can_change_out"] and local["can_reveal"]


def test_flags_lock_folder_and_reveal(tmp_path):
    srv = web.make_server("127.0.0.1", 0, tmp_path, allow_reveal=False, fixed_out=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    try:
        cfg = json.loads(call(base, "/api/config")[2])
        assert not cfg["can_change_out"] and not cfg["can_reveal"]
        assert call(base, "/api/jobs", {"url": "https://youtu.be/ok", "out_dir": "/tmp/x"})[0] == 403
    finally:
        srv.shutdown()
        srv.server_close()


def test_default_out_is_studio_downloads():
    """받은 곡은 작업실의 downloads/ 로. LaunchAgent 가 TCC 보호 폴더(~/Downloads)에서 멈추지 않게."""
    from pathlib import Path

    from ytmp3 import DEFAULT_OUT_DIR
    from shared.paths import DOWNLOADS_DIR, STUDIO_DIR, WORKS_DIR
    root = Path(__file__).resolve().parent.parent
    assert STUDIO_DIR == root / "studio"
    assert DEFAULT_OUT_DIR == DOWNLOADS_DIR == STUDIO_DIR / "downloads"
    assert WORKS_DIR == STUDIO_DIR / "works"
    home = Path.home()
    assert not any(DOWNLOADS_DIR.is_relative_to(home / d) for d in ("Downloads", "Documents", "Desktop"))


# ---- 구간 자르기 ----
from urllib.parse import quote  # noqa: E402

from .conftest import duration  # noqa: E402


def test_songs_peaks_and_cut(server, make_song):
    base, out = server
    make_song(out / "내 곡.mp3")
    (out / "메모.txt").write_text("x")
    songs = json.loads(call(base, "/api/songs")[2])
    assert [s["name"] for s in songs] == ["내 곡.mp3"]
    name = quote("내 곡.mp3")

    status, headers, body = call(base, f"/api/songs/{name}/audio", headers={"Range": "bytes=0-9"})
    assert status == 206 and headers["Content-Type"] == "audio/mpeg" and len(body) == 10
    w = json.loads(call(base, f"/api/songs/{name}/peaks?n=50")[2])
    assert len(w["peaks"]) == 50 and abs(w["duration"] - 7.5) < 0.05
    info = json.loads(call(base, f"/api/songs/{name}/info")[2])
    assert len(info["silences"]) == 1

    assert json.loads(call(base, "/api/cuts")[2]) == []
    status, _, raw = call(base, "/api/cuts", {"song": "내 곡.mp3", "start": "0:01", "end": 3.5, "fade_out": 0.2})
    assert status == 201, raw
    c = json.loads(raw)
    assert c["file"] == "내 곡 [0m01s-0m03.5s].mp3" and c["duration"] == 2.5
    assert abs(duration(out / "cuts" / c["file"]) - 2.5) < 0.05
    assert [x["name"] for x in json.loads(call(base, "/api/cuts")[2])] == [c["file"]]
    status, headers, _ = call(base, f"/api/cuts/{quote(c['file'])}/audio?download=1")
    assert status == 200 and headers["Content-Disposition"].startswith("attachment")


@pytest.mark.parametrize("body,status,msg", [
    ({"song": "내 곡.mp3", "start": 9}, 400, "곡 길이"),
    ({"song": "내 곡.mp3", "start": "abc"}, 400, "시간이 아닙니다"),
    ({"song": "내 곡.mp3", "fade_in": "x"}, 400, "숫자가 아닙니다"),
    ({"song": "없는 곡.mp3"}, 404, "없는 곡"),
    ({"song": "../내 곡.mp3"}, 404, "없는 곡"),
    ({"song": "/etc/hosts"}, 404, "없는 곡"),
    ({}, 404, "없는 곡"),
])
def test_cut_bad_requests(server, make_song, body, status, msg):
    base, out = server
    make_song(out / "내 곡.mp3")
    got, _, raw = call(base, "/api/cuts", body)
    assert got == status and msg in json.loads(raw)["error"]
    assert not (out / "cuts").exists() or list((out / "cuts").iterdir()) == []


def test_library_names_cannot_escape_folder(server, make_song, tmp_path):
    base, out = server
    make_song(out / "cuts" / "잘린.mp3")
    # 받은 곡 폴더(out)에서 하위 폴더나 바깥으로 가는 이름은 없는 곡
    for path in ["/api/songs/cuts%2F잘린.mp3/audio", "/api/songs/..%2Fx.mp3/audio", "/api/songs/.hidden.mp3/audio",
                 "/api/cuts/..%2F..%2Fetc%2Fhosts/audio"]:
        assert call(base, quote(path, safe="/%"))[0] == 404, path
    (out / "link.mp3").symlink_to(out / "cuts" / "잘린.mp3")
    assert call(base, "/api/songs/link.mp3/audio")[0] == 404
    assert call(base, "/api/cuts/" + quote("잘린.mp3") + "/audio")[0] == 200


def test_cut_post_rejects_other_origin(server, make_song):
    base, out = server
    make_song(out / "내 곡.mp3")
    status, _, _ = call(base, "/api/cuts", {"song": "내 곡.mp3"}, {"Origin": "https://evil.example"})
    assert status == 403
    req = urllib.request.Request(base + "/api/cuts", data=b"song=x", method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(req)
    assert e.value.code == 415


def test_test_mode_flag(tmp_path):
    srv = web.make_server("127.0.0.1", 0, tmp_path, test_mode=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    try:
        assert json.loads(call(base, "/api/config")[2])["test_mode"] is True
        assert "시험 모드".encode() in call(base, "/")[2]
    finally:
        srv.shutdown()
        srv.server_close()


# ---- 화면이 쓰는 ui-kit 사본 ----
import re  # noqa: E402
from pathlib import Path  # noqa: E402

KIT = Path(web.STATIC) / "vendor" / "ui-kit"


def test_page_loads_ui_kit_copy(server):
    """화면은 프로젝트 안 키트 사본(0.3.x)을 상대 경로로 읽고, 서버가 그 파일들(글꼴 포함)을 내준다."""
    base, _ = server
    page = call(base, "/")[2].decode()
    refs = re.findall(r'(?:href|src)="(static/vendor/ui-kit/[^"]+)"', page)
    assert sorted(refs) == ["static/vendor/ui-kit/components.css", "static/vendor/ui-kit/tokens.css",
                            "static/vendor/ui-kit/ui.js"]
    assert '<script src="static/vendor/ui-kit/ui.js"></script>' in page  # defer 없이 (첫 화면 테마 깜빡임 방지)
    for ref in refs:
        status, headers, body = call(base, "/" + ref)
        assert status == 200 and re.match(rb"/\* ui-kit 0\.\d+\.\d+ \*/", body), ref
    status, headers, body = call(base, "/static/vendor/ui-kit/fonts/KitSans-Variable.woff2")
    assert status == 200 and headers["Content-Type"] == "font/woff2" and body[:4] == b"wOF2"
    assert call(base, "/static/vendor/ui-kit/ui.js")[1]["Content-Type"].startswith("text/javascript")


def test_ui_kit_copy_is_untouched():
    """키트 사본은 고치지 않는다 — 세 파일의 판 번호가 같아야 한다(adopt.mjs 로만 바꾼다)."""
    stamps = {(KIT / f).read_text().splitlines()[0] for f in ("tokens.css", "components.css", "ui.js")}
    assert len(stamps) == 1 and re.fullmatch(r"/\* ui-kit 0\.\d+\.\d+ \*/", stamps.pop())


@pytest.mark.parametrize("path", [
    "/static/vendor/..%2F..%2Fweb.py", "/static/vendor/ui-kit/..%2F..%2F..%2Fweb.py",
    "/static/%2E%2E/web.py", "/static/vendor/ui-kit/.hidden", "/static/vendor/ui-kit/fonts",
])
def test_static_subfolders_stay_inside(server, path):
    base, _ = server
    assert call(base, path)[0] == 404


def test_page_css_uses_kit_tokens_only():
    """이 화면의 CSS 는 크기·색을 키트 토큰으로만 — 리터럴 색(hex·rgb)이 없다. ui- 이름을 새로 만들지 않는다."""
    page = (Path(web.STATIC) / "index.html").read_text()
    css = page.split("<style>", 1)[1].split("</style>", 1)[0]
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", css)
    own = set(re.findall(r"\.([a-zA-Z][\w-]*)", css))
    kit = (KIT / "components.css").read_text()
    for name in own:
        if name.startswith("ui-"):
            assert f".{name}" in kit, f"키트에 없는 ui- 이름: {name}"
