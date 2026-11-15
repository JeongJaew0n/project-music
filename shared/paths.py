"""작업실(studio/) 폴더 배치. 용어는 docs/glossary/README.md.

studio/            프로젝트 안 데이터 폴더 (git 제외)
├── downloads/     받은 곡 — 유튜브에서 받은 mp3 원본
└── works/         작업 결과 — 받은 곡을 다듬거나 새로 만든 것
    └── cuts/      잘라낸 곡 (songcut)

~/Downloads 를 쓰지 않는 이유: 웹 서버는 LaunchAgent 로 백그라운드에서 도는데, 그 python 에는
macOS 개인정보 보호(TCC) 권한이 없어 ~/Downloads·~/Documents·~/Desktop 을 여는 순간 권한 창을
띄운 채 멈춘다. 프로젝트 폴더는 보호 대상이 아니다.

여러 FeatureGroup 이 함께 쓰므로 공용 패키지(shared)에 둔다.
"""

from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
STUDIO_DIR = PROJECT_DIR / "studio"
DOWNLOADS_DIR = STUDIO_DIR / "downloads"
WORKS_DIR = STUDIO_DIR / "works"
CUTS_DIR = WORKS_DIR / "cuts"
