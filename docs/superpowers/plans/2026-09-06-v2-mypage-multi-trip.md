# v2 마이페이지 + 다중 여행계획 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자가 여행계획을 최대 5개까지 저장·정렬·삭제하고, 로그인 후 마이페이지로 진입하는 흐름을 `index.html` 한 파일에 구현한다.

**Architecture:** 기존 단일 파일 `index.html` 안에 4개 화면(`landing` / `mypage` / `settings` / `editor`)을 `<section data-screen>` 으로 두고 `showScreen()` 으로 하나만 보인다. 데이터는 Firestore `users/{uid}` 문서(`avatarId`, `tripOrder`) + `users/{uid}/trips/{tripId}` 하위 문서(전체 상태 JSON + 목록용 비정규화 필드)에 저장한다. localStorage 는 현재 편집 중인 여행 1개의 캐시로만 쓴다. 편집기 내부 로직(일정·메모·링크·지출·PDF·공유·모드)은 그대로 두고, 저장 대상과 진입 경로만 바꾼다.

**Tech Stack:** 순수 HTML/CSS/JS (빌드 없음), Firebase compat SDK 10.14.1 (app/auth/firestore), GitHub Pages 배포. 테스트: Playwright E2E + 주입식 Firebase 스텁 + `npx serve` 정적 서버.

**Spec:** `docs/superpowers/specs/2026-09-06-v2-mypage-multi-trip-design.md`

## Global Constraints

- 전부 `index.html` 한 파일. 새 화면은 `<section data-screen="...">` 로, 화면 전환은 `hidden` 속성 토글. 실제 URL 라우팅 없음.
- 저장 포맷은 **JSON** (`JSON.stringify(tripState)`). CSV 등 금지.
- Firestore 경로: 프로필 = `users/{uid}` 문서 `{ avatarId, tripOrder }` / 여행 = `users/{uid}/trips/{tripId}` 문서 `{ data, title, startDate, endDate, dayCount, updatedAt }`.
- 여행 저장 개수 상한 = **5**. 초과 시 팝업 문구(정확히):
  `여행계획은 최대 5개까지 저장할 수 있어요.` 줄바꿈 `멤버십을 변경하여 여행계획을 더 늘려보세요.`
- 삭제 확인 팝업 문구: `이 여행을 삭제할까요?` 줄바꿈 `되돌릴 수 없습니다.` / 버튼 `삭제` `취소`.
- 미동기화 표시(정확히, `#syncStatus` 한 자리에서 ~2000ms 간격 교대): `클라우드 저장 안됨` ↔ `인터넷 연결 확인`. 정상 동기화 시 숨김.
- 클라우드 저장 디바운스 ≈ 1000ms. 편집기에서 마이페이지로 나갈 때 1회 강제 flush.
- 클라우드 → 로컬 덮어쓰기는 "여행을 여는 순간" 1회만.
- localStorage 키: `ttv2-current-trip` (현재 여행 캐시), `travel-template-mode` (기존 유지). 기존 `travel-template-data-v1` 는 더 이상 쓰지 않음.
- 아바타 값: `'default' | 'dog' | 'cat' | 'rabbit' | 'tiger' | 'fox' | 'bear' | 'panda' | 'lion'`. `default` = ✈ (네이비 배경). 나머지 = 🐶🐱🐰🐯🦊🐻🐼🦁.
- 보안 규칙은 수정하지 않는다(기존 `/users/{userId}/{document=**}` 가 커버).
- 기존 함수는 최대한 재사용: `defaultState`, `rebuildAll`, `setMode`, `loginWithGoogle`, `logoutUser`, `uid`, `escapeHTML`, `formatDateDigits`, 편집기 렌더/액션 전부.
- 디자인 토큰 재사용: `--ink #1B2340`, `--ink-soft #4A5178`, `--ink-faint #8A90AE`, `--teal #227F76`, `--gold #DE9A34`, `--red #E8446B`, `--paper #FBF7EF`, `--paper-2 #F3ECDD`, `--line #E4DCC8`, `--card #FFFFFF`. 폰트: 제목 `'Fraunces',serif` / 숫자·날짜 `'Space Mono',monospace` / 본문 `'Noto Sans KR'`.
- 커밋은 자주. 커밋 메시지 끝에:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `index.html` | 앱 전체. 4개 화면 마크업 + 스타일 + 스크립트(데이터 계층, 화면 셸/라우팅, 마이페이지, 설정, 편집기 연동, 동기화). | 수정 |
| `package.json` | devDependency `@playwright/test`, 스크립트 `test`. | 신규 |
| `playwright.config.js` | `testDir: tests`, `webServer` 로 `npx serve -l 5199 .`, `use.baseURL`. | 신규 |
| `tests/support/firebase-stub.js` | 페이지 스크립트보다 먼저 주입되는 Firebase compat 스텁 + `window.__test` 헬퍼(로그인/로그아웃/오프라인/시드/덤프/리셋). | 신규 |
| `tests/support/fixtures.js` | Playwright `test` 확장: gstatic CDN 요청 abort + `firebase-stub.js` `addInitScript` 주입. | 신규 |
| `tests/*.spec.js` | 태스크별 E2E 스펙. | 신규 |
| `.gitignore` | `node_modules/`, `test-results/`, `playwright-report/` 추가. | 수정 |

`index.html` 스크립트 안에서 새 코드는 주석 배너로 구획을 나눈다:
`/* ===== V2: META ===== */`, `/* ===== V2: PROFILE STORE ===== */`, `/* ===== V2: TRIP STORE ===== */`, `/* ===== V2: LOCAL CACHE ===== */`, `/* ===== V2: SCREEN SHELL ===== */`, `/* ===== V2: MYPAGE ===== */`, `/* ===== V2: SETTINGS ===== */`, `/* ===== V2: SYNC ===== */`.

---

## Internal API (태스크 간 계약)

아래 이름/시그니처는 모든 태스크가 공유한다.

```
/* META */
deriveTripMeta(tripState) -> { title:string, startDate:string, endDate:string, dayCount:number }

/* PROFILE STORE  (module-level: let profile = {avatarId:'default', tripOrder:[]}) */
loadProfile() -> Promise<{avatarId:string, tripOrder:string[]}>   // 없으면 기본값, profile 캐시에 채움
saveProfile(patch:object) -> Promise<void>                        // users/{uid} 에 merge set, profile 캐시 갱신

/* TRIP STORE */
listTrips() -> Promise<Array<{id,title,startDate,endDate,dayCount,updatedAt}>>  // data 제외, meta만
loadTrip(tripId:string) -> Promise<tripState>                     // data 파싱
createTrip() -> Promise<string>                                   // defaultState()로 문서 생성, tripOrder 끝에 append+saveProfile, 새 tripId 반환
saveTrip(tripId:string, tripState:object) -> Promise<void>        // {data, ...deriveTripMeta, updatedAt: serverTimestamp()} merge set
deleteTrip(tripId:string) -> Promise<void>                        // 문서 delete, tripOrder 에서 제거+saveProfile

/* LOCAL CACHE  (LOCAL_KEY='ttv2-current-trip') */
cacheRead() -> {tripId,data,dirty,localUpdatedAt} | null
cacheWrite(tripId:string, tripState:object, dirty:boolean) -> void
cacheClear() -> void

/* SCREEN SHELL */
showScreen(name:'landing'|'mypage'|'settings'|'editor') -> void   // [data-screen] 섹션 hidden 토글, 현재값 currentScreen
handleAuthChange(user) -> void                                    // user? loadProfile→listTrips→renderMypage→showScreen('mypage') : showScreen('landing')

/* MYPAGE */
renderMypage() -> void
openTrip(tripId:string) -> Promise<void>                          // 캐시 조정 후 state 세팅, currentTripId=tripId, rebuildAll/setMode, showScreen('editor')
handleNewTrip() -> void                                           // trips>=5 → showLimitModal(); else createTrip().then(openTrip)
moveTrip(tripId:string, dir:-1|1) -> void                         // tripOrder swap + saveProfile + renderMypage
showLimitModal() -> void
showDeleteModal(tripId:string) -> void

/* SETTINGS */
renderSettings() -> void
openAvatarModal() -> void
avatarEmoji(id:string) -> string
AVATARS = [{id:'default',glyph:'✈'},{id:'dog',glyph:'🐶'},{id:'cat',glyph:'🐱'},{id:'rabbit',glyph:'🐰'},{id:'tiger',glyph:'🐯'},{id:'fox',glyph:'🦊'},{id:'bear',glyph:'🐻'},{id:'panda',glyph:'🐼'},{id:'lion',glyph:'🦁'}]

/* SYNC  (editor) */
save()        // 재정의: cacheWrite(currentTripId,state,true) + scheduleFlush()
scheduleFlush()   // clearTimeout+setTimeout(flushCloud, 1000)
flushCloud() -> Promise<void>   // saveTrip 성공→cache dirty=false + stopUnsyncedTicker; 실패→dirty 유지 + startUnsyncedTicker
forceFlush() -> Promise<void>   // 대기 중 타이머 취소하고 즉시 flushCloud
startUnsyncedTicker() / stopUnsyncedTicker()   // #syncStatus 텍스트 2000ms 교대 / 정리+숨김

/* TEST HELPERS (window.__test, 스텁이 제공) */
__test.signIn(user?)   __test.signOut()   __test.setOffline(bool)
__test.seed(path, obj)  __test.dump() -> object   __test.reset()
```

`currentTripId` (string|null), `currentScreen` (string), `profile` 는 스크립트 상단 다른 `let` 선언들 근처에 둔다. 편집기 `state`, `currentMode` 는 기존 이름 유지.

---

## Task 1: 테스트 하네스 (Playwright + Firebase 스텁 + 정적 서버)

**Files:**
- Create: `package.json`
- Create: `playwright.config.js`
- Create: `tests/support/firebase-stub.js`
- Create: `tests/support/fixtures.js`
- Create: `tests/smoke.spec.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음
- Produces: `tests/support/fixtures.js` 의 `test` (확장된 Playwright test), `window.__test` (스텁 헬퍼), `window.firebase` (compat 스텁)

- [ ] **Step 1: package.json 생성**

```json
{
  "name": "travel-template-v2",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "serve": "serve -l 5199 ."
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "serve": "^14.2.4"
  }
}
```

- [ ] **Step 2: 의존성 설치 + 브라우저 다운로드**

Run:
```bash
npm install
npx playwright install chromium
```
Expected: 성공. `node_modules/` 생성.

- [ ] **Step 3: .gitignore 에 추가**

`.gitignore` 최종 내용:
```
.superpowers/
node_modules/
test-results/
playwright-report/
```

- [ ] **Step 4: playwright.config.js 생성**

```js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 15000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx serve -l 5199 .',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 20000,
  },
});
```

- [ ] **Step 5: tests/support/firebase-stub.js 생성**

이 파일은 페이지의 실제 스크립트보다 먼저 실행된다(`addInitScript`). 실제 `firebasejs` CDN 로드는 fixture 에서 abort 하므로 이 스텁이 살아남는다.

```js
(function () {
  const store = {};              // { "users/u1": {...}, "users/u1/trips/t1": {...} }
  let authUser = null, authCb = null, offline = false, pendingUser = null;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const stamp = () => ({ __ts: Date.now() });
  const rid = () => 'auto_' + Math.random().toString(36).slice(2, 9);

  function docRef(path) {
    return {
      path,
      async get() {
        const d = store[path];
        return { exists: !!d, id: path.split('/').pop(), data: () => clone(d) };
      },
      async set(v, opts) {
        if (offline) throw new Error('offline');
        store[path] = opts && opts.merge ? Object.assign({}, store[path] || {}, clone(v)) : clone(v);
      },
      async update(v) {
        if (offline) throw new Error('offline');
        store[path] = Object.assign({}, store[path] || {}, clone(v));
      },
      async delete() {
        if (offline) throw new Error('offline');
        delete store[path];
      },
      collection(sub) { return collRef(path + '/' + sub); },
    };
  }
  function collRef(path) {
    return {
      path,
      doc(id) { return docRef(path + '/' + (id || rid())); },
      async add(v) {
        if (offline) throw new Error('offline');
        const p = path + '/' + rid();
        store[p] = clone(v);
        return docRef(p);
      },
      async get() {
        const prefix = path + '/';
        const docs = Object.keys(store)
          .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
          .map((k) => ({ id: k.slice(prefix.length), data: () => clone(store[k]) }));
        return { docs, empty: docs.length === 0, forEach: (f) => docs.forEach(f) };
      },
    };
  }
  const fakeAuth = {
    onAuthStateChanged(cb) { authCb = cb; Promise.resolve().then(() => cb(authUser)); return () => {}; },
    async signInWithPopup() {
      authUser = pendingUser || { uid: 'u1', displayName: '김진', email: 'emalration2@gmail.com', photoURL: '' };
      if (authCb) authCb(authUser);
      return { user: authUser };
    },
    async signOut() { authUser = null; if (authCb) authCb(null); },
  };
  const fakeDb = { collection: (p) => collRef(p), doc: (p) => docRef(p) };
  window.firebase = { initializeApp() {}, auth: () => fakeAuth, firestore: () => fakeDb };
  window.firebase.auth.GoogleAuthProvider = function () {};
  window.firebase.firestore.FieldValue = { serverTimestamp: stamp };

  window.__test = {
    signIn(user) { pendingUser = user || null; return fakeAuth.signInWithPopup(); },
    signOut() { return fakeAuth.signOut(); },
    setOffline(v) { offline = !!v; },
    seed(path, obj) { store[path] = clone(obj); },
    dump() { return clone(store); },
    reset() { Object.keys(store).forEach((k) => delete store[k]); authUser = null; offline = false; pendingUser = null; },
  };
})();
```

- [ ] **Step 6: tests/support/fixtures.js 생성**

```js
const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const STUB = fs.readFileSync(path.join(__dirname, 'firebase-stub.js'), 'utf8');

