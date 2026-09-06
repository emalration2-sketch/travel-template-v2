# 설계: 컬러 테마 (무료 5종)

작성일: 2026-09-06
대상: `travel-template-v2` / `index.html`
선행: 편집기 실사용 수정 배치 (배포됨, `7a89539`) · 썸네일 그리드 + 배너 (`e8a7a0b`)

사용자가 설정에서 컬러 테마를 고르면 앱 전체(마이페이지·설정·편집기 4탭·모달)가 즉시 그 팔레트로 바뀐다. 5종 전부 무료. 로그인 계정에 저장돼 기기 간 유지. 유료화(프리미엄 전용 테마)는 이번 범위 밖 — 시스템은 나중에 잠금 테마를 얹을 수 있게 설계하되 잠금 로직은 만들지 않는다.

---

## 1. 테마 모델

모든 색은 `:root` CSS 커스텀 프로퍼티. 현재 토큰 10개(`--ink` `--ink-soft` `--ink-faint` `--red` `--gold` `--teal` `--paper` `--paper-2` `--line` `--card`) 유지 + 아래 5개 추가:

| 신규 토큰 | 뜻 | 라이트 테마에서 | 다크 테마에서 |
|---|---|---|---|
| `--fill-strong` | "진한 솔리드 배경" — 일차 헤더·활성 탭·아바타 원·솔리드 버튼·모달 헤더 | `--ink` 와 동일 | 별도 값 (밝은 텍스트가 얹혀도 읽히는 짙은 서피스) |
| `--mode-edit` | 수정모드 신호색 — 탭바 하단 띠·모드 뱃지 글자·모드 버튼(수정 상태) | 테마별 | 테마별 |
| `--mode-view` | 보기모드 신호색 — 위와 동일(보기 상태) | 테마별 | 테마별 |
| `--banner-bg` | 마이페이지 배너 배경. **색 또는 `linear-gradient(...)` 문자열** (`background` 축약이 둘 다 받음) | 테마별 | 테마별(그라디언트 가능) |
| `--banner-fg` | 배너 워드마크·태그라인 글자색 | `#FFFFFF` (전 테마) | `#FFFFFF` |

**브랜드 상수 — 토큰 아님:** 배너 비행기(`✈`) 색은 리터럴 `#DE9A34` 고정. 전 테마 동일. 절대 테마화하지 않는다 (로고색).

**기본 테마 = `a`(오션).** bare `:root` 에 테마 a 값을 직접 넣어 JS 로드 전에도 a 로 그려진다. `:root[data-theme="b"]` … `:root[data-theme="e"]` 가 오버라이드. `:root[data-theme="a"]` 도 대칭을 위해 명시.

**모드 색 락 갱신:** 기존 "2모드만: edit=teal / view=navy" 락 제약은 이제 **테마별 `--mode-edit`/`--mode-view` 로 대체** (사용자 승인). 여전히 2모드뿐이고, 두 모드가 색으로 뚜렷이 구분된다는 원칙은 유지 — 색값만 테마가 정한다.

**`prefers-color-scheme` 는 쓰지 않는다.** 테마는 명시적 선택만. 다크 테마(d)를 골라야 다크가 된다.

---

## 2. 토큰 리팩터 — 하드코딩 색 제거

테마 스왑이 전 화면에 먹으려면 아래 하드코딩을 토큰으로 바꾼다. (행 번호는 작성 시점 기준, 구현 때 재확인.)

### 2-1. `--ink` → `--fill-strong` 로 교체 (텍스트가 아니라 "배경"으로 쓰인 자리)

| 위치 | 현재 | 변경 |
|---|---|---|
| `.mode-btn` 보기상태 `body:not(.mode-edit) .mode-btn` | `background:var(--ink); border-color:var(--ink)` | `background:var(--mode-view); border-color:var(--mode-view)` |
| `.mode-btn` 수정상태 | `border:2px solid var(--teal); background:var(--teal)` | `… var(--mode-edit)` |
| `.tab.active` (편집기 탭) | `background:var(--ink); border-color:var(--ink)` | `background:var(--fill-strong); border-color:var(--fill-strong); color:#fff` |
| `.tab.day-chip.active` | `background:#243057; border-color:#243057` | `background:var(--fill-strong); border-color:var(--fill-strong)` |
| `.day-head` | `background:var(--ink)` | `background:var(--fill-strong)` (글자·날짜는 `#fff`/`rgba(255,255,255,…)` 유지) |
| `.exp-modal` 헤더 등 `background:var(--ink)` (line ~275) | `background:var(--ink)` | `background:var(--fill-strong)` |
| `.btn-solid` | `background:var(--ink)` | `background:var(--fill-strong)` |
| `.v2-btn-solid` | `background:var(--ink)` | `background:var(--fill-strong)` |
| `.landing-login` | `background:var(--ink); border:2px solid var(--ink)` | `background:var(--fill-strong); border-color:var(--fill-strong)` |
| `.s-sum-card` 등 공유 HTML | — | **변경 안 함** (§7 참조) |

