# 설계: 편집기 탭 분리 + 자료모음(링크 + 이미지 첨부)

작성일: 2026-09-06
대상: `travel-template-v2` / `index.html` (단일 파일, Firebase compat SDK 10.14.1, 빌드 없음)
선행: v2 마이페이지 + 다중 여행계획 (배포 완료, commit `63df130`)

---

## 1. 목표

편집기가 지금은 `일정(모든 일차) → 메모 → 참고 링크 → 지출기록`을 한 페이지에 세로로 이어 붙인 구조라, 내용이 많은 여행에서 스크롤 부담이 크다. 이를 해결한다:

- **일정**은 지금처럼 한 화면에서 쭉 스크롤(전체 훑기 유지).
- **메모 / 지출 / 자료모음**은 진짜 탭 — 선택한 것만 보이고 나머지는 숨긴다.
- 기존 **참고 링크** 탭을 없애고 **자료모음** 탭으로 흡수한다.
- **자료모음**에 이미지 첨부(항공권·입장권·QR 등)를 추가한다: 평소엔 이름 텍스트 리스트, 탭하면 전체 화면 이미지, 닫으면 리스트로 복귀.

편집기 내부 기능(일차/일정 항목/지출 항목/메모/링크의 입력·수정·삭제, 수정/보기 모드, 화폐, 날짜·시간 입력)은 **그대로 둔다** — 배치와 표시/숨김만 바꾼다.

---

## 2. 탭 네비게이션 구조

### 2.1 `nav.tabs` 3영역

```
┌─ nav.tabs (position:sticky; top:0) ─────────────────────────┐
│ 1행  [stage-badge] [완료/수정]        [동기화] [← 마이페이지] │  ← 기존 .nav-title, 변경 없음
│ 2행  [일정] [메모] [지출] [자료모음]                          │  ← 신규: 기존 .tabs-scroll 대체
│ 3행  [Day 1] [Day 2] [Day 3] …                               │  ← 신규: 일정 탭일 때만 렌더
└────────────────────────────────────────────────────────────┘
```

- **2행 (섹션 탭)**: 4개 고정. `<button class="tab" data-action="edit-tab" data-tab="schedule|notes|expense|materials">`. 앵커 링크(`<a href="#...">`)가 아니라 **뷰 전환**. 활성 탭은 기존 `.tab.active` 스타일. 가로 넘치면 기존처럼 `overflow-x:auto` 로 스크롤(라벨 4개면 375px에서 대개 한 줄에 들어감).
- **3행 (일차 칩)**: `#dayChips` 컨테이너. `renderDays()` 가 `state.days` 로부터 `<a class="tab day-chip" href="#day-{id}" id="chip-{id}">{tabLabel}</a>` 를 채운다. **`currentEditorTab === 'schedule'` 일 때만 표시**(`hidden` 토글). 일차 칩은 앵커 링크 유지 → 네이티브 점프 스크롤. `#day-{id}` 앵커에 `scroll-margin-top` 을 nav 높이만큼 부여.
- 기존 `#dayTabs` span, `＋ 일차` 칩 버튼(`.tab-add`), `<a href="#notes">` / `<a href="#links">` / `<a href="#expense">` 는 제거.
- 기존 `참고 링크` 탭/`#links` 섹션은 자료모음으로 이동(§3).

### 2.2 콘텐츠 컨테이너

`#printArea` 안을 4개 뷰 컨테이너로 정리한다(래핑만; 내부 요소 id·구조는 유지):

| 뷰 | 컨테이너 | 내용 |
|---|---|---|
| `schedule` | `#editView-schedule` | `.header-card`(제목·동행자) + `#daysContainer` + `＋ 새로운 일차 추가` |
| `notes` | `#editView-notes` | 기존 `#notesContainer` + `+ 메모 추가` (섹션 제목 유지) |
| `expense` | `#editView-expense` | 기존 `#expenseSummary` + `#expenseList` (섹션 제목 유지) |
| `materials` | `#editView-materials` | §3 |

- `.header-card` 는 `schedule` 뷰 안에만 존재. 스크롤하면 화면 밖으로 사라진다(현재 동작 유지). `.hint` div 는 제거(§5.1).
- 뷰 전환은 컨테이너의 `hidden` 속성 토글(§2.3).