exports.test = base.test.extend({
  page: async ({ page }, use) => {
    // 실제 Firebase SDK 로드 차단 → 주입한 스텁이 window.firebase 를 유지
    await page.route('**/www.gstatic.com/firebasejs/**', (r) => r.abort());
    await page.addInitScript(STUB);
    await use(page);
  },
});
exports.expect = base.expect;
```

- [ ] **Step 7: tests/smoke.spec.js 작성**

```js
const { test, expect } = require('./support/fixtures');

test('페이지가 스텁과 함께 로드된다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.__test)).toBe('object');
  expect(await page.evaluate(() => typeof firebase.firestore)).toBe('function');
  expect(errors).toEqual([]);
});
```

- [ ] **Step 8: 실행 → 통과 확인**

Run: `npx playwright test smoke`
Expected: 1 passed. (현재 `index.html` 은 스텁 firebase 로 `initFirebase()` 가 조용히 동작하므로 pageerror 없음.)

- [ ] **Step 9: 커밋**

```bash
git add package.json playwright.config.js tests .gitignore
git commit -m "test: Playwright + Firebase 스텁 하네스

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: deriveTripMeta (목록용 메타 도출)

**Files:**
- Modify: `index.html` (스크립트에 `/* ===== V2: META ===== */` 구획 추가, `defaultState` 근처)
- Test: `tests/meta.spec.js`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: `deriveTripMeta(tripState) -> {title, startDate, endDate, dayCount}`

- [ ] **Step 1: 실패 테스트 작성 — tests/meta.spec.js**

```js
const { test, expect } = require('./support/fixtures');

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('제목/날짜/일수 도출', async ({ page }) => {
  const r = await page.evaluate(() => deriveTripMeta({
    title: '오사카',
    days: [
      { date: '2026-03-16', items: [] },
      { date: '', items: [] },
      { date: '2026-03-14', items: [] },
    ],
    notes: [], links: [], travelers: [],
  }));
  expect(r).toEqual({ title: '오사카', startDate: '2026-03-14', endDate: '2026-03-16', dayCount: 3 });
});

test('빈 상태 기본값', async ({ page }) => {
  const r = await page.evaluate(() => deriveTripMeta({ title: '', days: [{ date: '', items: [] }] }));
  expect(r).toEqual({ title: '', startDate: '', endDate: '', dayCount: 1 });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test meta`
Expected: FAIL — `deriveTripMeta is not defined`.

- [ ] **Step 3: 구현 — index.html 스크립트에 추가**

`defaultState()` 함수 정의 바로 아래에:

```js
/* ===== V2: META ===== */
function deriveTripMeta(tripState){
  const days = Array.isArray(tripState.days) ? tripState.days : [];
  const dates = days.map(d => (d && d.date) || '').filter(Boolean).sort();
  return {
    title: (tripState.title || '').trim(),
    startDate: dates[0] || '',
    endDate: dates[dates.length - 1] || '',
    dayCount: days.length,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx playwright test meta`
Expected: 2 passed.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/meta.spec.js
git commit -m "feat: deriveTripMeta 목록용 메타 도출

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: 화면 셸 (4개 section + showScreen)

**Files:**
- Modify: `index.html` — `<body>` 구조 재편, `<style>` 에 셸 CSS, 스크립트에 `/* ===== V2: SCREEN SHELL ===== */`
- Test: `tests/shell.spec.js`

**Interfaces:**
- Consumes: 없음
- Produces: `showScreen(name)`, `currentScreen`, DOM: `section[data-screen="landing|mypage|settings|editor"]`

- [ ] **Step 1: 실패 테스트 — tests/shell.spec.js**

```js
const { test, expect } = require('./support/fixtures');
test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('showScreen 이 한 화면만 보인다', async ({ page }) => {
  await page.evaluate(() => showScreen('mypage'));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('section[data-screen="editor"]')).toBeHidden();
  await expect(page.locator('section[data-screen="landing"]')).toBeHidden();
  await page.evaluate(() => showScreen('editor'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await expect(page.locator('section[data-screen="mypage"]')).toBeHidden();
  expect(await page.evaluate(() => currentScreen)).toBe('editor');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test shell`
Expected: FAIL — `section[data-screen=...]` 없음 / `showScreen is not defined`.

- [ ] **Step 3: 마크업 재편 — index.html `<body>`**

`<nav class="tabs">` 부터 `</footer>` 까지 기존 편집기 UI 전체를 `<section data-screen="editor">` 로 감싼다. 그 앞에 landing/mypage/settings 3개 빈 컨테이너를 추가한다. 모달 오버레이(`#modalOverlay`)와 `<script>` 태그들은 섹션 밖에 그대로 둔다.

```html
<body>

<section data-screen="landing" hidden>
  <!-- Task 5 에서 채움 -->
</section>

<section data-screen="mypage" hidden>
  <!-- Task 9 에서 채움 -->
</section>

<section data-screen="settings" hidden>
  <!-- Task 17 에서 채움 -->
</section>

<section data-screen="editor" hidden>
  <nav class="tabs"> ... 기존 그대로 ... </nav>
  <div id="printArea"> ... 기존 그대로 ... </div>
  <footer> ... 기존 그대로 ... </footer>
</section>

<div class="modal-overlay" id="modalOverlay"> ... 기존 그대로 ... </div>

<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
...
```

주의: 기존 `@media print` 규칙이 `nav.tabs, footer` 를 숨기는데, 편집기가 `data-screen="editor"` 안으로 들어가도 셀렉터는 유효하다. 변경 불필요.

- [ ] **Step 4: 셸 CSS — `<style>` 끝부분에 추가**

```css
/* ===== V2 SHELL ===== */
section[data-screen]{display:block;}
section[data-screen][hidden]{display:none !important;}
.v2-wrap{max-width:640px; margin:0 auto; padding:0 16px;}
```

- [ ] **Step 5: showScreen 구현 — 스크립트 상단(전역 let 근처)**

```js
/* ===== V2: SCREEN SHELL ===== */
let currentScreen = 'editor';
function showScreen(name){
  currentScreen = name;
  document.querySelectorAll('section[data-screen]').forEach(s => {
    s.hidden = (s.getAttribute('data-screen') !== name);
  });
}
```

- [ ] **Step 6: INIT 에서 초기 표시 보류**

스크립트 맨 끝 `/* ---------- INIT ---------- */` 블록에서, `rebuildAll(); setMode(currentMode);` 는 유지하되 그 뒤에 `showScreen('editor')` 를 **넣지 않는다** (라우팅은 Task 4 가 `handleAuthChange` 에서 결정). 대신 임시로 `showScreen('editor');` 한 줄을 넣어 Task 3 테스트가 통과하도록 하고, Task 4 에서 제거한다.

`initFirebase();` 바로 위에 추가:
```js
showScreen('editor'); // TEMP: Task 4 에서 handleAuthChange 라우팅으로 대체
```

- [ ] **Step 7: 통과 확인**

Run: `npx playwright test shell smoke`
Expected: 2 files passed.

- [ ] **Step 8: 커밋**

```bash
git add index.html tests/shell.spec.js
git commit -m "feat: 4개 화면 셸 + showScreen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: 인증 라우팅 (handleAuthChange 재작성)

**Files:**
- Modify: `index.html` — 기존 `handleAuthChange` 함수 본문 교체, INIT 의 TEMP 줄 제거
- Test: `tests/routing.spec.js`

**Interfaces:**
- Consumes: `showScreen`, `loadProfile`(Task 6 전엔 임시), `listTrips`+`renderMypage`(Task 7/9 전엔 임시 no-op)
- Produces: `handleAuthChange(user)` — user 있으면 mypage, 없으면 landing

- [ ] **Step 1: 실패 테스트 — tests/routing.spec.js**

```js
const { test, expect } = require('./support/fixtures');

test('로그아웃 상태 → landing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();
});

test('로그인 → mypage, 로그아웃 → landing', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => window.__test.signOut());
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test routing`
Expected: FAIL — 첫 화면이 editor(TEMP), 로그인해도 mypage 로 안 감.

- [ ] **Step 3: 임시 스텁 함수 추가 (Task 6/7/9 가 실제 구현으로 대체)**

`handleAuthChange` 정의 위에:
```js
/* ===== V2: PROFILE STORE (임시, Task 6에서 구현) ===== */
let profile = { avatarId: 'default', tripOrder: [] };
async function loadProfile(){ return profile; }
/* ===== V2: MYPAGE (임시, Task 7/9에서 구현) ===== */
async function refreshTripList(){ /* Task 7 */ }
function renderMypage(){ /* Task 9 */ }
```

- [ ] **Step 4: handleAuthChange 본문 교체**

기존 `async function handleAuthChange(user){ ... }` 전체를:

```js
async function handleAuthChange(user){
  currentUser = user;
  if(user){
    try{
      await loadProfile();
      await refreshTripList();
    }catch(e){ console.error('프로필/여행 로드 실패', e); }
    renderMypage();
    showScreen('mypage');
  } else {
    showScreen('landing');
  }
}
```

`currentUser` 전역은 기존에 이미 선언돼 있으므로 유지.

- [ ] **Step 5: INIT 정리**

`showScreen('editor'); // TEMP` 줄 삭제. `rebuildAll(); setMode(currentMode);` 는 유지(편집기 초기 렌더 준비). `initFirebase()` 가 `onAuthStateChanged` 를 통해 첫 라우팅을 트리거한다.

- [ ] **Step 6: 통과 확인**

Run: `npx playwright test routing shell smoke`
Expected: all passed.

- [ ] **Step 7: 커밋**

```bash
git add index.html tests/routing.spec.js
git commit -m "feat: 인증 상태 기반 landing/mypage 라우팅

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: 표지(landing) 화면

**Files:**
- Modify: `index.html` — `section[data-screen="landing"]` 마크업 + CSS
- Test: `tests/landing.spec.js`

**Interfaces:**
- Consumes: `loginWithGoogle` (기존), `handleAuthChange` (Task 4)
- Produces: DOM `#landingLoginBtn`

