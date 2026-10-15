/* ==========================================================================
   RISC-V Book — 공통 스크립트
   - 장 목록(CHAPTERS)과 상단 바·목차 서랍·오른쪽 목차·이전/다음 장 링크
   - 퀴즈, 읽기 진도 저장, 테마 전환
   - 캔버스 애니메이션과 시뮬레이터 조작부를 만드는 작은 도우미 함수들
   각 장의 HTML은 <body data-chapter="슬러그"> 만 적어 두면 나머지를 이 파일이 채운다.
   ========================================================================== */
(function () {
  "use strict";

  const SPECIFICATION_ROOT = "https://docs.riscv.org/reference/";
  const UNPRIVILEGED_SPECIFICATION = SPECIFICATION_ROOT + "isa/v20260120/unpriv/";
  const PRIVILEGED_SPECIFICATION = SPECIFICATION_ROOT + "isa/v20260120/priv/";
  const STORAGE_KEY = "riscv-book-progress-v1";
  const THEME_STORAGE_KEY = "riscv-book-theme";
  const PERCENT_TREATED_AS_DONE = 92;

  const CHAPTERS = [
    { slug: "intro", number: "01", part: "Part I · 시작하기", title: "RISC-V란 무엇인가", description: "열린 ISA가 왜 필요했는지, 규격 문서는 어떻게 나뉘는지, 하드웨어와 소프트웨어 사이의 약속을 큰 그림으로 본다.", tags: ["역사", "규격 지도", "simulator"] },
    { slug: "modular", number: "02", part: "Part I · 시작하기", title: "모듈식 ISA: 베이스와 확장", description: "RV64GC 같은 이름은 무엇을 뜻할까. 베이스 ISA 위에 확장을 레고처럼 쌓는 방식과 이름 규칙을 해독한다.", tags: ["ISA 문자열", "Z/S/X 확장", "simulator"] },
    { slug: "registers", number: "03", part: "Part II · 기본 정수 ISA", title: "레지스터와 프로그래머 모델", description: "x0부터 x31, pc, XLEN. 왜 x0는 항상 0이고 플래그 레지스터는 없는가.", tags: ["x0–x31", "ABI 이름", "simulator"] },
    { slug: "encoding", number: "04", part: "Part II · 기본 정수 ISA", title: "명령어 형식과 인코딩", description: "R·I·S·B·U·J 여섯 가지 형식과, 즉시값 비트가 뒤섞여 있는 이유를 비트 단위로 해부한다.", tags: ["R/I/S/B/U/J", "인코더", "simulator"] },
    { slug: "rv32i", number: "05", part: "Part II · 기본 정수 ISA", title: "RV32I 명령어 둘러보기", description: "40개 남짓한 명령으로 모든 프로그램을 짓는다. 산술·비교·분기·메모리 접근을 직접 실행하며 익힌다.", tags: ["에뮬레이터", "의사 명령", "simulator"] },
    { slug: "rv64", number: "06", part: "Part II · 기본 정수 ISA", title: "RV64I, RV32E, 그리고 RV128", description: "64비트로 넓어질 때 무엇이 바뀌고 무엇이 그대로인가. W 명령과 부호 확장 규칙.", tags: ["XLEN", "부호 확장", "simulator"] },
    { slug: "abi", number: "07", part: "Part II · 기본 정수 ISA", title: "호출 규약과 ABI", description: "함수를 부르고 돌아오는 약속. 스택 프레임, 호출자·피호출자 저장 레지스터, 재배치.", tags: ["psABI", "스택", "simulator"] },
    { slug: "pipeline", number: "08", part: "Part II · 기본 정수 ISA", title: "ISA에서 하드웨어로: 파이프라인", description: "RV32I를 5단 파이프라인으로 구현해 보며 ISA 설계 선택이 하드웨어를 어떻게 단순하게 만드는지 본다.", tags: ["5단 파이프라인", "해저드", "simulator"] },
    { slug: "multiply", number: "09", part: "Part III · 표준 확장", title: "M 확장: 곱셈과 나눗셈", description: "MUL·MULH·DIV·REM. 0으로 나눠도 트랩이 없는 이유와 오버플로 규칙.", tags: ["M", "Zmmul", "simulator"] },
    { slug: "atomic", number: "10", part: "Part III · 표준 확장", title: "A 확장과 원자적 연산", description: "LR/SC와 AMO로 여러 코어가 같은 메모리를 안전하게 나눠 쓰는 방법. Zacas·Zabha·Zawrs까지.", tags: ["LR/SC", "AMO", "simulator"] },
    { slug: "memory-model", number: "11", part: "Part III · 표준 확장", title: "RVWMO 메모리 모델", description: "다른 코어에게 내 쓰기는 언제 보이는가. 보존 프로그램 순서, FENCE, 리트머스 테스트, Ztso.", tags: ["RVWMO", "FENCE", "simulator"] },
    { slug: "floating-point", number: "12", part: "Part III · 표준 확장", title: "F·D·Q·Zfh: 부동소수점", description: "IEEE 754 위에 얹은 부동소수점 레지스터와 fcsr, NaN 박싱, 반올림 모드, Zfa·Zfinx·BF16.", tags: ["IEEE 754", "fcsr", "simulator"] },
    { slug: "compressed", number: "13", part: "Part III · 표준 확장", title: "C와 Zc*: 압축 명령어", description: "자주 쓰는 명령을 16비트로 줄여 코드 크기를 25–30% 줄인다. 9가지 압축 형식과 Zcb·Zcmp·Zcmt.", tags: ["RVC", "코드 밀도", "simulator"] },
    { slug: "bit-manipulation", number: "14", part: "Part III · 표준 확장", title: "B 확장과 스칼라 암호", description: "Zba·Zbb·Zbs·Zbc의 비트 조작 명령, 그리고 Zk 스칼라 암호 확장.", tags: ["Zba/Zbb/Zbs", "Zk", "simulator"] },
    { slug: "vector", number: "15", part: "Part III · 표준 확장", title: "V 확장: 벡터 연산", description: "VLEN·SEW·LMUL·vl. 길이에 얽매이지 않는 벡터 프로그래밍과 스트립 마이닝을 눈으로 본다.", tags: ["RVV 1.0", "vsetvli", "simulator"] },
    { slug: "small-extensions", number: "16", part: "Part III · 표준 확장", title: "작지만 중요한 확장들", description: "Zicsr·Zicntr·Zifencei·Zicond·Zihintpause·Zimop·CMO·CFI·Zilsd. 이름이 Z로 시작하는 확장의 세계.", tags: ["Zi*", "CMO", "CFI"] },
    { slug: "privilege", number: "17", part: "Part IV · 특권 아키텍처", title: "특권 모드와 CSR", description: "M·S·U 모드, 하트(hart), 4096개의 CSR 주소 공간과 mstatus·misa 같은 핵심 레지스터.", tags: ["M/S/U", "CSR", "simulator"] },
    { slug: "trap", number: "18", part: "Part IV · 특권 아키텍처", title: "트랩: 예외와 인터럽트", description: "ecall 한 번에 CPU 안에서 벌어지는 일. mtvec·mepc·mcause, 위임, 인터럽트 컨트롤러.", tags: ["mcause", "위임", "simulator"] },
    { slug: "virtual-memory", number: "19", part: "Part IV · 특권 아키텍처", title: "가상 메모리: Sv32부터 Sv57까지", description: "satp와 페이지 테이블 워크, PTE 비트, 슈퍼페이지, Svnapot·Svpbmt·Svinval.", tags: ["Sv39", "TLB", "simulator"] },
    { slug: "memory-protection", number: "20", part: "Part IV · 특권 아키텍처", title: "PMA·PMP·ePMP: 물리 메모리 보호", description: "M 모드가 물리 주소 공간에 울타리를 치는 방법. TOR·NAPOT 영역과 잠금, Smepmp, 포인터 마스킹.", tags: ["PMP", "NAPOT", "simulator"] },
    { slug: "hypervisor", number: "21", part: "Part IV · 특권 아키텍처", title: "H 확장: 하이퍼바이저", description: "VS·VU 모드와 2단계 주소 변환. 게스트 운영체제를 하드웨어가 직접 돌리는 방법.", tags: ["HS/VS", "2단계 변환", "simulator"] },
    { slug: "platform", number: "22", part: "Part V · 생태계", title: "부팅·SBI·플랫폼 규격", description: "전원이 켜진 뒤 리눅스가 뜨기까지. SBI, ACLINT·PLIC·AIA, 디버그·트레이스·IOMMU 규격.", tags: ["OpenSBI", "AIA", "simulator"] },
    { slug: "profiles", number: "23", part: "Part V · 생태계", title: "프로파일: RVA23과 호환성", description: "수십 개의 확장 중 무엇을 반드시 갖춰야 하나. RVI20·RVA20·RVA22·RVA23·RVB23 비교.", tags: ["RVA23", "호환성", "simulator"] },
    { slug: "reference", number: "24", part: "Part V · 생태계", title: "명령어 카드·용어집·종합 퀴즈", description: "검색 가능한 명령어 레퍼런스 카드와 용어집, 책 전체를 돌아보는 종합 퀴즈.", tags: ["레퍼런스", "용어집", "퀴즈"] },
  ];

  /* ------------------------------------------------------------ 경로 계산 */
  const isChapterPage = () => document.body.hasAttribute("data-chapter");
  const rootPath = () => (isChapterPage() ? "../" : "");
  const chapterUrl = (slug) => rootPath() + "chapters/" + slug + ".html";

  /* ------------------------------------------------------------ 테마 */
  function readStoredTheme() {
    try { return localStorage.getItem(THEME_STORAGE_KEY); } catch (error) { return null; }
  }
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
    window.dispatchEvent(new Event("riscv-book-theme-change"));
  }
  function currentThemeIsDark() {
    const explicitTheme = document.documentElement.getAttribute("data-theme");
    if (explicitTheme) return explicitTheme === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function toggleTheme() {
    const nextTheme = currentThemeIsDark() ? "light" : "dark";
    try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch (error) { /* 저장이 막혀 있어도 화면 전환은 된다 */ }
    applyTheme(nextTheme);
  }
  applyTheme(readStoredTheme());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => window.dispatchEvent(new Event("riscv-book-theme-change")));

  /* ------------------------------------------------------------ 읽기 진도 (이 브라우저에만 저장) */
  const progress = {
    load() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { chapters: {} }; } catch (error) { return { chapters: {} }; }
    },
    save(state) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* 저장 실패는 무시 */ }
    },
    update(slug, percent) {
      const state = this.load();
      const previous = state.chapters[slug] || { percent: 0, isDone: false };
      previous.percent = Math.max(previous.percent, percent);
      if (previous.percent >= PERCENT_TREATED_AS_DONE) previous.isDone = true;
      state.chapters[slug] = previous;
      state.lastSlug = slug;
      this.save(state);
    },
    isDone(slug) { const entry = this.load().chapters[slug]; return Boolean(entry && entry.isDone); },
    doneCount() { return Object.values(this.load().chapters).filter((entry) => entry.isDone).length; },
    lastSlug() { return this.load().lastSlug || null; },
    reset() { try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* 무시 */ } },
  };

  /* ------------------------------------------------------------ 아이콘 */
  const LOGO_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)"/><path d="M9 23V9h7a4.5 4.5 0 0 1 0 9h-7" fill="none" stroke="var(--on-accent)" stroke-width="2.6" stroke-linejoin="round"/><path d="M16 18l7 5" stroke="var(--accent-2)" stroke-width="2.8" stroke-linecap="round"/></svg>';
  const MENU_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  const THEME_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg>';
  const SPECIFICATION_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 13h8M8 17h6"/></svg>';

  /* ------------------------------------------------------------ 상단 바와 서랍 */
  function buildChrome() {
    const currentSlug = document.body.getAttribute("data-chapter");
    const currentChapter = CHAPTERS.find((chapter) => chapter.slug === currentSlug);

    const topbar = document.createElement("header");
    topbar.className = "book-topbar";
    topbar.innerHTML =
      '<button class="topbar-button icon-only" id="drawer-toggle" aria-label="목차 열기">' + MENU_ICON + "</button>" +
      '<a class="book-logo" href="' + rootPath() + 'index.html">' + LOGO_SVG + "<span>RISC-V Book</span><small>열린 ISA 해부도감</small></a>" +
      (currentChapter ? '<span class="topbar-chapter">· ' + currentChapter.number + " " + currentChapter.title + "</span>" : "") +
      '<span class="spacer"></span>' +
      '<a class="topbar-button" href="' + SPECIFICATION_ROOT + 'home/index.html" target="_blank" rel="noopener">' + SPECIFICATION_ICON + '<span class="label">공식 규격</span></a>' +
      '<button class="topbar-button icon-only" id="theme-toggle" aria-label="밝게/어둡게 전환">' + THEME_ICON + "</button>" +
      '<div class="reading-progress" id="reading-progress"></div>';
    document.body.prepend(topbar);

    const backdrop = document.createElement("div");
    backdrop.className = "drawer-backdrop";
    const drawer = document.createElement("nav");
    drawer.className = "drawer";
    drawer.setAttribute("aria-label", "전체 목차");
    let drawerHtml = '<a class="book-logo" style="padding:4px 10px 6px" href="' + rootPath() + 'index.html">' + LOGO_SVG + "<span>RISC-V Book</span></a>";
    let lastPart = "";
    CHAPTERS.forEach((chapter) => {
      if (chapter.part !== lastPart) {
        if (lastPart) drawerHtml += "</ul>";
        drawerHtml += "<h4>" + chapter.part + '</h4><ul class="drawer-list">';
        lastPart = chapter.part;
      }
      const classNames = [chapter.slug === currentSlug ? "current" : "", progress.isDone(chapter.slug) ? "is-done" : ""].join(" ").trim();
      drawerHtml += '<li><a class="' + classNames + '" href="' + chapterUrl(chapter.slug) + '"><span class="number">' + chapter.number + "</span><span>" + chapter.title + "</span></a></li>";
    });
    drawer.innerHTML = drawerHtml + "</ul>";
    document.body.append(backdrop, drawer);

    const closeDrawer = () => document.body.classList.remove("drawer-open");
    document.getElementById("drawer-toggle").addEventListener("click", () => document.body.classList.toggle("drawer-open"));
    backdrop.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDrawer(); });
    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  }

  /* ------------------------------------------------------------ 장 페이지 전용: 오른쪽 목차, 진도, 이전/다음 */
  function buildChapterExtras() {
    const currentSlug = document.body.getAttribute("data-chapter");
    const chapterIndex = CHAPTERS.findIndex((chapter) => chapter.slug === currentSlug);
    const main = document.querySelector("main.chapter");
    if (!main) return;

    // 본문과 오른쪽 목차를 나란히 놓기 위해 감싸는 틀을 만든다
    const layout = document.createElement("div");
    layout.className = "page-layout";
    main.parentNode.insertBefore(layout, main);
    layout.appendChild(main);
    const tableOfContents = document.createElement("aside");
    tableOfContents.className = "page-toc";
    const sectionHeadings = [...main.querySelectorAll("section[id] > h2")];
    tableOfContents.innerHTML = "<h5>이 장의 내용</h5>" + sectionHeadings.map((heading) => '<a href="#' + heading.parentElement.id + '">' + heading.textContent + "</a>").join("");
    layout.appendChild(tableOfContents);

    // 지금 읽는 절을 오른쪽 목차에서 강조한다
    const tocLinks = [...tableOfContents.querySelectorAll("a")];
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        tocLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id));
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    sectionHeadings.forEach((heading) => observer.observe(heading.parentElement));

    // 이전/다음 장
    const pager = document.createElement("nav");
    pager.className = "pager";
    const previousChapter = CHAPTERS[chapterIndex - 1];
    const nextChapter = CHAPTERS[chapterIndex + 1];
    if (previousChapter) pager.innerHTML += '<a class="previous" href="' + chapterUrl(previousChapter.slug) + '"><small>← 이전 장</small>' + previousChapter.number + " " + previousChapter.title + "</a>";
    if (nextChapter) pager.innerHTML += '<a class="next" href="' + chapterUrl(nextChapter.slug) + '"><small>다음 장 →</small>' + nextChapter.number + " " + nextChapter.title + "</a>";
    main.appendChild(pager);

    // 스크롤 진도 막대와 읽음 기록
    const progressBar = document.getElementById("reading-progress");
    let isUpdateScheduled = false;
    const updateReadingProgress = () => {
      isUpdateScheduled = false;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const percent = scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 100;
      if (progressBar) progressBar.style.width = percent + "%";
      if (currentSlug) progress.update(currentSlug, percent);
    };
    window.addEventListener("scroll", () => {
      if (isUpdateScheduled) return;
      isUpdateScheduled = true;
      requestAnimationFrame(updateReadingProgress);
    }, { passive: true });
    updateReadingProgress();
  }

  function buildFooter() {
    const footer = document.createElement("footer");
    footer.className = "book-footer";
    footer.innerHTML = 'RISC-V Book · 규격 기준: <a href="' + SPECIFICATION_ROOT + 'home/index.html" target="_blank" rel="noopener">RISC-V Ratified Specifications</a> (ISA Manual v20260120) · ' +
      'RISC-V®는 RISC-V International의 등록 상표입니다. 이 사이트는 비공식 학습 자료입니다.';
    document.body.appendChild(footer);
  }

  /* ------------------------------------------------------------ 퀴즈: .quiz-question 안의 .option 중 data-correct 가 정답 */
  function wireQuizzes() {
    document.querySelectorAll(".quiz").forEach((quiz) => {
      const questions = [...quiz.querySelectorAll(".quiz-question")];
      const scoreLine = document.createElement("div");
      scoreLine.className = "quiz-score";
      quiz.after(scoreLine);
      let correctCount = 0;
      let answeredCount = 0;
      questions.forEach((question) => {
        const options = [...question.querySelectorAll(".option")];
        options.forEach((option) => {
          option.addEventListener("click", () => {
            if (question.classList.contains("answered")) return;
            question.classList.add("answered");
            answeredCount += 1;
            const isCorrect = option.hasAttribute("data-correct");
            if (isCorrect) correctCount += 1;
            option.classList.add(isCorrect ? "correct" : "wrong");
            options.forEach((other) => {
              if (other.hasAttribute("data-correct")) other.classList.add("correct");
              other.disabled = true;
            });
            scoreLine.textContent = questions.length + "문제 중 " + answeredCount + "문제 풂 · 정답 " + correctCount + "개";
          });
        });
      });
    });
  }

  /* ------------------------------------------------------------ 스크롤하면 서서히 나타나는 요소 (.reveal) */
  function wireReveal() {
    const elements = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { elements.forEach((element) => element.classList.add("is-visible")); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.12 });
    elements.forEach((element) => observer.observe(element));
  }

  /* ========================================================================
     시뮬레이터 도우미
     ======================================================================== */

  /** 현재 테마의 색을 캔버스에서 쓰기 위해 CSS 변수에서 읽어 온다. */
  function palette() {
    const style = getComputedStyle(document.documentElement);
    const read = (name) => style.getPropertyValue(name).trim();
    return {
      background: read("--canvas-bg"), page: read("--bg"), elevated: read("--bg-elev"),
      surface: read("--surface"), surface2: read("--surface-2"), border: read("--border"),
      text: read("--text"), dim: read("--text-dim"), faint: read("--text-faint"),
      accent: read("--accent"), accentSoft: read("--accent-soft"),
      gold: read("--accent-2"), goldSoft: read("--accent-2-soft"),
      ok: read("--ok"), okSoft: read("--ok-soft"), warn: read("--warn"), warnSoft: read("--warn-soft"),
      bad: read("--bad"), badSoft: read("--bad-soft"), violet: read("--violet"), violetSoft: read("--violet-soft"),
      teal: read("--teal"), tealSoft: read("--teal-soft"), grid: read("--grid"), onAccent: read("--on-accent"),
      font: read("--font"), mono: read("--mono"),
    };
  }

  /**
   * 고해상도 화면과 창 크기 변화에 맞춰 다시 그려지는 캔버스를 만든다.
   * drawFunction(context, width, height, colors) 은 CSS 픽셀 단위로 그리면 된다.
   * options: { aspectRatio: 높이/너비, minimumHeight, maximumHeight }
   * 반환값의 redraw() 를 부르면 즉시 다시 그린다.
   */
  function createCanvas(canvasElement, drawFunction, options) {
    const settings = Object.assign({ aspectRatio: 0.5, minimumHeight: 220, maximumHeight: 560 }, options || {});
    const context = canvasElement.getContext("2d");
    let width = 0;
    let height = 0;
    function resize() {
      const parentWidth = canvasElement.parentElement.clientWidth || 600;
      width = parentWidth;
      height = Math.round(Math.min(settings.maximumHeight, Math.max(settings.minimumHeight, parentWidth * settings.aspectRatio)));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
      canvasElement.width = Math.round(width * pixelRatio);
      canvasElement.height = Math.round(height * pixelRatio);
      canvasElement.style.height = height + "px";
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      redraw();
    }
    function redraw() {
      const colors = palette();
      context.clearRect(0, 0, width, height);
      context.fillStyle = colors.background;
      context.fillRect(0, 0, width, height);
      drawFunction(context, width, height, colors);
    }
    new ResizeObserver(resize).observe(canvasElement.parentElement);
    window.addEventListener("riscv-book-theme-change", redraw);
    resize();
    return { redraw, context, size: () => ({ width, height }) };
  }

  /**
   * 화면에 보일 때만 돌아가는 애니메이션 반복. update(deltaSeconds) 가 매 프레임 호출된다.
   * 반환값의 stop()/start() 로 멈추거나 다시 돌릴 수 있다.
   * 사용자가 '동작 줄이기'를 켜 두었으면 기본으로 멈춘 상태에서 시작한다.
   */
  function animationLoop(element, update) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let isVisible = true;
    let isRunning = !prefersReducedMotion;
    let previousTime = 0;
    let frameRequest = 0;
    function frame(time) {
      frameRequest = 0;
      const deltaSeconds = previousTime ? Math.min(0.05, (time - previousTime) / 1000) : 0;
      previousTime = time;
      update(deltaSeconds);
      schedule();
    }
    function schedule() {
      if (isRunning && isVisible && !frameRequest) frameRequest = requestAnimationFrame(frame);
      if ((!isRunning || !isVisible) && frameRequest) { cancelAnimationFrame(frameRequest); frameRequest = 0; previousTime = 0; }
    }
    new IntersectionObserver((entries) => { isVisible = entries[0].isIntersecting; previousTime = 0; schedule(); }).observe(element);
    schedule();
    return {
      start() { isRunning = true; schedule(); },
      stop() { isRunning = false; schedule(); },
      isRunning: () => isRunning,
    };
  }

  function roundedRectangle(context, x, y, width, height, radius) {
    const clampedRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + clampedRadius, y);
    context.arcTo(x + width, y, x + width, y + height, clampedRadius);
    context.arcTo(x + width, y + height, x, y + height, clampedRadius);
    context.arcTo(x, y + height, x, y, clampedRadius);
    context.arcTo(x, y, x + width, y, clampedRadius);
    context.closePath();
  }

  /** options: { size, bold, color, align, baseline, mono } */
  function drawText(context, text, x, y, options) {
    const settings = Object.assign({ size: 13, bold: false, color: "#000", align: "left", baseline: "middle", mono: false }, options || {});
    const colors = palette();
    context.font = (settings.bold ? "700 " : "400 ") + settings.size + "px " + (settings.mono ? colors.mono : colors.font);
    context.fillStyle = settings.color;
    context.textAlign = settings.align;
    context.textBaseline = settings.baseline;
    context.fillText(text, x, y);
  }

  /** 화살표가 달린 선. options: { color, width, headSize, dash } */
  function drawArrow(context, fromX, fromY, toX, toY, options) {
    const settings = Object.assign({ color: "#888", width: 2, headSize: 8, dash: null }, options || {});
    const angle = Math.atan2(toY - fromY, toX - fromX);
    context.save();
    context.strokeStyle = settings.color;
    context.fillStyle = settings.color;
    context.lineWidth = settings.width;
    if (settings.dash) context.setLineDash(settings.dash);
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX - Math.cos(angle) * settings.headSize * 0.6, toY - Math.sin(angle) * settings.headSize * 0.6);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(toX, toY);
    context.lineTo(toX - settings.headSize * Math.cos(angle - 0.45), toY - settings.headSize * Math.sin(angle - 0.45));
    context.lineTo(toX - settings.headSize * Math.cos(angle + 0.45), toY - settings.headSize * Math.sin(angle + 0.45));
    context.closePath();
    context.fill();
    context.restore();
  }

  const linearInterpolate = (start, end, fraction) => start + (end - start) * fraction;
  const easeInOut = (fraction) => (fraction < 0.5 ? 2 * fraction * fraction : 1 - Math.pow(-2 * fraction + 2, 2) / 2);
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  /**
   * 분할 버튼(.segmented) 을 연결한다. 버튼마다 data-value 를 적어 둔다.
   * onChange(value) 는 처음 한 번, 그리고 누를 때마다 호출된다.
   */
  function segmented(containerOrId, onChange) {
    const container = typeof containerOrId === "string" ? document.getElementById(containerOrId) : containerOrId;
    const buttons = [...container.querySelectorAll("button")];
    const select = (button, shouldNotify) => {
      buttons.forEach((other) => other.classList.toggle("on", other === button));
      if (shouldNotify) onChange(button.dataset.value);
    };
    buttons.forEach((button) => button.addEventListener("click", () => select(button, true)));
    const initiallySelected = buttons.find((button) => button.classList.contains("on")) || buttons[0];
    select(initiallySelected, true);
    return {
      value: () => (buttons.find((button) => button.classList.contains("on")) || {}).dataset.value,
      set: (value) => { const target = buttons.find((button) => button.dataset.value === String(value)); if (target) select(target, true); },
    };
  }

  /**
   * 슬라이더 <input type=range> 와 옆의 <output> 을 연결한다.
   * format(value) 으로 output 에 보일 글자를 정한다. onChange(value) 는 처음 한 번, 움직일 때마다 호출된다.
   */
  function range(inputOrId, onChange, format) {
    const input = typeof inputOrId === "string" ? document.getElementById(inputOrId) : inputOrId;
    const output = document.getElementById(input.id + "-output");
    const formatValue = format || ((value) => String(value));
    const notify = () => {
      const value = Number(input.value);
      if (output) output.textContent = formatValue(value);
      onChange(value);
    };
    input.addEventListener("input", notify);
    notify();
    return { value: () => Number(input.value), set: (value) => { input.value = value; notify(); } };
  }

  /** 32비트(또는 지정한 폭) 부호 없는 값을 2진수 문자열로. groupSize 마다 공백을 넣는다. */
  function toBinary(value, width, groupSize) {
    const bitWidth = width || 32;
    let text = "";
    for (let bitIndex = bitWidth - 1; bitIndex >= 0; bitIndex -= 1) {
      text += Number((BigInt(value) >> BigInt(bitIndex)) & 1n);
      if (groupSize && bitIndex % groupSize === 0 && bitIndex !== 0) text += " ";
    }
    return text;
  }
  function toHex(value, width) {
    const digitCount = Math.ceil((width || 32) / 4);
    const mask = (1n << BigInt(width || 32)) - 1n;
    return "0x" + (BigInt(value) & mask).toString(16).padStart(digitCount, "0");
  }

  /** 규격 문서 링크를 만든다. volume: "unpriv" | "priv" | 그 밖의 경로 */
  function specificationUrl(volume, page, anchor) {
    const base = volume === "unpriv" ? UNPRIVILEGED_SPECIFICATION : volume === "priv" ? PRIVILEGED_SPECIFICATION : SPECIFICATION_ROOT + volume;
    return base + (page || "") + (anchor ? "#" + anchor : "");
  }

  function initialize() {
    buildChrome();
    if (isChapterPage()) buildChapterExtras();
    buildFooter();
    wireQuizzes();
    wireReveal();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();

  window.RiscvBook = {
    CHAPTERS, SPECIFICATION_ROOT, UNPRIVILEGED_SPECIFICATION, PRIVILEGED_SPECIFICATION,
    progress, palette, createCanvas, animationLoop, roundedRectangle, drawText, drawArrow,
    linearInterpolate, easeInOut, clamp, segmented, range, toBinary, toHex, specificationUrl,
    chapterUrl, currentThemeIsDark,
  };
})();
