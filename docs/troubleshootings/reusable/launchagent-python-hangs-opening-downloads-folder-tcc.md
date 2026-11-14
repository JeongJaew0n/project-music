# LaunchAgent 로 띄운 python 이 ~/Downloads 를 열다가 멈춤 (오류 없음, 무한 대기)

## 증상
- 터미널에서 `uv run ytmp3-web` 으로 띄우면 잘 되는데, LaunchAgent 로 띄운 같은 서버는 작업이 "시작"에서 영원히 멈춘다.
- 예외도 로그도 없다. yt-dlp·ffmpeg 하위 프로세스도 안 생긴다.

## 원인 찾기
`sample <pid> 1` 로 스택을 뜨면 작업 스레드가 여기서 멈춰 있다:
```
os_listdir → __opendir2 → __open_nocancel   (com.apple.TCC 로드됨)
```
macOS 개인정보 보호(TCC)는 `~/Downloads`·`~/Documents`·`~/Desktop` 을 처음 열 때 사용자에게 묻는다.
터미널에서 띄우면 터미널 앱이 이미 받은 권한을 쓰지만, launchd 가 띄운 python 은 권한이 없어
권한 창을 띄운 채 시스템 호출이 답을 기다리며 막힌다(거부되면 PermissionError).

## 해결
- 백그라운드 서버는 TCC 보호 폴더에 쓰지 않는다. ytmp3 는 프로젝트 안 `studio/downloads/` 에 저장한다 (`ytmp3/paths.py`).
- 꼭 보호 폴더를 써야 하면 시스템 설정 > 개인정보 보호 및 보안 > 파일 및 폴더 에서 그 python 실행 파일에 권한을 줘야 하는데,
  uv 가 python 을 바꾸면 경로가 달라져 다시 줘야 한다.
