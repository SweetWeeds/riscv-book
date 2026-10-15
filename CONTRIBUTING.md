# RISC-V Book 작성 규칙

이 문서는 `chapters/*.html` 을 새로 쓰거나 고칠 때 지켜야 할 약속이다.
**본보기는 `chapters/intro.html` 이다.** 새 장을 쓰기 전에 반드시 그 파일 전체를 읽고 구조·말투·그림 밀도를 맞춘다.

## 1. 파일 구조

- 정적 사이트다. 빌드 도구 없이 GitHub Pages 에 그대로 올라간다.
- `assets/css/style.css` — 공통 스타일과 색 토큰. 장마다 필요한 작은 스타일은 그 장의 `<style>` 에 둔다.
- `assets/js/book.js` — 장 목록(`RiscvBook.CHAPTERS`), 상단 바·목차·이전/다음 장·퀴즈·진도 저장, 캔버스/조작부 도우미.
- `assets/js/riscv.js` — RV32IM 인코더·디코더·어셈블러·에뮬레이터 (`window.Riscv`).
- 공통 파일(`style.css`, `book.js`, `riscv.js`)은 **수정하지 않는다.** 필요한 것이 있으면 장 안에서 해결한다.

## 2. 장 HTML 뼈대

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NN 장 제목 · RISC-V Book</title>
<meta name="description" content="한두 문장 요약">
<link rel="icon" href="../assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../assets/css/style.css">
<script src="../assets/js/book.js"></script>
<script src="../assets/js/riscv.js"></script>   <!-- 필요할 때만 -->
<style> /* 이 장 전용 스타일 */ </style>
</head>
<body data-chapter="슬러그">            <!-- book.js 의 CHAPTERS[].slug 와 같아야 한다 -->
<main class="chapter">
  <header class="chapter-hero"> eyebrow · h1 · p.lead · ul.objectives · div.spec-meta(규격 링크) </header>
  <section id="영문-id"><h2>…</h2> … </section>   <!-- 6~9개 절 -->
  <section class="keypoints" id="summary"><h2>핵심 정리</h2><ol>…</ol></section>
  <section id="quiz"><h2>확인 퀴즈</h2><div class="quiz"> .quiz-question × 6~8 </div></section>
  <section id="references"><h2>더 읽을거리</h2><ul class="references">…</ul></section>
