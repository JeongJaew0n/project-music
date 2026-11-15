# project-music

AI 로 깔끔한 음원을 뽑아내는 작업 공간. 지금은 **유튜브 → mp3 추출**(`ytmp3/`)과 **구간 자르기**(`songcut/`)가 있다.
이전 작업(Soundalike·musickit, 2026-10)은 `~/my/Dev/project-music-old-20261114/` 로 옮겨 두었다.

## 작업실 (`studio/`, git 제외)
- `studio/downloads/` 받은 곡(원본 mp3) — `ytmp3`·`ytmp3-web` 의 기본 저장 위치.
- `studio/works/` 작업 결과 — 음악 작업(AI 등) 결과는 여기에, 작업 종류별 하위 폴더로. 받은 곡과 섞지 않는다.
  - `studio/works/cuts/` 잘라낸 곡 (songcut).
- 경로는 `shared/paths.py` 한 곳에서 정한다. 용어는 `docs/glossary/README.md`.
- `~/Downloads` 등 macOS 보호 폴더를 기본값으로 쓰지 않는다 — LaunchAgent 로 도는 서버가 TCC 권한 창에서 멈춘다.

## ytmp3
- 화면: `uv run ytmp3-web` ([::1]:8765, `--host`·`--port`·`--no-open`·`-o` 기본 저장 폴더·`--cuts` 잘라낸 곡 폴더·`--fixed-out`·`--no-reveal`·`--test-mode` 소리 끔). 받기와 구간 자르기가 한 화면이다. 표준 라이브러리 http.server. Python 수정 후 재시작, `static/` 은 새로고침만.
- **127.0.0.1 에 바인딩하지 않는다.** 이 맥의 tailscaled(userspace)가 tailnet 에서 온 연결을 127.0.0.1:<포트> 로 넘겨, 인증 없는 이 앱이 tailnet 전체(회사 컴퓨터 포함)에 열린다. 기본 `::1` 을 지킨다.
- 홈 서버(tailnet-home): LaunchAgent `com.jjw.ytmp3` 가 [::1]:8740 으로 띄우고 `/apps/ytmp3/` 로 proxy 한다(세션마스터가 관리). 폰 주소 http://jjwui-macbookpro.tailb5e88c.ts.net/apps/ytmp3/, 맥에서는 http://localhost:8700/apps/ytmp3/. 코드를 고치면 `launchctl kickstart -k gui/$(id -u)/com.jjw.ytmp3`. 로그 `~/Library/Logs/ytmp3-server.log`. proxy 요청(X-Forwarded-*)은 저장 폴더 변경·Finder 열기가 막힌다. POST 는 JSON + 같은 출처만 받는다.
- 명령줄: `uv run ytmp3 <URL> [<URL> ...] [-o 폴더]` — 기본 저장 폴더 `studio/downloads/`, 파일 이름은 `<영상 제목>.mp3`.
- 함수: `from ytmp3 import extract_mp3` → `Extracted(url, title, path, duration, already_existed)`. 실패는 `ExtractError`(한국어 메시지).
- yt-dlp(파이썬 의존성) + ffmpeg. 유튜브 쪽이 바뀌어 깨지면 `uv lock --upgrade-package yt-dlp && uv sync`.
- yt-dlp 는 유튜브용 JS 런타임으로 deno 를 쓴다(`brew install deno`).

## songcut (구간 자르기)
- 사람: 웹 화면의 "받은 곡" → 자르기 → 파형에서 끌어 구간 선택, 손잡이로 다듬기, 시간 입력, 구간 듣기, 페이드 → 잘라서 저장.
- AI·명령줄: `uv run songcut info <곡> [--json]` 으로 길이·초당 소리 크기(dBFS)·조용한 구간을 보고 고른 뒤
  `uv run songcut cut <곡> -s 1:23 -e 2:05 [--fade-in 초] [--fade-out 초] [-o 폴더|파일.mp3/.wav/.flac] [--json]`.
  `<곡>` 은 경로 또는 `studio/downloads/` 안의 파일 이름. 끝이 음수면 곡 끝에서 거꾸로. 실패하면 종료 코드 1, `--json` 이면 `{"error"}`.
- 함수: `from songcut import cut_song, analyze, peaks` → `Cut(source, path, start, end)`. 실패는 `CutError`.
- 다시 인코딩한다(mp3 V0, 태그·앨범아트 유지, 제목에 구간). 원본은 건드리지 않고, 같은 이름이 있으면 ` (2)`.
- 웹 API(`/api/songs`, `/api/cuts`)는 `ytmp3/web.py` 머리 주석. 파일 이름은 폴더 바로 안 것만 받는다.

