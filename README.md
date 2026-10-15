# RISC-V Book — 그림으로 읽는 RISC-V ISA와 규격

RISC-V International의 공식 비준 규격(Ratified Specifications, ISA Manual **v20260120**)을 따라가며
명령어 비트 하나하나와 CPU 안에서 벌어지는 일을 **그림 · 애니메이션 · 직접 돌려 보는 시뮬레이터**로 풀어 쓴
한국어 인터랙티브 교과서입니다.

- 24개 장: 베이스 ISA → 표준 확장(M·A·F·D·C·B·V·Z*) → 특권 아키텍처(CSR·트랩·가상 메모리·PMP·하이퍼바이저) → 플랫폼·프로파일
- 장마다 SVG 그림, 움직이는 그림, 시뮬레이터, 핵심 정리, 퀴즈
- 브라우저 안에서 동작하는 RV32IM 어셈블러·에뮬레이터 (`assets/js/riscv.js`)
- 빌드 도구 없는 순수 정적 사이트, 다크 모드, 모바일 대응

## 로컬에서 보기

```bash
python3 -m http.server 8000
# http://localhost:8000 접속
```

## GitHub Pages로 배포하기

1. 이 디렉터리를 GitHub 저장소로 올립니다.
   ```bash
   git init && git add . && git commit -m "RISC-V Book"
   git branch -M main
   git remote add origin https://github.com/<계정>/<저장소>.git
   git push -u origin main
   ```
2. 저장소 **Settings → Pages → Build and deployment**에서 Source를 **Deploy from a branch**, 브랜치를 `main` / `/ (root)`로 지정합니다.
3. 잠시 뒤 `https://<계정>.github.io/<저장소>/`에서 열립니다. (`.nojekyll` 파일이 있어 Jekyll 처리 없이 그대로 배포됩니다.)

## 구조

```
index.html              첫 화면 (살아 있는 하트 애니메이션, 전체 목차)
chapters/*.html         24개 장
assets/css/style.css    공통 디자인 토큰과 컴포넌트 (라이트/다크)
assets/js/book.js       장 목록, 내비게이션, 퀴즈, 진도 저장, 캔버스·조작부 도우미
assets/js/riscv.js      RV32IM 인코더·디코더·어셈블러·에뮬레이터
CONTRIBUTING.md         장 작성 규칙
```

## 참고 규격

- [RISC-V Ratified Specifications](https://docs.riscv.org/reference/home/index.html)
- [Unprivileged ISA v20260120](https://docs.riscv.org/reference/isa/v20260120/unpriv/unpriv-index.html)
- [Privileged ISA v20260120](https://docs.riscv.org/reference/isa/v20260120/priv/priv-index.html)

RISC-V®는 RISC-V International의 등록 상표입니다. 이 사이트는 비공식 학습 자료이며, 규범적인 내용은 언제나 공식 규격 원문을 따릅니다.
디자인과 구성은 [ComputerBook](https://computerbook.euiyun.com/)의 인터랙티브 교과서 형식에서 영감을 받았습니다.