### 2.3 전환 로직

```
let currentEditorTab = 'schedule';

function showEditorTab(name){          // 'schedule' | 'notes' | 'expense' | 'materials'
  currentEditorTab = name;
  document.querySelectorAll('[id^="editView-"]').forEach(v => {
    v.hidden = (v.id !== 'editView-' + name);
  });
  document.querySelectorAll('.tab[data-tab]').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.getElementById('dayChips').hidden = (name !== 'schedule');
  window.scrollTo(0, 0);
  if(name === 'materials') ensureAttachmentsLoaded();   // §4.3
}
```

- `openTrip(tripId)` 는 `state`/`rebuildAll()`/`setMode()` 후 **`showEditorTab('schedule')`** 로 초기화한다(탭 선택은 세션·여행 간 기억하지 않음).
- 클릭 위임에 `else if(a === 'edit-tab') showEditorTab(btn.dataset.tab);` 추가.
- `setMode()` 는 변경 없음. 4개 탭은 보기모드에서도 모두 보인다(네비게이션이므로). 추가/삭제/이름수정 컨트롤은 기존 `.edit-only` 클래스로 숨김.

### 2.4 스크롤스파이

`initObserver()` 를 축소: `section[id="day-…"]`(일차 카드)만 관찰하여 해당 `#chip-{id}` 에 `.active` 부여. `notes`/`links`/`expense` 섹션은 더 이상 한 스크롤에 없으므로 관찰 대상에서 제외. `renderDays()` 끝에서 재초기화(현행 유지).

---

## 3. 자료모음 탭 (`#editView-materials`)

두 그룹, 각각 제목 + 추가 버튼. B안(그룹 분리) 확정.

```
자료모음
─ 링크 ──────────────
  🔗 간사이공항 철도 노선도
  🔗 호텔 예약 확인 메일
  [＋ 링크 추가]                 ← .edit-only
─ 이미지  3 / 20 ────────────
  ▮ 대한항공 탑승권
  ▮ 유니버설 입장권 QR
  ▮ 숙소 체크인 QR
  [＋ 이미지 추가]               ← .edit-only, 20장 도달 시 비활성+안내
```

### 3.1 링크 그룹

- `state.links` (`[{id, label, url}]`) — 데이터·`addLink`/`deleteLink`/`renderLinks`/`linkHTML` 전부 **변경 없음**. `#linksContainer` 를 `#editView-materials` 안으로 옮기고 그룹 제목("링크")을 붙일 뿐.
- 탭 → 기존 동작(새 창으로 URL 열기).

### 3.2 이미지 그룹

- 여행 JSON: `state.attachments = [{ id, name }]` — 순서 + 이름만. `defaultState()` 에 `attachments: []` 추가. `loadTrip`/`openTrip` 정규화에 `if(!Array.isArray(state.attachments)) state.attachments = [];` 추가.
- 렌더: 신규 `renderMaterials()` → 링크 그룹(내부적으로 기존 `linkHTML` 재사용) + 이미지 그룹. `rebuildAll()` 은 `renderLinks()` 호출을 `renderMaterials()` 로 교체. 이미지 행 = 이름 텍스트(비었으면 "이미지"), 우측 `✕`(`.edit-only`). 그룹 제목에 `${state.attachments.length} / 20`.
- 행 탭 → `openAttachmentViewer(id)` (§3.3).
- `＋ 이미지 추가` → 숨겨진 `<input type="file" accept="image/*">` 트리거. `capture` 속성은 넣지 않는다 — 일부 모바일 브라우저에서 카메라 전용이 되어 갤러리 선택이 막힘. `accept="image/*"` 만으로 OS 선택기가 카메라·갤러리 둘 다 제공.
- `state.attachments.length >= 20` 이면 `＋ 이미지 추가` 비활성 + "이미지는 여행당 20장까지 추가할 수 있어요" 안내(향후 멤버십 시 무료 5 / 프리미엄 30).
- 이름 수정: 수정모드에서 행 이름 인라인 편집 → blur/enter 시 `att/{id}` name + `state.attachments` 항목 갱신 → `save()`.

