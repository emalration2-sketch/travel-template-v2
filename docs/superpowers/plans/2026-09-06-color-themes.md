# 컬러 테마 (무료 5종) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정에서 5개 컬러 테마 중 하나를 골라 앱 전체가 즉시 그 팔레트로 바뀌고, 로그인 계정에 저장된다.

**Architecture:** 모든 색을 `:root` CSS 커스텀 프로퍼티로 두고 `:root[data-theme="a".."e"]` 블록으로 오버라이드. `applyTheme(t)` 가 `<html data-theme>` 를 세팅. `profile.theme` (Firestore) + `localStorage['ttv2-theme']` (플래시 방지 캐시). 하드코딩된 네이비/틸 색은 `--fill-strong` · `--mode-edit` · `--mode-view` 토큰으로 리팩터.

**Tech Stack:** 단일 `index.html` (인라인 CSS/JS), Firebase compat SDK 10.14.1, 빌드 없음, GitHub Pages 배포, Playwright E2E + `tests/support/firebase-stub.js`.

**Spec:** `docs/superpowers/specs/2026-09-06-color-themes-design.md`

## Global Constraints

- 모든 편집은 `index.html` 한 파일. 인라인 CSS/JS, 빌드 스텝 없음, 배포는 파일 그대로 GitHub Pages.
- 테마 ID: `a`=오션, `b`=모노 슬레이트, `c`=미드나잇, `d`=아쿠아마린 갤럭시, `e`=코랄 선라이즈. 기본 `a`.
- 배너 비행기(`✈`) 색은 **리터럴 `#DE9A34`** — 토큰 아님, 테마 불변 (브랜드 상수).
- 팔레트 값은 스펙 §3 그대로 (Task 1 에 전량 전사).
- `profile.theme` (Firestore `users/{uid}` 문서 필드) · `localStorage` 키 `ttv2-theme`.
- `--fill-strong` = 라이트 테마에선 `--ink` 와 동일값, 다크(d)에선 별도값 `#1E2E48`.
- `--banner-bg` 는 색 또는 `linear-gradient(...)` 문자열 — `background:` 축약이 둘 다 받음.
- 모드 색 락 갱신: 기존 "edit=teal / view=navy" 고정 대신 테마별 `--mode-edit`/`--mode-view` (사용자 승인). 2모드 구조·색 구분 원칙은 유지.
- **스펙 §5-4.4 정정:** 로그아웃 시 `applyTheme('a')` 를 호출하지 **않는다**. 캐시된 테마를 그대로 둬야 스펙 §7 "로그아웃한 재방문자는 마지막 테마로 랜딩" 이 성립. 로그아웃 훅 없음.
- 회귀 기준선: 전체 73 테스트 통과.
- `prefers-color-scheme` 사용 안 함. 공유 HTML(`STATIC_CSS`) 색은 이번에 건드리지 않음.

---

## Task 1: 테마 토큰 정의

**Files:**
- Modify: `index.html` — `:root{…}` 블록 (현재 line ~13-24)
- Test: `tests/theme-palette.spec.js` (Create)

**Interfaces:**
- Consumes: 없음 (기반 작업)
- Produces: `:root` 및 `:root[data-theme="a".."e"]` 에 15개 토큰 — `--ink --ink-soft --ink-faint --red --gold --teal --paper --paper-2 --line --card --fill-strong --mode-edit --mode-view --banner-bg --banner-fg`. 이후 태스크가 이 토큰들을 읽음.

- [ ] **Step 1: Write the failing test**