`--ink` 가 **글자색**으로 쓰인 자리는 그대로 둔다 (제목·본문·입력값 등 다수).

### 2-2. 아바타 원 — 하드코딩 네이비 그라디언트 제거

| 위치 | 현재 | 변경 |
|---|---|---|
| `.mp-avatar` | `background:linear-gradient(135deg,#1B2340,#243057)` | `background:var(--fill-strong)` (플랫). `.mp-avatar.emoji{background:var(--paper-2)}` 규칙은 그대로 |
| `.set-avatar-big` | `background:linear-gradient(135deg,#1B2340,#243057)` | `background:var(--fill-strong)` |

### 2-3. 모드 신호색

| 위치 | 현재 | 변경 |
|---|---|---|
| `nav.tabs` | `border-bottom:4px solid var(--teal)` | `border-bottom:4px solid var(--mode-edit)` |
| `body.mode-view nav.tabs` (기존) | `border-bottom-color:var(--ink-soft)` | `border-bottom-color:var(--mode-view)` |
| `.stage-badge` 수정 | `background:#E7F2F0; color:var(--teal)` | `background:var(--paper-2); color:var(--mode-edit)` |
| `body.mode-view .stage-badge` | `background:#E4E6F0; color:var(--ink)` | `background:var(--paper-2); color:var(--mode-view)` |

### 2-4. 썸네일 로딩 플레이스홀더

`.att-img-wrap{ background:#243057 }` → `background:var(--fill-strong)` (이미지 로드 전 잠깐 보이는 색).

### 2-5. 그 외 `--teal` 사용처

`--teal` 를 "주 액센트"로 이미 쓰는 자리(링크·+추가 점선 버튼·`.set-back`·`.mp-settings-row`·`.av-cell.sel` outline·`.link-btn:hover` 등)는 **토큰 그대로 두고** 값만 테마가 바꾼다. 추가 작업 없음.

---

## 3. 5개 테마 정의

각 블록은 위 15개 토큰(기존 10 + 신규 5)을 모두 정의한다. `--card` 는 라이트 전부 `#FFFFFF`.

### a. 오션 (기본) — 쿨 민트 · 틸 · 라이트
```
--ink:#16302D  --ink-soft:#47635E  --ink-faint:#8AA39D
--red:#E0556E  --gold:#E3A63C  --teal:#1C7A6F
--paper:#F1F6F4  --paper-2:#E1EDE9  --line:#CEDFD9  --card:#FFFFFF
--fill-strong:#16302D
--mode-edit:#1C7A6F  --mode-view:#415A78
--banner-bg:#1C7A6F  --banner-fg:#FFFFFF
```

### b. 모노 슬레이트 — 뉴트럴 그레이 · 슬레이트블루 · 라이트
```
--ink:#1E2124  --ink-soft:#55585C  --ink-faint:#9A9CA0
--red:#C6506A  --gold:#9A7B4E  --teal:#3E6B8A
--paper:#F4F3F1  --paper-2:#E9E7E3  --line:#DAD8D3  --card:#FFFFFF
--fill-strong:#1E2124
--mode-edit:#3E6B8A  --mode-view:#2E3236
--banner-bg:#2A2D30  --banner-fg:#FFFFFF
```

### c. 미드나잇 — 딥 네이비 · 골드 · 라이트
```
--ink:#1B2340  --ink-soft:#4A5178  --ink-faint:#8A90AE
--red:#E0475F  --gold:#DE9A34  --teal:#35528F
--paper:#F2F4F9  --paper-2:#E6EAF4  --line:#D6DCEA  --card:#FFFFFF
--fill-strong:#1B2340
--mode-edit:#35528F  --mode-view:#8A6E2E
--banner-bg:#1B2340  --banner-fg:#FFFFFF
```