- [ ] **Step 1: 실패 테스트 — tests/landing.spec.js**

```js
const { test, expect } = require('./support/fixtures');

test('표지에 소개 + 로그인 버튼', async ({ page }) => {
  await page.goto('/');
  const landing = page.locator('section[data-screen="landing"]');
  await expect(landing.getByText('Travel Template')).toBeVisible();
  await expect(landing.locator('#landingLoginBtn')).toBeVisible();
});

test('로그인 버튼 클릭 → mypage', async ({ page }) => {
  await page.goto('/');
  await page.locator('#landingLoginBtn').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test landing`
Expected: FAIL — `#landingLoginBtn` 없음.

- [ ] **Step 3: 마크업 — section[data-screen="landing"] 내용**

```html
<section data-screen="landing" hidden>
  <div class="v2-wrap landing">
    <img class="landing-icon" src="icon.png" alt="Travel Template">
    <h1 class="landing-title">Travel Template</h1>
    <p class="landing-sub">여행 일정·지출·메모를 한 곳에서</p>
    <ul class="landing-feats">
      <li>날짜별 일정과 장소·메모를 정리</li>
      <li>항목별 지출을 여러 화폐로 기록</li>
      <li>완성한 계획을 PDF로 저장하거나 공유</li>
    </ul>
    <button id="landingLoginBtn" class="landing-login" data-action="login">Google로 계속하기</button>
  </div>
</section>
```

`data-action="login"` 은 기존 클릭 위임(`else if(a === 'login') loginWithGoogle();`)이 처리하므로 별도 핸들러 불필요.

- [ ] **Step 4: CSS — `<style>` 끝에**

```css
/* ===== V2 LANDING ===== */
.landing{padding-top:64px; text-align:center; min-height:100vh;}
.landing-icon{width:76px; height:76px; border-radius:18px; box-shadow:0 8px 24px rgba(27,35,64,.14);}
.landing-title{font-family:'Fraunces',serif; font-size:28px; font-weight:700; color:var(--ink); margin:18px 0 6px;}
.landing-sub{font-size:13.5px; color:var(--ink-soft); margin:0 0 28px;}
.landing-feats{list-style:none; padding:0; margin:0 auto 32px; max-width:300px; text-align:left;}
.landing-feats li{font-size:12.5px; color:var(--ink-soft); padding:9px 0 9px 22px; position:relative; border-bottom:1px solid var(--line);}
.landing-feats li::before{content:"·"; position:absolute; left:8px; color:var(--teal); font-weight:700;}
.landing-login{border:2px solid var(--ink); background:var(--ink); color:#fff; border-radius:999px; padding:12px 26px; font-size:14px; font-weight:700; cursor:pointer;}
```

- [ ] **Step 5: 통과 확인**

Run: `npx playwright test landing routing`
Expected: all passed.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/landing.spec.js
git commit -m "feat: 표지(landing) 화면

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: 프로필 스토어 (users/{uid} 문서)

**Files:**
- Modify: `index.html` — Task 4 의 임시 `loadProfile` 교체, `saveProfile` 추가
- Test: `tests/profile-store.spec.js`

**Interfaces:**
- Consumes: `fbDb` (기존 `firebase.firestore()` 핸들), `currentUser`
- Produces: `loadProfile()`, `saveProfile(patch)`, `profile` (module cache)

- [ ] **Step 1: 실패 테스트 — tests/profile-store.spec.js**

```js
const { test, expect } = require('./support/fixtures');

async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('문서 없으면 기본값', async ({ page }) => {
  await signedIn(page);
  const p = await page.evaluate(() => loadProfile());
  expect(p).toEqual({ avatarId: 'default', tripOrder: [] });
});

test('saveProfile 후 재로드 round-trip', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => saveProfile({ avatarId: 'fox', tripOrder: ['t1', 't2'] }));
  const raw = await page.evaluate(() => window.__test.dump()['users/u1']);
  expect(raw).toMatchObject({ avatarId: 'fox', tripOrder: ['t1', 't2'] });
  const p = await page.evaluate(() => loadProfile());
  expect(p).toEqual({ avatarId: 'fox', tripOrder: ['t1', 't2'] });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test profile-store`
Expected: FAIL — `saveProfile is not defined`, `loadProfile` 이 항상 초기 `profile` 반환.

- [ ] **Step 3: 구현 — Task 4 에서 넣은 임시 PROFILE STORE 블록 교체**

```js
/* ===== V2: PROFILE STORE ===== */
let profile = { avatarId: 'default', tripOrder: [] };
function profileDoc(){ return fbDb.collection('users').doc(currentUser.uid); }
async function loadProfile(){
  const snap = await profileDoc().get();
  const d = snap.exists ? snap.data() : {};
  profile = {
    avatarId: d.avatarId || 'default',
    tripOrder: Array.isArray(d.tripOrder) ? d.tripOrder.slice() : [],
  };
  return profile;
}
async function saveProfile(patch){
  Object.assign(profile, patch);
  await profileDoc().set(
    { avatarId: profile.avatarId, tripOrder: profile.tripOrder },
    { merge: true }
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx playwright test profile-store routing`
Expected: all passed.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/profile-store.spec.js
git commit -m "feat: 프로필 스토어 (avatarId, tripOrder)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: 여행 스토어 — list / load / create

**Files:**
- Modify: `index.html` — `/* ===== V2: TRIP STORE ===== */` 추가, Task 4 임시 `refreshTripList` 교체
- Test: `tests/trip-store-crud.spec.js`

**Interfaces:**
- Consumes: `fbDb`, `currentUser`, `defaultState`, `deriveTripMeta`, `saveProfile`, `profile`
- Produces: `listTrips()`, `loadTrip(id)`, `createTrip()`, `trips` (module cache: 마지막 listTrips 결과), `refreshTripList()` (= `trips = await listTrips()`)

- [ ] **Step 1: 실패 테스트 — tests/trip-store-crud.spec.js**

```js
const { test, expect } = require('./support/fixtures');

async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('createTrip → listTrips 에 메타와 함께 등장, tripOrder 갱신', async ({ page }) => {
  await signedIn(page);
  const id = await page.evaluate(() => createTrip());
  expect(typeof id).toBe('string');
  const list = await page.evaluate(() => listTrips());
  expect(list.length).toBe(1);
  expect(list[0]).toMatchObject({ id, title: '', startDate: '', endDate: '', dayCount: 1 });
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual([id]);
});

test('loadTrip 은 저장된 상태를 파싱해 돌려준다', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => window.__test.seed('users/u1/trips/t9', {
    data: JSON.stringify({ title: '제주', travelers: ['나'], days: [{ id: 'd1', date: '2026-01-05', label: '', items: [] }], notes: [], links: [] }),
    title: '제주', startDate: '2026-01-05', endDate: '2026-01-05', dayCount: 1,
  }));
  const st = await page.evaluate(() => loadTrip('t9'));
  expect(st.title).toBe('제주');
  expect(st.days[0].date).toBe('2026-01-05');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test trip-store-crud`
Expected: FAIL — `createTrip is not defined`.

- [ ] **Step 3: 구현 — TRIP STORE 블록 추가 (PROFILE STORE 아래)**

```js
/* ===== V2: TRIP STORE ===== */
let trips = [];            // 마지막 listTrips() 결과 (메타만)
function tripsCol(){ return fbDb.collection('users').doc(currentUser.uid).collection('trips'); }

async function listTrips(){
  const snap = await tripsCol().get();
  const out = [];
  snap.forEach(doc => {
    const d = doc.data() || {};
    out.push({
      id: doc.id,
      title: d.title || '',
      startDate: d.startDate || '',
      endDate: d.endDate || '',
      dayCount: d.dayCount || 0,
      updatedAt: d.updatedAt || null,
    });
  });
  return out;
}
async function refreshTripList(){ trips = await listTrips(); return trips; }

async function loadTrip(tripId){
  const snap = await tripsCol().doc(tripId).get();
  if(!snap.exists) throw new Error('trip 없음: ' + tripId);
  const st = JSON.parse(snap.data().data);
  if(!Array.isArray(st.links)) st.links = [];
  if(!Array.isArray(st.notes)) st.notes = [];
  if(!Array.isArray(st.travelers)) st.travelers = ['나'];
  return st;
}

async function createTrip(){
  const st = defaultState();
  const meta = deriveTripMeta(st);
  const ref = await tripsCol().add({
    data: JSON.stringify(st),
    title: meta.title, startDate: meta.startDate, endDate: meta.endDate, dayCount: meta.dayCount,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  await saveProfile({ tripOrder: profile.tripOrder.concat(ref.path.split('/').pop()) });
  return ref.path.split('/').pop();
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx playwright test trip-store-crud profile-store`
Expected: all passed.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/trip-store-crud.spec.js
git commit -m "feat: 여행 스토어 list/load/create

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: 여행 스토어 — save / delete

**Files:**
- Modify: `index.html` — TRIP STORE 블록에 `saveTrip`, `deleteTrip` 추가
- Test: `tests/trip-store-savedelete.spec.js`

**Interfaces:**
- Consumes: Task 7 의 것들
- Produces: `saveTrip(tripId, tripState)`, `deleteTrip(tripId)`

- [ ] **Step 1: 실패 테스트 — tests/trip-store-savedelete.spec.js**

```js
const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('saveTrip 은 data + 메타를 함께 쓴다', async ({ page }) => {
  await signedIn(page);
  const id = await page.evaluate(() => createTrip());
  await page.evaluate((id) => saveTrip(id, {
    title: '도쿄', travelers: ['나'],
    days: [{ id: 'd1', date: '2026-04-01', label: '', items: [] }, { id: 'd2', date: '2026-04-03', label: '', items: [] }],
    notes: [], links: [],
  }), id);
  const raw = await page.evaluate((id) => window.__test.dump()['users/u1/trips/' + id], id);
  expect(raw).toMatchObject({ title: '도쿄', startDate: '2026-04-01', endDate: '2026-04-03', dayCount: 2 });
  expect(JSON.parse(raw.data).title).toBe('도쿄');
});

test('deleteTrip 은 문서와 tripOrder 에서 제거', async ({ page }) => {
  await signedIn(page);
  const a = await page.evaluate(() => createTrip());
  const b = await page.evaluate(() => createTrip());
  await page.evaluate((a) => deleteTrip(a), a);
  expect(await page.evaluate((a) => window.__test.dump()['users/u1/trips/' + a], a)).toBeUndefined();
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual([b]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test trip-store-savedelete`
Expected: FAIL — `saveTrip is not defined`.

- [ ] **Step 3: 구현 — TRIP STORE 블록에 이어서**

```js
async function saveTrip(tripId, tripState){
  const meta = deriveTripMeta(tripState);
  await tripsCol().doc(tripId).set({
    data: JSON.stringify(tripState),
    title: meta.title, startDate: meta.startDate, endDate: meta.endDate, dayCount: meta.dayCount,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}
async function deleteTrip(tripId){
  await tripsCol().doc(tripId).delete();
  await saveProfile({ tripOrder: profile.tripOrder.filter(id => id !== tripId) });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx playwright test trip-store-savedelete trip-store-crud`
Expected: all passed.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/trip-store-savedelete.spec.js
git commit -m "feat: 여행 스토어 save/delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: 마이페이지 렌더 (목록 · 카드 · N/5 · 빈 상태)

**Files:**
- Modify: `index.html` — `section[data-screen="mypage"]` 마크업, CSS, `/* ===== V2: MYPAGE ===== */` 에 `renderMypage` 구현
- Test: `tests/mypage-render.spec.js`

**Interfaces:**
- Consumes: `profile`, `trips`, `currentUser`, `avatarEmoji`(임시), `refreshTripList`
- Produces: `renderMypage()`, DOM: `#mpAvatar`, `#mpName`, `#mpCount`, `#mpList`, `#mpNewBtn`, `#mpSettingsRow`, 카드 `.mp-card[data-trip-id]`