`tests/theme-palette.spec.js`:
```js
const { test, expect } = require('./support/fixtures');

const EXPECT = {
  a: { paper:'rgb(241, 246, 244)', teal:'rgb(28, 122, 111)',  fillStrong:'rgb(22, 48, 45)',  modeEdit:'rgb(28, 122, 111)', modeView:'rgb(65, 90, 120)' },
  b: { paper:'rgb(244, 243, 241)', teal:'rgb(62, 107, 138)',  fillStrong:'rgb(30, 33, 36)',  modeEdit:'rgb(62, 107, 138)', modeView:'rgb(46, 50, 54)' },
  c: { paper:'rgb(242, 244, 249)', teal:'rgb(53, 82, 143)',   fillStrong:'rgb(27, 35, 64)',  modeEdit:'rgb(53, 82, 143)',  modeView:'rgb(138, 110, 46)' },
  d: { paper:'rgb(12, 21, 36)',    teal:'rgb(51, 214, 192)',  fillStrong:'rgb(30, 46, 72)',  modeEdit:'rgb(51, 214, 192)', modeView:'rgb(108, 123, 224)' },
  e: { paper:'rgb(254, 243, 236)', teal:'rgb(216, 88, 60)',   fillStrong:'rgb(67, 32, 47)',  modeEdit:'rgb(216, 88, 60)',  modeView:'rgb(168, 112, 62)' },
};

test('5개 테마 토큰이 data-theme 로 적용된다', async ({ page }) => {
  await page.goto('/');
  for(const [id, exp] of Object.entries(EXPECT)){
    const got = await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      const s = getComputedStyle(document.documentElement);
      const g = n => s.getPropertyValue(n).trim();
      // css var 원시값은 hex 라 비교용으로 실제 렌더 색을 뽑는다
      const probe = document.createElement('div');
      probe.style.cssText = 'color:var(--paper)';
      document.body.appendChild(probe);
      const rgb = k => { probe.style.color = 'var(' + k + ')'; return getComputedStyle(probe).color; };
      const out = { paper:rgb('--paper'), teal:rgb('--teal'), fillStrong:rgb('--fill-strong'),
                    modeEdit:rgb('--mode-edit'), modeView:rgb('--mode-view'), bannerBg:g('--banner-bg') };
      probe.remove();
      return out;
    }, id);
    expect(got.paper, id+' paper').toBe(exp.paper);
    expect(got.teal, id+' teal').toBe(exp.teal);
    expect(got.fillStrong, id+' fill-strong').toBe(exp.fillStrong);
    expect(got.modeEdit, id+' mode-edit').toBe(exp.modeEdit);
    expect(got.modeView, id+' mode-view').toBe(exp.modeView);
  }
});

test('d/e 배너는 그라디언트, a/b/c 는 단색', async ({ page }) => {
  await page.goto('/');
  const kind = await page.evaluate(() => {
    const r = {};
    for(const t of ['a','b','c','d','e']){
      document.documentElement.dataset.theme = t;
      r[t] = getComputedStyle(document.documentElement).getPropertyValue('--banner-bg').includes('gradient');
    }
    return r;
  });
  expect(kind).toEqual({ a:false, b:false, c:false, d:true, e:true });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx playwright test theme-palette`
Expected: FAIL (`--fill-strong` 등 미정의 → 빈 문자열/기본색).

- [ ] **Step 3: Implement**

`:root{…}` 블록을 아래로 교체 (bare `:root` = 테마 a 전체값):

```css
  :root{
    --ink:#16302D; --ink-soft:#47635E; --ink-faint:#8AA39D;
    --red:#E0556E; --gold:#E3A63C; --teal:#1C7A6F;
    --paper:#F1F6F4; --paper-2:#E1EDE9; --line:#CEDFD9; --card:#FFFFFF;
    --fill-strong:#16302D;
    --mode-edit:#1C7A6F; --mode-view:#415A78;
    --banner-bg:#1C7A6F; --banner-fg:#FFFFFF;
  }
  :root[data-theme="a"]{
    --ink:#16302D; --ink-soft:#47635E; --ink-faint:#8AA39D;
    --red:#E0556E; --gold:#E3A63C; --teal:#1C7A6F;
    --paper:#F1F6F4; --paper-2:#E1EDE9; --line:#CEDFD9; --card:#FFFFFF;
    --fill-strong:#16302D;
    --mode-edit:#1C7A6F; --mode-view:#415A78;
    --banner-bg:#1C7A6F; --banner-fg:#FFFFFF;
  }
  :root[data-theme="b"]{
    --ink:#1E2124; --ink-soft:#55585C; --ink-faint:#9A9CA0;
    --red:#C6506A; --gold:#9A7B4E; --teal:#3E6B8A;
    --paper:#F4F3F1; --paper-2:#E9E7E3; --line:#DAD8D3; --card:#FFFFFF;
    --fill-strong:#1E2124;
    --mode-edit:#3E6B8A; --mode-view:#2E3236;
    --banner-bg:#2A2D30; --banner-fg:#FFFFFF;
  }
  :root[data-theme="c"]{
    --ink:#1B2340; --ink-soft:#4A5178; --ink-faint:#8A90AE;
    --red:#E0475F; --gold:#DE9A34; --teal:#35528F;
    --paper:#F2F4F9; --paper-2:#E6EAF4; --line:#D6DCEA; --card:#FFFFFF;
    --fill-strong:#1B2340;
    --mode-edit:#35528F; --mode-view:#8A6E2E;
    --banner-bg:#1B2340; --banner-fg:#FFFFFF;
  }
  :root[data-theme="d"]{
    --ink:#EAF2F4; --ink-soft:#9FB2BE; --ink-faint:#61748A;
    --red:#FF6B85; --gold:#E3A63C; --teal:#33D6C0;
    --paper:#0C1524; --paper-2:#182335; --line:#29374D; --card:#131E30;
    --fill-strong:#1E2E48;
    --mode-edit:#33D6C0; --mode-view:#6C7BE0;
    --banner-bg:linear-gradient(125deg,#0F1C3E 0%,#123E5E 52%,#0C4F4A 100%); --banner-fg:#FFFFFF;
  }
  :root[data-theme="e"]{
    --ink:#43202F; --ink-soft:#8A5560; --ink-faint:#BE93A0;
    --red:#B23A32; --gold:#E89A3C; --teal:#D8583C;
    --paper:#FEF3EC; --paper-2:#FBE3D5; --line:#F1D2C0; --card:#FFFFFF;
    --fill-strong:#43202F;
    --mode-edit:#D8583C; --mode-view:#A8703E;
    --banner-bg:linear-gradient(120deg,#E8663E 0%,#EF8A3C 55%,#E8A54A 100%); --banner-fg:#FFFFFF;
  }
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx playwright test theme-palette`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/theme-palette.spec.js
git commit -m "feat: 테마 토큰 5종 정의 (:root[data-theme])"
```

---

## Task 2: 하드코딩 색 → 토큰 리팩터

**Files:**
- Modify: `index.html` — CSS 규칙 다수 (스펙 §2 표)
- Test: `tests/theme-refactor.spec.js` (Create)

**Interfaces:**
- Consumes: Task 1 의 `--fill-strong` `--mode-edit` `--mode-view`
- Produces: 일차 헤더·활성 탭·솔리드 버튼·아바타·모드 띠·`.stage-badge` 가 테마 토큰을 따름

- [ ] **Step 1: Write the failing test**

`tests/theme-refactor.spec.js`:
```js
const { test, expect } = require('./support/fixtures');

