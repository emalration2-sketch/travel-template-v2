# 편집기 실사용 수정 배치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 실기기 테스트에서 나온 7건 수정: (1) 이미지 이름 수정 모드 잠금, (2) PDF 저장 CDN, (3) 초기화 버튼 이동·축소, (4) 하단 문구 줄바꿈, (5) 동행자 칩 여백, (6) 마이페이지 드래그 텍스트선택, (7) 모드 색 띠.

**Architecture:** `index.html` 한 파일. 대부분 CSS/마크업 소폭 수정 + 2건 JS 수정(`applyModeLock` 헬퍼, `loadPdfLibs` CDN 교체).

**Tech Stack:** 순수 HTML/CSS/JS, Firebase compat SDK, GitHub Pages. 테스트: Playwright + Firebase 스텁.

**Spec:** `docs/superpowers/specs/2026-09-06-editor-fixes-batch-design.md`

## Global Constraints

- 전부 `index.html`. 빌드 없음.
- Fix 2 CDN: `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` (→ `window.jspdf.jsPDF`) + `https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js` (→ `window.html2canvas`). 병렬 로드, 둘 다 onload 시 resolve. 캐시 프라미스 유지. 옛 `loadHtml2Pdf`/`html2pdfLoadPromise`/`window.html2pdf` 잔여 참조 0.
- Fix 1: `applyModeLock()` = `document.querySelectorAll('[data-scope]').forEach(el => el.disabled = (currentMode === 'view'));`. `setMode` 인라인 루프를 이걸로 교체 + `renderMaterials`/`renderDays`/`renderNotes` 끝에서 호출 (renderExpenseTab 은 `[data-scope]` 있을 때만).
- Fix 3: 초기화 → `.reset-link edit-only` 링크형, `#editView-schedule` 의 `＋ 새로운 일차 추가` 다음. 푸터의 `.foot-btns.foot-edit` 제거. `.foot-btns.foot-view` (PDF/공유) 유지. `resetAll()` 변경 없음.
- Fix 4: 푸터 `.foot-note` 힌트에 `...수정할 수 있어요.` 뒤 `<br>` 추가.
- Fix 5: `body:not(.mode-edit) .chip{ padding-right:12px; }` (보기모드 칩 좌우 대칭).
- Fix 6: `.mp-card` 에 `user-select:none; -webkit-user-select:none; -webkit-touch-callout:none;`.
- Fix 7: `nav.tabs{ border-bottom:4px solid var(--teal); }` (기존 `1px var(--line)` 대체), `body.mode-view nav.tabs{ border-bottom-color:var(--ink-soft); }`.
- 마이페이지/설정 뒤로가기 `←` 화살표는 **유지**(건드리지 않음).
- 커밋 트레일러: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## File Structure

| 파일 | 변경 |
|---|---|
| `index.html` | `loadPdfLibs` (Fix 2), `applyModeLock` + 호출부 (Fix 1), `#editView-schedule` 마크업 + `.reset-link` CSS + 푸터 (Fix 3), 힌트 `<br>` (Fix 4), CSS: 칩/mp-card/nav.tabs (Fix 5·6·7) |
| `tests/editor-fixes.spec.js` | 신규 — 7건 검증 |

---

## Task 1: Fix 2 — PDF 저장 CDN 교체

**Files:**
- Modify: `index.html` — `loadHtml2Pdf` → `loadPdfLibs`, `exportPDF` 호출부, 잔여 `html2pdf` 참조 제거
- Test: `tests/editor-fixes.spec.js` (일부)

**Interfaces:**
- Consumes: 없음
- Produces: `loadPdfLibs()` (Promise, `window.jspdf.jsPDF` + `window.html2canvas` 보장)

- [ ] **Step 1: 실패 테스트 — tests/editor-fixes.spec.js**

```js
const { test, expect } = require('./support/fixtures');

test('PDF: loadPdfLibs 존재 + 옛 html2pdf 참조 없음', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => typeof loadPdfLibs)).toBe('function');
  expect(await page.evaluate(() => typeof window.loadHtml2Pdf)).toBe('undefined');
  // exportPDF 소스가 loadPdfLibs 를 부르는지 (함수 문자열 검사)
  const src = await page.evaluate(() => exportPDF.toString());
  expect(src).toContain('loadPdfLibs');
  expect(src).not.toContain('loadHtml2Pdf');
});

test('PDF: loadPdfLibs 가 jsPDF+html2canvas 전역을 갖춘다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => loadPdfLibs());
  await expect.poll(() => page.evaluate(() => typeof (window.jspdf && window.jspdf.jsPDF))).toBe('function');
  expect(await page.evaluate(() => typeof window.html2canvas)).toBe('function');
  // 실제 jsPDF 인스턴스가 exportPDF 가 쓰는 메서드를 갖는지
  const m = await page.evaluate(() => { const { jsPDF } = window.jspdf; const d = new jsPDF('p','mm','a4');
    return [typeof d.addImage, typeof d.splitTextToSize, typeof d.text, typeof d.save].join(','); });
  expect(m).toBe('function,function,function,function');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test editor-fixes -g PDF`