### d. 아쿠아마린 갤럭시 — 다크 · 아쿠아마린 · 갤럭시 그라디언트
```
--ink:#EAF2F4  --ink-soft:#9FB2BE  --ink-faint:#61748A
--red:#FF6B85  --gold:#E3A63C  --teal:#33D6C0
--paper:#0C1524  --paper-2:#182335  --line:#29374D  --card:#131E30
--fill-strong:#1E2E48
--mode-edit:#33D6C0  --mode-view:#6C7BE0
--banner-bg:linear-gradient(125deg,#0F1C3E 0%,#123E5E 52%,#0C4F4A 100%)
--banner-fg:#FFFFFF
```
다크 유의: `.day-head`/`.tab.active`/모달 헤더의 글자는 전 테마 `#fff` 유지 — `--fill-strong`(`#1E2E48`)가 짙어서 흰 글자가 읽힌다. `.pdfrow button` 등 `background:var(--card)` 자리는 `#131E30` 이 되어 자동 정합.

### e. 코랄 선라이즈 — 웜 · 코랄 · 선라이즈 그라디언트 · 라이트
```
--ink:#43202F  --ink-soft:#8A5560  --ink-faint:#BE93A0
--red:#B23A32  --gold:#E89A3C  --teal:#D8583C
--paper:#FEF3EC  --paper-2:#FBE3D5  --line:#F1D2C0  --card:#FFFFFF
--fill-strong:#43202F
--mode-edit:#D8583C  --mode-view:#A8703E
--banner-bg:linear-gradient(120deg,#E8663E 0%,#EF8A3C 55%,#E8A54A 100%)
--banner-fg:#FFFFFF
```

---

## 4. 배너 재구성 (마크업 + 태그라인 + 그라디언트)

현재:
```html
<div class="mp-banner"><span class="mpb-plane">✈</span><span class="mpb-word">Travel Template</span></div>
```
변경:
```html
<div class="mp-banner">
  <div class="mpb-line"><span class="mpb-plane">✈</span><span class="mpb-word">Travel Template</span></div>
  <span class="mpb-tag">여행의 모든 순간을 한 곳에</span>
</div>
```
CSS:
```css
.mp-banner{ display:flex; flex-direction:column; align-items:center; gap:2px;
  background:var(--banner-bg); color:var(--banner-fg);
  border-radius:12px; padding:12px 14px; margin:12px 0 2px; }
.mpb-line{ display:flex; align-items:center; gap:7px; }
.mpb-word{ font-family:'Fraunces',serif; font-size:15px; font-weight:600; letter-spacing:.01em; }
.mpb-plane{ color:#DE9A34; }         /* 브랜드 상수, 테마 불변 */
.mpb-tag{ font-size:10.5px; opacity:.85; }
```
- 마크업·클래스 구조는 **전 테마 공통**. 색만 `--banner-bg`/`--banner-fg` 로 바뀐다.
- `--banner-bg` 에 그라디언트 문자열이 와도 `background:` 축약이 그대로 처리.

---

## 5. 저장 & 적용

### 5-1. 저장 위치
`profile.theme` (`'a'|'b'|'c'|'d'|'e'`, 기본 `'a'`). `users/{uid}` 문서에 `avatarId`·`tripOrder` 옆.

- `loadProfile()`: `theme: (['a','b','c','d','e'].includes(d.theme) ? d.theme : 'a')` 추가.
- `saveProfile()`: `profileDoc().set({...}, {merge:true})` payload 에 `theme: profile.theme` 추가.
- 기존 사용자(문서에 `theme` 없음) → `'a'`. 다음 `saveProfile` 호출(아바타 변경·순서 변경·첫 테마 선택) 때 필드 기록. 마이그레이션 화면·팝업 없음.

### 5-2. localStorage 캐시 (플래시 방지)
키 `ttv2-theme`. 새로고침 시 Firebase 프로필 로드 전에 즉시 테마 적용 → 기본 a 로 깜빡였다 바뀌는 현상 방지. (`travel-template-mode` 와 같은 패턴.)