- [ ] **Step 1: 실패 테스트 — tests/mypage-render.spec.js**

```js
const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('여행 0개 — 카운트 0/5, 카드 없음', async ({ page }) => {
  await signedIn(page);
  await expect(page.locator('#mpCount')).toHaveText('0 / 5');
  expect(await page.locator('.mp-card').count()).toBe(0);
  await expect(page.locator('#mpNewBtn')).toBeVisible();
  await expect(page.locator('#mpName')).toHaveText('김진');
});

test('여행 2개 — tripOrder 순서대로 카드, 빈 값 처리', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['b', 'a'] });
    window.__test.seed('users/u1/trips/a', { title: '오사카', startDate: '2026-03-14', endDate: '2026-03-17', dayCount: 4 });
    window.__test.seed('users/u1/trips/b', { title: '', startDate: '', endDate: '', dayCount: 3 });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await expect(page.locator('#mpCount')).toHaveText('2 / 5');
  const cards = page.locator('.mp-card');
  await expect(cards.nth(0)).toHaveAttribute('data-trip-id', 'b');
  await expect(cards.nth(0)).toContainText('제목 없는 여행');
  await expect(cards.nth(0)).toContainText('날짜 미정');
  await expect(cards.nth(0)).toContainText('3일');
  await expect(cards.nth(1)).toContainText('오사카');
  await expect(cards.nth(1)).toContainText('2026-03-14');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test mypage-render`
Expected: FAIL — `#mpList` 없음.

- [ ] **Step 3: 마크업 — section[data-screen="mypage"]**

```html
<section data-screen="mypage" hidden>
  <div class="v2-wrap mp">
    <div class="mp-top" id="mpTop" data-action="go-settings">
      <span class="mp-avatar" id="mpAvatar">✈</span>
      <span class="mp-name" id="mpName"></span>
    </div>
    <h2 class="mp-h">내 여행</h2>
    <div class="mp-count" id="mpCount">0 / 5</div>
    <div id="mpList"></div>
    <button class="mp-new" id="mpNewBtn" data-action="new-trip">＋ 새 여행 만들기</button>
    <div class="mp-settings-row" id="mpSettingsRow" data-action="go-settings">⚙ 내 정보 및 옵션</div>
  </div>
</section>
```

- [ ] **Step 4: CSS**

```css
/* ===== V2 MYPAGE ===== */
.mp{padding-top:16px; min-height:100vh;}
.mp-top{display:flex; align-items:center; gap:9px; padding-bottom:11px; border-bottom:1px solid var(--line); cursor:pointer;}
.mp-avatar{width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#1B2340,#243057); color:#fff; display:flex; align-items:center; justify-content:center; font-size:15px; flex:none;}
.mp-avatar.emoji{background:var(--paper-2);}
.mp-name{font-size:13.5px; font-weight:700; color:var(--ink);}
.mp-h{font-family:'Fraunces',serif; font-size:20px; font-weight:700; color:var(--ink); margin:14px 0 3px;}
.mp-count{font-size:11.5px; color:var(--ink-faint); margin-bottom:12px;}
.mp-card{background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px 12px 12px 40px; margin-bottom:9px; position:relative; cursor:pointer;}
.mp-card .mp-title{font-size:14px; font-weight:700; color:var(--ink);}
.mp-card .mp-dates{font-family:'Space Mono',monospace; font-size:10.5px; color:var(--ink-faint); margin-top:3px;}
.mp-card .mp-arrows{position:absolute; left:8px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:2px;}
.mp-card .mp-arrows button{border:none; background:transparent; color:var(--ink-faint); font-size:11px; line-height:1; cursor:pointer; padding:2px;}
.mp-card .mp-arrows button:disabled{opacity:.25; cursor:default;}
.mp-card .mp-del{position:absolute; top:9px; right:10px; border:none; background:transparent; color:#C9CBD8; font-size:12px; cursor:pointer;}
.mp-card.dragging{transform:scale(1.03); box-shadow:0 14px 30px rgba(27,35,64,.22); opacity:.95;}
.mp-new{width:100%; border:1px dashed var(--teal); background:#fff; color:var(--teal); border-radius:14px; padding:13px; font-size:13px; font-weight:700; cursor:pointer; margin-top:2px;}
.mp-settings-row{margin-top:12px; text-align:center; font-size:12.5px; color:var(--teal); font-weight:600; padding:10px; border-top:1px solid var(--line); cursor:pointer;}
```

- [ ] **Step 5: 임시 avatarEmoji (Task 17 이 실제 구현으로 대체)**

MYPAGE 블록 위에:
```js
function avatarEmoji(id){ return id === 'default' || !id ? '✈' : ({dog:'🐶',cat:'🐱',rabbit:'🐰',tiger:'🐯',fox:'🦊',bear:'🐻',panda:'🐼',lion:'🦁'}[id] || '✈'); }
```

- [ ] **Step 6: renderMypage 구현 — 임시 `renderMypage` 교체**

```js
/* ===== V2: MYPAGE ===== */
function orderedTrips(){
  const byId = {};
  trips.forEach(t => { byId[t.id] = t; });
  const seen = {};
  const out = [];
  profile.tripOrder.forEach(id => { if(byId[id]){ out.push(byId[id]); seen[id] = 1; } });
  trips.forEach(t => { if(!seen[t.id]) out.push(t); });  // tripOrder 누락분 뒤에 붙임
  return out;
}
function tripDatesLabel(t){
  if(!t.startDate) return '날짜 미정 · ' + t.dayCount + '일';
  const end = t.endDate && t.endDate !== t.startDate ? ' → ' + t.endDate.slice(5) : '';
  return t.startDate + end + ' · ' + t.dayCount + '일';
}
function renderMypage(){
  const av = document.getElementById('mpAvatar');
  av.textContent = avatarEmoji(profile.avatarId);
  av.classList.toggle('emoji', profile.avatarId && profile.avatarId !== 'default');
  document.getElementById('mpName').textContent =
    (currentUser && (currentUser.displayName || currentUser.email)) || '내 계정';
  const list = orderedTrips();
  document.getElementById('mpCount').textContent = list.length + ' / 5';
  document.getElementById('mpList').innerHTML = list.map((t, i) => `
    <div class="mp-card" data-trip-id="${escapeAttr(t.id)}" data-action="open-trip">
      <span class="mp-arrows">
        <button data-action="move-up" data-trip-id="${escapeAttr(t.id)}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button data-action="move-down" data-trip-id="${escapeAttr(t.id)}" ${i === list.length - 1 ? 'disabled' : ''}>▼</button>
      </span>
      <div class="mp-title">${t.title ? escapeHTML(t.title) : '제목 없는 여행'}</div>
      <div class="mp-dates">${escapeHTML(tripDatesLabel(t))}</div>
      <button class="mp-del" data-action="delete-trip" data-trip-id="${escapeAttr(t.id)}">✕</button>
    </div>`).join('');
}
```

`escapeAttr` 는 기존 파일에 정의돼 있음(line 479 부근).

- [ ] **Step 7: 통과 확인**

Run: `npx playwright test mypage-render routing`
Expected: all passed.

- [ ] **Step 8: 커밋**

```bash
git add index.html tests/mypage-render.spec.js
git commit -m "feat: 마이페이지 목록 렌더

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: 새 여행 생성 + 5개 제한 모달

**Files:**
- Modify: `index.html` — 클릭 위임에 `new-trip` 분기, `handleNewTrip` + `showLimitModal` + 재사용 모달 마크업/CSS, `openTrip` 임시 스텁
- Test: `tests/new-trip-limit.spec.js`

**Interfaces:**
- Consumes: `trips`, `createTrip`, `refreshTripList`, `renderMypage`, `openTrip`(임시)
- Produces: `handleNewTrip()`, `showLimitModal()`, DOM `#v2Modal`, `#v2ModalBody`, `#v2ModalClose`

- [ ] **Step 1: 실패 테스트 — tests/new-trip-limit.spec.js**

```js
const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('새 여행 만들기 → 편집기로, 목록에 1개', async ({ page }) => {
  await signedIn(page);
  await page.locator('#mpNewBtn').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' })); // 재라우팅
  await expect(page.locator('#mpCount')).toHaveText('1 / 5');
});

test('5개면 모달, 생성 안 됨', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['a','b','c','d','e'] });
    ['a','b','c','d','e'].forEach(id => window.__test.seed('users/u1/trips/' + id, { title: id, dayCount: 1 }));
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await page.locator('#mpNewBtn').click();
  await expect(page.locator('#v2Modal')).toBeVisible();
  await expect(page.locator('#v2ModalBody')).toContainText('여행계획은 최대 5개까지 저장할 수 있어요.');
  await expect(page.locator('#v2ModalBody')).toContainText('멤버십을 변경하여 여행계획을 더 늘려보세요.');
  await expect(page.locator('section[data-screen="editor"]')).toBeHidden();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test new-trip-limit`
Expected: FAIL — `#v2Modal` 없음.

- [ ] **Step 3: 재사용 모달 마크업 — `#modalOverlay` 바로 다음에**

```html
<div class="v2-modal-overlay" id="v2Modal" hidden>
  <div class="v2-modal">
    <div class="v2-modal-body" id="v2ModalBody"></div>
    <div class="v2-modal-actions" id="v2ModalActions"></div>
  </div>
</div>
```

- [ ] **Step 4: CSS**

```css
/* ===== V2 MODAL ===== */
.v2-modal-overlay{position:fixed; inset:0; background:rgba(27,35,64,.45); z-index:120; display:flex; align-items:center; justify-content:center; padding:24px;}
.v2-modal-overlay[hidden]{display:none;}
.v2-modal{background:#fff; border-radius:18px; padding:20px 18px; max-width:340px; width:100%; box-shadow:0 18px 44px rgba(27,35,64,.3);}
.v2-modal-body{font-size:13px; color:var(--ink); line-height:1.6; text-align:center; white-space:pre-line;}
.v2-modal-actions{display:flex; gap:8px; margin-top:16px;}
.v2-modal-actions button{flex:1; padding:10px; border-radius:12px; font-size:13px; font-weight:700; cursor:pointer;}
.v2-btn-ghost{border:1px solid var(--line); background:#fff; color:var(--ink-soft);}
.v2-btn-solid{border:none; background:var(--ink); color:#fff;}
.v2-btn-danger{border:none; background:var(--red); color:#fff;}
```

- [ ] **Step 5: 헬퍼 + handleNewTrip 구현 — MYPAGE 블록에**

```js
function v2ModalOpen(bodyText, actionsHtml){
  document.getElementById('v2ModalBody').textContent = bodyText;
  document.getElementById('v2ModalActions').innerHTML = actionsHtml;
  document.getElementById('v2Modal').hidden = false;
}
function v2ModalClose(){ document.getElementById('v2Modal').hidden = true; }

function showLimitModal(){
  v2ModalOpen(
    '여행계획은 최대 5개까지 저장할 수 있어요.\n멤버십을 변경하여 여행계획을 더 늘려보세요.',
    '<button class="v2-btn-solid" data-action="v2modal-close">확인</button>'
  );
}
async function handleNewTrip(){
  if(trips.length >= 5){ showLimitModal(); return; }
  try{
    const id = await createTrip();
    await refreshTripList();
    await openTrip(id);
  }catch(e){ console.error('새 여행 생성 실패', e); }
}
```

- [ ] **Step 6: 임시 openTrip (Task 11 이 실제 구현)**

```js
async function openTrip(tripId){
  currentTripId = tripId;
  state = await loadTrip(tripId);
  rebuildAll(); setMode(currentMode);
  showScreen('editor');
}
```
`currentTripId` 전역 `let currentTripId = null;` 을 스크립트 상단에 선언.