Expected: FAIL — `loadPdfLibs` 없음. (2번째 테스트는 실제 CDN 로드 — Playwright 는 네트워크 허용이면 통과 가능. 안 되면 이 테스트만 `test.skip` 처리하고 리포트에 명시.)

- [ ] **Step 3: 구현 — `loadHtml2Pdf` 정의 교체 (index.html ~1606)**

```js
let pdfLibsPromise = null;
function loadPdfLibs(){
  if(window.jspdf && window.jspdf.jsPDF && window.html2canvas) return Promise.resolve();
  if(pdfLibsPromise) return pdfLibsPromise;
  const load = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('script load fail: ' + src));
    document.head.appendChild(s);
  });
  pdfLibsPromise = Promise.all([
    load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
    load('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
  ]);
  return pdfLibsPromise;
}
```

- 옛 `function loadHtml2Pdf(){...}` 와 `html2pdfLoadPromise` 변수 선언 삭제. `if(window.html2pdf) return...` 가드도 삭제.
- `exportPDF` 안 `loadHtml2Pdf().then(async () => {` → `loadPdfLibs().then(async () => {`.
- `grep -n "html2pdf\|loadHtml2Pdf" index.html` → 0 이어야 함 (CDN URL 주석 등도 없어야).

- [ ] **Step 4: 통과 확인**

Run: `npx playwright test editor-fixes -g PDF` → pass (2번째가 네트워크 이슈로 skip 이면 그 사실 리포트). 전체 `npx playwright test` 회귀 (기존 `attachments-integration` 의 exportPDF 테스트가 `window.loadHtml2Pdf`/`window.jspdf` 를 스텁하는데 — 그 스텁이 `loadPdfLibs` 를 스텁하도록 그 테스트도 갱신 필요. 확인하고 최소 수정).

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/editor-fixes.spec.js tests/attachments-integration.spec.js
git commit -m "fix: PDF 저장 — jsPDF+html2canvas 개별 CDN 로드로 교체

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Fix 1 — 이미지 이름 수정 모드 잠금 (applyModeLock)

**Files:**
- Modify: `index.html` — `applyModeLock` 신규, `setMode`, `renderMaterials`/`renderDays`/`renderNotes`
- Test: `tests/editor-fixes.spec.js` (추가)

**Interfaces:**
- Consumes: `currentMode`
- Produces: `applyModeLock()`

- [ ] **Step 1: 실패 테스트 추가**

```js
async function openTrip1(page, seedAtt = [{id:'a1',name:'IMG_1'}]){
  await page.goto('/');
  await page.evaluate((att) => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[], attachments: att }), title:'X', dayCount:1 });
    att.forEach(a => window.__test.seed('users/u1/trips/t1/att/'+a.id, { name:a.name, data:'data:image/jpeg;base64,AA' }));
  }, seedAtt);
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('이미지 이름: 보기모드 재렌더 후에도 잠김, 수정모드는 편집 가능', async ({ page }) => {
  await openTrip1(page);
  // 보기모드 전환 후 자료모음 첫 진입(→ ensureAttachmentsLoaded → renderMaterials 재렌더)
  await page.evaluate(() => setMode('view'));
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await expect.poll(() => page.evaluate(() => { const el=document.querySelector('#attList .att-name'); return el && el.disabled; })).toBe(true);
  // 수정모드로
  await page.evaluate(() => setMode('edit'));
  expect(await page.evaluate(() => document.querySelector('#attList .att-name').disabled)).toBe(false);
  // 수정모드에서 renderMaterials 재호출해도 편집 가능 유지
  await page.evaluate(() => renderMaterials());
  expect(await page.evaluate(() => document.querySelector('#attList .att-name').disabled)).toBe(false);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx playwright test editor-fixes -g 이미지` → FAIL (보기모드 재렌더 후 `disabled` 가 false).

- [ ] **Step 3: 구현**