### 3.3 이미지 뷰어

- 전체 화면 오버레이(신규 `#attViewer`, `position:fixed; inset:0; z-index:130; background:#000`). 이미지 `object-fit:contain`, CSS `touch-action:pinch-zoom` 로 핀치 줌 허용.
- 닫기: `✕` 버튼 또는 배경(이미지 바깥) 탭 → 오버레이 `hidden` → 리스트 복귀.
- v1: 이미지 간 스와이프 없음.
- `attachmentsCache[id]` (data URI) 사용. 없으면 먼저 `ensureAttachmentsLoaded()` 대기.

---

## 4. 이미지 데이터 모델 & 동작

### 4.1 저장 (경로 1 — Firestore 하위 컬렉션)

- 경로: `users/{uid}/trips/{tripId}/att/{attId}` — 이미지 1장당 문서 1개.
- 필드: `{ name: string, mime: 'image/jpeg', data: string /* "data:image/jpeg;base64,…" */, createdAt: serverTimestamp() }`.
- **1 MiB 문서 한계** 때문에 압축 후 base64 문자열이 ~700KB 를 넘지 않아야 함(§4.2).
- 여행 문서(`trips/{tripId}`)의 `data` JSON 에는 `state.attachments = [{id, name}]` 만 — 바이트는 넣지 않는다.
- **보안 규칙**: 기존 `/users/{userId}/{document=**}` 재귀 규칙이 `att` 하위 컬렉션까지 커버 → **규칙 변경 없음**. (배포된 규칙이 실제 재귀형인지는 사용자가 콘솔에서 확인 — v2와 동일 주의사항.)

### 4.2 압축 파이프라인 (`compressImage(file) -> Promise<{dataUrl, bytes}>`)

1. `createImageBitmap(file)` (or `<img>` + `onload`).
2. 장변(가로/세로 중 큰 쪽)을 **1400px** 로 스케일(작으면 원본 유지). `<canvas>` 에 `drawImage`.
3. `canvas.toDataURL('image/jpeg', q)` — q = 0.7 → 결과 base64 길이로 바이트 추정. `> 700KB` 면 q=0.6, 그래도 초과면 q=0.5 재시도.
4. q=0.5 에서도 초과하면 reject → 호출부에서 "이미지가 너무 커요. 더 작은 파일을 사용해주세요" alert.
5. HEIC 등 브라우저가 못 읽는 포맷: `createImageBitmap` 실패 → 동일 거부 메시지.

### 4.3 로드 (지연)

```
let loadedAttTripId = null;                 // 어떤 여행의 att 를 로드했는지
let attachmentsCache = {};                  // { attId: dataUrl }

async function ensureAttachmentsLoaded(){
  if(!currentTripId || loadedAttTripId === currentTripId) return;
  attachmentsCache = {};
  const snap = await tripsCol().doc(currentTripId).collection('att').get();
  snap.forEach(d => { attachmentsCache[d.id] = d.data().data; });
  loadedAttTripId = currentTripId;
  renderMaterials();                         // 썸네일/유효성 반영
}
```

- `showEditorTab('materials')` 진입 시 1회 호출. `openTrip` 에서 `loadedAttTripId = null` 로 리셋(여행 바뀌면 재로드).
- 실패 시 콘솔 로그 + 이미지 그룹에 "이미지를 불러오지 못했어요" 표시. 링크 그룹은 영향 없음.

### 4.4 추가

```
async function addAttachment(file){
  if(state.attachments.length >= 20){ /* 안내 */ return; }
  let out;
  try { out = await compressImage(file); }
  catch { alert('이미지가 너무 커요…'); return; }
  const id = uid();
  try {
    await tripsCol().doc(currentTripId).collection('att').doc(id).set({
      name: file.name.replace(/\.[^.]+$/, ''), mime: 'image/jpeg',
      data: out.dataUrl, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    alert('오프라인에서는 이미지를 추가할 수 없어요. 연결 후 다시 시도해주세요.');
    return;
  }
  attachmentsCache[id] = out.dataUrl;
  state.attachments.push({ id, name: file.name.replace(/\.[^.]+$/, '') });
  save();                                    // 여행 문서 동기화(디바운스)
  renderMaterials();
}
```

