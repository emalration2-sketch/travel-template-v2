# 설계: 편집기 실사용 수정 배치 (7건)

작성일: 2026-09-06
대상: `travel-template-v2` / `index.html`
선행: 편집기 탭 분리 + 자료모음 (배포됨, `122a037`)

실기기 테스트에서 나온 7건. 원인은 라이브 사이트에서 재현·확인 완료.

---

## 1. 이미지 이름 수정이 모드와 반대로 동작

**증상:** 자료모음 이미지 이름을 **보기모드에서 편집 가능**, 수정모드 기대와 어긋남. (수정모드에서만 편집 가능해야 함)

**원인:** `setMode(mode)`는 모드 전환 시 `document.querySelectorAll('[data-scope]').forEach(el => el.disabled = (mode === 'view'))` 를 **그 시점의 DOM에 1회** 적용한다. `자료모음` 탭 첫 진입 시 `ensureAttachmentsLoaded()` → `renderMaterials()` 가 `.att-name` 입력칸(`data-scope="att"`)을 **다시 그리는데**, 이후 `setMode` 가 다시 호출되지 않으므로 새 입력칸은 모드와 무관하게 `disabled=false`(편집 가능) 상태로 남는다. (`renderDays`/`renderNotes` 도 같은 잠재 결함이 있으나 탭 전환 시 재렌더되지 않아 현재는 드러나지 않음.)

**수정:** 모드 잠금 로직을 헬퍼로 추출하고, `[data-scope]` 요소를 생성하는 렌더 함수 끝에서 호출한다.

```js
function applyModeLock(){
  document.querySelectorAll('[data-scope]').forEach(el => { el.disabled = (currentMode === 'view'); });
}
```

- `setMode` 의 인라인 `forEach` 를 `applyModeLock()` 호출로 교체.
- `renderMaterials()`, `renderDays()`, `renderNotes()` 끝에 `applyModeLock()` 추가. (`renderExpenseTab` 에 `[data-scope]` 입력칸이 있으면 거기도.)
- `applyModeLock` 은 `currentMode` 전역을 읽음 — `openTrip` 에서 `rebuildAll()` 전에 이미 올바른 값이므로 순서 문제 없음(멱등).

---

## 2. PDF 저장 실패

**증상:** "PDF로 저장" → alert "PDF 생성에 실패했어요. 다시 시도해주세요."

**원인 (라이브에서 재현·확인):** `loadHtml2Pdf()` 가 로드하는 `https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js` 는 `window.html2pdf`(함수) **하나만** 전역으로 노출한다. `window.jspdf` · `window.jsPDF` · `window.html2canvas` 는 번들 내부에만 있고 전역에 없다. `exportPDF` 는 `const { jsPDF } = window.jspdf;` 와 `await window.html2canvas(...)` 를 직접 쓰므로 → `Cannot destructure property 'jsPDF' of 'window.jspdf' as it is undefined.` → catch → 실패 alert.

**수정:** 번들 대신 **jsPDF UMD + html2canvas 를 개별 스크립트로** 로드한다. (라이브에서 로드·`new jsPDF()`·`addImage`/`splitTextToSize`/`text`/`save` 사용 테스트 통과.)

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

- 기존 `loadHtml2Pdf` 정의와 `html2pdfLoadPromise` 변수 제거. `exportPDF` 의 `loadHtml2Pdf().then(...)` → `loadPdfLibs().then(...)`.
- `exportPDF` 의 나머지 본문(섹션 캡처 루프, 첨부 이미지 루프, `try/finally` 복원)은 이미 `window.jspdf.jsPDF` · `window.html2canvas` 를 쓰므로 **변경 없음**.
- `html2pdf` 라는 이름/전역은 더 이상 쓰지 않음. grep 해서 잔여 참조 제거.

---

## 3. 초기화 버튼 — 일정 탭 하단으로 이동 + 축소

**증상:** 초기화 버튼이 공용 푸터에 있어 모든 탭(수정모드)에서 보이고, 알약 버튼이라 비중이 커서 오탭 우려.

**수정:**
- `<footer>` 의 `<div class="foot-btns foot-edit"><button data-action="reset">초기화</button></div>` **제거** (푸터의 `.foot-btns.foot-view` = PDF/공유 는 유지).
- `#editView-schedule` 안, `<div class="wrap">` 의 `＋ 새로운 일차 추가` 버튼 **다음**에 작은 링크형 버튼 추가:
  ```html
  <button class="reset-link edit-only" data-action="reset">초기화</button>
  ```
- 스타일 (신규):
  ```css
  .reset-link{
    display:block; margin:18px auto 4px; padding:4px 10px;
    background:none; border:none; font-size:11px; color:var(--ink-faint);
    text-decoration:underline; cursor:pointer;
  }
  ```
