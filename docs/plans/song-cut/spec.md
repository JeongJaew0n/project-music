# spec — 음악 구간 자르기 (songcut)

## 범위

1. 엔진 `songcut.cut_song(source, start, end, *, fade_in, fade_out, out)` → `Cut`
   - 입력: mp3/m4a/wav/flac/opus/webm 등 ffmpeg 가 읽는 오디오. 출력: mp3(V0)·wav·flac (확장자로 정함).
   - mp3 로 낼 때 원본의 태그와 앨범아트를 옮기고, 제목에 구간을 붙인다.
   - 기본 저장: `studio/works/cuts/<원본 이름> [1m23s-2m05s].<확장자>`.
2. 분석 `songcut.analyze(source)` → 길이, 초당 소리 크기(dBFS), 조용한 구간. `peaks(source, n)` → 파형.
3. 명령줄 `songcut`
   - `songcut cut <파일> --start 1:23 --end 2:05 [--fade-in 초] [--fade-out 초] [-o 파일|폴더] [--json]`
   - `songcut info <파일> [--json]`
   - `<파일>` 이 없는 경로인데 이름만 주면 `studio/downloads/` 에서 찾는다.
4. 웹 화면(ytmp3-web)
   - 받은 곡 목록, 곡을 골라 파형 위에서 구간 선택(끌기·손잡이)·시간 입력·"지금 위치"·구간 듣기·페이드,
     잘라서 저장, 잘라낸 곡 목록(듣기·내려받기).
   - API: `GET /api/songs`, `GET /api/songs/<이름>/audio|peaks`, `GET /api/cuts`,
     `GET /api/cuts/<이름>/audio`, `POST /api/cuts`.
   - 파일 이름은 폴더 안 이름만 받는다(경로 이동 막기). POST 는 기존과 같은 출처·JSON 검사.

## 완료 조건

- 단위 시험: 시간 해석, 실제 ffmpeg 로 만든 소리를 잘라 길이 확인, 조용한 구간 찾기, 웹 API.
- 실제 받은 곡으로 명령줄·화면 둘 다 확인(크롬). 홈 서버 경로에서도 자르기 동작.