- `att` 문서 쓰기는 즉시(디바운스 아님). 여행 문서의 `state.attachments` 변경만 기존 `save()`(→ `flushCloud` ~1s 디바운스)를 탄다.
- **오프라인**: `att` 쓰기 실패 → 안내 후 중단(로컬 `state.attachments` 에도 추가 안 함 → 불일치 없음). 로드맵 ③(오프라인 지속성) 이후엔 큐잉되어 해결.

### 4.5 삭제

- `✕` → 확인 모달(재사용 `#v2Modal`): "이 이미지를 삭제할까요?\n되돌릴 수 없습니다." [삭제]/[취소].
- 확인 → `att/{id}` 문서 `.delete()` → `delete attachmentsCache[id]` → `state.attachments` 에서 제거 → `save()` → `renderMaterials()`.
- 삭제 실패(오프라인 등) → "삭제하지 못했어요" alert, 상태 원복.

### 4.6 여행 삭제 연동

`deleteTrip(tripId)` 확장: 문서 삭제 전에 `att` 하위 컬렉션을 클라이언트에서 정리.

```
const attSnap = await tripsCol().doc(tripId).collection('att').get();
await Promise.all(attSnap.docs.map(d => d.ref.delete()));   // best-effort
await tripsCol().doc(tripId).delete();
// 이어서 기존 로직: tripOrder 에서 제거 + saveProfile
```

- 일부 실패해도 여행 삭제는 진행(고아 `att` 문서가 남을 수 있음 — 비용 미미, 향후 정리 스윕 가능). 실패는 콘솔 로그만.

---

## 5. 통합 처리

### 5.1 힌트 문구 이동

- `.header-card` 의 `<div class="hint">✏️ [수정모드]에서 모든 항목을…[보기모드]에서는 조회만 가능합니다.</div>` **제거**.
- `footer` 의 `<div class="foot-note">로그인한 계정에 자동 저장됩니다</div>` **아래**에 같은 문구를 `.foot-note` 스타일로 한 줄 추가.

### 5.2 PDF 저장 (`exportPDF`)

- 문제: 캡처 루프가 살아있는 DOM(`.header-card`, `#daysContainer .day-card`, `#notes`/`#links`/`#expense`)을 `html2canvas` 로 찍는데, 탭 전환으로 비활성 뷰가 `hidden`(`display:none`)이면 0×0 캔버스 → `if(canvas.height === 0) continue;` 로 **조용히 누락**.
- 수정:
  1. 루프 전에 4개 `#editView-*` 컨테이너의 `hidden` 을 모두 해제(원래 값 기억) + `#dayChips` 숨김.
  2. `ensureAttachmentsLoaded()` 대기(이미지 캡처용).
  3. 캡처 대상 순서: `.header-card` → `#daysContainer .day-card` 들 → 메모 뷰 컨테이너 → 지출 뷰 컨테이너 → 자료모음의 **링크 그룹 DOM**(html2canvas 로 이미지화 — 예전 `#links` 섹션 캡처와 동일 방식) → **각 이미지 첨부**를 `doc.addImage(attachmentsCache[id], 'JPEG', …)` 로 페이지 폭에 맞춰 축소 삽입(이름을 캡션으로).
  4. `finally` 에서 `hidden` 원복 + `showEditorTab(currentEditorTab)` 재적용.

### 5.3 공유하기 (`buildStaticGuideHTML`)

- 데이터(`state`) 기반이라 구조 변경 없음. `state.attachments` 는 **무시**(이미지 제외 — base64 임베드 시 공유 파일이 수 MB). 링크는 기존대로 포함.
- `defaultState` 에 `attachments` 가 생겨도 `buildStaticGuideHTML` 이 참조하지 않으면 자동으로 안전. 명시적으로 건드리지 않는다.

### 5.4 보기모드

- 4개 탭 모두 표시. `showEditorTab` 은 모드와 무관.
- `＋ 링크 추가` / `＋ 이미지 추가` / `✕` / 이름 인라인 편집 = 기존 `.edit-only` 로 숨김.
- 이미지 뷰어(전체 화면 보기)는 두 모드 다 동작.