- [ ] **Step 7: 클릭 위임 분기 추가 — `document.addEventListener('click', ...)` 안**

`else if(a === 'login') loginWithGoogle();` 다음 줄들 근처에 추가:
```js
  else if(a === 'new-trip') handleNewTrip();
  else if(a === 'v2modal-close') v2ModalClose();
```

- [ ] **Step 8: 통과 확인**

Run: `npx playwright test new-trip-limit mypage-render`
Expected: all passed.

- [ ] **Step 9: 커밋**

```bash
git add index.html tests/new-trip-limit.spec.js
git commit -m "feat: 새 여행 생성 + 5개 제한 모달

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: 여행 열기 + 편집기 "← 마이페이지" 버튼 / 로그인 UI 제거

**Files:**
- Modify: `index.html` — `nav.tabs` 마크업(로그인 블록 제거, back 버튼 추가), CSS, `openTrip` 정식 구현, 클릭 위임 `open-trip`/`back-to-mypage`
- Test: `tests/open-trip.spec.js`

**Interfaces:**
- Consumes: `loadTrip`, `cacheRead`(Task 12 전엔 없음 → 이 태스크에선 캐시 조정 생략, Task 14 에서 추가), `rebuildAll`, `setMode`, `refreshTripList`, `renderMypage`, `forceFlush`(Task 12 전엔 no-op)
- Produces: `openTrip(tripId)` (정식), `goBackToMypage()`

- [ ] **Step 1: 실패 테스트 — tests/open-trip.spec.js**

```js
const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('카드 탭 → 편집기에 해당 여행 로드', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', {
      data: JSON.stringify({ title: '교토 여행', travelers: ['나'], days: [{ id: 'd1', date: '', label: '', items: [] }], notes: [], links: [] }),
      title: '교토 여행', dayCount: 1,
    });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await page.locator('.mp-card[data-trip-id="t1"] .mp-title').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await expect(page.locator('#inputTitle')).toHaveValue('교토 여행');
  await expect(page.locator('#backToMypage')).toBeVisible();
});

test('← 마이페이지 → 목록 복귀', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: 'X', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: 'X', dayCount: 1 });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await page.locator('.mp-card[data-trip-id="t1"] .mp-title').click();
  await page.locator('#backToMypage').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
});

test('편집기 nav 에 로그인/유저 UI 없음', async ({ page }) => {
  await page.goto('/');
  expect(await page.locator('#loginBtn').count()).toBe(0);
  expect(await page.locator('#userInfo').count()).toBe(0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test open-trip`
Expected: FAIL — `#backToMypage` 없음, `#loginBtn` 아직 존재.

- [ ] **Step 3: nav 마크업 수정 — `.nav-title` 내부**

기존:
```html
<div class="nav-left">
  <span class="stage-badge" id="stageBadge"></span>
  <button class="mode-btn" id="modeBtn" data-action="toggle-mode">완료</button>
</div>
<div class="nav-sync" id="navSync"> ...로그인/유저/상태... </div>
```
로 교체:
```html
<div class="nav-left">
  <span class="stage-badge" id="stageBadge"></span>
  <button class="mode-btn" id="modeBtn" data-action="toggle-mode">완료</button>
</div>
<div class="nav-sync" id="navSync">
  <span class="sync-status" id="syncStatus"></span>
  <button class="sync-btn" id="backToMypage" data-action="back-to-mypage">← 마이페이지</button>
</div>
```
`#loginBtn`, `#userInfo`, `#userAvatar`, `#userName` 요소 삭제. `#syncStatus` 는 유지(Task 16 이 재사용).

- [ ] **Step 4: CSS 조정**

기존 `.nav-sync .sync-status{display:none;}` 규칙을 삭제(이제 Task 16 이 제어). `.nav-sync #userName` 관련 규칙도 삭제. `#backToMypage` 는 기존 `.sync-btn` 스타일 재사용. `.sync-status` 에 다음 추가:
```css
.nav-sync .sync-status{font-size:10.5px; color:var(--red); font-weight:600; white-space:nowrap;}
.nav-sync .sync-status:empty{display:none;}
```

- [ ] **Step 5: openTrip 정식 구현 — Task 10 임시 버전 교체**

```js
async function openTrip(tripId){
  let st;
  try{ st = await loadTrip(tripId); }
  catch(e){ console.error('여행 열기 실패', e); return; }
  currentTripId = tripId;
  state = st;
  if(!Array.isArray(state.links)) state.links = [];
  rebuildAll();
  setMode(currentMode);
  showScreen('editor');
}
async function goBackToMypage(){
  await forceFlush();               // Task 12 전엔 no-op
  await refreshTripList();
  renderMypage();
  showScreen('mypage');
}
```

Task 12 전까지 `forceFlush` 미정의이므로, SYNC 구획 자리에 임시로:
```js
/* ===== V2: SYNC (임시, Task 12/16에서 구현) ===== */
async function forceFlush(){}
```

- [ ] **Step 6: 클릭 위임 분기 — click 핸들러에 추가**

`open-trip` 은 카드 전체에 걸리므로, 화살표/삭제 버튼 클릭이 카드로 버블링되어 여행이 열리는 것을 막아야 한다. 핸들러 상단에서 처리:

```js
  else if(a === 'open-trip') openTrip(btn.dataset.tripId);
  else if(a === 'back-to-mypage') goBackToMypage();
```

그리고 `move-up`/`move-down`/`delete-trip`/`go-settings` 는 각자 분기에서 처리되고 `open-trip` 보다 먼저 매칭되도록, `e.target.closest('[data-action]')` 가 가장 가까운 버튼(화살표/삭제)을 먼저 잡으므로 자연히 우선한다. 확인용으로 `open-trip` 분기는 `btn.dataset.action === 'open-trip'` 일 때만 실행되니 안전.

- [ ] **Step 7: 통과 확인**

Run: `npx playwright test open-trip new-trip-limit routing`
Expected: all passed.

- [ ] **Step 8: 커밋**

```bash
git add index.html tests/open-trip.spec.js
git commit -m "feat: 여행 열기 + 편집기 마이페이지 버튼, 로그인 UI 제거

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: 저장 재배선 + 로컬 캐시 (localStorage = 현재 여행)

**Files:**
- Modify: `index.html` — `/* ===== V2: LOCAL CACHE ===== */` 추가, `save()` 재정의, 기존 `STORAGE_KEY`/`loadFromCloud`/`saveToCloud`/`saveToCloudDebounced` 제거, `SYNC` 구획 정식화
- Test: `tests/save-sync.spec.js`

**Interfaces:**
- Consumes: `saveTrip`, `currentTripId`, `state`, `deriveTripMeta`
- Produces: `LOCAL_KEY`, `cacheRead()`, `cacheWrite(id,st,dirty)`, `cacheClear()`, `save()` (재정의), `scheduleFlush()`, `flushCloud()`, `forceFlush()`

- [ ] **Step 1: 실패 테스트 — tests/save-sync.spec.js**

```js
const { test, expect } = require('./support/fixtures');
async function openEditor(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: '초기', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: '초기', dayCount: 1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('제목 편집 → 로컬 즉시, 클라우드는 ~1초 뒤', async ({ page }) => {
  await openEditor(page);
  await page.fill('#inputTitle', '삿포로');
  await page.dispatchEvent('#inputTitle', 'input');
  // 로컬 캐시 즉시
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('ttv2-current-trip')));
  expect(cached.tripId).toBe('t1');
  expect(JSON.parse(cached.data).title).toBe('삿포로');
  expect(cached.dirty).toBe(true);
  // 클라우드 반영 대기
  await page.waitForTimeout(1300);
  const raw = await page.evaluate(() => window.__test.dump()['users/u1/trips/t1']);
  expect(raw.title).toBe('삿포로');
  expect(JSON.parse(raw.data).title).toBe('삿포로');
  const c2 = await page.evaluate(() => JSON.parse(localStorage.getItem('ttv2-current-trip')));
  expect(c2.dirty).toBe(false);
});

test('구 v1 키를 더 이상 쓰지 않는다', async ({ page }) => {
  await openEditor(page);
  await page.fill('#inputTitle', 'x');
  await page.dispatchEvent('#inputTitle', 'input');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => localStorage.getItem('travel-template-data-v1'))).toBeNull();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test save-sync`
Expected: FAIL — `ttv2-current-trip` 안 만들어짐, 기존 `save()` 가 v1 키 씀.

- [ ] **Step 3: LOCAL CACHE 구획 추가 (defaultState 아래, META 근처)**

```js
/* ===== V2: LOCAL CACHE ===== */
const LOCAL_KEY = 'ttv2-current-trip';
function cacheRead(){
  try{ return JSON.parse(localStorage.getItem(LOCAL_KEY)); }catch(e){ return null; }
}
function cacheWrite(tripId, tripState, dirty){
  try{
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      tripId, data: JSON.stringify(tripState), dirty: !!dirty, localUpdatedAt: Date.now(),
    }));
  }catch(e){}
}
function cacheClear(){ try{ localStorage.removeItem(LOCAL_KEY); }catch(e){} }
```

- [ ] **Step 4: 기존 v1 저장 코드 제거**

삭제할 것:
- `const STORAGE_KEY = 'travel-template-data-v1';` 및 이를 쓰는 `loadState()`, `let state = loadState() || defaultState();` → `let state = defaultState();` 로 대체 (초기값; 실제 값은 openTrip 이 채움)
- `function save()` 기존 본문
- `saveDebounced()` — 유지하되 내부를 `save` 호출로 (아래 Step 5)
- `loadFromCloud`, `saveToCloud`, `saveToCloudDebounced`, `cloudSaveTimer` 전부 삭제
- `handleAuthChange` 는 Task 4 에서 이미 교체됨

`if(!Array.isArray(state.links)) state.links = [];` 같은 초기 정규화 줄은 삭제(openTrip/loadTrip 이 처리).

- [ ] **Step 5: save() 재정의 + SYNC 구획 정식화**

Task 11 에서 넣은 임시 `SYNC` 블록을 교체:
```js
/* ===== V2: SYNC ===== */
let flushTimer = null;

function save(){                 // 편집기 전역에서 호출하던 이름 유지
  if(!currentTripId) return;
  cacheWrite(currentTripId, state, true);
  scheduleFlush();
}
function saveDebounced(){ save(); }   // 기존 호출부 호환

function scheduleFlush(){
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushCloud, 1000);
}
async function flushCloud(){
  clearTimeout(flushTimer); flushTimer = null;
  if(!currentTripId) return;
  const snapshot = JSON.parse(JSON.stringify(state));
  try{
    await saveTrip(currentTripId, snapshot);
    const c = cacheRead();
    if(c && c.tripId === currentTripId) cacheWrite(currentTripId, snapshot, false);
    stopUnsyncedTicker();       // Task 16
  }catch(e){
    startUnsyncedTicker();      // Task 16
  }
}
async function forceFlush(){
  if(flushTimer || (cacheRead() && cacheRead().dirty)) await flushCloud();
}
```

Task 16 전까지 `startUnsyncedTicker`/`stopUnsyncedTicker` 미정의이므로 임시로 위 SYNC 블록 끝에:
```js
function startUnsyncedTicker(){}   // Task 16
function stopUnsyncedTicker(){}    // Task 16
```

- [ ] **Step 6: openTrip 에서 캐시 세팅**

Task 11 의 `openTrip` 에 캐시 초기화 추가 — `state = st;` 다음에:
```js
  cacheWrite(currentTripId, state, false);
```
(Task 14 에서 dirty 조정 로직으로 확장)

- [ ] **Step 7: 통과 확인**

Run: `npx playwright test save-sync open-trip new-trip-limit`
Expected: all passed.

- [ ] **Step 8: 커밋**

```bash
git add index.html tests/save-sync.spec.js
git commit -m "feat: 저장 재배선 + 로컬 캐시, v1 저장 코드 제거

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: 삭제 확인 모달

