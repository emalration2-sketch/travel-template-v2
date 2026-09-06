# 편집기 탭 분리 + 자료모음 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 편집기를 `[일정] [메모] [지출] [자료모음]` 4개 탭으로 나누고(일정만 스크롤 유지), 기존 `참고 링크`를 `자료모음`으로 흡수한 뒤 그 탭에 이미지 첨부(항공권·입장권·QR)를 추가한다.

**Architecture:** `index.html` 한 파일. `#printArea` 안을 `#editView-schedule|notes|expense|materials` 4개 컨테이너로 래핑하고 `showEditorTab(name)` 이 `hidden` 토글로 하나만 보인다(v2 `showScreen()` 과 같은 패턴). 이미지는 `users/{uid}/trips/{tripId}/att/{attId}` Firestore 하위 문서에 압축 base64 1장씩 저장하고, 여행 JSON 에는 `state.attachments = [{id,name}]` 참조만 둔다. `자료모음` 탭 첫 진입 시 `att` 하위 컬렉션을 1회 지연 로드한다.

**Tech Stack:** 순수 HTML/CSS/JS, Firebase compat SDK 10.14.1, GitHub Pages. 테스트: Playwright E2E + 주입식 Firebase 스텁(`tests/support/firebase-stub.js`) + `npx serve`.

**Spec:** `docs/superpowers/specs/2026-09-06-editor-tabs-and-materials-design.md`

## Global Constraints

- 전부 `index.html` 한 파일. 뷰 전환 = `hidden` 속성 토글. 빌드 없음.
- 탭바 4개: `일정`(schedule) / `메모`(notes) / `지출`(expense) / `자료모음`(materials). `<button class="tab" data-action="edit-tab" data-tab="...">`. `참고 링크` 탭·`#links` 섹션·`＋ 일차` 칩(`.tab-add`)·헤더 `.hint` 는 제거.
- `openTrip` 는 `state`/`rebuildAll`/`setMode`/`showScreen('editor')` 후 **`showEditorTab('schedule')`** 로 초기화. 탭 선택은 기억하지 않음.
- 일차 칩(`#dayChips`)은 `currentEditorTab === 'schedule'` 일 때만 표시. 앵커 링크 `href="#day-{id}"` 유지. 일차 카드에 `scroll-margin-top` 부여(sticky nav 높이만큼).
- 이미지 저장: `users/{uid}/trips/{tripId}/att/{attId}` 문서 `{ name, mime:'image/jpeg', data:'data:image/jpeg;base64,…', createdAt: serverTimestamp() }`. 1장당 1문서. 여행 JSON 은 `state.attachments = [{id,name}]` 만. 보안 규칙 변경 없음(기존 `/users/{userId}/{document=**}`).
- 이미지 압축: 장변 **1400px**, `toDataURL('image/jpeg', 0.7)` → base64 바이트 `> 700*1024` 면 q=0.6, 그래도 초과면 q=0.5 재시도, q=0.5 에서도 초과면 reject.
- 이미지 상한 **여행당 20장** (`state.attachments.length >= 20` 이면 `＋ 이미지 추가` 비활성 + 안내 "이미지는 여행당 20장까지 추가할 수 있어요").
- 파일 입력: `<input type="file" accept="image/*">` — `capture` 속성 금지.
- 오프라인에서 `att` 쓰기 실패 시: alert `오프라인에서는 이미지를 추가할 수 없어요. 연결 후 다시 시도해주세요.` 후 중단(로컬 상태도 안 바꿈).
- 이미지 삭제 확인 모달 문구: `이 이미지를 삭제할까요?` 줄바꿈 `되돌릴 수 없습니다.` / 버튼 `삭제` `취소` (재사용 `#v2Modal` + `v2ModalOpen`).
- 힌트 문구(`✏️ [수정모드]에서 모든 항목을 자유롭게 입력·수정할 수 있어요. [보기모드]에서는 조회만 가능합니다.`)를 `footer` 의 `.foot-note`(`로그인한 계정에 자동 저장됩니다`) **아래**에 같은 `.foot-note` 스타일 한 줄로 이동.
- 공유 HTML(`buildStaticGuideHTML`)은 `state.attachments` 를 무시(이미지 제외). 링크는 기존대로.
- 보기모드: 4개 탭 모두 표시. 추가/삭제/이름수정은 기존 `.edit-only` 로 숨김.
- 커밋 메시지 끝: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- 디자인 토큰·기존 클래스(`.tab`, `.tab.active`, `.section-block`, `.section-title`, `.add-block`, `.edit-only`, `.day-card`, `.links-grid`) 재사용.

---

## File Structure

| 파일 | 변경 |
|---|---|
| `index.html` | 편집기 마크업 재구조화, CSS(탭줄·일차칩·자료그룹·이미지뷰어), `/* ===== EDITOR TABS ===== */` + `/* ===== ATTACHMENTS ===== */` 스크립트 구획. `renderDays`/`renderLinks`→`renderMaterials`/`initObserver`/`openTrip`/`deleteTrip`/`exportPDF`/`defaultState`/`loadTrip` 수정. `openAvatarModal` 문구 1줄 삭제. |
| `tests/editor-tabs.spec.js` | 신규 — 탭 전환, openTrip 초기화, 일차칩 |
| `tests/materials-links.spec.js` | 신규 — 자료모음 링크 그룹 이동 |
| `tests/attachments.spec.js` | 신규 — 이미지 렌더/추가/삭제/20제한/지연로딩/뷰어 |
| `tests/attachments-integration.spec.js` | 신규 — deleteTrip 정리, exportPDF 임시노출, 힌트 문구, 아바타 문구 |
| `tests/support/firebase-stub.js` | 필요 시 `att` 하위 컬렉션 지원 보강 (대개 불필요) |

---

## Internal API (태스크 간 계약)

```
/* EDITOR TABS */
let currentEditorTab = 'schedule';                 // 'schedule'|'notes'|'expense'|'materials'
showEditorTab(name) -> void                        // #editView-* hidden 토글, .tab[data-tab] active,
                                                   //   #dayChips hidden = (name!=='schedule'), window.scrollTo(0,0),
                                                   //   name==='materials' → ensureAttachmentsLoaded()
renderMaterials() -> void                          // 링크 그룹(linkHTML 재사용) + 이미지 그룹 렌더. rebuildAll 이 renderLinks 대신 호출

/* ATTACHMENTS */
let attachmentsCache = {};                         // { attId: dataUrl }
let loadedAttTripId = null;                        // 마지막으로 att 로드한 tripId
compressImage(file) -> Promise<{dataUrl:string, bytes:number}>   // 장변 1400 / q 0.7→0.6→0.5 / 초과 시 reject
ensureAttachmentsLoaded() -> Promise<void>         // currentTripId 의 att 하위 컬렉션 1회 fetch → attachmentsCache, renderMaterials()
addAttachment(file:File) -> Promise<void>          // 20 guard → compress → att/{id} set → state.attachments.push → save() → renderMaterials()
deleteAttachment(id:string) -> void               // 확인 모달 → att/{id} delete → cache/ state 제거 → save() → renderMaterials()
renameAttachment(id:string, name:string) -> void  // att/{id} name + state.attachments 항목 → save()
openAttachmentViewer(id:string) -> void           // #attViewer 표시 (attachmentsCache[id])
closeAttachmentViewer() -> void

/* 기존 재사용: uid, escapeHTML, escapeAttr, save, saveDebounced, rebuildAll, setMode, renderDays,
   tabLabel, linkHTML, addLink, deleteLink, renderNotes, renderExpenseTab, openTrip, deleteTrip,
   tripsCol(), v2ModalOpen, v2ModalClose, firebase.firestore.FieldValue.serverTimestamp */
```

