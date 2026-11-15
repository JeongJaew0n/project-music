# project-music

AI 로 깔끔한 음원을 뽑아내기 위한 작업 공간. 지금은 유튜브에서 mp3 를 뽑고, 원하는 구간을 잘라낼 수 있다.

## 준비

```sh
brew install ffmpeg deno uv
uv sync
```

## 유튜브 → mp3

### 화면으로

```sh
uv run ytmp3-web        # http://[::1]:8765 이 브라우저로 열림
```

링크를 붙여넣고 **mp3 뽑기** → 진행률 → 바로 듣기 · Finder 에서 보기 · 경로 복사. 저장 폴더는 화면에서 바꿀 수 있습니다.

### 명령줄로

```sh
uv run ytmp3 "https://www.youtube.com/watch?v=..."            # studio/downloads/<제목>.mp3
uv run ytmp3 URL1 URL2 -o ~/Music/inbox                         # 여러 개, 저장 폴더 지정
```

- 가장 좋은 오디오 스트림을 받아 mp3(VBR V0, 약 245kbps)로 바꾸고, 제목·업로더와 썸네일(앨범아트)을 넣습니다.
- 재생목록 링크(`&list=`)여도 그 영상 하나만 받습니다. 같은 이름의 파일이 있으면 다시 받지 않습니다.
- 유튜브가 가끔 내려받기를 403 으로 거절하면 새로 읽어 최대 3번까지 다시 시도합니다.
- 유튜브 원본 오디오가 opus 약 130~160kbps 라서 mp3 로 바꿔도 원본보다 좋아지지는 않습니다.

## 구간 자르기 (songcut)

### 화면으로

`ytmp3-web` 화면 아래 **받은 곡**에서 **자르기** → 파형을 끌어 구간을 고르고, 양 끝 손잡이로 다듬거나 시간을 직접 넣습니다.
**지금 위치로**는 재생 중인 위치를 시작·끝으로 잡습니다. **구간 듣기**로 확인하고 **잘라서 저장**하면 아래 **잘라낸 곡**에 나옵니다.

### 명령줄로 (사람·AI)

```sh
uv run songcut info "곡.mp3"                         # 길이 · 초당 소리 크기 · 조용한 구간
uv run songcut cut "곡.mp3" -s 1:23 -e 2:05          # studio/works/cuts/곡 [1m23s-2m05s].mp3
uv run songcut cut "곡.mp3" -s 0:30 -e -10 --fade-out 2 -o ~/Music/clip.wav
uv run songcut cut "곡.mp3" -s 43 -e 68.5 --json     # 결과를 JSON 으로 (AI 용)
```

- `곡.mp3` 은 경로, 또는 `studio/downloads/` 안의 파일 이름만 줘도 됩니다.
- 시간: `83` · `83.5` · `1:23` · `1:23.5` · `0:01:23`. 끝이 음수면 곡 끝에서 거꾸로(`-10` = 끝나기 10초 전), 없으면 곡 끝까지.
- 다시 인코딩해서 원하는 지점에서 정확히 자릅니다(mp3 V0, 태그·앨범아트 유지). 원본은 그대로 두고, 같은 이름이 있으면 ` (2)` 를 붙입니다.

## 작업실 폴더

```
studio/            (git 제외)
├── downloads/     받은 곡 — 유튜브에서 받은 mp3 원본
└── works/         작업 결과 — 음악 작업 결과물
    └── cuts/      잘라낸 곡
```

## 시험

```sh
uv run pytest -q                       # 단위 시험
YTMP3_NETWORK=1 uv run pytest -q       # 실제 유튜브에서 받아 보기까지
```