**Files:**
- Modify: `index.html` — 클릭 위임 `delete-trip`, `showDeleteModal`
- Test: `tests/delete-trip.spec.js`

**Interfaces:**
- Consumes: `deleteTrip`, `refreshTripList`, `renderMypage`, `v2ModalOpen`/`v2ModalClose`, `cacheRead`/`cacheClear`, `currentTripId`
- Produces: `showDeleteModal(tripId)`

- [ ] **Step 1: 실패 테스트 — tests/delete-trip.spec.js**

```js
const { test, expect } = require('./support/fixtures');
async function signedInWith(page, order){
  await page.goto('/');
  await page.evaluate((order) => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: order });
    order.forEach(id => window.__test.seed('users/u1/trips/' + id, { title: id.toUpperCase(), dayCount: 1 }));
  }, order);
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
}

test('✕ → 확인 모달 → 삭제 시 목록/순서에서 제거', async ({ page }) => {
  await signedInWith(page, ['a', 'b']);
  await page.locator('.mp-card[data-trip-id="a"] .mp-del').click();
  await expect(page.locator('#v2ModalBody')).toContainText('이 여행을 삭제할까요?');
  await expect(page.locator('#v2ModalBody')).toContainText('되돌릴 수 없습니다.');
  await page.locator('#v2Modal').getByText('삭제', { exact: true }).click();
  await expect(page.locator('.mp-card')).toHaveCount(1);
  await expect(page.locator('.mp-card').first()).toHaveAttribute('data-trip-id', 'b');
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual(['b']);
});

test('취소 시 아무 일 없음', async ({ page }) => {
  await signedInWith(page, ['a', 'b']);
  await page.locator('.mp-card[data-trip-id="a"] .mp-del').click();
  await page.locator('#v2Modal').getByText('취소', { exact: true }).click();
  await expect(page.locator('.mp-card')).toHaveCount(2);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test delete-trip`
Expected: FAIL — `delete-trip` 액션이 `showDeleteModal` 로 연결 안 됨.

- [ ] **Step 3: showDeleteModal 구현 — MYPAGE 블록**

```js
function showDeleteModal(tripId){
  v2ModalOpen(
    '이 여행을 삭제할까요?\n되돌릴 수 없습니다.',
    '<button class="v2-btn-ghost" data-action="v2modal-close">취소</button>' +
    '<button class="v2-btn-danger" data-action="confirm-delete-trip" data-trip-id="' + escapeAttr(tripId) + '">삭제</button>'
  );
}
async function confirmDeleteTrip(tripId){
  v2ModalClose();
  try{
    await deleteTrip(tripId);
    const c = cacheRead();
    if(c && c.tripId === tripId) cacheClear();
    await refreshTripList();
    renderMypage();
  }catch(e){ console.error('삭제 실패', e); }
}
```

- [ ] **Step 4: 클릭 위임 분기**

```js
  else if(a === 'delete-trip') showDeleteModal(btn.dataset.tripId);
  else if(a === 'confirm-delete-trip') confirmDeleteTrip(btn.dataset.tripId);
```

- [ ] **Step 5: 통과 확인**

Run: `npx playwright test delete-trip mypage-render`
Expected: all passed.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/delete-trip.spec.js
git commit -m "feat: 여행 삭제 확인 모달

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: 다시 열 때 캐시 조정 (dirty 로컬 우선 + flush)

**Files:**
- Modify: `index.html` — `openTrip` 의 캐시 분기 확장
- Test: `tests/reopen-reconcile.spec.js`

**Interfaces:**
- Consumes: `cacheRead`, `loadTrip`, `flushCloud`, `currentTripId`, `state`
- Produces: `openTrip` (캐시 조정 포함 최종형)

- [ ] **Step 1: 실패 테스트 — tests/reopen-reconcile.spec.js**

```js
const { test, expect } = require('./support/fixtures');

test('dirty 로컬 캐시가 있으면 그 버전으로 열고 클라우드에 밀어올린다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: '클라우드제목', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: '클라우드제목', dayCount: 1 });
    localStorage.setItem('ttv2-current-trip', JSON.stringify({
      tripId: 't1',
      data: JSON.stringify({ title: '로컬미저장제목', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }),
      dirty: true, localUpdatedAt: Date.now(),
    }));
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('#inputTitle')).toHaveValue('로컬미저장제목');
  await page.waitForTimeout(300);
  const raw = await page.evaluate(() => window.__test.dump()['users/u1/trips/t1']);
  expect(raw.title).toBe('로컬미저장제목');
});

test('캐시가 다른 여행 것이면 클라우드 버전으로 연다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: '클라우드', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: '클라우드', dayCount: 1 });
    localStorage.setItem('ttv2-current-trip', JSON.stringify({ tripId: 'OTHER', data: JSON.stringify({ title: '엉뚱', days: [] }), dirty: true, localUpdatedAt: Date.now() }));
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('#inputTitle')).toHaveValue('클라우드');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test reopen-reconcile`
Expected: FAIL — 첫 테스트에서 클라우드 제목이 로드됨.

- [ ] **Step 3: openTrip 캐시 조정 로직 — Step 5(Task 11)/Step 6(Task 12) 버전 교체**

```js
async function openTrip(tripId){
  const cached = cacheRead();
  let st, needsPush = false;
  if(cached && cached.tripId === tripId && cached.dirty){
    try{ st = JSON.parse(cached.data); needsPush = true; }
    catch(e){ st = null; }
  }
  if(!st){
    try{ st = await loadTrip(tripId); }
    catch(e){ console.error('여행 열기 실패', e); return; }
  }
  currentTripId = tripId;
  state = st;
  if(!Array.isArray(state.links)) state.links = [];
  if(!Array.isArray(state.notes)) state.notes = [];
  cacheWrite(currentTripId, state, needsPush);
  rebuildAll();
  setMode(currentMode);
  showScreen('editor');
  if(needsPush) flushCloud();
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx playwright test reopen-reconcile save-sync open-trip`
Expected: all passed.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/reopen-reconcile.spec.js
git commit -m "feat: 재오픈 시 dirty 로컬 캐시 우선 + flush

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: 순서 편집 — 위/아래 화살표

**Files:**
- Modify: `index.html` — 클릭 위임 `move-up`/`move-down`, `moveTrip`
- Test: `tests/reorder-arrows.spec.js`

**Interfaces:**
- Consumes: `profile`, `saveProfile`, `renderMypage`, `orderedTrips`
- Produces: `moveTrip(tripId, dir)` (dir: -1 위, +1 아래)

- [ ] **Step 1: 실패 테스트 — tests/reorder-arrows.spec.js**

```js
const { test, expect } = require('./support/fixtures');
async function setup(page, order){
  await page.goto('/');
  await page.evaluate((order) => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: order });
    order.forEach(id => window.__test.seed('users/u1/trips/' + id, { title: id.toUpperCase(), dayCount: 1 }));
  }, order);
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
}

test('가운데 항목 ▲ → 위로', async ({ page }) => {
  await setup(page, ['a', 'b', 'c']);
  await page.locator('.mp-card[data-trip-id="b"] [data-action="move-up"]').click();
  const ids = await page.locator('.mp-card').evaluateAll(els => els.map(e => e.dataset.tripId));
  expect(ids).toEqual(['b', 'a', 'c']);
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual(['b', 'a', 'c']);
});

test('맨 위 ▲ 비활성, 맨 아래 ▼ 비활성', async ({ page }) => {
  await setup(page, ['a', 'b']);
  await expect(page.locator('.mp-card[data-trip-id="a"] [data-action="move-up"]')).toBeDisabled();
  await expect(page.locator('.mp-card[data-trip-id="b"] [data-action="move-down"]')).toBeDisabled();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test reorder-arrows`
Expected: FAIL — `move-up` 액션 미연결.

- [ ] **Step 3: moveTrip 구현 — MYPAGE 블록**

```js
function currentOrder(){ return orderedTrips().map(t => t.id); }
async function moveTrip(tripId, dir){
  const order = currentOrder();
  const i = order.indexOf(tripId);
  const j = i + dir;
  if(i < 0 || j < 0 || j >= order.length) return;
  order.splice(i, 1);
  order.splice(j, 0, tripId);
  await saveProfile({ tripOrder: order });
  renderMypage();
}
```

`orderedTrips()` 를 순서 기준으로 삼으면 `tripOrder` 에 누락됐던 항목도 확정 반영된다.

- [ ] **Step 4: 클릭 위임 분기**

```js
  else if(a === 'move-up') moveTrip(btn.dataset.tripId, -1);
  else if(a === 'move-down') moveTrip(btn.dataset.tripId, 1);
```

- [ ] **Step 5: 통과 확인**

Run: `npx playwright test reorder-arrows mypage-render delete-trip`
Expected: all passed.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/reorder-arrows.spec.js
git commit -m "feat: 순서 편집 위/아래 화살표

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: 미동기화 표시 (문구 2개 교대)

**Files:**
- Modify: `index.html` — SYNC 구획의 임시 ticker 함수 교체
- Test: `tests/unsynced-indicator.spec.js`

**Interfaces:**
- Consumes: `#syncStatus` DOM
- Produces: `startUnsyncedTicker()`, `stopUnsyncedTicker()`

- [ ] **Step 1: 실패 테스트 — tests/unsynced-indicator.spec.js**

```js
const { test, expect } = require('./support/fixtures');
async function openEditor(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: 'A', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: 'A', dayCount: 1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('오프라인 편집 → 문구 두 개가 번갈아, 온라인 복귀 → 사라짐', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => window.__test.setOffline(true));
  await page.fill('#inputTitle', '오프라인편집');
  await page.dispatchEvent('#inputTitle', 'input');
  await page.waitForTimeout(1300);           // flush 시도 → 실패 → ticker 시작
  await expect(page.locator('#syncStatus')).toHaveText('클라우드 저장 안됨');
  await page.waitForTimeout(2100);
  await expect(page.locator('#syncStatus')).toHaveText('인터넷 연결 확인');
  // 로컬엔 남아있다
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('ttv2-current-trip')));
  expect(JSON.parse(cached.data).title).toBe('오프라인편집');
  // 복귀
  await page.evaluate(() => window.__test.setOffline(false));
  await page.fill('#inputTitle', '복구됨');
  await page.dispatchEvent('#inputTitle', 'input');
  await page.waitForTimeout(1300);
  await expect(page.locator('#syncStatus')).toHaveText('');
  const raw = await page.evaluate(() => window.__test.dump()['users/u1/trips/t1']);
  expect(raw.title).toBe('복구됨');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test unsynced-indicator`
Expected: FAIL — ticker no-op, `#syncStatus` 비어 있음.

- [ ] **Step 3: ticker 구현 — SYNC 구획 임시 함수 2개 교체**

```js
let unsyncedTimer = null;
const UNSYNCED_MSGS = ['클라우드 저장 안됨', '인터넷 연결 확인'];
function startUnsyncedTicker(){
  const el = document.getElementById('syncStatus');
  if(!el) return;
  if(unsyncedTimer) return;                 // 이미 돌고 있음
  let i = 0;
  el.textContent = UNSYNCED_MSGS[0];
  unsyncedTimer = setInterval(() => {
    i = (i + 1) % UNSYNCED_MSGS.length;
    el.textContent = UNSYNCED_MSGS[i];
  }, 2000);
}
function stopUnsyncedTicker(){
  if(unsyncedTimer){ clearInterval(unsyncedTimer); unsyncedTimer = null; }
  const el = document.getElementById('syncStatus');
  if(el) el.textContent = '';
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx playwright test unsynced-indicator save-sync`
Expected: all passed.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/unsynced-indicator.spec.js
git commit -m "feat: 미동기화 표시 문구 교대

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 17: 설정 화면 + 아바타 팝업

**Files:**
- Modify: `index.html` — `section[data-screen="settings"]` 마크업/CSS, `/* ===== V2: SETTINGS ===== */`, 클릭 위임 분기, 임시 `avatarEmoji` 를 `AVATARS` 기반으로 정리
- Test: `tests/settings-avatar.spec.js`