`setMode` 근처(index.html ~1524)에 헬퍼 추가:
```js
function applyModeLock(){
  document.querySelectorAll('[data-scope]').forEach(el => { el.disabled = (currentMode === 'view'); });
}
```
`setMode` 안 `document.querySelectorAll('[data-scope]').forEach(el => { el.disabled = (mode === 'view'); });` → `applyModeLock();` 로 교체. (`currentMode` 는 그 줄 위 `currentMode = mode;` 로 이미 갱신됨.)

`renderMaterials()` 끝, `renderDays()` 끝, `renderNotes()` 끝에 `applyModeLock();` 추가. `renderExpenseTab` 은 함수 내 `[data-scope]` 요소 렌더 여부 확인 후 있으면 추가(없으면 생략, 리포트에 명시).

- [ ] **Step 4: 통과 확인** — Run: `npx playwright test editor-fixes -g 이미지` + 전체 회귀.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/editor-fixes.spec.js
git commit -m "fix: 재렌더 후에도 모드 잠금 재적용 (applyModeLock)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Fix 3 — 초기화 버튼 일정 탭 하단으로

**Files:**
- Modify: `index.html` — `#editView-schedule` 마크업, `<footer>`, `.reset-link` CSS
- Test: `tests/editor-fixes.spec.js` (추가)

**Interfaces:**
- Consumes: `resetAll` (기존)
- Produces: DOM `.reset-link[data-action="reset"]` (schedule 뷰 안)

- [ ] **Step 1: 실패 테스트 추가**

```js
test('초기화 버튼: 일정 뷰 안, 링크형, 푸터엔 없음', async ({ page }) => {
  await openTrip1(page);
  expect(await page.locator('#editView-schedule .reset-link[data-action="reset"]').count()).toBe(1);
  expect(await page.locator('footer .foot-btns.foot-edit').count()).toBe(0);
  expect(await page.locator('footer .foot-btns.foot-view').count()).toBe(1); // PDF/공유 유지
  // 보기모드에선 숨김
  await page.evaluate(() => setMode('view'));
  await expect(page.locator('#editView-schedule .reset-link')).toBeHidden();
  await page.evaluate(() => setMode('edit'));
  await expect(page.locator('#editView-schedule .reset-link')).toBeVisible();
});
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: 구현**

- `<footer>` 에서 `<div class="foot-btns foot-edit"><button data-action="reset">초기화</button></div>` 통째 삭제.
- `#editView-schedule` 안, `<button class="add-day edit-only" data-action="add-day">＋ 새로운 일차 추가</button>` 바로 다음 줄에:
  ```html
  <button class="reset-link edit-only" data-action="reset">초기화</button>
  ```
- `<style>` 끝에:
  ```css
  .reset-link{ display:block; margin:18px auto 4px; padding:4px 10px; background:none; border:none;
    font-size:11px; color:var(--ink-faint); text-decoration:underline; cursor:pointer; }
  ```
- `resetAll()` 변경 없음.
- `exportPDF` 의 `document.querySelectorAll('.foot-btns button')` 는 이제 PDF/공유만 잡음 — 변경 불필요(의도대로).

- [ ] **Step 4: 통과 확인** — `npx playwright test editor-fixes -g 초기화` + 회귀.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/editor-fixes.spec.js
git commit -m "fix: 초기화 버튼을 일정 탭 하단 링크형으로 이동

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Fix 4·5·6·7 — 문구 줄바꿈 / 칩 여백 / 드래그 선택 / 모드 색 띠

**Files:**
- Modify: `index.html` — 힌트 마크업 + CSS 3곳
- Test: `tests/editor-fixes.spec.js` (추가)

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (CSS/마크업)

- [ ] **Step 1: 실패 테스트 추가**