## 시험
- `uv run pytest -q` — 단위 시험.
- `YTMP3_NETWORK=1 uv run pytest -q` — 실제 유튜브에서 19초 영상을 받아 확인까지.
- 화면은 크롬(claude-in-chrome)으로 직접 시험한다 — 서버를 `--test-mode -o <scratchpad> --cuts <scratchpad>` 로 띄워 `studio/` 를 더럽히지 않는다. **`--test-mode` 필수** — 소리가 스피커로 나가면 안 된다(사용자 요청). 화면 위 "시험 모드" 띠를 확인하고 시작. 짧은 시험 영상만 쓰지 말고 실제 곡 길이 영상도 넣어 본다(403 은 긴 영상에서 났다).
- 시험으로 저장 폴더에 만든 파일은 끝나면 정리한다.

## 구조

| 경로 | 책임 |
|---|---|
| `ytmp3/` | 유튜브 링크 → mp3 (FeatureGroup). `extract.py` 엔진 · `__main__.py` 명령줄 · `web.py` + `static/` 화면(구간 자르기 화면도 여기) |
| `songcut/` | 구간 자르기 (FeatureGroup). `cut.py` 자르기·시간 해석 · `analyze.py` 소리 크기·조용한 구간·파형 · `__main__.py` 명령줄 |
| `shared/` | 여러 FeatureGroup 이 함께 쓰는 것. `paths.py` 작업실 경로 |
| `tests/` | 시험 |
| `docs/` | 계획·용어·문제 해결 기록 |

- FeatureGroup 하나는 최상위 패키지 하나다. 새 FeatureGroup 은 최상위 패키지로 만든다.
- 파일이 늘면 이 절을 고친다.

## 프로젝트 규칙 (jjw-app-init, 2026-11-14 확정)

### git
- author: `HeLLo2 <popt0@naver.com>` — `git config --local` 로 설정돼 있다. 커밋 전 `git config user.email` 로 확인한다.
- 커밋·푸시: 전자동 — 작업 단위가 끝나고 시험이 통과하면 묻지 않고 커밋하고, 원격(`origin`)이 있으면 바로 푸시한다. 사용자가 2026-11-14 에 이 프로젝트 전체에 대해 지속 승인했다. 커밋 전에 `git status` 로 비밀·데이터 파일이 올라가지 않는지(.gitignore) 확인한다. 첫 커밋은 사용자가 시킬 때 한다.
- 브랜치: main 고정 — 브랜치를 만들지 않고 main 에서 바로 작업·커밋한다.
- **예외 — 리뷰는 자동 커밋·푸시하지 않는다.** 코드리뷰·리뷰 문서, 그리고 리뷰에서
  나온 수정은 위 정책이 '전자동'이어도 사람이 읽고 판단한 뒤에 커밋한다.
  리뷰는 사실이 아니라 의견이고, 틀린 의견이 먼저 기록에 박히면 되돌리기 어렵다.

### docs
- 여러 단계짜리 작업은 코드를 건드리기 전에 `docs/plans/<slug>/` 에 계획을 먼저 쓴다.
- 원인 찾는 데 시간이 걸린 오류는 `docs/troubleshootings/` 에 남긴다.
  원인이 라이브러리·런타임·OS 에 있으면 `reusable/`, 이 프로젝트의 코드·설정에
  있으면 `project-specific/`.
- 도메인 용어를 새로 만들거나 이름을 바꾸면 `docs/glossary/README.md` 를 먼저 고치고
  코드를 그 이름에 맞춘다. 코드만 바꾸면 용어집이 거짓말이 된다.

### 버전
- **0.x.x 에 머문다. 1.0.0 으로 올리지 않는다.** 내부에서 쓰는 앱이라 공개 API 안정성을
  약속하지 않는다. semver 규격이 `0.y.z` 를 "initial development, 공개 API 를 안정적으로
  보지 않는다" 로 정의하는 것과 같은 자리다.
- 규칙은 **Semantic Versioning** 을 따르되 0.x 구간의 관례를 쓴다.

  | 변경 | 올리는 자리 | 예 |
  |---|---|---|
  | 호환이 깨지는 변경 | **MINOR** (0.y) | `0.3.4` → `0.4.0` |
  | 기능 추가 (호환 유지) | MINOR | `0.3.4` → `0.4.0` |
  | 버그 수정·내부 정리 | PATCH | `0.3.4` → `0.3.5` |

  1.x 에서는 호환 깨짐이 MAJOR 를 올리지만, **0.x 에는 올릴 MAJOR 가 없다.** 그래서
  MINOR 가 그 역할을 대신한다. 이건 semver 규격 본문이 아니라 0.x 구간의 **관례**다
  (Cargo 등이 쓰는 방식).
- 초기값은 `0.1.0` 이다.
- 번호는 `pyproject.toml` 의 `[project] version` 에만 둔다. **두 군데에 적지 않는다.**
- 버전을 올린 커밋에는 무엇이 올랐는지 한 줄 적는다. 번호만 바뀌면 나중에 왜 올렸는지
  알 수 없다.

### 설계
- 기능 묶음 단위는 **FeatureGroup** 이다. 새 기능은 기존 FeatureGroup 에 넣을지
  새 FeatureGroup 을 만들지 먼저 정하고 시작한다. 코드의 디렉터리·타입 이름도 이 말을 쓴다.