**Interfaces:**
- Consumes: `currentUser`, `profile`, `saveProfile`, `renderMypage`, `showScreen`, `logoutUser`, `avatarEmoji`, `v2ModalOpen`/`v2ModalClose`
- Produces: `renderSettings()`, `openAvatarModal()`, `chooseAvatarPending(id)`, `saveAvatar()`, `AVATARS`

- [ ] **Step 1: 실패 테스트 — tests/settings-avatar.spec.js**

```js
const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'kim@x.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('상단 바 탭 → 설정, 계정 정보 노출', async ({ page }) => {
  await signedIn(page);
  await page.locator('#mpTop').click();
  await expect(page.locator('section[data-screen="settings"]')).toBeVisible();
  await expect(page.locator('#setName')).toHaveText('김진');
  await expect(page.locator('#setEmail')).toHaveText('kim@x.com');
  await expect(page.locator('#setLang')).toContainText('준비 중');
  await expect(page.locator('#setTheme')).toContainText('준비 중');
});

test('아바타 변경 → 팝업 → 저장 → 마이페이지 반영 + 영속', async ({ page }) => {
  await signedIn(page);
  await page.locator('#mpTop').click();
  await page.locator('#setAvatarRow').click();
  await expect(page.locator('#v2Modal')).toBeVisible();
  await page.locator('#v2Modal [data-avatar="fox"]').click();
  await page.locator('#v2Modal').getByText('저장', { exact: true }).click();
  await expect(page.locator('#setAvatarBig')).toHaveText('🦊');
  await page.locator('#setBack').click();
  await expect(page.locator('#mpAvatar')).toHaveText('🦊');
  expect(await page.evaluate(() => window.__test.dump()['users/u1'].avatarId)).toBe('fox');
});

test('기본으로 되돌리기 → ✈', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => saveProfile({ avatarId: 'bear' }));
  await page.locator('#mpTop').click();
  await page.locator('#setAvatarRow').click();
  await page.locator('#v2Modal').getByText('기본(✈)으로', { exact: true }).click();
  await page.locator('#v2Modal').getByText('저장', { exact: true }).click();
  await expect(page.locator('#setAvatarBig')).toHaveText('✈');
});

test('로그아웃 → 표지', async ({ page }) => {
  await signedIn(page);
  await page.locator('#mpTop').click();
  await page.locator('#setLogout').click();
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test settings-avatar`
Expected: FAIL — settings 마크업/함수 없음.

- [ ] **Step 3: 마크업 — section[data-screen="settings"]**

```html
<section data-screen="settings" hidden>
  <div class="v2-wrap set">
    <button class="set-back" id="setBack" data-action="go-mypage">← 내 여행</button>
    <div class="set-account">
      <span class="set-avatar-big" id="setAvatarBig">✈</span>
      <div>
        <div class="set-name" id="setName"></div>
        <div class="set-email" id="setEmail"></div>
      </div>
    </div>
    <div class="set-row" id="setAvatarRow" data-action="open-avatar"><span>아바타 변경</span><span class="set-chev">›</span></div>
    <div class="set-row set-disabled" id="setLang"><span>언어</span><span class="set-soon">준비 중</span></div>
    <div class="set-row set-disabled" id="setTheme"><span>컬러 테마</span><span class="set-soon">준비 중</span></div>
    <button class="set-logout" id="setLogout" data-action="logout">로그아웃</button>
  </div>
</section>
```

`data-action="logout"` 은 기존 위임(`else if(a === 'logout') logoutUser();`)이 처리 → `handleAuthChange(null)` → landing.

- [ ] **Step 4: CSS**

```css
/* ===== V2 SETTINGS ===== */
.set{padding-top:16px; min-height:100vh;}
.set-back{border:none; background:transparent; color:var(--teal); font-size:11.5px; font-weight:700; cursor:pointer; padding:0 0 14px;}
.set-account{display:flex; align-items:center; gap:12px; padding:4px 2px 18px; border-bottom:1px solid var(--line);}
.set-avatar-big{width:52px; height:52px; border-radius:50%; background:linear-gradient(135deg,#1B2340,#243057); color:#fff; display:flex; align-items:center; justify-content:center; font-size:24px; flex:none;}
.set-avatar-big.emoji{background:var(--paper-2);}
.set-name{font-size:14px; font-weight:700; color:var(--ink);}
.set-email{font-size:11.5px; color:var(--ink-faint); margin-top:2px;}
.set-row{display:flex; justify-content:space-between; align-items:center; padding:13px 2px; font-size:12.5px; color:var(--ink-soft); border-bottom:1px solid var(--line); cursor:pointer;}
.set-row.set-disabled{cursor:default; color:var(--ink-faint);}
.set-chev{color:#C9CBD8;}
.set-soon{font-size:10px; color:#B4B8C8; background:var(--paper-2); padding:2px 7px; border-radius:999px;}
.set-logout{margin-top:16px; width:100%; border:1px solid #F1C9D3; background:#fff; color:var(--red); border-radius:999px; padding:10px; font-size:12.5px; font-weight:700; cursor:pointer;}
/* 아바타 팝업 그리드 */
.av-grid{display:grid; grid-template-columns:repeat(4,1fr); gap:12px 8px; margin:6px 0 4px;}
.av-cell{width:100%; aspect-ratio:1; border-radius:50%; background:var(--paper-2); display:flex; align-items:center; justify-content:center; font-size:22px; cursor:pointer;}
.av-cell.default-glyph{background:linear-gradient(135deg,#1B2340,#243057); color:#fff;}
.av-cell.sel{outline:2.5px solid var(--teal); outline-offset:2px;}
.av-reset{font-size:10.5px; color:var(--ink-faint); text-decoration:underline; background:none; border:none; cursor:pointer;}
```

- [ ] **Step 5: SETTINGS 구획 구현**

```js
/* ===== V2: SETTINGS ===== */
const AVATARS = [
  { id: 'default', glyph: '✈' }, { id: 'dog', glyph: '🐶' }, { id: 'cat', glyph: '🐱' },
  { id: 'rabbit', glyph: '🐰' }, { id: 'tiger', glyph: '🐯' }, { id: 'fox', glyph: '🦊' },
  { id: 'bear', glyph: '🐻' }, { id: 'panda', glyph: '🐼' }, { id: 'lion', glyph: '🦁' },
];
function avatarEmoji(id){
  const a = AVATARS.find(x => x.id === id);
  return a ? a.glyph : '✈';
}
function renderSettings(){
  const big = document.getElementById('setAvatarBig');
  big.textContent = avatarEmoji(profile.avatarId);
  big.classList.toggle('emoji', profile.avatarId && profile.avatarId !== 'default');
  document.getElementById('setName').textContent = (currentUser && currentUser.displayName) || '내 계정';
  document.getElementById('setEmail').textContent = (currentUser && currentUser.email) || '';
}
let pendingAvatar = null;
function openAvatarModal(){
  pendingAvatar = profile.avatarId || 'default';
  const grid = AVATARS.filter(a => a.id !== 'default').map(a =>
    `<div class="av-cell${pendingAvatar === a.id ? ' sel' : ''}" data-avatar="${a.id}">${a.glyph}</div>`
  ).join('');
  document.getElementById('v2ModalBody').innerHTML =
    '<div style="font-weight:700;font-size:13px;margin-bottom:4px">아바타 선택</div>' +
    '<div style="font-size:10.5px;color:#8A90AE;margin-bottom:8px">기본값은 ✈ Travel Template 아이콘</div>' +
    '<div class="av-grid">' + grid + '</div>';
  document.getElementById('v2ModalActions').innerHTML =
    '<button class="av-reset" data-action="avatar-reset">기본(✈)으로</button>' +
    '<button class="v2-btn-solid" data-action="avatar-save" style="flex:0 0 auto;padding:8px 18px">저장</button>';
  document.getElementById('v2Modal').hidden = false;
}
function pickPendingAvatar(id){
  pendingAvatar = id;
  document.querySelectorAll('#v2Modal .av-cell').forEach(c =>
    c.classList.toggle('sel', c.dataset.avatar === id));
}
async function saveAvatar(){
  document.getElementById('v2Modal').hidden = true;
  await saveProfile({ avatarId: pendingAvatar || 'default' });
  renderSettings();
  renderMypage();
}
```

- [ ] **Step 6: 클릭 위임 분기 + go-settings/go-mypage**

```js
  else if(a === 'go-settings'){ renderSettings(); showScreen('settings'); }
  else if(a === 'go-mypage'){ renderMypage(); showScreen('mypage'); }
  else if(a === 'open-avatar') openAvatarModal();
  else if(a === 'avatar-reset') pickPendingAvatar('default');
  else if(a === 'avatar-save') saveAvatar();
```

그리고 아바타 셀은 `data-action` 이 아니라 `data-avatar` 속성이므로, click 핸들러 맨 위(=`btn` 계산 직후)에 별도 처리:
```js
  const avCell = e.target.closest('#v2Modal .av-cell');
  if(avCell){ pickPendingAvatar(avCell.dataset.avatar); return; }
```

- [ ] **Step 7: 통과 확인**

Run: `npx playwright test settings-avatar mypage-render routing`
Expected: all passed.

- [ ] **Step 8: 커밋**

```bash
git add index.html tests/settings-avatar.spec.js
git commit -m "feat: 설정 화면 + 아바타 팝업

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 18: 순서 편집 — 롱프레스 드래그

**Files:**
- Modify: `index.html` — `#mpList` 포인터 이벤트 핸들러, 드래그 상태 CSS(이미 `.mp-card.dragging` 있음)
- Test: `tests/reorder-drag.spec.js`

**Interfaces:**
- Consumes: `currentOrder`, `saveProfile`, `renderMypage`, `openTrip`
- Produces: `initMypageDrag()` (INIT 에서 1회 호출), 내부 상태 머신 (전역 함수 노출 불필요)

- [ ] **Step 1: 실패 테스트 — tests/reorder-drag.spec.js**

```js
const { test, expect } = require('./support/fixtures');
async function setup(page, order){
  await page.goto('/');
  await page.evaluate((order) => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: order });
    order.forEach(id => window.__test.seed('users/u1/trips/' + id, {
      data: JSON.stringify({ title: id.toUpperCase(), travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }),
      title: id.toUpperCase(), dayCount: 1,
    }));
  }, order);
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
}

test('롱프레스 후 드래그로 순서 변경', async ({ page }) => {
  await setup(page, ['a', 'b', 'c']);
  const first = page.locator('.mp-card[data-trip-id="a"]');
  const third = page.locator('.mp-card[data-trip-id="c"]');
  const b1 = await first.boundingBox();
  const b3 = await third.boundingBox();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);                       // 롱프레스 임계 통과
  await expect(first).toHaveClass(/dragging/);
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2, { steps: 8 });
  await page.mouse.up();
  const ids = await page.locator('.mp-card').evaluateAll(els => els.map(e => e.dataset.tripId));
  expect(ids).toEqual(['b', 'c', 'a']);
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual(['b', 'c', 'a']);
});

test('빠른 탭(롱프레스 아님) → 여행 열기', async ({ page }) => {
  await setup(page, ['a', 'b']);
  await page.locator('.mp-card[data-trip-id="b"] .mp-title').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await expect(page.locator('#inputTitle')).toHaveValue('B');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test reorder-drag`
Expected: FAIL — 드래그해도 순서 안 바뀜(첫 테스트). 두 번째(빠른 탭)는 이미 통과할 수 있음.

- [ ] **Step 3: 드래그 상태 머신 — MYPAGE 블록에**