`currentEditorTab`, `attachmentsCache`, `loadedAttTripId` 는 스크립트 상단 다른 `let` 근처.

---

## Task 1: 편집기 4-뷰 마크업 재구조화 + CSS + 힌트 이동

**Files:**
- Modify: `index.html` — `<section data-screen="editor">` 내부 마크업, `<style>`, `openAvatarModal` 1줄 삭제
- Test: `tests/editor-tabs.spec.js` (일부)

**Interfaces:**
- Consumes: 없음
- Produces: DOM `#editTabs` (4 버튼), `#dayChips`, `#editView-schedule|notes|expense|materials`, `#linksContainer`(materials 안), `#attList`, `#attCount`, `#attAddBtn`, `#attFileInput`, `#attViewer`

- [ ] **Step 1: 실패 테스트 — tests/editor-tabs.spec.js**

```js
const { test, expect } = require('./support/fixtures');

async function openEditor(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', {
      data: JSON.stringify({ title: '오사카', travelers:['나'],
        days:[{id:'d1',date:'',label:'',items:[{id:'i1',time:'',place:'',memo:'',expenses:[]}]}],
        notes:[], links:[] }),
      title: '오사카', dayCount: 1,
    });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('편집기에 4개 뷰 + 탭바 + 일차칩 컨테이너', async ({ page }) => {
  await openEditor(page);
  for (const v of ['schedule','notes','expense','materials']) {
    expect(await page.locator(`#editView-${v}`).count()).toBe(1);
  }
  await expect(page.locator('#editTabs .tab[data-tab="schedule"]')).toHaveText('일정');
  await expect(page.locator('#editTabs .tab[data-tab="materials"]')).toHaveText('자료모음');
  expect(await page.locator('#editTabs .tab').count()).toBe(4);
  expect(await page.locator('#dayChips').count()).toBe(1);
  // 자료모음 안에 링크 컨테이너 + 이미지 리스트
  expect(await page.locator('#editView-materials #linksContainer').count()).toBe(1);
  expect(await page.locator('#editView-materials #attList').count()).toBe(1);
  // 제거된 것들
  expect(await page.locator('.tab.tab-add').count()).toBe(0);
  expect(await page.locator('.header-card .hint').count()).toBe(0);
  expect(await page.locator('#editTabs .tab', { hasText: '참고 링크' }).count()).toBe(0);
});

test('힌트 문구가 푸터로 이동', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('footer')).toContainText('[수정모드]에서 모든 항목을 자유롭게');
  await expect(page.locator('footer')).toContainText('로그인한 계정에 자동 저장됩니다');
});