### 5-3. `applyTheme(t)`
```js
const THEME_IDS = ['a','b','c','d','e'];
function applyTheme(t){
  const theme = THEME_IDS.includes(t) ? t : 'a';
  document.documentElement.dataset.theme = theme;
  try{ localStorage.setItem('ttv2-theme', theme); }catch(e){}
}
```

### 5-4. 호출 지점
1. **부트 인라인** — `<body>` 직후(또는 첫 스크립트 최상단), Firebase 로드 전:
   `document.documentElement.dataset.theme = (localStorage.getItem('ttv2-theme') || 'a');`
   (검증은 `applyTheme` 가 나중에 다시 함.)
2. `loadProfile()` 완료 후: `applyTheme(profile.theme)`.
3. 테마 선택 탭: `applyTheme(id); saveProfile({ theme:id });`
4. 로그아웃(`handleAuthChange(null)` 경로): `applyTheme('a')`.
5. `exportPDF()`: 캡처 직전 현재 테마 저장 → `document.documentElement.dataset.theme='a'` → 캡처 → `finally` 에서 복원. (이미 뷰 4개 임시 unhide 하는 try/finally 존재 — 거기 얹는다.) 이유: 다크 테마 d 의 PDF 가 검은 배경으로 나오는 것 방지, 인쇄물은 항상 라이트.

---

## 6. 테마 선택 UI

### 6-1. 설정 행
현재:
```html
<div class="set-row set-disabled" id="setTheme"><span>컬러 테마</span><span class="set-soon">준비 중</span></div>
```
변경:
```html
<div class="set-row" id="setTheme" data-action="open-theme">
  <span>컬러 테마</span>
  <span class="set-row-val" id="setThemeVal">오션 <span class="set-chev">›</span></span>
</div>
```
`renderSettings()` 에서 `#setThemeVal` 앞부분을 `THEME_LIST.find(t=>t.id===profile.theme).name` 로 채운다.

### 6-2. 팝업 (`openThemeModal()` — `v2ModalOpen` 재사용, 아바타 팝업과 같은 바텀시트)

```js
const THEME_LIST = [
  { id:'a', name:'오션',            desc:'쿨 민트 · 틸 (기본)',        sw:['#F1F6F4','#1C7A6F','#16302D'] },
  { id:'b', name:'모노 슬레이트',    desc:'뉴트럴 그레이 · 슬레이트블루', sw:['#F4F3F1','#3E6B8A','#1E2124'] },
  { id:'c', name:'미드나잇',        desc:'딥 네이비 · 골드',           sw:['#F2F4F9','#35528F','#1B2340'] },
  { id:'d', name:'아쿠아마린 갤럭시', desc:'다크 · 아쿠아마린 · 갤럭시',   sw:['#0C1524','#33D6C0','#EAF2F4'] },
  { id:'e', name:'코랄 선라이즈',    desc:'웜 · 코랄 · 선라이즈',        sw:['#FEF3EC','#D8583C','#43202F'] },
];
```

- 카드마다: 미니 3색 프리뷰(페이퍼 / 액센트 / 잉크) + 이름 + `desc`. 현재 선택 카드는 `--teal` 아웃라인 + `✓`.
- **탭 = 즉시 적용**: `applyTheme(id)` → `✓` 이동 → `saveProfile({theme:id})`. 모달은 **열린 채 유지** (다른 테마 계속 시도 가능). `닫기` 버튼으로 종료. 아바타 팝업의 pending/저장 패턴과 달리 즉시 반영이라 pending 없음.
- 팝업 자신도 테마 토큰을 쓰므로 탭하면 팝업 색도 같이 리렌더된다.
- 클릭 위임: `e.target.closest('#v2Modal .theme-card')` → `pickTheme(card.dataset.theme)` (아바타의 `.av-cell` 위임과 같은 자리 line ~1752).

CSS (신규):
```css
.theme-card{ display:flex; align-items:center; gap:11px; border:1px solid var(--line);
  border-radius:12px; padding:11px 12px; margin-bottom:8px; background:var(--card); cursor:pointer; }
.theme-card.sel{ border:2px solid var(--teal); padding:10px 11px; }
.theme-card .tsw{ display:flex; border-radius:8px; overflow:hidden; border:1px solid var(--line); flex:none; }
.theme-card .tsw i{ width:16px; height:34px; display:block; }
.theme-card .tmeta{ flex:1; }
.theme-card .tnm{ font-size:13px; font-weight:700; color:var(--ink); }
.theme-card .tds{ font-size:10.5px; color:var(--ink-faint); margin-top:1px; }
.theme-card .tck{ width:20px; height:20px; border-radius:50%; background:var(--teal); color:#fff;
  font-size:11px; display:flex; align-items:center; justify-content:center; flex:none; }
```