```js
function initMypageDrag(){
  const list = document.getElementById('mpList');
  let pressTimer = null, dragEl = null, dragId = null, startY = 0, longPressed = false;

  function cleanup(){
    clearTimeout(pressTimer); pressTimer = null;
    if(dragEl) dragEl.classList.remove('dragging');
    dragEl = null; dragId = null; longPressed = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  }
  function onDown(e){
    const card = e.target.closest('.mp-card');
    if(!card) return;
    if(e.target.closest('.mp-arrows') || e.target.closest('.mp-del')) return;  // 화살표/삭제는 제외
    dragEl = card; dragId = card.dataset.tripId; startY = e.clientY; longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      card.classList.add('dragging');
    }, 500);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }
  function onMove(e){
    if(!dragEl) return;
    if(!longPressed){
      if(Math.abs(e.clientY - startY) > 8) cleanup();   // 롱프레스 전 움직임 → 취소(스크롤 등)
      return;
    }
    e.preventDefault();
    const cards = [...list.querySelectorAll('.mp-card:not(.dragging)')];
    const after = cards.find(c => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if(after) list.insertBefore(dragEl, after);
    else list.appendChild(dragEl);
  }
  async function onUp(){
    const wasLong = longPressed;
    if(wasLong){
      const newOrder = [...list.querySelectorAll('.mp-card')].map(c => c.dataset.tripId);
      cleanup();
      await saveProfile({ tripOrder: newOrder });
      renderMypage();
    } else {
      cleanup();
      // 빠른 탭은 click 위임(open-trip)이 별도로 처리하므로 여기선 아무 것도 안 함
    }
  }
  list.addEventListener('pointerdown', onDown);
}
```

- [ ] **Step 4: 롱프레스와 click 충돌 방지**

롱프레스 드래그가 끝나면 브라우저가 `click` 도 발생시켜 `open-trip` 이 트리거될 수 있다. `onUp` 에서 `wasLong` 이면 다음 click 1회를 무시:

`initMypageDrag` 안에 추가:
```js
  let swallowNextClick = false;
  list.addEventListener('click', (e) => {
    if(swallowNextClick){ e.stopPropagation(); e.preventDefault(); swallowNextClick = false; }
  }, true);
```
그리고 `onUp` 의 `if(wasLong){ ... }` 첫 줄에 `swallowNextClick = true;` 추가.

- [ ] **Step 5: INIT 에서 1회 등록**

스크립트 끝 INIT 블록, `initFirebase();` 앞에:
```js
initMypageDrag();
```

- [ ] **Step 6: 통과 확인**

Run: `npx playwright test reorder-drag reorder-arrows open-trip`
Expected: all passed.

- [ ] **Step 7: 커밋**

```bash
git add index.html tests/reorder-drag.spec.js
git commit -m "feat: 순서 편집 롱프레스 드래그

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 19: 정리 · 전체 흐름 스모크 · 배포

**Files:**
- Modify: `index.html` — 죽은 코드/문구 정리
- Test: `tests/full-flow.spec.js`

**Interfaces:**
- Consumes: 전체
- Produces: 없음 (검증 + 배포)

- [ ] **Step 1: 죽은 코드 스캔 및 제거 — index.html**

확인하고 남아 있으면 삭제:
- `updateMiniTitle()` 호출/정의 — 이미 no-op이면 그대로 둬도 무방하나, 정의와 `rebuildAll` 내 호출 모두 제거해도 됨.
- `STORAGE_KEY`, `loadState`, `loadFromCloud`, `saveToCloud`, `saveToCloudDebounced`, `cloudSaveTimer`, 옛 `handleAuthChange` 잔재 — 전부 없어야 함.
- footer 문구 `모든 내용은 이 기기의 브라우저에 자동 저장됩니다` → `로그인한 계정에 자동 저장됩니다` 로 변경.
- `resetAll()` 의 `save()` 호출은 유지(현재 여행을 기본 상태로). 단 `data-action="reset"` 버튼은 그대로 편집기 footer 에 남긴다(현재 여행 초기화 용도).

- [ ] **Step 2: 전체 흐름 스모크 — tests/full-flow.spec.js**

```js
const { test, expect } = require('./support/fixtures');

test('로그인 → 새 여행 → 편집 → 목록 복귀 → 재오픈 → 삭제', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();

  await page.locator('#landingLoginBtn').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('#mpCount')).toHaveText('0 / 5');

  await page.locator('#mpNewBtn').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await page.fill('#inputTitle', '방콕 4일');
  await page.dispatchEvent('#inputTitle', 'input');
  await page.waitForTimeout(1300);

  await page.locator('#backToMypage').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('#mpCount')).toHaveText('1 / 5');
  await expect(page.locator('.mp-card')).toContainText('방콕 4일');

  await page.locator('.mp-card .mp-title').click();
  await expect(page.locator('#inputTitle')).toHaveValue('방콕 4일');

  await page.locator('#backToMypage').click();
  await page.locator('.mp-card .mp-del').click();
  await page.locator('#v2Modal').getByText('삭제', { exact: true }).click();
  await expect(page.locator('.mp-card')).toHaveCount(0);
  await expect(page.locator('#mpCount')).toHaveText('0 / 5');
});
```

- [ ] **Step 3: 전체 스위트 실행**

Run: `npx playwright test`
Expected: 모든 spec 통과.

- [ ] **Step 4: 브라우저 수동 확인 (preview 도구)**

`.claude/launch.json` 에 항목 추가(있으면 생략):
```json
{ "name": "ttv2", "runtimeExecutable": "npx", "runtimeArgs": ["--yes", "serve", "-l", "5199", "."], "port": 5199 }
```
`preview_start` 로 `ttv2` 실행 → landing 스크린샷, 콘솔 에러 없음 확인. (실제 Firebase 로그인은 수동 확인 영역이라 스킵.)

- [ ] **Step 5: 커밋 + 푸시**

```bash
git add index.html tests/full-flow.spec.js .claude/launch.json
git commit -m "chore: 죽은 코드 정리 + 전체 흐름 스모크

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 6: 배포 확인**

`https://emalration2-sketch.github.io/travel-template-v2/` 접속 → 표지 화면이 뜨는지, 콘솔 에러 없는지 확인. GitHub Pages 반영에 1~2분.

- [ ] **Step 7: 사용자 안내**

푸시 후 사용자에게:
1. 라이브 URL 에서 실제 구글 로그인 1회 테스트 (Firebase 승인 도메인 정상 여부).
2. Firebase 콘솔에서 기존 `users` 컬렉션 삭제 (v1 데이터 정리) — 원할 때.

---

## Self-Review

**1. Spec coverage**

| 스펙 항목 | 태스크 |
|---|---|
| 4개 화면 셸 / showScreen / 라우팅 | 3, 4 |
| 표지: 아이콘·소개·기능 미리보기·구글 로그인 | 5 |
| 로그인 후 항상 마이페이지 | 4 |
| 새로고침 시 항상 마이페이지 (편집기 복귀 안 함) | 4 (INIT 라우팅), 11 |
| 데이터 모델 `users/{uid}` `{avatarId, tripOrder}` | 6 |
| `users/{uid}/trips/{tripId}` `{data, title, startDate, endDate, dayCount, updatedAt}` | 7, 8 |
| 저장 포맷 JSON | 7, 8 |
| 목록용 필드 비정규화 | 2, 8 |
| 보안 규칙 미변경 | (변경 없음 — 명시) |
| v1 Firestore 데이터 수동 삭제 / 마이그레이션 없음 | 19 Step 7 (안내) |
| 마이페이지 A안: 상단 아바타+이름, N/5, 카드(제목/날짜/일수), 빈 상태 | 9 |
| 카드 빈 값: "제목 없는 여행" / "날짜 미정" / "N일" | 9 |
| 새 여행: 탭 즉시 생성, 빈 여행도 카운트 | 7, 10 |
| 5개 제한 팝업 (정확 문구) | 10 |
| 5개일 때 버튼 활성 유지, 눌러야 안내 | 10 |
| 삭제 확인 팝업 (정확 문구) + Firestore 삭제 + tripOrder + 로컬 캐시 | 8, 13 |
| 순서: tripOrder 배열 | 6, 7 |
| 순서 편집: 위/아래 화살표 | 15 |
| 순서 편집: 롱프레스(~0.5s) 드래그, 드롭 시 자동 해제, 시각 표시 | 18 |
| 정렬 = 슬롯 순서만 (최근 수정순 폐기) | 9 (`orderedTrips`) |
| 설정: 계정(아바타 크게/이름/이메일), 아바타 변경, 언어/테마 준비 중, 로그아웃 | 17 |
| 아바타: 팝업, 동물 8종 4×2, 기본 ✈, `기본으로` 되돌리기 + 저장 | 17 |
| 아바타 저장 → `users/{uid}.avatarId`, 마이페이지·설정 반영 | 17 |
| 편집기: 로그인 UI 제거 | 11 |
| 편집기: 배지 줄에 "← 마이페이지" 추가, 브랜딩 없음 | 11 |
| 편집기: 저장 대상 `trips/{currentTripId}` | 12 |
| localStorage = 현재 여행 캐시 (`ttv2-current-trip`), v1 키 미사용 | 12 |
| 클라우드 디바운스 ~1초 + 나갈 때 강제 flush | 12 |
| 클라우드→로컬 덮어쓰기 = 열 때 1회 | 11, 14 |
| 재오픈 시 dirty 로컬 우선 + flush | 14 |
| 오프라인: 로컬 저장 유지, 클라우드 실패 | 12, 16 |
| 미동기화 표시: `#syncStatus` 한 자리, 2문구 ~2s 교대, 동기화 시 숨김 | 16 |
| 편집기 내부 기능 불변 | (전 태스크에서 편집 로직 미수정) |
| 단일 `index.html`, show/hide | 3 및 전체 |
| 범위 밖 (마이그레이션/언어·테마 실동작/멤버십/협업/URL 라우팅/비로그인 편집/엑셀·CSV) | 미포함 (명시) |

갭 없음.

**2. Placeholder scan**

- "임시 스텁" 함수들은 모두 뒤 태스크에서 정식 구현으로 교체되며 교체 태스크를 명시함 (`loadProfile`→T6, `refreshTripList`/`renderMypage`→T7/T9, `openTrip`→T11/T14, `forceFlush`/ticker→T12/T16, `avatarEmoji`→T17). 실제 코드 블록이 모두 포함됨. 잔여 "TODO/TBD" 없음.
- 모든 테스트 스텝에 실제 스펙 코드, 모든 구현 스텝에 실제 JS/HTML/CSS 포함.

**3. Type consistency**

- `deriveTripMeta` 반환 `{title,startDate,endDate,dayCount}` — T2 정의, T7/T8/T9 소비 일치.
- `profile` = `{avatarId, tripOrder}` — T4 임시, T6 정식, T7/T9/T15/T17 소비 일치.
- `listTrips()` 항목 = `{id,title,startDate,endDate,dayCount,updatedAt}` — T7 정의, T9 `orderedTrips`/`tripDatesLabel` 소비 일치.
- `cacheRead()` = `{tripId,data,dirty,localUpdatedAt}` — T12 정의, T13/T14 소비 일치.
- `save()` 재정의는 이름 유지하여 편집기 기존 호출부(`saveDebounced` 등) 호환 — T12에서 `saveDebounced` 를 `save` 래퍼로 유지.
- `showScreen` 인자 리터럴 `'landing'|'mypage'|'settings'|'editor'` — T3 정의, 전 태스크 일치.
- `AVATARS[].glyph` (id별 이모지) — T17 정의, `avatarEmoji` 소비. T9/T15 의 임시 `avatarEmoji` 는 동일 매핑을 인라인으로 갖고 T17에서 `AVATARS` 기반으로 정리 (동작 동일).
- 클릭 위임 액션명: `login, new-trip, v2modal-close, open-trip, back-to-mypage, move-up, move-down, delete-trip, confirm-delete-trip, go-settings, go-mypage, open-avatar, avatar-reset, avatar-save` — 각 태스크에서 추가되는 분기와 마크업 `data-action` 값 일치.

이슈 없음.