</main>
<script> /* 시뮬레이터 코드 (IIFE 로 감싼다) */ </script>
</body>
</html>
```

상단 바, 목차 서랍, 오른쪽 목차, 이전/다음 장 링크, 꼬리말은 `book.js` 가 자동으로 붙인다. 직접 쓰지 않는다.

## 3. 분량과 시각 자료 (가장 중요)

- 한 장에 **SVG 그림 6개 이상**, **움직이는 그림(SVG 애니메이션 또는 캔버스 애니메이션) 2개 이상**, **직접 조작하는 시뮬레이터 2개 이상**.
- 글보다 그림이 먼저다. 비트 배치, 레지스터, 메모리, 흐름은 반드시 그림으로 보여 준다.
- 그림마다 `<figcaption><b>그림 N-M.</b> …</figcaption>` 으로 번호를 붙인다 (N = 장 번호).
- 표(`.table-wrap > table`), 알림 상자(`.callout.tip|warn|deep|history|spec`), 코드 상자(`.codebox`)를 적극 쓴다.
- `.callout.spec` 에는 규격 원문을 **짧게**(두세 문장 이내) 영어로 인용하고 원문 링크를 붙인다.

### SVG 그림 규칙

- `<figure class="diagram"><div class="scroll-x"><svg viewBox="…">…</svg></div><figcaption>…</figcaption></figure>`
  (`.scroll-x` 는 좁은 화면에서 가로 스크롤을 준다. 아주 작은 그림이면 생략 가능)
- **색은 직접 쓰지 말고 클래스나 CSS 변수만 쓴다.** 다크 모드가 자동으로 맞는다.
  - 채움: `f-elev f-surface f-surface-2 f-accent f-accent-soft f-gold f-gold-soft f-ok-soft f-warn-soft f-bad-soft f-violet-soft f-teal-soft`
  - 글자: `t t-dim t-faint t-mono t-accent t-gold t-ok t-warn t-bad t-violet t-teal t-on-accent t-bold`
  - 선: `s-line s-accent s-gold s-ok s-bad` (+ `s-dashed`)
  - 직접 지정이 필요하면 `fill="var(--accent)"` 처럼 변수로.
- 움직임:
  - `class="flow-dash"` 를 선에 붙이면 점선이 흐른다 (데이터 흐름 방향 표현).
  - `class="pulse"` 는 깜빡임, `class="blink-highlight"` 는 채움 강조.
  - 점이 경로를 따라 움직이게: `<circle r="5" fill="var(--accent-2)"><animateMotion dur="2s" begin="-0.5s" repeatCount="indefinite" path="M… "/></circle>`
    (`begin` 을 **음수**로 줘야 시작 전 원점(0,0)에 점이 보이지 않는다)
  - 문서 안에서 `id`(marker, path 등)는 장 전체에서 고유해야 한다. 그림마다 접두어를 붙인다 (`id="trap-arrow"`).
- 글자 크기: viewBox 너비 800~900 기준으로 본문 13~15px, 제목 16~20px. 글자가 상자를 넘지 않게 좌표를 신경 쓴다.
- 스크롤하면 서서히 나타나게 하려면 블록 요소에 `class="reveal"`.

### 시뮬레이터 규칙

```html
<div class="sim" id="…">
  <div class="sim-head"><span class="sim-tag">SIMULATOR</span><h3>이름</h3></div>
  <div class="sim-view"><canvas id="…"></canvas></div>     <!-- 또는 <div class="sim-pad">HTML 내용</div> -->
  <div class="step-description" id="…">단계 설명</div>        <!-- 선택 -->
  <div class="sim-controls">
    <div class="control"><span>모드</span><div class="segmented" id="…"><button data-value="a" class="on">A</button><button data-value="b">B</button></div></div>
    <label class="control"><span>값 <output id="slider-output"></output></span><input type="range" id="slider" min="0" max="10" value="3"></label>
    <div class="control"><span>실행</span><div class="button-row"><button class="button primary" id="…">한 단계</button><button class="button" id="…">처음으로</button></div></div>
  </div>
  <div class="sim-readout"><div class="stat"><span class="key">이름</span><span class="value" id="…">값</span></div></div>
  <div class="sim-note">해볼 것 문장 (앞에 "해볼 것 ·" 이 자동으로 붙는다)</div>