프리미엄 잠금 섹션은 이번 범위 밖 — `THEME_LIST` 에 나중 `locked:true` 항목을 추가하고 렌더에서 분기하면 되게 열어둔다. 지금은 5개 전부 선택 가능.

---

## 7. 엣지 케이스

- **랜딩(로그인 전):** 부트 인라인이 세팅한 `data-theme`(localStorage 또는 `'a'`)로 그려진다. 로그아웃한 재방문자는 마지막 테마로 랜딩이 보임 — 의도된 동작. 신규 방문자는 `'a'`.
- **PDF:** §5-4.5 — 캡처 동안 강제 `'a'`, 이후 복원.
- **공유 HTML(`buildShareHtml` 계열, line ~1560+):** 자체 하드코딩 팔레트(구 웜 크림) 유지. 수신자는 테마 컨텍스트가 없는 독립 산출물 — 이번 범위 밖. (후속: 작성자 테마를 구워 넣는 옵션.) 이번 작업에서 공유 HTML 의 색은 건드리지 않는다.
- **다크 테마 + 이미지 뷰어(`#attViewer`):** 이미 `background:#000` 고정 — 전 테마 그대로.
- **모드 색 대비:** 각 테마 `--mode-edit`/`--mode-view` 는 서로, 그리고 자기 `--paper` 위에서 구분되게 이미 시안에서 확정. 구현 시 값 그대로 사용.

---

## 8. 범위 밖 (명시)

- 프리미엄/유료 테마, 잠금 카드, 결제 연동 — 별도 사이클.
- 공유 HTML 테마 반영.
- `prefers-color-scheme` 자동 감지.
- 언어 설정(별도 로드맵 6).
- 테마별 폰트·라운드·간격 변경 — 이번엔 팔레트 + 배너만.

---

## 9. 테스트 (Playwright + 스텁)

- **applyTheme:** `applyTheme('c')` → `documentElement.dataset.theme === 'c'`; `applyTheme('z')` → `'a'`; `localStorage['ttv2-theme']` 기록.
- **부트 인라인:** `localStorage['ttv2-theme']='d'` 세팅 후 `page.goto('/')` → 첫 페인트에 `data-theme="d"`.
- **팔레트 적용(테마별):** 각 id 에서 `getComputedStyle(documentElement).getPropertyValue('--paper'|'--teal'|'--mode-edit'|'--fill-strong')` 가 §3 값과 일치. (5 테마 × 핵심 4토큰.)
- **모드 띠:** 각 테마에서 `nav.tabs` `border-bottom-color` = `--mode-edit`(수정) / `--mode-view`(보기), 그리고 edit ≠ view.
- **프로필 라운드트립:** `window.__test` 로 로그인 → `saveProfile({theme:'e'})` → 재로드 → `data-theme="e"`, 설정 행 값 "코랄 선라이즈".
- **기존 사용자:** 프로필 문서 `{avatarId, tripOrder}` (theme 없음) seed → 로그인 → `data-theme="a"`.
- **선택 UI:** 설정 → "컬러 테마" 탭 → `#v2Modal` 에 `.theme-card` 5개 → 카드 d 탭 → `data-theme="d"` 즉시 + d 카드에 `.sel`/`✓` + `window.__test.dump()` 의 `users/u1` 에 `theme:'d'`. 모달 열린 채 유지.
- **배너:** `.mp-banner` 에 `.mpb-tag` 텍스트 "여행의 모든 순간을 한 곳에"; `.mpb-plane` 색 `rgb(222, 154, 52)` (전 테마 동일); `.mp-banner` `background`/`background-image` 가 테마별로 다름(색 vs 그라디언트).
- **PDF:** `exportPDF` 실행 중 `data-theme` 이 `'a'` 로 바뀌고 종료 후 원복 (스파이 또는 `loadPdfLibs` 스텁 상태에서 확인).
- **회귀:** 기존 73개 전부 통과 (특히 `settings-avatar`, `editor-tabs`, `attachments`, `mypage-banner`, `editor-fixes` — 배너·모드띠·`--ink` 관련).
