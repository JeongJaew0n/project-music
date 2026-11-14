# yt-dlp: 유튜브에서 가끔 `HTTP Error 403: Forbidden` (같은 영상이 됐다 안 됐다)

## 증상
- `unable to download video data: HTTP Error 403: Forbidden`
- 같은 영상·같은 코드로 바로 다시 하면 대개 된다. 2026-11-14 측정: 같은 곡을 9번 받아 3번 403.
- 19초짜리 시험 영상(`jNQXAC9IVRw`)에서는 한 번도 안 났고, 3분대 뮤직비디오에서 났다
  — 짧은 영상 하나로만 시험하면 놓친다. 크롬으로 실제 곡을 넣어 보다가 발견했다.
- 실패하면 `--embed-thumbnail` 용으로 먼저 받은 썸네일(`.webp`)이 저장 폴더에 남는다.

## 원인
yt-dlp 2026.10.26 은 유튜브 정보를 tv 계열 클라이언트로 읽고 JS 챌린지를 deno 로 푼다.
이때 받은 내려받기 주소(googlevideo.com)를 유튜브가 가끔 거절한다(PO Token 없이 받는 주소의
일부가 막히는 것으로 보임). yt-dlp 의 `--retries` 는 같은 주소로 다시 묻기만 해서 403 은 그대로다.

## 해결 (`ytmp3/extract.py`)
- 403(·연결 끊김)이면 **정보를 처음부터 다시 읽어** 새 주소로 다시 받는다. 최대 3번.
- 최종 실패 시 이번 실행이 새로 만든, 이 영상 이름으로 시작하는 파일만 지운다
  (저장 폴더가 `~/Downloads` 라 다른 파일은 건드리지 않는다).
- 그래도 계속 나면 `uv lock --upgrade-package yt-dlp && uv sync` 로 yt-dlp 를 올린다.