test('아바타 팝업 안내 문구 삭제됨', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.locator('#mpTop').click();
  await page.locator('#setAvatarRow').click();
  await expect(page.locator('#v2Modal')).toBeVisible();
  await expect(page.locator('#v2Modal')).not.toContainText('기본값은');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test editor-tabs`
Expected: FAIL — `#editTabs` 등 없음.

- [ ] **Step 3: 마크업 재구조화 — `<section data-screen="editor" hidden>` 내부**

`<nav class="tabs">` 의 `.tabs-scroll` 블록을 교체하고 그 아래 일차칩 줄 추가:

```html
<nav class="tabs">
  <div class="wrap nav-title"> ...기존 그대로... </div>
  <div class="tabs-scroll" id="editTabs">
    <button class="tab active" data-action="edit-tab" data-tab="schedule">일정</button>
    <button class="tab" data-action="edit-tab" data-tab="notes">메모</button>
    <button class="tab" data-action="edit-tab" data-tab="expense">지출</button>
    <button class="tab" data-action="edit-tab" data-tab="materials">자료모음</button>
  </div>
  <div class="tabs-scroll day-chips" id="dayChips"></div>
</nav>
```

`#printArea` 내부를 4개 컨테이너로 래핑:

```html
<div id="printArea">
  <div id="editView-schedule">
    <div class="header-card wrap">
      <input id="inputTitle" class="h-title" ... >           <!-- 기존 그대로 -->
      <div class="h-travelers" id="travelersWrap"></div>     <!-- 기존 그대로 -->
      <!-- .hint 제거 -->
    </div>
    <div class="wrap">
      <div id="daysContainer"></div>
      <button class="add-day edit-only" data-action="add-day">＋ 새로운 일차 추가</button>
    </div>
  </div>

  <div id="editView-notes" hidden>
    <section class="wrap section-block">
      <div class="section-title">메모</div>
      <div id="notesContainer"></div>
      <button class="add-block edit-only" data-action="add-note">+ 메모 추가</button>
    </section>
  </div>

  <div id="editView-expense" hidden>
    <section class="wrap section-block">
      <div class="section-title">지출</div>
      <div id="expenseSummary" class="exp-summary"></div>
      <div id="expenseList"></div>
    </section>
  </div>

  <div id="editView-materials" hidden>
    <section class="wrap section-block">
      <div class="section-title">자료모음</div>
      <div class="mat-group-title">링크</div>
      <div id="linksContainer" class="links-grid"></div>
      <button class="add-block edit-only" data-action="add-link">+ 링크 추가</button>
      <div class="mat-group-title">이미지 <span id="attCount"></span></div>
      <div id="attList"></div>
      <button class="add-block edit-only" id="attAddBtn" data-action="add-attachment">+ 이미지 추가</button>
      <input type="file" id="attFileInput" accept="image/*" hidden>
    </section>
  </div>
</div>
```

`footer` 에 힌트 한 줄 추가:
```html
<div class="foot-note">로그인한 계정에 자동 저장됩니다</div>
<div class="foot-note">✏️ [수정모드]에서 모든 항목을 자유롭게 입력·수정할 수 있어요. [보기모드]에서는 조회만 가능합니다.</div>
```

`#attViewer` 는 `#v2Modal` 다음에:
```html
<div id="attViewer" hidden>
  <button id="attViewerClose" data-action="att-viewer-close">✕</button>
  <img id="attViewerImg" alt="">
</div>
```

기존 `<section id="notes">`, `<section id="links">`, `<section id="expense">` 및 `id="dayTabs"` span, `<button class="tab tab-add" ...＋ 일차>` 삭제.

- [ ] **Step 4: CSS — `<style>` 끝에**

```css
/* ===== EDITOR TABS ===== */
.tabs-scroll.day-chips{padding-top:0; padding-bottom:8px;}
.tabs-scroll.day-chips[hidden]{display:none;}
.tab.day-chip{font-size:11.5px; padding:5px 11px; background:#fff; border-color:var(--line); color:var(--ink-soft);}
.tab.day-chip.active{background:#243057; color:#fff; border-color:#243057;}
.day-card{scroll-margin-top:104px;}   /* nav-title + editTabs + dayChips 대략 높이 */
[id^="editView-"][hidden]{display:none !important;}
.mat-group-title{font-size:11px; font-weight:700; color:var(--ink-faint); letter-spacing:.03em; margin:16px 2px 8px; text-transform:uppercase;}
.mat-group-title:first-of-type{margin-top:6px;}
#editView-materials .add-block{margin-top:2px;}
/* 이미지 리스트 */
.att-row{display:flex; align-items:center; gap:8px; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 11px; margin-bottom:7px; cursor:pointer;}
.att-row .att-thumb{width:16px; height:16px; border-radius:3px; background:#243057; flex:none;}
.att-row .att-name{flex:1; font-size:12.5px; color:var(--ink); border:none; background:transparent; min-width:0;}
.att-row .att-name:disabled{-webkit-text-fill-color:var(--ink); color:var(--ink);}
.att-row .att-del{border:none; background:transparent; color:#C9CBD8; font-size:12px; cursor:pointer;}
#attAddBtn:disabled{opacity:.45; cursor:default;}
.att-limit-note{font-size:10.5px; color:var(--ink-faint); margin:4px 2px 0;}
/* 이미지 뷰어 */
#attViewer{position:fixed; inset:0; z-index:130; background:#000; display:flex; align-items:center; justify-content:center;}
#attViewer[hidden]{display:none;}
#attViewer img{max-width:100%; max-height:100%; object-fit:contain; touch-action:pinch-zoom;}
#attViewerClose{position:absolute; top:14px; right:16px; width:34px; height:34px; border-radius:50%; border:none; background:rgba(255,255,255,.15); color:#fff; font-size:15px; cursor:pointer;}
```

- [ ] **Step 5: `openAvatarModal` 문구 삭제 — index.html:767 부근**

`'<div style="font-size:10.5px;color:#8A90AE;margin-bottom:8px">기본값은 ✈ Travel Template 아이콘</div>' +` 줄을 삭제. 위 `아바타 선택` 제목 줄은 유지.

- [ ] **Step 6: 통과 확인**

Run: `npx playwright test editor-tabs`
Expected: 3 tests — "4개 뷰", "힌트 이동", "아바타 문구" 통과. (탭 전환 테스트는 Task 2.)
Run: `npx playwright test` — 기존 스펙 중 `open-trip`/`full-flow` 가 `#inputTitle` 을 보므로 schedule 뷰가 기본 표시되어야 통과. 깨지면 markup의 `hidden` 배치 확인.

- [ ] **Step 7: 커밋**

```bash
git add index.html tests/editor-tabs.spec.js
git commit -m "feat: 편집기 4-뷰 마크업 + 힌트 문구 이동 + 아바타 문구 삭제

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: showEditorTab — 탭 전환

**Files:**
- Modify: `index.html` — `/* ===== EDITOR TABS ===== */` 구획, 클릭 위임 분기, `openTrip`
- Test: `tests/editor-tabs.spec.js` (추가)

**Interfaces:**
- Consumes: Task 1 DOM
- Produces: `currentEditorTab`, `showEditorTab(name)`, `ensureAttachmentsLoaded`(임시 no-op — Task 6에서 구현)

- [ ] **Step 1: 실패 테스트 추가 — tests/editor-tabs.spec.js**

```js
test('탭 전환 — 한 뷰만 보이고 일차칩은 일정에서만', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('#editView-schedule')).toBeVisible();
  await expect(page.locator('#dayChips')).toBeVisible();

  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await expect(page.locator('#editView-materials')).toBeVisible();
  await expect(page.locator('#editView-schedule')).toBeHidden();
  await expect(page.locator('#dayChips')).toBeHidden();
  await expect(page.locator('#editTabs .tab[data-tab="materials"]')).toHaveClass(/active/);

  await page.locator('#editTabs .tab[data-tab="schedule"]').click();
  await expect(page.locator('#editView-schedule')).toBeVisible();
  await expect(page.locator('#dayChips')).toBeVisible();
});