async function openEditor(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'2026-01-01',label:'',items:[]}], notes:[], links:[], attachments:[] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('일차 헤더 배경이 테마 --fill-strong 을 따른다', async ({ page }) => {
  await openEditor(page);
  // 테마 d: fill-strong = #1E2E48 = rgb(30, 46, 72)
  await page.evaluate(() => document.documentElement.dataset.theme = 'd');
  const bg = await page.evaluate(() => {
    const el = document.querySelector('#daysContainer .day-card .day-head') || document.querySelector('.day-head');
    return getComputedStyle(el).backgroundColor;
  });
  expect(bg).toBe('rgb(30, 46, 72)');
});

test('nav.tabs 하단 띠가 테마 --mode-edit / --mode-view 를 따른다', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'c'; setMode('edit'); });
  const edit = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).borderBottomColor);
  await page.evaluate(() => setMode('view'));
  const view = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).borderBottomColor);
  expect(edit).toBe('rgb(53, 82, 143)');   // c --mode-edit #35528F
  expect(view).toBe('rgb(138, 110, 46)');  // c --mode-view #8A6E2E
});

test('아바타 원 배경에 하드코딩 네이비 그라디언트가 없다', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => { renderMypage(); showScreen('mypage'); });
  const img = await page.evaluate(() => {
    const el = document.getElementById('mpAvatar');
    const s = getComputedStyle(el);
    return s.backgroundImage;
  });
  expect(img).toBe('none');   // flat var(--fill-strong), 그라디언트 아님
});

