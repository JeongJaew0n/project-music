"""웹 화면 자동 점검 — 헤드리스 Chrome 으로 폭 셋 × 라이트·다크 × 화면 넷을 잰다 (tests/ui/screen.mjs).

Chrome 이나 node 가 없으면 건너뛴다. Chrome 은 파이프로만 붙는다(디버깅 포트를 열지 않는다).
서버는 시험 모드(소리 끔)로, [::1] 에 띄운다.
"""

import json
import os
import shutil
import subprocess
import threading
import urllib.request
from pathlib import Path

import pytest

from songcut import cut_song
from ytmp3 import Extracted, ExtractError
from ytmp3 import web

HERE = Path(__file__).parent
CHROMES = [os.environ.get("CHROME"), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
           "/Applications/Chromium.app/Contents/MacOS/Chromium"]

pytestmark = [
    pytest.mark.screen,
    pytest.mark.skipif(shutil.which("node") is None, reason="node 없음"),
    pytest.mark.skipif(not any(c and Path(c).exists() for c in CHROMES), reason="Chrome 없음"),
]

LONG = "아주 긴 제목의 시험 곡 — Official Music Video (4K Remaster) [Live at Somewhere Very Far Away 2026]"


@pytest.fixture
def screen_server(tmp_path, make_song, monkeypatch):
    out, cuts = tmp_path / "downloads", tmp_path / "cuts"
    song = make_song(out / f"{LONG}.mp3")
    make_song(out / "짧은 곡.mp3")
    cut_song(song, 1, 3, out=cuts)

    def fake_extract(url, out_dir, progress=None):
        if "bad" in url:
            raise ExtractError("볼 수 없는 영상입니다 (비공개·삭제·지역 제한): 시험")
        return Extracted(url, LONG, out_dir / f"{LONG}.mp3", 7.5, already_existed=True)

    monkeypatch.setattr(web, "extract_mp3", fake_extract)
    srv = web.make_server("::1", 0, out, cuts_dir=cuts, test_mode=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://[::1]:{srv.server_address[1]}"
    for url in ("https://youtu.be/bad", "https://youtu.be/ok"):  # 받기 화면에 실패 카드·끝난 카드
        req = urllib.request.Request(base + "/api/jobs", data=json.dumps({"url": url}).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        urllib.request.urlopen(req).read()
    yield base
    srv.shutdown()
    srv.server_close()


def test_screen_sizes_contrast_targets_and_flow(screen_server):
    r = subprocess.run(["node", str(HERE / "ui" / "screen.mjs"), screen_server],
                       capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stderr
    result = json.loads(r.stdout.strip().splitlines()[-1])
    checked = result["checked"]
    assert not any(f.startswith("실행:") for f in result["failures"]), "\n".join(result["failures"])
    assert checked["pages"] == 3 * 2 * 4 and checked["flows"] == 3, checked
    assert checked["targets"] > 100 and checked["texts"] > 200, checked
    assert result["failures"] == [], "\n".join(result["failures"])