test('openTrip 은 항상 schedule 로 초기화', async ({ page }) => {
  await openEditor(page);
  await page.locator('#editTabs .tab[data-tab="expense"]').click();
  await expect(page.locator('#editView-expense')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('#editView-schedule')).toBeVisible();
  expect(await page.evaluate(() => currentEditorTab)).toBe('schedule');
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx playwright test editor-tabs` → FAIL (`showEditorTab` 없음, 클릭 무반응).

- [ ] **Step 3: 구현 — EDITOR TABS 구획 (renderDays 근처)**

```js
/* ===== EDITOR TABS ===== */
let currentEditorTab = 'schedule';
function showEditorTab(name){
  currentEditorTab = name;
  document.querySelectorAll('[id^="editView-"]').forEach(v => {
    v.hidden = (v.id !== 'editView-' + name);
  });
  document.querySelectorAll('#editTabs .tab[data-tab]').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.getElementById('dayChips').hidden = (name !== 'schedule');
  window.scrollTo(0, 0);
  if(name === 'materials') ensureAttachmentsLoaded();
}
async function ensureAttachmentsLoaded(){ /* Task 6 */ }
```

- [ ] **Step 4: 클릭 위임 분기 — `document` click 핸들러(현재 index.html:1529~)**

`if(a === 'add-day') addDay();` 앞 or 근처에:
```js
  if(a === 'edit-tab'){ showEditorTab(btn.dataset.tab); return; }
```

- [ ] **Step 5: openTrip 초기화 — index.html:1003 `showScreen('editor');` 다음**

```js
  showEditorTab('schedule');
```

- [ ] **Step 6: 통과 확인** — Run: `npx playwright test editor-tabs open-trip full-flow` → all pass.

- [ ] **Step 7: 커밋**

```bash
git add index.html tests/editor-tabs.spec.js
git commit -m "feat: showEditorTab 탭 전환 + openTrip 초기화

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: 일차 칩 (#dayChips) + 스크롤스파이 축소

**Files:**
- Modify: `index.html` — `renderDays`, `initObserver`, 일차 라벨 갱신 2곳
- Test: `tests/editor-tabs.spec.js` (추가)

**Interfaces:**
- Consumes: `renderDays`, `tabLabel`, `state.days`
- Produces: `#dayChips` 내용 (`<a class="tab day-chip" href="#day-{id}" id="chip-{id}">`)

- [ ] **Step 1: 실패 테스트 추가**

```js
test('일차 칩이 dayChips 에 렌더', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'오사카', travelers:['나'],
      days:[
        {id:'d1',date:'2026-03-14',label:'',items:[]},
        {id:'d2',date:'2026-03-15',label:'',items:[]},
      ], notes:[], links:[] }), title:'오사카', dayCount:2 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  const chips = page.locator('#dayChips .day-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toHaveAttribute('href', '#day-d1');
  await expect(chips.nth(0)).toHaveAttribute('id', 'chip-d1');
  // 옛 위치엔 없음
  expect(await page.locator('#dayTabs').count()).toBe(0);
});
```

- [ ] **Step 2: 실패 확인** — `renderDays` 가 아직 `#dayTabs`(없어짐) 를 참조 → 콘솔 에러 or 칩 미렌더.

- [ ] **Step 3: renderDays 수정 — index.html:1114**

```js
function renderDays(){
  document.getElementById('daysContainer').innerHTML = state.days.map(dayCardHTML).join('');
  document.getElementById('dayChips').innerHTML = state.days.map((d, idx) =>
    `<a class="tab day-chip" href="#day-${d.id}" id="chip-${d.id}">${escapeHTML(tabLabel(d, idx))}</a>`
  ).join('');
  initObserver();
}
```

- [ ] **Step 4: initObserver 수정 — index.html:1184**

```js
function initObserver(){
  if(window._obs) window._obs.disconnect();
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if(e.isIntersecting){
        document.querySelectorAll('#dayChips .day-chip').forEach(a => a.classList.remove('active'));
        const chip = document.getElementById('chip-' + e.target.id.replace(/^day-/, ''));
        if(chip) chip.classList.add('active');
      }
    });
  }, { rootMargin:'-40% 0px -55% 0px' });
  document.querySelectorAll('#daysContainer .day-card').forEach(sec => obs.observe(sec));
  window._obs = obs;
}
```

- [ ] **Step 5: 일차 라벨 갱신 2곳 — `getElementById('tab-' + d.id)` → `getElementById('chip-' + d.id)`**

index.html 약 1276, 1592 부근에서 `tab-` prefix 를 `chip-` 으로. (grep `'tab-' + d.id` / `tab-${d.id}` 로 정확 위치 확인.)

- [ ] **Step 6: 통과 확인** — Run: `npx playwright test editor-tabs` → all pass. `npx playwright test` 전체 회귀.

- [ ] **Step 7: 커밋**

```bash
git add index.html tests/editor-tabs.spec.js
git commit -m "feat: 일차 칩 dayChips 이동 + 스크롤스파이 축소

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: 참고 링크 → 자료모음 (renderMaterials)

**Files:**
- Modify: `index.html` — `renderLinks` → `renderMaterials`, `rebuildAll`, `addLink`/`deleteLink` 의 리렌더 호출
- Test: `tests/materials-links.spec.js`

**Interfaces:**
- Consumes: `state.links`, `linkHTML`, `#linksContainer`(materials 뷰 안), `#attList`, `#attCount`, `state.attachments`(Task 6 전엔 undefined → `[]` 취급)
- Produces: `renderMaterials()`

- [ ] **Step 1: 실패 테스트 — tests/materials-links.spec.js**

```js
const { test, expect } = require('./support/fixtures');

test('링크가 자료모음 탭 링크 그룹에 렌더', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[],
      links:[{id:'l1',label:'노선도',url:'https://ex.com'},{id:'l2',label:'예약메일',url:'https://ex2.com'}] }),
      title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await expect(page.locator('#editView-materials .mat-group-title').first()).toContainText('링크');
  await expect(page.locator('#editView-materials #linksContainer .link-card')).toHaveCount(2);
  await expect(page.locator('#editView-materials')).toContainText('이미지');
  await expect(page.locator('#attCount')).toHaveText('0 / 20');
});

test('링크 추가/삭제가 자료모음에서 동작', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await page.locator('#editView-materials [data-action="add-link"]').click();
  await expect(page.locator('#editView-materials #linksContainer .link-card')).toHaveCount(1);
});
```

- [ ] **Step 2: 실패 확인** — `renderMaterials` 없음 / `#attCount` 안 채워짐.

- [ ] **Step 3: 구현 — index.html:1150 `renderLinks` 를 `renderMaterials` 로 교체**

```js
function renderMaterials(){
  document.getElementById('linksContainer').innerHTML = state.links.map(linkHTML).join('');
  const atts = Array.isArray(state.attachments) ? state.attachments : [];
  document.getElementById('attCount').textContent = atts.length + ' / 20';
  document.getElementById('attList').innerHTML = atts.map(attRowHTML).join('');   // attRowHTML: Task 6
  const addBtn = document.getElementById('attAddBtn');
  if(addBtn) addBtn.disabled = atts.length >= 20;
}
function attRowHTML(a){ return ''; }   // Task 6 에서 구현 (임시)
```

- [ ] **Step 4: 호출부 교체**

- `rebuildAll()` (index.html:1179): `renderLinks()` → `renderMaterials()`
- `addLink()` / `deleteLink()` (index.html:1222-1223): `renderLinks()` → `renderMaterials()`
- 그 외 `renderLinks(` 호출 전부 grep 해서 `renderMaterials(` 로. `renderLinks` 정의 자체는 제거.

- [ ] **Step 5: 통과 확인** — Run: `npx playwright test materials-links editor-tabs` + 전체 회귀.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/materials-links.spec.js
git commit -m "feat: 참고 링크를 자료모음 탭으로 이동 (renderMaterials)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: state.attachments 스키마 + 이미지 그룹 렌더 + 뷰어 마크업 동작

**Files:**
- Modify: `index.html` — `defaultState`, `openTrip`/`loadTrip` 정규화, `attRowHTML` 실제 구현, `/* ===== ATTACHMENTS ===== */` 구획 시작, 클릭 위임(뷰어 열기/닫기)
- Test: `tests/attachments.spec.js` (일부)

**Interfaces:**
- Consumes: `state.attachments`, `attachmentsCache`, `renderMaterials`
- Produces: `attRowHTML(a)`, `openAttachmentViewer(id)`, `closeAttachmentViewer()`, `attachmentsCache`, `loadedAttTripId`

- [ ] **Step 1: 실패 테스트 — tests/attachments.spec.js**

```js
const { test, expect } = require('./support/fixtures');

async function openMaterials(page, attachments = []){
  await page.goto('/');
  await page.evaluate((att) => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[], attachments: att }),
      title:'X', dayCount:1 });
  }, attachments);
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
}

test('이미지 그룹이 state.attachments 로부터 렌더', async ({ page }) => {
  await openMaterials(page, [{id:'a1',name:'탑승권'},{id:'a2',name:'입장권 QR'}]);
  await expect(page.locator('#attCount')).toHaveText('2 / 20');
  await expect(page.locator('#attList .att-row')).toHaveCount(2);
  await expect(page.locator('#attList .att-row').first()).toContainText('탑승권');
});

test('이미지 행 탭 → 뷰어 열림, 닫기 → 리스트', async ({ page }) => {
  await openMaterials(page, [{id:'a1',name:'탑승권'}]);
  await page.evaluate(() => { attachmentsCache['a1'] = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='; });
  await page.locator('#attList .att-row').first().click();
  await expect(page.locator('#attViewer')).toBeVisible();
  await expect(page.locator('#attViewerImg')).toHaveAttribute('src', /^data:image\/jpeg/);
  await page.locator('#attViewerClose').click();
  await expect(page.locator('#attViewer')).toBeHidden();
});
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: defaultState + 정규화**

- `defaultState()` (index.html:607): 반환 객체에 `attachments: []` 추가.
- `openTrip` (index.html:998-999) 정규화 블록에 `if(!Array.isArray(state.attachments)) state.attachments = [];` 추가.
- `loadTrip` (index.html:707) 도 동일 정규화 추가(있으면).

- [ ] **Step 4: ATTACHMENTS 구획 — `renderMaterials` 아래**

```js
/* ===== ATTACHMENTS ===== */
let attachmentsCache = {};
let loadedAttTripId = null;

function attRowHTML(a){
  return `<div class="att-row" data-action="att-open" data-att-id="${escapeAttr(a.id)}">
    <span class="att-thumb"></span>
    <input class="att-name" data-scope="att" data-att-id="${escapeAttr(a.id)}" data-field="name"
           value="${escapeAttr(a.name || '')}" placeholder="이미지">
    <button class="att-del edit-only" data-action="att-delete" data-att-id="${escapeAttr(a.id)}">✕</button>
  </div>`;
}
function openAttachmentViewer(id){
  const url = attachmentsCache[id];
  if(!url) return;
  document.getElementById('attViewerImg').src = url;
  document.getElementById('attViewer').hidden = false;
}
function closeAttachmentViewer(){
  document.getElementById('attViewer').hidden = true;
  document.getElementById('attViewerImg').src = '';
}
```

`attRowHTML` 임시 stub(Task 4)을 위 실제 구현으로 교체.

- [ ] **Step 5: 클릭 위임 분기**

```js
  else if(a === 'att-open') openAttachmentViewer(btn.dataset.attId);
  else if(a === 'att-viewer-close') closeAttachmentViewer();
```

주의: `.att-row` 자체가 `data-action="att-open"` 이고 그 안 `.att-del` 이 `data-action="att-delete"` — `e.target.closest('[data-action]')` 가 삭제 버튼을 먼저 잡으므로 삭제가 우선. `.att-name` input 클릭은 `data-action` 없어 `closest` 가 `.att-row` 를 잡아 뷰어가 열림 → 수정모드에서 이름 편집이 방해됨. **대응**: `att-open` 분기에서 `if(e.target.closest('.att-name')) return;` 가드 추가.

- [ ] **Step 6: 통과 확인** — `npx playwright test attachments materials-links` + 회귀.

- [ ] **Step 7: 커밋**

```bash
git add index.html tests/attachments.spec.js
git commit -m "feat: state.attachments 스키마 + 이미지 그룹 렌더 + 뷰어

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: 이미지 압축 (compressImage)

**Files:**
- Modify: `index.html` — ATTACHMENTS 구획에 `compressImage`
- Test: `tests/attachments.spec.js` (추가)

**Interfaces:**
- Consumes: 없음
- Produces: `compressImage(file) -> Promise<{dataUrl, bytes}>`

- [ ] **Step 1: 실패 테스트 추가**

```js
test('compressImage — 장변 1400 이하, 700KB 이하', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    // 2000x100 빨간 PNG 를 canvas 로 만들어 File 로
    const c = document.createElement('canvas'); c.width = 2000; c.height = 100;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#f00'; ctx.fillRect(0,0,2000,100);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const file = new File([blob], 'wide.png', { type: 'image/png' });
    const out = await compressImage(file);
    const img = new Image(); img.src = out.dataUrl;
    await new Promise(res => { img.onload = res; });
    return { w: img.naturalWidth, h: img.naturalHeight, bytes: out.bytes, mime: out.dataUrl.slice(5, 15) };
  });
  expect(r.w).toBeLessThanOrEqual(1400);
  expect(r.bytes).toBeLessThanOrEqual(700 * 1024);
  expect(r.mime).toContain('image/jpeg');
});
```

- [ ] **Step 2: 실패 확인** — `compressImage is not defined`.

- [ ] **Step 3: 구현**

```js
function compressImage(file){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const long = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = long > 1400 ? 1400 / long : 1;
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const MAX = 700 * 1024;
      for(const q of [0.7, 0.6, 0.5]){
        const dataUrl = c.toDataURL('image/jpeg', q);
        const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
        if(bytes <= MAX) return resolve({ dataUrl, bytes });
      }
      reject(new Error('too large'));
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('unreadable')); };
    img.src = objUrl;
  });
}
```

- [ ] **Step 4: 통과 확인** — `npx playwright test attachments`.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/attachments.spec.js
git commit -m "feat: compressImage — 장변 1400 리사이즈 + 품질 재시도

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: ensureAttachmentsLoaded — 지연 로딩

**Files:**
- Modify: `index.html` — `ensureAttachmentsLoaded` 실구현, `openTrip` 에서 `loadedAttTripId=null`
- Test: `tests/attachments.spec.js` (추가)

**Interfaces:**
- Consumes: `tripsCol()`, `currentTripId`, `attachmentsCache`, `renderMaterials`
- Produces: `ensureAttachmentsLoaded()` (Task 2 임시 no-op 교체)

- [ ] **Step 1: 실패 테스트 추가**

```js
test('자료모음 첫 진입 시 att 하위 컬렉션 1회 로드', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[],
      attachments:[{id:'a1',name:'탑승권'}] }), title:'X', dayCount:1 });
    window.__test.seed('users/u1/trips/t1/att/a1', { name:'탑승권', mime:'image/jpeg', data:'data:image/jpeg;base64,AAAA' });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  // 아직 materials 안 열었으면 캐시 비어있음
  expect(await page.evaluate(() => Object.keys(attachmentsCache).length)).toBe(0);
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await expect.poll(() => page.evaluate(() => attachmentsCache['a1'] || '')).toContain('data:image/jpeg');
  expect(await page.evaluate(() => loadedAttTripId)).toBe('t1');
});
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: 구현**

```js
async function ensureAttachmentsLoaded(){
  if(!currentTripId || loadedAttTripId === currentTripId) return;
  attachmentsCache = {};
  try{
    const snap = await tripsCol().doc(currentTripId).collection('att').get();
    snap.forEach(d => { attachmentsCache[d.id] = (d.data() || {}).data; });
    loadedAttTripId = currentTripId;
  }catch(e){ console.error('첨부 로드 실패', e); }
  renderMaterials();
}
```

`openTrip` (index.html:1000 `cacheWrite` 앞뒤 어디든 currentTripId 세팅 이후): `loadedAttTripId = null;` 추가.

- [ ] **Step 4: firebase-stub 확인** — `tests/support/firebase-stub.js` 의 `docRef.collection(sub)` → `collRef` → `.get()` 이 `att` 경로에서 동작하는지. 이미 `users/{uid}/trips/{id}` 서브컬렉션을 지원하므로 한 단계 더 깊은 `att` 도 같은 코드로 동작해야 함. 안 되면 `collRef.get()` 의 prefix 매칭이 임의 깊이를 처리하는지 확인하고 최소 수정 + 그 사실을 리포트에 기록.

- [ ] **Step 5: 통과 확인** — `npx playwright test attachments` + 회귀.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/attachments.spec.js tests/support/firebase-stub.js
git commit -m "feat: ensureAttachmentsLoaded 지연 로딩

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: addAttachment — 추가 (20 제한 + 오프라인)

**Files:**
- Modify: `index.html` — `addAttachment`, `#attFileInput` change 리스너, 클릭 위임 `add-attachment`, 20-제한 안내
- Test: `tests/attachments.spec.js` (추가)

**Interfaces:**
- Consumes: `compressImage`, `tripsCol()`, `currentTripId`, `state.attachments`, `attachmentsCache`, `save`, `renderMaterials`, `uid`
- Produces: `addAttachment(file)`

- [ ] **Step 1: 실패 테스트 추가**

```js
test('이미지 추가 → att 문서 + state.attachments + 여행문서', async ({ page }) => {
  await openMaterials(page, []);
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 40;
    c.getContext('2d').fillRect(0,0,40,40);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await addAttachment(new File([blob], '탑승권.png', { type:'image/png' }));
  });
  await expect(page.locator('#attList .att-row')).toHaveCount(1);
  await expect(page.locator('#attCount')).toHaveText('1 / 20');
  const dump = await page.evaluate(() => window.__test.dump());
  const attKey = Object.keys(dump).find(k => k.startsWith('users/u1/trips/t1/att/'));
  expect(attKey).toBeTruthy();
  expect(dump[attKey].data).toMatch(/^data:image\/jpeg/);
  expect(dump[attKey].name).toBe('탑승권');
  await page.waitForTimeout(1300);
  expect(JSON.parse(dump['users/u1/trips/t1'] ? '{}' : '{}')); // 여행문서 반영은 아래
  const dump2 = await page.evaluate(() => window.__test.dump());
  expect(JSON.parse(dump2['users/u1/trips/t1'].data).attachments.length).toBe(1);
});

test('20장이면 추가 버튼 비활성 + 추가 안 됨', async ({ page }) => {
  const many = Array.from({length:20}, (_,i) => ({id:'x'+i, name:'img'+i}));
  await openMaterials(page, many);
  await expect(page.locator('#attAddBtn')).toBeDisabled();
  const before = await page.evaluate(() => state.attachments.length);
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width=10; c.height=10; c.getContext('2d').fillRect(0,0,10,10);
    const blob = await new Promise(r => c.toBlob(r,'image/png'));
    await addAttachment(new File([blob], 'over.png', {type:'image/png'}));
  });
  expect(await page.evaluate(() => state.attachments.length)).toBe(before);
});

test('오프라인이면 이미지 추가 실패 + 상태 불변', async ({ page }) => {
  await openMaterials(page, []);
  page.on('dialog', d => d.accept());
  await page.evaluate(() => window.__test.setOffline(true));
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width=10; c.height=10; c.getContext('2d').fillRect(0,0,10,10);
    const blob = await new Promise(r => c.toBlob(r,'image/png'));
    await addAttachment(new File([blob], 'x.png', {type:'image/png'}));
  });
  expect(await page.evaluate(() => state.attachments.length)).toBe(0);
});
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: 구현**

```js
async function addAttachment(file){
  const atts = state.attachments || (state.attachments = []);
  if(atts.length >= 20){
    v2ModalOpen('이미지는 여행당 20장까지 추가할 수 있어요.',
      '<button class="v2-btn-solid" data-action="v2modal-close">확인</button>');
    return;
  }
  let out;
  try{ out = await compressImage(file); }
  catch(e){ alert('이미지가 너무 커요. 더 작은 파일을 사용해주세요.'); return; }
  const id = uid();
  const name = file.name.replace(/\.[^.]+$/, '');
  try{
    await tripsCol().doc(currentTripId).collection('att').doc(id).set({
      name, mime: 'image/jpeg', data: out.dataUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }catch(e){
    alert('오프라인에서는 이미지를 추가할 수 없어요. 연결 후 다시 시도해주세요.');
    return;
  }
  attachmentsCache[id] = out.dataUrl;
  atts.push({ id, name });
  save();
  renderMaterials();
}
```

- [ ] **Step 4: 파일 입력 배선**

```js
const _attFile = document.getElementById('attFileInput');
if(_attFile) _attFile.addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(f) addAttachment(f);
});
```
클릭 위임: `else if(a === 'add-attachment') document.getElementById('attFileInput').click();`

- [ ] **Step 5: 통과 확인** — `npx playwright test attachments` + 회귀.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/attachments.spec.js
git commit -m "feat: addAttachment — 추가/20제한/오프라인

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: 이미지 삭제 + 이름 수정

**Files:**
- Modify: `index.html` — `deleteAttachment`, `renameAttachment`, 클릭 위임, `handleFieldChange` 의 `data-scope="att"` 처리
- Test: `tests/attachments.spec.js` (추가)

**Interfaces:**
- Consumes: `tripsCol()`, `state.attachments`, `attachmentsCache`, `save`, `renderMaterials`, `v2ModalOpen`/`v2ModalClose`
- Produces: `deleteAttachment(id)`, `renameAttachment(id, name)`

- [ ] **Step 1: 실패 테스트 추가**

```js
test('이미지 삭제 — 확인 모달 → att 문서 + state 제거', async ({ page }) => {
  await openMaterials(page, [{id:'a1',name:'탑승권'},{id:'a2',name:'입장권'}]);
  await page.evaluate(() => window.__test.seed('users/u1/trips/t1/att/a1', { name:'탑승권', data:'data:image/jpeg;base64,AA' }));
  await page.locator('.att-row[data-att-id="a1"] .att-del').click();
  await expect(page.locator('#v2ModalBody')).toContainText('이 이미지를 삭제할까요?');
  await page.locator('#v2Modal').getByText('삭제', { exact:true }).click();
  await expect(page.locator('#attList .att-row')).toHaveCount(1);
  expect(await page.evaluate(() => state.attachments.map(a => a.id))).toEqual(['a2']);
  expect(await page.evaluate(() => window.__test.dump()['users/u1/trips/t1/att/a1'])).toBeUndefined();
});

test('이름 수정 → att 문서 + state 갱신', async ({ page }) => {
  await openMaterials(page, [{id:'a1',name:'탑승권'}]);
  await page.evaluate(() => window.__test.seed('users/u1/trips/t1/att/a1', { name:'탑승권', data:'data:image/jpeg;base64,AA' }));
  const input = page.locator('.att-row[data-att-id="a1"] .att-name');
  await input.fill('대한항공 탑승권');
  await input.dispatchEvent('change');
  expect(await page.evaluate(() => state.attachments[0].name)).toBe('대한항공 탑승권');
  await expect.poll(() => page.evaluate(() => (window.__test.dump()['users/u1/trips/t1/att/a1']||{}).name)).toBe('대한항공 탑승권');
});
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: 구현**

```js
function showAttDeleteModal(id){
  v2ModalOpen('이 이미지를 삭제할까요?\n되돌릴 수 없습니다.',
    '<button class="v2-btn-ghost" data-action="v2modal-close">취소</button>' +
    '<button class="v2-btn-danger" data-action="att-confirm-delete" data-att-id="' + escapeAttr(id) + '">삭제</button>');
}
async function deleteAttachment(id){
  v2ModalClose();
  try{ await tripsCol().doc(currentTripId).collection('att').doc(id).delete(); }
  catch(e){ alert('삭제하지 못했어요. 연결을 확인해주세요.'); return; }
  delete attachmentsCache[id];
  state.attachments = (state.attachments || []).filter(a => a.id !== id);
  save();
  renderMaterials();
}
async function renameAttachment(id, name){
  const a = (state.attachments || []).find(x => x.id === id);
  if(!a) return;
  a.name = name;
  save();
  try{ await tripsCol().doc(currentTripId).collection('att').doc(id).set({ name }, { merge: true }); }
  catch(e){ /* 이름은 state.attachments 에도 있으니 다음 flush 로 복구 */ }
}
```

- [ ] **Step 4: 배선**

- 클릭 위임: `else if(a === 'att-delete') showAttDeleteModal(btn.dataset.attId);` / `else if(a === 'att-confirm-delete') deleteAttachment(btn.dataset.attId);`
- `handleFieldChange` (index.html ~1600-1642): `data-scope` 분기에 `att` 추가 — `if(scope === 'att') renameAttachment(el.dataset.attId, el.value);` (기존 note/link 처리와 같은 위치, `saveDebounced()` 는 기존대로 마지막에 호출되지만 `renameAttachment` 가 `save()` 를 이미 부르므로 중복 무방).

- [ ] **Step 5: 통과 확인** — `npx playwright test attachments` + 회귀.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/attachments.spec.js
git commit -m "feat: 이미지 삭제(확인 모달) + 이름 수정

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: deleteTrip — att 하위 컬렉션 정리

**Files:**
- Modify: `index.html` — `deleteTrip` (index.html:737)
- Test: `tests/attachments-integration.spec.js` (일부)

**Interfaces:**
- Consumes: `tripsCol()`, `saveProfile`, `profile`
- Produces: `deleteTrip` (att 정리 포함)

- [ ] **Step 1: 실패 테스트 — tests/attachments-integration.spec.js**

```js
const { test, expect } = require('./support/fixtures');

test('deleteTrip 이 att 하위 문서도 삭제', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1','t2'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'A', days:[], notes:[], links:[], attachments:[{id:'a1',name:'x'}] }), title:'A', dayCount:0 });
    window.__test.seed('users/u1/trips/t2', { data: JSON.stringify({ title:'B', days:[], notes:[], links:[] }), title:'B', dayCount:0 });
    window.__test.seed('users/u1/trips/t1/att/a1', { name:'x', data:'data:image/jpeg;base64,AA' });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); await deleteTrip('t1'); });
  const dump = await page.evaluate(() => window.__test.dump());
  expect(dump['users/u1/trips/t1']).toBeUndefined();
  expect(dump['users/u1/trips/t1/att/a1']).toBeUndefined();
});
```

- [ ] **Step 2: 실패 확인** — `att/a1` 이 남아있음.

- [ ] **Step 3: 구현 — index.html:737**

```js
async function deleteTrip(tripId){
  try{
    const attSnap = await tripsCol().doc(tripId).collection('att').get();
    await Promise.all(attSnap.docs.map(d => d.ref.delete()));
  }catch(e){ console.error('첨부 정리 실패(무시하고 진행)', e); }
  await tripsCol().doc(tripId).delete();
  await saveProfile({ tripOrder: profile.tripOrder.filter(id => id !== tripId) });
}
```

스텁의 `d.ref` 가 delete 가능한 docRef 를 반환하는지 확인(대개 `collRef.get()` 이 `{ docs:[{ id, data(), ref }] }` 형태). 없으면 `attSnap.docs.map(d => tripsCol().doc(tripId).collection('att').doc(d.id).delete())` 로.

- [ ] **Step 4: 통과 확인** — `npx playwright test attachments-integration delete-trip` + 회귀.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/attachments-integration.spec.js tests/support/firebase-stub.js
git commit -m "feat: deleteTrip 이 att 하위 컬렉션 정리

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: exportPDF — 탭 숨김 대응 + 이미지 삽입

**Files:**
- Modify: `index.html` — `exportPDF` (index.html:1450)
- Test: `tests/attachments-integration.spec.js` (추가)

**Interfaces:**
- Consumes: `currentEditorTab`, `showEditorTab`, `ensureAttachmentsLoaded`, `attachmentsCache`, `state.attachments`
- Produces: `exportPDF` (수정)

- [ ] **Step 1: 실패 테스트 추가**

```js
test('exportPDF 캡처 전 4개 뷰 임시 노출, 완료 후 원래 탭 복원', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[], attachments:[] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.locator('#editTabs .tab[data-tab="expense"]').click();
  // html2canvas / jsPDF 를 스텁
  await page.evaluate(() => {
    window.__seenVisible = null;
    window.loadHtml2Pdf = async () => {
      window.html2canvas = async () => {
        window.__seenVisible = ['schedule','notes','expense','materials']
          .filter(v => !document.getElementById('editView-'+v).hidden);
        return { width: 10, height: 10, toDataURL: () => 'data:image/jpeg;base64,AA' };
      };
      window.jspdf = { jsPDF: function(){ return {
        internal:{ pageSize:{ getWidth:()=>210, getHeight:()=>297 } },
        addImage(){}, addPage(){}, save(){}, }; } };
    };
  });
  await page.evaluate(() => exportPDF());
  await expect.poll(() => page.evaluate(() => (window.__seenVisible||[]).length)).toBe(4);  // 캡처 시점엔 4개 다 노출
  expect(await page.evaluate(() => currentEditorTab)).toBe('expense');                       // 복원
  await expect(page.locator('#editView-expense')).toBeVisible();
});
```

- [ ] **Step 2: 실패 확인** — 현재 `exportPDF` 는 뷰를 안 건드림 → `__seenVisible` 길이 1.

- [ ] **Step 3: 구현 — exportPDF 수정**

`loadHtml2Pdf().then(async () => {` 내부, 캡처 루프 전에:
```js
    const views = ['schedule','notes','expense','materials'].map(v => document.getElementById('editView-'+v));
    const prevHidden = views.map(v => v.hidden);
    views.forEach(v => v.hidden = false);
    const dayChipsEl = document.getElementById('dayChips');
    const prevChips = dayChipsEl.hidden; dayChipsEl.hidden = true;
    await ensureAttachmentsLoaded();
```
캡처 대상(`sections` 배열) 수정: `.header-card` → `#daysContainer .day-card` 들 → `#editView-notes section` → `#editView-expense section` → `#editView-materials #linksContainer` (링크 그룹). 그 다음 각 첨부 이미지:
```js
    for(const a of (state.attachments || [])){
      const url = attachmentsCache[a.id];
      if(!url) continue;
      // 이미지 크기 계산 후 doc.addImage(url, 'JPEG', margin, y, imgWidth, imgHeight) + 이름 캡션
    }
```
`.then(() => { ... })` 정리부 + `.catch(...)` 양쪽에서:
```js
    views.forEach((v,i) => v.hidden = prevHidden[i]);
    dayChipsEl.hidden = prevChips;
    showEditorTab(currentEditorTab);
```

- [ ] **Step 4: 통과 확인** — `npx playwright test attachments-integration` + 회귀.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/attachments-integration.spec.js
git commit -m "feat: exportPDF 탭 숨김 대응 + 첨부 이미지 삽입

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: 공유 HTML 확인 + 전체 흐름 스모크 + 회귀

**Files:**
- Modify: `index.html` — 필요 시 `buildStaticGuideHTML` (대개 무변경)
- Test: `tests/attachments-integration.spec.js` (추가), 전체 스위트

**Interfaces:**
- Consumes: 전체
- Produces: 없음 (검증)

- [ ] **Step 1: 공유 HTML 테스트 추가**

```js
test('공유 HTML — 링크 포함, 이미지 제외', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'교토', travelers:['나'],
      days:[{id:'d1',date:'2026-05-01',label:'',items:[]}], notes:[],
      links:[{id:'l1',label:'노선도',url:'https://ex.com'}], attachments:[{id:'a1',name:'탑승권'}] }),
      title:'교토', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  const html = await page.evaluate(() => buildStaticGuideHTML(state));
  expect(html).toContain('노선도');
  expect(html).not.toContain('탑승권');
  expect(html).not.toContain('data:image');
});
```

- [ ] **Step 2: 실패 시에만 대응** — `buildStaticGuideHTML` 이 `state.attachments` 를 실수로 렌더하면 그 부분만 제거. 대개 이미 통과(참조 안 함).

- [ ] **Step 3: 전체 흐름 스모크 추가**

```js
test('전체 흐름: 여행 열기 → 탭 전환 → 링크·이미지 추가 → 삭제', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'방콕', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[], attachments:[] }), title:'방콕', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('#editView-schedule')).toBeVisible();

  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await page.locator('[data-action="add-link"]').click();
  await expect(page.locator('#linksContainer .link-card')).toHaveCount(1);

  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width=30; c.height=30; c.getContext('2d').fillRect(0,0,30,30);
    const blob = await new Promise(r => c.toBlob(r,'image/png'));
    await addAttachment(new File([blob], 'QR.png', {type:'image/png'}));
  });
  await expect(page.locator('#attList .att-row')).toHaveCount(1);
  await expect(page.locator('#attCount')).toHaveText('1 / 20');

  await page.locator('#editTabs .tab[data-tab="schedule"]').click();
  await expect(page.locator('#editView-schedule')).toBeVisible();
  await expect(page.locator('#dayChips')).toBeVisible();
});
```

- [ ] **Step 4: 전체 스위트 실행**

Run: `npx playwright test`
Expected: 기존 38개 + 신규 전부 통과. 회귀(특히 `open-trip`, `save-sync`, `full-flow`, `reorder-drag`) 확인.

- [ ] **Step 5: 브라우저 수동 확인**

`preview_start` 로 로컬 서버 → 편집기 진입 → 4개 탭 전환, 일정 스크롤 시 일차칩 sticky, 자료모음에서 링크/이미지 추가, 이미지 탭 시 전체화면, 콘솔 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/attachments-integration.spec.js
git commit -m "test: 공유 HTML 확인 + 전체 흐름 스모크

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**

| 스펙 항목 | 태스크 |
|---|---|
| 탭바 `[일정][메모][지출][자료모음]`, `참고 링크` 탭·`#links` 제거, `＋일차` 칩 제거 | 1, 4 |
| 4개 `#editView-*` 컨테이너, `hidden` 토글 | 1, 2 |
| `showEditorTab`, 클릭 `edit-tab`, `openTrip` → schedule 초기화 | 2 |
| 일차칩 `#dayChips`, 일정 탭에서만, 앵커 유지, `scroll-margin-top` | 1(CSS), 3 |
| 스크롤스파이 일차 카드로 축소 | 3 |
| `.header-card` 유지(schedule 안), `.hint` 제거 | 1 |
| 힌트 문구 → 푸터 | 1 |
| 자료모음 = 링크 그룹(기존 로직) + 이미지 그룹(`N / 20`) | 4, 5 |
| `renderLinks` → `renderMaterials`, `rebuildAll` 교체 | 4 |
| `state.attachments = [{id,name}]`, `defaultState`/`openTrip` 정규화 | 5 |
| `att` 하위 문서 `{name,mime,data,createdAt}` | 8 |
| `compressImage` 장변 1400 / q 0.7→0.6→0.5 / 초과 reject | 6 |
| 지연 로딩 `ensureAttachmentsLoaded`, `자료모음` 진입 시, 여행별 1회 | 7, 2 |
| `addAttachment` 20 guard + 오프라인 실패 안내 | 8 |
| 삭제 확인 모달(문구·버튼) + 이름 인라인 수정 | 9 |
| `deleteTrip` att 정리 | 10 |
| 이미지 뷰어 전체화면 + 닫기, `.att-name` 클릭 가드 | 5 |
| `exportPDF` 임시 노출 + 이미지 삽입 + 탭 복원 | 11 |
| 공유 HTML 이미지 제외 | 12 |
| 보기모드 4탭 유지 + `.edit-only` | 1(마크업), 전 태스크 |
| 아바타 팝업 "기본값은 ✈…" 문구 삭제 | 1 |
| 파일 입력 `accept="image/*"`, `capture` 금지 | 8(마크업은 1) |
| 보안 규칙 변경 없음 | (명시) |
| 범위 밖(Storage 이관, 오프라인 지속성, 스와이프, 순서편집, 멤버십 상한, 탭 기억) | 미포함 |

갭 없음.

**2. Placeholder scan**

- `attRowHTML` 은 Task 4 에서 stub(`return ''`), Task 5 에서 실구현으로 교체 — 명시됨.
- `ensureAttachmentsLoaded` 는 Task 2 에서 no-op, Task 7 에서 실구현 — 명시됨.
- 모든 테스트에 실제 스펙 코드, 모든 구현 스텝에 실제 코드. "TODO/TBD" 없음.
- Task 11 의 캡처 대상 순서는 산문 + 코드 조각 혼합 — 구현자가 기존 `exportPDF` 의 `sections` 배열 구성부(index.html:1466-1473)를 대체하면 됨. 기존 코드 위치를 브리핑에 포함.

**3. Type consistency**

- `state.attachments` 항목 = `{id, name}` — Task 5 정의, 4/7/8/9/11/12 소비 일치.
- `att` 문서 필드 = `{name, mime, data, createdAt}` — Task 8 정의, 7(로드 시 `.data`)/9(`name` merge)/10(삭제) 일치.
- `attachmentsCache` = `{id: dataUrl}` — Task 5 정의, 7/8/9/11 일치.
- `loadedAttTripId` — Task 5 선언, 7 사용, `openTrip` 에서 `null` 리셋(7 Step 3).
- `compressImage` 반환 `{dataUrl, bytes}` — Task 6 정의, 8 소비 일치.
- `showEditorTab(name)` name 리터럴 `'schedule'|'notes'|'expense'|'materials'` — Task 2 정의, 전 태스크 일치. `#editView-` + name 규칙 일관.
- 클릭 위임 액션: `edit-tab, add-attachment, att-open, att-viewer-close, att-delete, att-confirm-delete` — 각 태스크에서 추가, 마크업 `data-action` 일치.
- `renderMaterials` — Task 4 정의, `rebuildAll`/`addLink`/`deleteLink`/`ensureAttachmentsLoaded`/`addAttachment`/`deleteAttachment`/`renameAttachment` 가 호출. `renderLinks` 정의 제거(Task 4).

이슈 없음.