</div>
```

- 태그 종류: `SIMULATOR`(조작), `<span class="sim-tag animation">ANIMATION</span>`(재생형), `EXPLORER`(탐색).
- 캔버스는 `RiscvBook.createCanvas(canvas, (context, width, height, colors) => {…}, { aspectRatio, minimumHeight, maximumHeight })` 로 만든다.
  `colors` 는 테마 색(`colors.accent`, `colors.gold`, `colors.text`, `colors.dim`, `colors.border`, `colors.surface`, `colors.elevated`, `colors.accentSoft`, `colors.goldSoft`, `colors.ok`, `colors.bad`, `colors.warn`, `colors.violet`, `colors.teal` …)이다. 반환값의 `redraw()` 로 다시 그린다.
- 애니메이션은 `RiscvBook.animationLoop(element, (deltaSeconds) => {…})` — 화면에 보일 때만 돈다. `stop()/start()` 제공.
- 그리기 도우미: `RiscvBook.roundedRectangle(context, x, y, w, h, r)`, `RiscvBook.drawText(context, text, x, y, { size, bold, color, align, baseline, mono })`, `RiscvBook.drawArrow(context, x1, y1, x2, y2, { color, width, headSize, dash })`, `linearInterpolate`, `easeInOut`, `clamp`.
- 조작부: `RiscvBook.segmented(idOrElement, (value) => …)`, `RiscvBook.range(id, (value) => …, format)` (`<output id="{id}-output">` 와 자동 연결), `RiscvBook.toBinary(value, width, groupSize)`, `RiscvBook.toHex(value, width)`.
- 반복 셀은 `.cell-grid > .cell` (`.cell-name`, `.cell-value`, 상태 `.changed .active .zero`), 비트 토글은 `.bit-row > .bit(.on)`.
- 명령어 비트 필드 그림은 `.bitfield > .field.opcode|register|immediate|function|plain` (`flex-grow` 를 비트 수로 준다) 또는 SVG.
- RV32IM 실행이 필요하면 `riscv.js` 를 쓴다:
  - `Riscv.assemble(source)` → `{ words:[{address, word, text, line, source}], labels, errors }`
  - `new Riscv.Machine()` → `.load(programOrSource)`, `.step()` (변경 기록 반환: `registerWrite`, `memoryRead`, `memoryWrite`, `isBranch`, `isBranchTaken`, `nextPc`, `error`), `.run(limit)`, `.registers`(Int32Array), `.pc`, `.memory`, `.output`
  - `Riscv.encode(name, {rd, rs1, rs2, immediate})`, `Riscv.decode(word)` (`fields` 배열 포함), `Riscv.disassemble(word)`, `Riscv.highlightAssembly(source)` (codebox 용 HTML)
  - `Riscv.ABI_NAMES`, `Riscv.INSTRUCTIONS`, `Riscv.FORMAT_FIELDS`, `Riscv.IMMEDIATE_LAYOUTS`, `Riscv.CSR_NAMES`
  - 시스템 호출: `a7=1` 정수 출력, `a7=4` 문자열 출력, `a7=11` 문자 출력, `a7=10` 종료, `a7=93` 코드와 함께 종료
- 좁은 화면(390px)에서도 가로로 넘치지 않아야 한다. 캔버스는 부모 너비를 따르게 두고, 고정 폭이 필요한 내용은 `.scroll-x` 안에 넣는다.

## 4. 코드 작성 규칙 (반드시)

- **식별자는 축약하지 않은 전체 단어로 쓴다.** `ctx`, `w`, `h`, `idx`, `btn`, `el`, `cb`, `val`, `tmp`, `cfg`, `prev`, `cur`, `e`(이벤트) 등 금지.
  → `context`, `width`, `height`, `index`, `button`, `element`, `callback`, `value`, `temporary`, `configuration`, `previous`, `current`, `event`.
  표준 약어(`id`, `url`, `api`, `http`, `json`, `csr`, `pc`, `isa`, `tlb`, `pte` 같은 RISC-V 용어)는 허용.
- 불리언은 `is`/`has`/`should`/`can` 접두어 (`isRunning`, `hasFault`).
- 의미 있는 숫자·문자열은 이름 있는 상수로 뺀다 (`const PAGE_SIZE = 4096;`).
- 복잡한 한 줄 코드와 중첩 삼항 연산자를 피하고 여러 줄로 풀어 쓴다.
- 주석은 "무엇"이 아니라 "왜"를 평이한 한국어로.
- 각 시뮬레이터 스크립트는 `(function () { "use strict"; … })();` 로 감싼다.

## 5. 내용 규칙

- 언어: 한국어. 말투는 intro.html 처럼 "~다" 체. 용어는 처음 나올 때 `<span class="term">한국어</span><span class="english">(English)</span>`.
- 기준 규격: RISC-V ISA Manual **v20260120** (비특권/특권), 그 밖의 규격은 docs.riscv.org 의 비준 버전.
  - 비특권: `https://docs.riscv.org/reference/isa/v20260120/unpriv/<page>.html`
  - 특권: `https://docs.riscv.org/reference/isa/v20260120/priv/<page>.html`
  - 그 밖: `https://docs.riscv.org/reference/<spec>/index.html` (예: `sbi`, `aia`, `rva23`, `abi`, `debug`, `iommu`, `plic`)
- **사실 정확성이 최우선이다.** 인코딩 비트, CSR 주소·비트 위치, 예외 코드, 확장 버전 같은 숫자는 규격 원문을 확인하고 쓴다. 확실하지 않은 숫자는 쓰지 않는다.
- 다른 장을 언급할 때는 `<a href="슬러그.html">N장</a>` 링크로.
- 퀴즈는 `.quiz-question > p + .options > button.option(data-correct 하나) + .quiz-explanation` 구조.