---

## 6. 테스트 (Playwright + Firebase 스텁)

기존 하네스 확장. 스텁은 이미 `collection().doc().collection()` 중첩과 `.get()`/`.set()`/`.delete()` 를 지원하므로 `att` 하위 컬렉션은 추가 작업 거의 없음.

- **탭 전환**: `showEditorTab('notes')` → `#editView-notes` 만 보이고 나머지 `hidden`, `.tab[data-tab="notes"]` active, `#dayChips` 숨김. `schedule` 로 돌아오면 `#dayChips` 다시 표시.
- **openTrip 초기화**: 다른 탭 선택 후 `openTrip` → `currentEditorTab === 'schedule'`, schedule 뷰 표시.
- **일차 칩**: `renderDays` 후 `#dayChips` 에 일차 수만큼 앵커. 스크롤스파이는 일차 카드만 관찰.
- **자료모음 렌더**: `state.links` 2개 + `state.attachments` 3개 → 링크 그룹 2행 + 이미지 그룹 3행 + `3 / 20`.
- **이미지 추가**: 작은 dataURI 픽스처로 `addAttachment` → `att/{id}` 문서 생성(`__test.dump()`), `state.attachments` 갱신, 여행 문서 `data` 에 반영, 리스트 4행.
- **20장 제한**: `state.attachments` 20개 → `＋ 이미지 추가` 비활성, `addAttachment` 호출해도 문서 안 생김.
- **지연 로딩**: 시드된 `att` 문서 2개 + `자료모음` 탭 첫 진입 → `attachmentsCache` 채워짐, 재진입 시 재fetch 안 함(`loadedAttTripId`).
- **삭제**: 이미지 ✕ → 확인 모달 → `att/{id}` 문서 삭제 + `state.attachments` 에서 제거.
- **deleteTrip 연동**: `att` 문서 2개 있는 여행 삭제 → `att` 문서들도 삭제됨.
- **PDF 임시 노출**: `exportPDF` 호출 시 캡처 직전 4개 뷰가 잠깐 모두 `hidden=false`, 완료 후 원래 탭 복원. (html2canvas 는 스텁 불가 — 함수 스텁 or DOM 상태만 검증.)
- **힌트 문구**: `.header-card .hint` 없음, 푸터에 문구 존재.
- **회귀**: 기존 38개 스펙 그대로 통과(특히 `open-trip`, `save-sync`, `full-flow`).

---

## 7. 범위 밖 (이번에 하지 않음)

- Firebase Storage 로의 이미지 이관(경로 2) — 이미지가 커지거나 사용자 수천 명 시점.
- 오프라인 지속성(로드맵 ③) — 이후 별도. 지금은 오프라인 이미지 추가 = 실패 + 안내.
- 이미지 간 스와이프, 이미지 편집(크롭·회전), OCR.
- 링크/이미지 순서 편집(드래그) — 추가 순서 고정 유지.
- 멤버십 연동 상한(무료 5 / 프리미엄 30) — 지금은 20 고정.
- 탭 선택 기억(여행별/세션).
- 공유 HTML 에 이미지 포함.

---

## 8. 구현 메모

- 단일 `index.html` 유지. 새 코드는 주석 배너로 구획: `/* ===== EDITOR TABS ===== */`, `/* ===== ATTACHMENTS ===== */`.
- 기존 함수 재사용: `renderDays`/`tabLabel`/`initObserver`(축소)/`renderLinks`/`addLink`/`deleteLink`/`save`/`rebuildAll`/`setMode`/`openTrip`/`deleteTrip`/`uid`/`escapeHTML`/`escapeAttr`/`v2ModalOpen`/`v2ModalClose`.
- `rebuildAll()` 에 `renderMaterials()` 추가(또는 `renderLinks` 를 `renderMaterials` 로 흡수). `renderMaterials` 는 `attachmentsCache` 가 비어도 이름 리스트는 그림(썸네일/뷰어는 로드 후).
- 디자인 토큰·기존 클래스(`.tab`, `.section-block`, `.section-title`, `.add-block`, `.edit-only`, `.day-card`) 재사용.
- 커밋 트레일러: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