test('index.html 에 #243057 / #1B2340 하드코딩이 배경으로 남지 않았다', async () => {
  const fs = require('fs');
  const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const styleBlock = html.slice(0, html.indexOf('</style>'));
  expect(styleBlock).not.toContain('#243057');
  // #1B2340 는 :root/[data-theme="c"] 정의에만 허용 → style 블록 그 외 등장 금지
  const occurrences = (styleBlock.match(/#1B2340/g) || []).length;
  expect(occurrences).toBeLessThanOrEqual(2); // bare :root 는 a값이라 없음; [data-theme=c] --ink & --fill-strong 2회
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx playwright test theme-refactor`
Expected: FAIL (`.day-head` 는 아직 `var(--ink)`, `#243057` 잔존 등).

- [ ] **Step 3: Implement** — 스펙 §2 표대로 치환:

`--ink` → `--fill-strong` (배경 용도만):
- `body:not(.mode-edit) .mode-btn{ background:var(--mode-view); color:#fff; border-color:var(--mode-view); }`
- `.mode-btn` 수정상태 규칙: `border:2px solid var(--mode-edit); background:var(--mode-edit); color:#fff;`
- `.tab.active{ background:var(--fill-strong); color:#fff; border-color:var(--fill-strong); }`
- `.tab.day-chip.active{ background:var(--fill-strong); color:#fff; border-color:var(--fill-strong); }`  ← `#243057` 제거
- `.day-head{ … background:var(--fill-strong); … }`
- 지출 모달 헤더 `background:var(--ink)` (line ~275) → `background:var(--fill-strong)`
- `.btn-solid{ border:none; background:var(--fill-strong); color:#fff; }`
- `.v2-btn-solid{ border:none; background:var(--fill-strong); color:#fff; }`
- `.landing-login{ border:2px solid var(--fill-strong); background:var(--fill-strong); color:#fff; … }`

아바타:
- `.mp-avatar{ … background:var(--fill-strong); … }`  ← `linear-gradient(135deg,#1B2340,#243057)` 제거
- `.set-avatar-big{ … background:var(--fill-strong); … }`  ← 동일

모드 색:
- `nav.tabs{ … border-bottom:4px solid var(--mode-edit); }`
- `body.mode-view nav.tabs{ border-bottom-color:var(--mode-view); }`  ← `var(--ink-soft)` 에서
- `.stage-badge{ … background:var(--paper-2); color:var(--mode-edit); }`  ← `#E7F2F0` 제거
- `body.mode-view .stage-badge{ background:var(--paper-2); color:var(--mode-view); }`  ← `#E4E6F0` 제거

썸네일 플레이스홀더:
- `.att-img-wrap{ … background:var(--fill-strong); }`  ← `#243057` 에서

`--ink` 가 **글자색**인 규칙은 건드리지 않는다.

- [ ] **Step 4: Run — expect PASS**

Run: `npx playwright test theme-refactor`
Expected: PASS (4 tests).

- [ ] **Step 5: Regression**

Run: `npx playwright test editor-fixes editor-tabs attachments`
Expected: 전부 PASS (모드 띠·`.att-name`·썸네일 관련 회귀 없음).

- [ ] **Step 6: Commit**

```bash
git add index.html tests/theme-refactor.spec.js
git commit -m "feat: 하드코딩 네이비/틸 → --fill-strong / --mode-* 토큰"
```

---

## Task 3: 배너 재구성 (태그라인 + 그라디언트 대응)

**Files:**
- Modify: `index.html` — `.mp-banner` 마크업 (line ~486) + CSS (line ~382-384)
- Test: `tests/mypage-banner.spec.js` (Modify — 기존 파일에 추가)

**Interfaces:**
- Consumes: Task 1 의 `--banner-bg` `--banner-fg`
- Produces: `.mp-banner > .mpb-line(.mpb-plane + .mpb-word) + .mpb-tag` 구조, 전 테마 공통

- [ ] **Step 1: Write the failing test** — `tests/mypage-banner.spec.js` 에 추가:

```js
test('배너: 태그라인 + 브랜드 골드 ✈ + 테마별 배경', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'홍길동', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();

  await expect(page.locator('.mp-banner .mpb-tag')).toHaveText('여행의 모든 순간을 한 곳에');

  // ✈ 는 전 테마 #DE9A34 = rgb(222, 154, 52)
  for(const t of ['a','c','d']){
    const c = await page.evaluate((th) => {
      document.documentElement.dataset.theme = th;
      return getComputedStyle(document.querySelector('.mp-banner .mpb-plane')).color;
    }, t);
    expect(c, t).toBe('rgb(222, 154, 52)');
  }

  // c = 단색, d = 그라디언트(background-image != none)
  const c_img = await page.evaluate(() => { document.documentElement.dataset.theme='c';
    return getComputedStyle(document.querySelector('.mp-banner')).backgroundImage; });
  const d_img = await page.evaluate(() => { document.documentElement.dataset.theme='d';
    return getComputedStyle(document.querySelector('.mp-banner')).backgroundImage; });
  expect(c_img).toBe('none');
  expect(d_img).toContain('gradient');
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx playwright test mypage-banner`
Expected: FAIL (`.mpb-tag` 없음).

- [ ] **Step 3: Implement**

마크업 (line ~486):
```html
    <div class="mp-banner">
      <div class="mpb-line"><span class="mpb-plane">✈</span><span class="mpb-word">Travel Template</span></div>
      <span class="mpb-tag">여행의 모든 순간을 한 곳에</span>
    </div>
```

CSS — `.mp-banner` 3규칙 교체:
```css
  .mp-banner{ display:flex; flex-direction:column; align-items:center; gap:2px;
    background:var(--banner-bg); color:var(--banner-fg);
    border-radius:12px; padding:12px 14px; margin:12px 0 2px; }
  .mp-banner .mpb-line{ display:flex; align-items:center; gap:7px; }
  .mp-banner .mpb-plane{ color:#DE9A34; }
  .mp-banner .mpb-word{ font-family:'Fraunces',serif; font-size:15px; font-weight:600; letter-spacing:.01em; }
  .mp-banner .mpb-tag{ font-size:10.5px; opacity:.85; }
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx playwright test mypage-banner`
Expected: PASS (기존 배너 테스트 + 신규 1개).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/mypage-banner.spec.js
git commit -m "feat: 배너 태그라인 2줄 + --banner-bg/fg 토큰화 (그라디언트 대응)"
```

---

## Task 4: applyTheme + 저장 + 부트

**Files:**
- Modify: `index.html` — `<body>` 직후 부트 스크립트 (line ~464), `loadProfile`/`saveProfile` (line ~716-734), `handleAuthChange` (line ~1074 부근), JS 유틸 영역에 `applyTheme`
- Test: `tests/theme-persist.spec.js` (Create)

**Interfaces:**
- Consumes: Task 1 토큰
- Produces: 전역 `applyTheme(t)`, 상수 `THEME_IDS`, `profile.theme`, `localStorage['ttv2-theme']`

- [ ] **Step 1: Write the failing test**

`tests/theme-persist.spec.js`:
```js
const { test, expect } = require('./support/fixtures');

test('applyTheme: data-theme 세팅 + 잘못된 값은 a', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => { applyTheme('c'); return document.documentElement.dataset.theme; })).toBe('c');
  expect(await page.evaluate(() => { applyTheme('zzz'); return document.documentElement.dataset.theme; })).toBe('a');
  expect(await page.evaluate(() => { try{ return localStorage.getItem('ttv2-theme'); }catch(e){ return null; } })).toBe('a');
});

test('부트: localStorage ttv2-theme 를 첫 페인트에 적용', async ({ page }) => {
  await page.addInitScript(() => { try{ localStorage.setItem('ttv2-theme','d'); }catch(e){} });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('d');
});

test('프로필 라운드트립: 저장 → 재로드 → data-theme', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => saveProfile({ theme:'e' }));
  await expect.poll(() => page.evaluate(() => (window.__test.dump()['users/u1']||{}).theme)).toBe('e');
  await page.reload();
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('e');
});

