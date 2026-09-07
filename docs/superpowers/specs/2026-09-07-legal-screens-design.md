# 설계: 앱 내 법적 문서 화면

작성일: 2026-09-07
대상: `travel-template-v2` / `index.html`
선행: 컬러 테마 (배포됨), 법적 문서 초안 `docs/legal/*.md` (`e7ecca8`)

이용약관·개인정보처리방침을 앱 안에서 볼 수 있는 화면으로 렌더링하고, 표지와 설정에서 진입할 수 있게 한다. 문서 본문은 `docs/legal/*.md` 를 **단일 원본**으로 두고 런타임에 불러와 렌더한다 (사본 이중관리 안 함).

---

## 1. 범위

**이번에 구현:**
- 화면 2개: `terms`(이용약관), `privacy`(개인정보처리방침)
- 표지(landing) 하단 링크 + 저작권 표기
- 설정(내 정보 및 옵션)에 문서 링크 행 2개
- 로그인 버튼 근처에 동의 고지 문구
- 문서 화면의 "뒤로" 내비게이션

**이번에 제외 (이유):**
- `ecommerce-ko.md`(유료·환불) 화면 — 결제 기능이 없어 노출 시 혼란. 결제 도입 시 같은 패턴으로 `checkout-terms` 화면 추가.
- 로그인 차단형 동의 체크박스 — 우선 고지 문구로. 명시적 체크박스는 법률 자문 후 추가 가능 (§6 참고).
- 문서 다국어화, 마크다운 빌드 파이프라인.

---

## 2. 문서 본문 전달 방식 — 런타임 fetch + 미니 렌더러

- **원본:** `docs/legal/terms-ko.md`, `docs/legal/privacy-ko.md`. GitHub Pages(및 `npx serve`)가 저장소 파일을 그대로 서빙하므로 `fetch('docs/legal/terms-ko.md')` 로 접근 가능.
- **경로:** 상대경로 사용. 배포 URL이 `/travel-template-v2/` 서브패스라 절대경로(`/docs/...`)는 안 됨. `index.html` 기준 상대경로 `docs/legal/…` 로.
- **렌더:** 외부 라이브러리 없이 `renderMarkdown(text)` — 아래 서브셋만 지원:
  - `#`, `##`, `###` → `<h2>`, `<h3>`, `<h4>` (문서 안이므로 h1은 안 씀)
  - `**굵게**` → `<strong>`
  - `` `코드` `` → `<code>`
  - `- ` 목록 → `<ul><li>` (연속 줄 묶음)
  - `| … | … |` + 다음 줄 `|---|` → `<table>` (헤더 1행 + 본문). `<div class="legal-table">` 로 감싸 `overflow-x:auto`
  - `> ` → `<blockquote>` (연속 줄 묶음)
  - `---` (단독 줄) → `<hr>`
  - `[텍스트](URL)` → `<a href target=_blank rel="noopener">`
  - 빈 줄로 구분된 나머지 → `<p>`
  - **모든 텍스트 노드는 이스케이프** 후 인라인 규칙 적용 (XSS 방지). 원본은 우리 저장소 파일이지만 습관적으로 이스케이프.
- **선행 처리:** 렌더 전에 파일 첫 줄이 `# ` 로 시작하면 그 한 줄만 제거 (문서 제목은 화면 크롬의 `.legal-title` 이 제공). 그 아래 메타데이터 블록(`**서비스명:**` 등)·초안 경고 blockquote·`---` 은 그대로 렌더된다 — 사용자가 프로덕션 배포 전 `.md` 에서 직접 다듬는다(실제 날짜 기입, "초안입니다" 경고 삭제 등). 즉 `.md` 가 곧 화면.
- **로딩·실패 처리:**
  - 화면 진입 시 `#legalBody` 에 "불러오는 중…" 표시 → fetch 성공하면 렌더 교체.
  - fetch 실패(오프라인·404) → "문서를 불러오지 못했어요." + GitHub 원본 링크(`https://github.com/emalration2-sketch/travel-template-v2/blob/main/docs/legal/terms-ko.md`) 표시.
  - 한 번 받은 문서는 메모리에 캐시(`legalCache[name]`)해서 재진입 시 재요청 안 함.

## 3. 화면 마크업

`section[data-screen="settings"]` 뒤에 두 섹션 추가. 구조는 동일, `id`/data만 다름:

```html
<section data-screen="terms" hidden>
  <div class="v2-wrap legal">
    <button class="set-back" data-action="legal-back">← 뒤로</button>
    <h2 class="legal-title">이용약관</h2>
    <div class="legal-body" id="legalBody-terms"></div>
  </div>
</section>
<section data-screen="privacy" hidden>
  <div class="v2-wrap legal">
    <button class="set-back" data-action="legal-back">← 뒤로</button>
    <h2 class="legal-title">개인정보처리방침</h2>
    <div class="legal-body" id="legalBody-privacy"></div>
  </div>
</section>
```

## 4. 진입점

### 4-1. 표지(landing) 하단

`#landingLoginBtn` 다음에 추가:

```html
<p class="landing-consent">계속하면 <a data-action="open-legal" data-doc="terms">이용약관</a> 및
  <a data-action="open-legal" data-doc="privacy">개인정보처리방침</a>에 동의하게 됩니다.</p>
<footer class="landing-foot">
  <a data-action="open-legal" data-doc="terms">이용약관</a>
  <span aria-hidden="true">·</span>
  <a data-action="open-legal" data-doc="privacy">개인정보처리방침</a>
  <div class="landing-copy">© 2026 Travel Template</div>
</footer>
```

`.landing-consent` 는 버튼 바로 아래(작게, `--ink-faint`), `.landing-foot` 는 화면 하단. `.landing` 이 `text-align:center` 라 그대로 가운데 정렬됨.

### 4-2. 설정 화면

`#setTheme` 행과 `#setLogout` 사이에 행 2개 추가 (기존 `.set-row` 패턴):

```html
<div class="set-row" data-action="open-legal" data-doc="terms"><span>이용약관</span><span class="set-chev">›</span></div>
<div class="set-row" data-action="open-legal" data-doc="privacy"><span>개인정보처리방침</span><span class="set-chev">›</span></div>
```

## 5. 내비게이션

- 전역 `let legalFrom = 'landing';`
- 액션 `open-legal`: `legalFrom = currentScreen; openLegal(el.dataset.doc);`
  - `openLegal(doc)` → `showScreen(doc)` + 아직 로드 안 됐으면 fetch·렌더, 스크롤 최상단.
- 액션 `legal-back`: `showScreen(legalFrom === 'settings' ? 'settings' : (currentUser ? 'settings' : 'landing'))`.
  - 즉 설정에서 왔으면 설정으로, 표지에서 왔으면 표지로. (안전장치로 로그인 상태도 확인.)
- 클릭 위임: `open-legal`/`legal-back` 은 `[data-action]` 체인에 추가. `open-legal` 은 `<a>`/`<div>` 양쪽에 붙으므로 `btn.dataset.doc` 로 문서 구분. `<a>` 에 `href` 없음 → 기본 동작 없음, `e.preventDefault()` 불필요하나 `<a>` 라면 넣어두기.

## 6. 동의 처리 (결정 필요 항목)

- **이번 구현:** 표지에 고지 문구(§4-1 `.landing-consent`)만. Google 로그인 버튼을 누르는 행위로 약관·방침에 동의한 것으로 간주.
- **더 방어적인 대안(후속):** 로그인 버튼 위에 체크박스("[✓] 이용약관 및 개인정보처리방침에 동의합니다") — 체크 전 버튼 비활성. 개인정보는 명시 동의가 원칙이라, 지인 대상 클로즈드 테스트를 넘어 공개 런칭 시 이 방식 권장. 법률 자문 결과에 따라 결정. 스펙에는 고지 문구만 포함하고, 체크박스는 별도.

## 7. 스타일

```css
.legal{padding-top:16px; padding-bottom:60px;}
.legal-title{font-family:'Fraunces',serif; font-size:20px; font-weight:700; color:var(--ink); margin:6px 0 14px;}
.legal-body{font-size:13px; line-height:1.75; color:var(--ink-soft);}
.legal-body h2{font-size:15px; font-weight:700; color:var(--ink); margin:22px 0 8px;}
.legal-body h3{font-size:13.5px; font-weight:700; color:var(--ink); margin:16px 0 6px;}
.legal-body h4{font-size:13px; font-weight:700; color:var(--ink-soft); margin:12px 0 4px;}
.legal-body p{margin:8px 0;}
.legal-body ul{margin:8px 0; padding-left:18px;}
.legal-body li{margin:3px 0;}
.legal-body strong{color:var(--ink);}
.legal-body code{font-family:'Space Mono',monospace; font-size:12px; background:var(--paper-2); padding:1px 4px; border-radius:4px;}
.legal-body a{color:var(--teal); text-decoration:underline; word-break:break-all;}
.legal-body blockquote{margin:10px 0; padding:8px 12px; background:var(--paper-2); border-left:3px solid var(--gold); border-radius:0 8px 8px 0; font-size:12.5px;}
.legal-body hr{border:none; border-top:1px solid var(--line); margin:18px 0;}
.legal-table{overflow-x:auto; margin:10px 0;}
.legal-body table{border-collapse:collapse; width:100%; font-size:12px;}
.legal-body th,.legal-body td{border:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top;}
.legal-body th{background:var(--paper-2); font-weight:700; color:var(--ink); white-space:nowrap;}
.legal-loading,.legal-error{font-size:12.5px; color:var(--ink-faint); padding:20px 0;}
.landing-consent{font-size:11px; color:var(--ink-faint); margin:12px 0 0; line-height:1.6;}
.landing-consent a{color:var(--ink-soft); text-decoration:underline;}
.landing-foot{margin-top:40px; font-size:11.5px; color:var(--ink-faint);}
.landing-foot a{color:var(--ink-soft); text-decoration:underline; margin:0 4px;}
.landing-copy{margin-top:8px; font-size:10.5px; color:var(--ink-faint);}
```