```js
test('힌트 문구 줄바꿈', async ({ page }) => {
  await page.goto('/');
  const html = await page.evaluate(() => [...document.querySelectorAll('footer .foot-note')].map(n => n.innerHTML).join('|'));
  expect(html).toContain('<br>');
  expect(html).toContain('[보기모드]에서는 조회만 가능합니다');
});

test('동행자 칩: 보기모드 좌우 여백 대칭', async ({ page }) => {
  await openTrip1(page);
  await page.evaluate(() => { state.travelers = ['나','길동']; renderTravelers(); setMode('view'); });
  const pad = await page.evaluate(() => { const c = document.querySelector('#travelersWrap .chip');
    const s = getComputedStyle(c); return { l: s.paddingLeft, r: s.paddingRight }; });
  expect(pad.l).toBe(pad.r);
});

test('마이페이지 카드: user-select none', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { title:'A', dayCount:1 });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  const us = await page.evaluate(() => getComputedStyle(document.querySelector('.mp-card')).userSelect
    || getComputedStyle(document.querySelector('.mp-card')).webkitUserSelect);
  expect(us).toBe('none');
});

test('모드 색 띠: 수정=teal, 보기=ink-soft', async ({ page }) => {
  await openTrip1(page);
  await page.evaluate(() => setMode('edit'));
  const edit = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).borderBottomColor);
  await page.evaluate(() => setMode('view'));
  const view = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).borderBottomColor);
  expect(edit).not.toBe(view);
  expect(edit).toBe('rgb(34, 127, 118)');   // --teal #227F76
  expect(view).toBe('rgb(74, 81, 120)');    // --ink-soft #4A5178
});
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: 구현**

- **Fix 4:** 힌트 `.foot-note` 텍스트에서 `...수정할 수 있어요. [보기모드]...` → `...수정할 수 있어요.<br>[보기모드]...`.
- **Fix 5:** `<style>` 에 `body:not(.mode-edit) .chip{ padding-right:12px; }` 추가 (기존 `.chip` 규칙은 그대로).
- **Fix 6:** 기존 `.mp-card{...}` 규칙에 `user-select:none; -webkit-user-select:none; -webkit-touch-callout:none;` 추가.
- **Fix 7:** `nav.tabs{...}` 의 `border-bottom:1px solid var(--line);` → `border-bottom:4px solid var(--teal);`. 그 아래(또는 CSS 끝) `body.mode-view nav.tabs{ border-bottom-color:var(--ink-soft); }` 추가.

- [ ] **Step 4: 통과 확인** — `npx playwright test editor-fixes` + 전체 회귀.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/editor-fixes.spec.js
git commit -m "fix: 힌트 줄바꿈 + 칩 여백 + 드래그 텍스트선택 방지 + 모드 색 띠

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: 회귀 + 전체 흐름 + 브라우저 확인

**Files:**
- Test: 전체 스위트
- Modify: (회귀로 깨진 게 있으면 최소 수정)

- [ ] **Step 1: 전체 스위트** — `npx playwright test` — 기존 63 + 신규 editor-fixes 전부 통과. `attachments-integration.spec.js` 의 exportPDF 테스트가 Task 1의 `loadPdfLibs` 로 갱신됐는지 재확인.

- [ ] **Step 2: 브라우저 수동 확인** (controller가 수행): 라이브 아닌 로컬 `preview_start` 로 — 편집기 진입 → 모드 색 띠 전환 확인 / 자료모음에서 수정모드일 때만 이름 편집 가능 / 초기화 버튼 위치·크기 / 힌트 2줄 / 마이페이지 카드 롱프레스 시 텍스트 선택 안 됨.

- [ ] **Step 3: 커밋** (수정 있었으면)

```bash
git add -A
git commit -m "test: 수정 배치 회귀 확인

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**

| 스펙 | 태스크 |
|---|---|
| Fix 1 (applyModeLock) | Task 2 |
| Fix 2 (PDF CDN) | Task 1 |
| Fix 3 (초기화 이동) | Task 3 |
| Fix 4 (힌트 br) | Task 4 |
| Fix 5 (칩 여백) | Task 4 |
| Fix 6 (mp-card user-select) | Task 4 |
| Fix 7 (모드 색 띠) | Task 4 |
| 회귀 | Task 5 |
| 범위 밖 (뒤로가기 화살표 유지) | 미변경 |

갭 없음.

**2. Placeholder scan** — 모든 스텝에 실제 코드/테스트. Task 1 Step 4 · Task 2 Step 3 에 "확인 후 필요 시" 조건부 지시 있음(renderExpenseTab data-scope 여부, attachments-integration exportPDF 스텁) — 구현자가 grep/read 로 판단, 리포트에 명시하도록 함.

**3. Type consistency**

- `loadPdfLibs()` — Task 1 정의, `exportPDF` 소비. `pdfLibsPromise` 캐시.
- `applyModeLock()` — Task 2 정의, `setMode`/`renderMaterials`/`renderDays`/`renderNotes` 호출. `currentMode` 전역 읽음.
- `.reset-link` 클래스 + `data-action="reset"` — Task 3 마크업, `resetAll` 은 기존 클릭 위임(`else if(a === 'reset') resetAll()`)이 처리 (액션명 동일).
- CSS 토큰 `--teal` `#227F76` → `rgb(34,127,118)`, `--ink-soft` `#4A5178` → `rgb(74,81,120)` — Task 4 테스트 기대값 일치.

이슈 없음.