- `resetAll()` 함수 변경 없음. `.foot-btns button` 에 걸린 스타일 규칙은 `.foot-view` 버튼용으로 남으므로 그대로.
- `exportPDF` 의 `const btns = document.querySelectorAll('.foot-btns button');` 는 이제 PDF/공유 버튼만 잡음 — 의도대로.

---

## 4. 일정 탭 하단 문구 줄바꿈

**수정:** 정적 마크업 한 줄:
`<div class="foot-note">✏️ [수정모드]에서 모든 항목을 자유롭게 입력·수정할 수 있어요. [보기모드]에서는 조회만 가능합니다.</div>`
→
`<div class="foot-note">✏️ [수정모드]에서 모든 항목을 자유롭게 입력·수정할 수 있어요.<br>[보기모드]에서는 조회만 가능합니다.</div>`

---

## 5. 동행자 칩 — 보기모드에서 이름 앞 공백처럼 보임

**원인 (확인):** `.chip{ padding:5px 6px 5px 12px }` (상 우 하 좌). 수정모드엔 우측에 `✕` 버튼(`display:block`)이 있어 균형이 맞지만, 보기모드는 `body:not(.mode-edit) .chip button{display:none}` 로 `✕` 이 사라져 좌 12px / 우 6px 비대칭 → 왼쪽 여백이 공백처럼 보임. **칩 마크업에 실제 공백 문자는 없음.**

**수정:** 보기모드에서 칩 패딩 대칭:
```css
body:not(.mode-edit) .chip{ padding-right:12px; }
```

---

## 6. 마이페이지 여행 목록 — 꾹 눌러 드래그 시 텍스트 선택됨

**증상:** 순서 변경하려고 카드를 롱프레스하면 카드 안 텍스트("1일" 등)가 선택되고 iOS 선택 핸들이 떠서 드래그가 방해됨.

**수정:** `.mp-card` 에 텍스트 선택·콜아웃 방지:
```css
.mp-card{ ... user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
```
(카드 내부 `.mp-name`/`.mp-dates` 포함. 화살표·삭제 버튼은 여전히 클릭 가능.)

---

## 7. (원래 8번) 수정/보기 모드 구분 강화 — 안 A: 상단 색 띠

**수정:** `nav.tabs` 하단 테두리를 얇은 색 띠로. 수정모드 = teal, 보기모드 = 뮤트 네이비. 순수 CSS (`body.mode-edit`/`body.mode-view` 는 `setMode` 가 이미 토글).

```css
nav.tabs{ border-bottom:4px solid var(--teal); }          /* 기존 1px var(--line) 대체 */
body.mode-view nav.tabs{ border-bottom-color:var(--ink-soft); }   /* #4A5178 */
```

- 기존 배지(`수정 모드`/`보기 모드`) + 버튼 색 대비는 그대로 유지 — 색 띠가 추가 신호.
- 레이아웃 이동 없음 (테두리 두께만 1→4px).

---

## 범위 밖

- 마이페이지 `← 마이페이지` / 설정 `← 내 여행` 화살표 — 사용자 요청으로 **유지**.
- `renameAttachment` 키 입력 관련 이전 이월건, PDF 캡션 페이지브레이크 이월건 — 이번 배치와 무관, 그대로 둠.

---

## 테스트

Playwright + Firebase 스텁 하네스 확장:
- **1:** 여행 열고 보기모드 전환 → `자료모음` 탭 첫 진입(→`renderMaterials` 재렌더) → `#attList .att-name` 이 `disabled` 인지. 수정모드에선 `disabled=false`.
- **2:** `loadPdfLibs()` 호출 후 `window.jspdf.jsPDF` 와 `window.html2canvas` 가 함수인지. (실제 CDN 로드는 테스트에서 라우트 스텁 or 스킵 — 최소한 `exportPDF` 가 `loadPdfLibs` 를 부르고 옛 `loadHtml2Pdf`/`window.html2pdf` 참조가 없는지.)
- **3:** `#editView-schedule` 안에 `.reset-link[data-action="reset"]` 존재, 푸터엔 `.foot-btns.foot-edit` 없음. 보기모드에서 `.reset-link` 안 보임(`edit-only`).
- **4:** 푸터 `.foot-note` 에 `<br>` 포함 (또는 innerHTML 검사).
- **5:** 보기모드에서 `#travelersWrap .chip` 의 `padding-left === padding-right`.
- **6:** `.mp-card` 의 `getComputedStyle().userSelect === 'none'`.
- **7:** `body.mode-edit` 일 때 `nav.tabs` border-bottom-color 가 teal 계열, `body.mode-view` 일 때 `--ink-soft`.
- **회귀:** 기존 63개 전부 통과 (특히 `attachments`, `open-trip`, `full-flow`, `reorder-drag`, `editor-tabs`).
