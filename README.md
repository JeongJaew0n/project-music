# project-music

AI 로 깔끔한 음원을 뽑아내기 위한 작업 공간. 첫 단계는 유튜브에서 mp3 를 뽑는 것.

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
uv run ytmp3 "https://www.youtube.com/watch?v=..."            # ~/Downloads/<제목>.mp3
uv run ytmp3 URL1 URL2 -o ~/Music/inbox                         # 여러 개, 저장 폴더 지정
```

- 가장 좋은 오디오 스트림을 받아 mp3(VBR V0, 약 245kbps)로 바꾸고, 제목·업로더와 썸네일(앨범아트)을 넣습니다.
- 재생목록 링크(`&list=`)여도 그 영상 하나만 받습니다. 같은 이름의 파일이 있으면 다시 받지 않습니다.
- 유튜브가 가끔 내려받기를 403 으로 거절하면 새로 읽어 최대 3번까지 다시 시도합니다.
- 유튜브 원본 오디오가 opus 약 130~160kbps 라서 mp3 로 바꿔도 원본보다 좋아지지는 않습니다.

## 시험

```sh
uv run pytest -q                       # 단위 시험
YTMP3_NETWORK=1 uv run pytest -q       # 실제 유튜브에서 받아 보기까지
```