문서 화면도 `data-screen` 섹션이라 활성 테마 토큰이 그대로 적용됨. 표지에서 열면 부트 캐시 테마.

## 8. 엣지 케이스

- **테마 화면 폭:** `.v2-wrap` 은 `max-width:640px`. 데스크톱에서도 읽기 좋은 폭.
- **표 넘침:** `.legal-table{overflow-x:auto}` 로 가로 스크롤. 본문은 `body` 가로 스크롤 안 생기게.
- **뒤로 갔을 때 스크롤 위치:** `openLegal` 진입 시 문서 화면을 최상단으로 (`window.scrollTo(0,0)`). 돌아온 화면 스크롤 복원은 안 함(단순).
- **로그인 안 한 상태에서 설정 딥링크 불가:** 문서는 표지에서도 열리므로 무관.
- **fetch 캐시 무효화:** 문서 갱신 후에도 브라우저가 옛 `.md` 를 캐시할 수 있음. `fetch(url, {cache:'no-cache'})` 로 조건부 요청. (완전 무효화는 아니지만 충분.)
- **`renderMarkdown` 미지원 문법:** 현재 3개 문서에 쓰인 문법만 지원. 원본 `.md` 에 새 문법(중첩 목록, 이미지 등) 추가하려면 렌더러도 확장. 스펙 범위는 "현재 문서를 정확히 렌더".

## 9. 테스트 (Playwright + 스텁)

- **fetch 라우팅:** 테스트에서 `page.route('**/docs/legal/terms-ko.md', …)` 로 고정 마크다운 응답을 주입 (실제 파일 대신 결정적 픽스처). 최소 픽스처에 heading·bold·list·table·link·hr 각 1개 포함.
- **표지 → 이용약관:** 표지의 `이용약관` 링크 클릭 → `section[data-screen="terms"]` 표시, `#legalBody-terms` 에 렌더된 `<h2>`/`<table>`/`<a>` 존재.
- **뒤로:** 표지에서 열고 `← 뒤로` → `section[data-screen="landing"]` 표시. 설정에서 열고 뒤로 → `section[data-screen="settings"]`.
- **설정 진입:** 로그인 → 설정 → `개인정보처리방침` 행 클릭 → `section[data-screen="privacy"]` 표시, `#legalBody-privacy` 채워짐.
- **fetch 실패:** `page.route(...)` 로 500 응답 → `.legal-error` 표시 + GitHub 링크(`href` 에 `github.com` 포함).
- **캐시:** 같은 문서 두 번 열면 `fetch` 는 1회만 (route 핸들러 호출 횟수로 확인).
- **렌더러 XSS:** 픽스처에 `<script>alert(1)</script>` 를 본문 텍스트로 넣고, 렌더 결과 DOM에 `<script>` 요소가 없고 텍스트로 이스케이프됐는지.
- **동의 문구:** 표지에 `.landing-consent` 존재 + "이용약관"·"개인정보처리방침" 링크 포함.
- **회귀:** 기존 89개 통과 (특히 `routing`, `settings-avatar`, `editor-tabs` — 화면 토글).

## 10. 파일

- `index.html` — 유일한 코드 변경 파일 (섹션 2개, landing/settings 마크업, `renderMarkdown`·`openLegal`·`legalCache`·`legalFrom`, CSS, 클릭 위임 2건).
- `docs/legal/terms-ko.md`, `docs/legal/privacy-ko.md` — 원본(변경 없음, 이미 커밋됨). 사용자 검토 후 본문 수정 시 이 파일만 고치면 앱에 반영됨.
- 테스트 스펙 신규 (`tests/legal-screens.spec.js`).