test('기존 사용자(theme 필드 없음) → a', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u2', { avatarId:'cat', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u2', displayName:'박', email:'c@d.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('a');
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx playwright test theme-persist`
Expected: FAIL (`applyTheme` 미정의).

- [ ] **Step 3: Implement**

(a) `<body>` 바로 다음 줄 (Firebase 스크립트보다 위):
```html
<script>try{document.documentElement.dataset.theme=localStorage.getItem('ttv2-theme')||'a';}catch(e){document.documentElement.dataset.theme='a';}</script>
```

(b) 메인 `<script>` 안 유틸 영역 (예: `cacheClear` 근처):
```js
const THEME_IDS = ['a','b','c','d','e'];
function applyTheme(t){
  const theme = THEME_IDS.includes(t) ? t : 'a';
  document.documentElement.dataset.theme = theme;
  try{ localStorage.setItem('ttv2-theme', theme); }catch(e){}
}
```

(c) `loadProfile()` 의 `profile = { … }` 에 추가:
```js
    theme: THEME_IDS.includes(d.theme) ? d.theme : 'a',
```
그리고 `profileLoaded = true;` 앞이나 뒤에:
```js
  applyTheme(profile.theme);
```

(d) `saveProfile()` 의 `.set({ … }, {merge:true})` payload 에 `theme: profile.theme` 추가. `Object.assign(profile, patch)` 뒤에 `if(patch.theme) applyTheme(profile.theme);` (선택 탭에서 이미 applyTheme 하지만 멱등).

(e) 전역 초기 상태: `let profile = { avatarId:'default', tripOrder:[], theme:'a' };`

- [ ] **Step 4: Run — expect PASS**

Run: `npx playwright test theme-persist`
Expected: PASS (4 tests).

- [ ] **Step 5: Regression**

Run: `npx playwright test settings-avatar profile-store routing`
Expected: PASS (프로필 저장/로드 회귀 없음).

- [ ] **Step 6: Commit**

```bash
git add index.html tests/theme-persist.spec.js
git commit -m "feat: applyTheme + profile.theme 저장 + 부트 인라인 캐시"
```

---

## Task 5: PDF 는 항상 라이트

**Files:**
- Modify: `index.html` — `exportPDF()` (line ~1644)
- Test: `tests/theme-pdf.spec.js` (Create)

**Interfaces:**
- Consumes: `applyTheme` (Task 4)
- Produces: `exportPDF` 캡처 구간 동안 `data-theme="a"` 강제, 종료 후 원복

- [ ] **Step 1: Write the failing test**

`tests/theme-pdf.spec.js`:
```js
const { test, expect } = require('./support/fixtures');

test('exportPDF 캡처 중 테마 a 강제, 이후 원복', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'PDF', travelers:['나'],
      days:[{id:'d1',date:'2026-01-01',label:'',items:[]}], notes:[], links:[], attachments:[] }), title:'PDF', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));

  const seen = await page.evaluate(async () => {
    document.documentElement.dataset.theme = 'd';        // 다크 테마 상태에서 시작
    let themeAtCapture = null;
    window.loadPdfLibs = () => Promise.resolve();
    window.jspdf = { jsPDF: function(){ return {
      internal:{ pageSize:{ getWidth:()=>210, getHeight:()=>297 } },
      addImage(){}, addPage(){}, setFontSize(){}, splitTextToSize:(s)=>[s], text(){}, save(){}
    }; } };
    window.html2canvas = async () => { themeAtCapture = document.documentElement.dataset.theme;
      return { width:0, height:0, toDataURL:()=>'' }; };
    await exportPDF();
    await new Promise(r => setTimeout(r, 50));
    return { themeAtCapture, themeAfter: document.documentElement.dataset.theme };
  });
  expect(seen.themeAtCapture).toBe('a');
  expect(seen.themeAfter).toBe('d');
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx playwright test theme-pdf`
Expected: FAIL (`themeAtCapture` = `'d'`).

- [ ] **Step 3: Implement** — `exportPDF` 의 `try{ … }finally{ … }` 블록:

`try{` 바로 다음 줄에:
```js
      var __prevTheme = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = 'a';
```
`finally{` 안, 기존 복원문들과 함께:
```js
      document.documentElement.dataset.theme = __prevTheme;
```
`html2canvas(sec, { scale: 2, useCORS: true, backgroundColor: '#FBF7EF' })` → `backgroundColor: '#F1F6F4'` (테마 a `--paper`).

- [ ] **Step 4: Run — expect PASS**

Run: `npx playwright test theme-pdf`
Expected: PASS.

- [ ] **Step 5: Regression**

Run: `npx playwright test editor-fixes attachments-integration`
Expected: PASS (PDF 관련 기존 테스트 회귀 없음).

- [ ] **Step 6: Commit**

```bash
git add index.html tests/theme-pdf.spec.js
git commit -m "feat: exportPDF 캡처 중 테마 a 강제 (인쇄물 항상 라이트)"
```

---

## Task 6: 테마 선택 UI

**Files:**
- Modify: `index.html` — `#setTheme` 행 마크업 (line ~507), `renderSettings` (line ~807), 클릭 위임 (line ~1752 부근), 액션 스위치 (line ~1788 부근), CSS (설정/모달 영역), JS 에 `THEME_LIST`/`openThemeModal`/`pickTheme`
- Test: `tests/theme-picker.spec.js` (Create)

**Interfaces:**
- Consumes: `applyTheme` (T4), `saveProfile` (T4), `v2ModalOpen`/`v2ModalClose`, Task 1 토큰
- Produces: 설정 "컬러 테마" 행 → 바텀시트 팝업 → 카드 5개 → 탭 즉시 적용 + 저장

- [ ] **Step 1: Write the failing test**

`tests/theme-picker.spec.js`:
```js
const { test, expect } = require('./support/fixtures');

async function toSettings(page){
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'홍길동', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => { renderSettings(); showScreen('settings'); });
}

test('설정 행 → 팝업 5카드 → 탭 시 즉시 적용 + 저장 + 모달 유지', async ({ page }) => {
  await toSettings(page);
  await expect(page.locator('#setTheme')).toBeVisible();
  await expect(page.locator('#setThemeVal')).toContainText('오션');

  await page.locator('#setTheme').click();
  await expect(page.locator('#v2Modal .theme-card')).toHaveCount(5);

  await page.locator('#v2Modal .theme-card[data-theme="d"]').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('d');
  await expect(page.locator('#v2Modal .theme-card[data-theme="d"]')).toHaveClass(/sel/);
  await expect(page.locator('#v2Modal')).toBeVisible();   // 모달 유지
  await expect.poll(() => page.evaluate(() => (window.__test.dump()['users/u1']||{}).theme)).toBe('d');

  await page.locator('#v2Modal [data-action="v2modal-close"]').click();
  await expect(page.locator('#v2Modal')).toBeHidden();
  await expect(page.locator('#setThemeVal')).toContainText('아쿠아마린 갤럭시');
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx playwright test theme-picker`
Expected: FAIL (`#setTheme` 비활성 placeholder, `open-theme` 액션 없음).

- [ ] **Step 3: Implement**

(a) `#setTheme` 행 교체:
```html
    <div class="set-row" id="setTheme" data-action="open-theme">
      <span>컬러 테마</span>
      <span class="set-row-val"><span id="setThemeVal"></span> <span class="set-chev">›</span></span>
    </div>
```
(`set-disabled` 클래스와 `준비 중` span 제거.)

(b) JS 상수 + 함수 (아바타 모달 근처):
```js
const THEME_LIST = [
  { id:'a', name:'오션',            desc:'쿨 민트 · 틸 (기본)',        sw:['#F1F6F4','#1C7A6F','#16302D'] },
  { id:'b', name:'모노 슬레이트',    desc:'뉴트럴 그레이 · 슬레이트블루', sw:['#F4F3F1','#3E6B8A','#1E2124'] },
  { id:'c', name:'미드나잇',        desc:'딥 네이비 · 골드',           sw:['#F2F4F9','#35528F','#1B2340'] },
  { id:'d', name:'아쿠아마린 갤럭시', desc:'다크 · 아쿠아마린 · 갤럭시',   sw:['#0C1524','#33D6C0','#EAF2F4'] },
  { id:'e', name:'코랄 선라이즈',    desc:'웜 · 코랄 · 선라이즈',        sw:['#FEF3EC','#D8583C','#43202F'] },
];
function themeName(id){ const t = THEME_LIST.find(x => x.id === id); return t ? t.name : '오션'; }
function openThemeModal(){
  const cur = profile.theme || 'a';
  const cards = THEME_LIST.map(t =>
    `<div class="theme-card${t.id === cur ? ' sel' : ''}" data-theme="${t.id}">` +
      `<span class="tsw">${t.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>` +
      `<span class="tmeta"><span class="tnm">${t.name}</span><span class="tds">${t.desc}</span></span>` +
      `<span class="tck">✓</span>` +
    `</div>`
  ).join('');
  document.getElementById('v2ModalBody').innerHTML =
    '<div style="font-weight:700;font-size:13px;margin-bottom:6px">컬러 테마</div>' +
    '<div style="font-size:11px;color:var(--ink-faint);margin-bottom:11px">탭하면 바로 적용됩니다.</div>' +
    cards;
  document.getElementById('v2ModalActions').innerHTML =
    '<button class="v2-btn-ghost" data-action="v2modal-close">닫기</button>';
  document.getElementById('v2Modal').hidden = false;
}
function pickTheme(id){
  applyTheme(id);
  document.querySelectorAll('#v2Modal .theme-card').forEach(c =>
    c.classList.toggle('sel', c.dataset.theme === id));
  saveProfile({ theme: id });
  const v = document.getElementById('setThemeVal');
  if(v) v.textContent = themeName(id);
}
```

(c) `renderSettings()` 끝에:
```js
  const tv = document.getElementById('setThemeVal');
  if(tv) tv.textContent = themeName(profile.theme || 'a');
```

(d) 클릭 위임 — `.av-cell` 처리 근처 (line ~1752):
```js
  const tCard = e.target.closest('#v2Modal .theme-card');
  if(tCard){ pickTheme(tCard.dataset.theme); return; }
```

(e) 액션 스위치 (line ~1790 부근, `open-avatar` 근처):
```js
  else if(a === 'open-theme') openThemeModal();
```

(f) CSS (모달/설정 영역):
```css
  .set-row-val{ display:flex; align-items:center; gap:5px; color:var(--ink-faint); font-size:12px; }
  .theme-card{ display:flex; align-items:center; gap:11px; border:1px solid var(--line);
    border-radius:12px; padding:11px 12px; margin-bottom:8px; background:var(--card); cursor:pointer; }
  .theme-card.sel{ border:2px solid var(--teal); padding:10px 11px; }
  .theme-card .tsw{ display:flex; border-radius:8px; overflow:hidden; border:1px solid var(--line); flex:none; }
  .theme-card .tsw i{ width:16px; height:34px; display:block; }
  .theme-card .tmeta{ flex:1; min-width:0; }
  .theme-card .tnm{ font-size:13px; font-weight:700; color:var(--ink); }
  .theme-card .tds{ font-size:10.5px; color:var(--ink-faint); margin-top:1px; }
  .theme-card .tck{ width:20px; height:20px; border-radius:50%; background:var(--teal); color:#fff;
    font-size:11px; display:none; align-items:center; justify-content:center; flex:none; }
  .theme-card.sel .tck{ display:flex; }
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx playwright test theme-picker`
Expected: PASS.

- [ ] **Step 5: Regression**

Run: `npx playwright test settings-avatar`
Expected: PASS (아바타 모달·설정 화면 회귀 없음).

- [ ] **Step 6: Commit**

```bash
git add index.html tests/theme-picker.spec.js
git commit -m "feat: 설정 컬러 테마 선택 팝업 (5종, 탭 즉시 적용)"
```

---

## Task 7: 회귀 + 브라우저 확인 (컨트롤러 실행)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 스위트**

Run: `npx playwright test`
Expected: 기존 73 + 신규(팔레트 2 · 리팩터 4 · 배너 1 · 저장 4 · PDF 1 · 픽커 1 = 13) = 86 통과.

- [ ] **Step 2: 로컬 서버 + 브라우저**

`npx serve -l 5199 .` → 브라우저로 `http://localhost:5199/`.
가짜 상태 주입(`window.__test` 또는 직접 state) 후 5개 테마 각각:
- 마이페이지 — 배너 배경/태그라인, 카드, 아바타 원(`--fill-strong`)
- 편집기 수정모드 — `nav.tabs` 띠 색(`--mode-edit`), 일차 헤더(`--fill-strong`), 활성 탭
- 편집기 보기모드 — 띠 색(`--mode-view`), 뱃지
- 설정 → 컬러 테마 팝업 — 카드 5개, 현재 ✓, 탭 시 팝업 자체 색 리렌더
- 다크(d) — 텍스트 대비, 카드/모달 배경, 이미지 뷰어(`#000` 고정)

각 테마 스크린샷 1~2장 확보.

- [ ] **Step 3: 배포 확인**

푸시 후 GitHub Pages 에서 `data-theme` / `--fill-strong` / `theme-card` 마커 반영 확인.

---

## Self-Review

**Spec coverage:**
- §1 토큰 모델 → Task 1
- §2 하드코딩 리팩터 → Task 2
- §3 5팔레트 → Task 1
- §4 배너 재구성 → Task 3
- §5 저장/적용(profile.theme, localStorage, applyTheme, 부트, 로드 훅) → Task 4
- §5-4.5 PDF 강제 라이트 → Task 5
- §6 선택 UI → Task 6
- §7 엣지: 랜딩(부트 인라인=T4), PDF(T5), 공유 HTML(범위 밖=건드리지 않음), 이미지뷰어(#000 고정=T7 확인)
- §8 범위 밖: 프리미엄 잠금/결제, 공유 HTML 테마, prefers-color-scheme, 폰트 — 계획에 포함 안 함 ✓
- §9 테스트 → 각 Task 의 spec 파일 + Task 7

**Placeholder scan:** "적절히"/"TBD"/"등등" 류 없음. 각 코드 스텝에 실제 코드·실제 hex.

**Type consistency:** `applyTheme`/`THEME_IDS`/`THEME_LIST`/`themeName`/`openThemeModal`/`pickTheme` — Task 4 에서 `applyTheme`·`THEME_IDS` 정의, Task 6 에서 `THEME_LIST`·`themeName`·`openThemeModal`·`pickTheme` 정의하고 T4 심볼 소비. `profile.theme` 는 T4 에서 도입, T6 에서 읽기/쓰기. 클래스명 `.theme-card`/`.sel`/`.tck`/`.tsw`/`.tnm`/`.tds` T6 내부 일관. `--fill-strong`/`--mode-edit`/`--mode-view`/`--banner-bg`/`--banner-fg` T1 정의, T2·T3 소비. 일치.

**스펙 모순 정정:** §5-4.4(로그아웃 시 applyTheme('a')) 는 §7(재방문자 마지막 테마 유지)과 충돌 → Global Constraints 에서 로그아웃 훅 제거로 확정.
