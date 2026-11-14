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
    srv = web.make_server("127.0.0.1", 0, tmp_path)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}", tmp_path
    srv.shutdown()
    srv.server_close()


def call(base, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, headers=headers or {},
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
    assert json.loads(call(base, "/api/config")[2]) == {"out_dir": str(out)}


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
