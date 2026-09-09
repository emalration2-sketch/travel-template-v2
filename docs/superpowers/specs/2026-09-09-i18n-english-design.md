# travel-template-v2 다국어(i18n) — 영어 지원

작성: 2026-09-09 · 상태: 설계 승인됨, 구현 대기

## 목표

단일 파일 vanilla 앱(`index.html`)에 언어 전환을 도입한다. 이번 단락은 **한국어(ko) + 영어(en)** 2종까지 실제 번역을 넣고 마무리한다. 구조는 일본어(ja)·중국어(zh)를 나중에 키만 추가하면 되도록 준비한다.

번역 범위(전체):
- 앱 UI 전체 — 모든 화면의 버튼·라벨·안내문·빈 상태·`alert()`
- 표지(로그아웃) 화면
- 공유하기 / PDF 내보내기 결과물의 라벨
- 이용약관·개인정보처리방침 본문 (영문 **초안**)

## 비목표 (YAGNI)

- ja/zh 번역 문자열 (구조·감지만 대비, 실제 사전은 없음)
- 숫자·통화·날짜의 로케일 포매팅 (날짜는 YYYYMMDD 숫자 입력, 통화는 자유 텍스트라 현행 유지)
- 여행별/문서별 언어, RTL, 동적 로케일 로딩, 번역 관리 도구
- `ecommerce-ko.md` 영문판 (앱에서 링크되지 않는 미발효 초안)

## 1. 언어 모델 · 감지

- 지원 목록: `const LANGS = ['ko','en'];` (확장 지점). 각 언어 표시명: `한국어`, `English`.
- 전역 `curLang`. `<html lang>` 를 항상 `curLang` 과 동기화.
- **결정 우선순위** (부팅 시):
  1. `profile.lang` — 로그인 사용자가 명시 선택한 값 (`LANGS` 에 있을 때만)
  2. `localStorage['ttv2-lang']` — 이전에 고른 값 (로그아웃/첫 페인트용)
  3. `detectLang(navigator.language)` — 기기 언어
  4. `'en'` — 최종 폴백
- 순수 함수로 분리해 테스트한다:
  ```
  function detectLang(navLang){
    const base = String(navLang || '').toLowerCase().split('-')[0];
    return LANGS.includes(base) ? base : 'en';
  }
  ```
  ja/zh 는 `LANGS` 에 없으므로 이번엔 `'en'` 으로 떨어진다. 나중에 `LANGS` 에 추가하면 자동 반영.
- **첫 페인트 대비**: `<head>` 에 테마와 같은 방식의 조기 인라인 스크립트.
  ```
  <script>try{
    var l=localStorage.getItem('ttv2-lang');
    if(!l){var b=(navigator.language||'').toLowerCase().split('-')[0];l=(['ko','en'].indexOf(b)>=0)?b:'en';}
    document.documentElement.lang=l;
  }catch(e){document.documentElement.lang='en';}</script>
  ```
  본 스크립트 로드 후 `curLang = document.documentElement.lang` 로 이어받는다.
- 명시 변경마다 `localStorage['ttv2-lang']` 기록 (테마 `ttv2-theme` 와 동일 패턴).

## 2. 문자열 카탈로그 · `t()`

- `<script>` 안에 인라인:
  ```
  const I18N = {
    ko: { 'nav.edit':'수정', 'sched.addItem':'+ 일정 추가', ... },
    en: { 'nav.edit':'Edit',  'sched.addItem':'+ Add stop',  ... },
  };
  ```
- 키 규칙: `화면/영역.의미` 의 점 표기, 화면별로 묶어 정의(`nav.*`, `mypage.*`, `sched.*`, `expense.*`, `note.*`, `att.*`, `link.*`, `settings.*`, `theme.*`, `legal.*`, `landing.*`, `share.*`, `alert.*`, `common.*`).
- `t(key, vars)`:
  - `I18N[curLang][key]` → 없으면 `I18N.ko[key]` (ko = 소스 오브 트루스) → 없으면 `key` 자체.
  - `{name}` 형태 치환: `t('note.doneHead', {n:3})` → `"완료된 항목 3개"` / `"3 completed"`.
  - 개발용: `en` 키 누락 시 `console.warn` (기존 `console.*` 게이팅 논의와 무관하게 dev 편의).
- 복수형: 한국어는 불변. 영어는 1/N 모두 자연스러운 표현을 우선 선택하고, 꼭 필요한 소수 지점만 인라인 `n===1?…:…`.
- ko 사전 값은 현재 코드의 리터럴을 **그대로** 옮긴다 (표현 변경 금지 — 회귀 방지).

## 3. 문자열 주입

두 경로.

### 3a. JS 렌더 콘텐츠
`renderHeader/renderDays/renderNotes/renderMypage/renderSettings/renderMaterials/renderExpenseTab`, `noteHTML/chkRowHTML/itemHTML/dayHeadHTML`, 모달 빌더, `alert()` 등 — 한글 리터럴을 `t()` 로 교체. 언어 전환 시 해당 렌더 함수가 재실행되며 자동 반영.

### 3b. 정적 마크업
`index.html` 에 그대로 있는 텍스트(표지, 설정 행 라벨, 마이페이지 셸, 모달 뼈대, nav 버튼 등):
- `data-i18n="key"` → `textContent` 치환
- `data-i18n-ph="key"` → `placeholder` 속성
- `data-i18n-aria="key"` → `aria-label` 속성
- `applyI18n(root=document)` : `root.querySelectorAll('[data-i18n],[data-i18n-ph],[data-i18n-aria]')` 순회하며 채움. 부팅 시 1회 + 언어 전환 시 호출.

### 3c. `setLang(l)`
```
function setLang(l){
  if(!LANGS.includes(l) || l === curLang) return;
  curLang = l;
  document.documentElement.lang = l;
  try{ localStorage.setItem('ttv2-lang', l); }catch(e){}
  applyI18n(document);
  rerenderCurrentScreen();      // 활성 화면의 render* 재호출
  const v = document.getElementById('setLangVal'); if(v) v.textContent = langName(l);
  if(currentUser) saveProfile({ lang: l });
}
```
`rerenderCurrentScreen()` 는 `currentScreen` 에 따라 `renderMypage()` / `renderAll()` / `renderSettings()` / 표지(`applyI18n` 로 충분) 를 부른다. 법적 화면이면 `openLegal(현재doc)` 재호출.

## 4. 언어 피커 UI

- 기존 비활성 행:
  ```
  <div class="set-row set-disabled" id="setLang"><span>언어</span><span class="set-soon">준비 중</span></div>
  ```
  → 활성 행으로. `set-disabled` 제거, `.set-soon` 제거, 현재 언어명 표시:
  ```
  <div class="set-row" id="setLang" data-action="open-lang">
    <span data-i18n="settings.language">언어</span>
    <span class="set-row-val"><span id="setLangVal">한국어</span><span class="set-chev">›</span></span>
  </div>
  ```
- `openLangModal()` : 테마 피커(`openThemeModal`)와 동일한 `v2Modal` 패턴. 목록 = `한국어` / `English`, 현재 언어에 체크. 탭 → `setLang(l)` + 모달 닫기(테마 피커의 "선택 즉시 적용·닫힘" 동작과 통일).
- 이벤트 위임: `data-action="open-lang"` → `openLangModal()`, 모달 내 항목 클릭 → `pickLang(l)`.

## 5. 공유 / PDF 내보내기

- `buildStaticGuideHTML(s)` 와 `STATIC_CSS` 의 하드코딩 한글 라벨(`Day`, `일정`, `메모`, `지출기록`, `합계(…)`, `공유` 등 ~10개)을 `t()` 로. 같은 파일 스코프라 별도 로케일 로딩 불필요.
- 산출 HTML 의 `<html lang="ko">` → `<html lang="${curLang}">`, 기본 제목 폴백 `'나의 여행'` → `t('share.defaultTitle')`.
- **여행 본문(제목·장소·시간·메모·통화)은 사용자가 입력한 그대로** — 번역하지 않음.
- PDF(`exportPDF`)는 위 HTML/DOM 캡처 기반이므로 UI가 `t()` 화되면 자동 반영. 섹션 제목 등 PDF 전용 하드코딩 문자열이 있으면 함께 `t()`.

## 6. 법적 문서

- `LEGAL_DOCS` 를 언어 템플릿으로:
  ```
  const LEGAL_DOCS = {
    terms:   { base:'docs/legal/terms',   gh:'…/terms-ko.md' },
    privacy: { base:'docs/legal/privacy', gh:'…/privacy-ko.md' },
  };
  ```
- `openLegal(doc)` : `fetch(`${base}-${curLang}.md`)` → 실패(404 등) 시 `-ko` 로 1회 재시도 → 그래도 실패면 기존 에러 UI(GitHub 링크). `legalCache` 키를 `doc + '-' + curLang` 로.
- 로딩·에러 문구(`문서를 불러오는 중…`, `문서를 불러오지 못했어요.`, `GitHub에서 보기`)는 `t()`.
- 신규 파일: `docs/legal/terms-en.md`, `docs/legal/privacy-en.md` — 한국어본 직역, 상단에 기존과 같은 `> ⚠️ Draft — pending professional review.` 고지. 알려진 ko 버그(중첩목록 번호 재시작)는 영문판에서 굳이 재현하지 않되 내용 동등성 유지.
- 표지 동의 문구·설정 링크 텍스트는 §2 UI 문자열.

## 7. 저장 · 프로필

- `profile` 에 `lang` 추가. 기본값 객체 `{ avatarId, tripOrder, theme }` → `+ lang`.
- `loadProfile()`: `lang: LANGS.includes(d.lang) ? d.lang : detectLang(navigator.language)` — 기존 사용자(무 `lang`)는 감지값으로 채워짐(한국 OS 사용자는 계속 ko).
- `saveProfile()` 화이트리스트에 `lang` 추가 (Firestore `users/<uid>` 문서).
- `localStorage['ttv2-lang']` — 로그인 전/오프라인용. 로그인 시 `profile.lang` 로 정합.
- 로그인 사용자가 **다른 기기에서** 언어를 바꿨다면, 첫 페인트는 이 기기의 `localStorage` 값 → `loadProfile` 후 `profile.lang` 로 재적용되며 한 번 다시 그려질 수 있다(수용 범위). `setLang` 이 매번 `localStorage` 도 쓰므로 같은 기기 재접속 시엔 불일치 없음.

## 8. 테스트

- **기존 126 스펙 보호**: Playwright 기본 `navigator.language` 가 `en-US` 라, 조치 없으면 앱이 en 으로 부팅되어 한글 단정이 대량 실패한다. `tests/support/firebase-stub.js` 또는 `fixtures.js` 에서 `page.goto` 이전에 `localStorage['ttv2-lang'] = 'ko'` 를 심어 테스트 환경을 ko 로 고정한다. (init 스크립트 주입)
- **신규 `tests/i18n.spec.js`**:
  - `detectLang()` 단위: `'ko-KR'→ko`, `'en'→en`, `'ja'→en`(미지원), `''→en`.
  - `t()`: `{var}` 보간, `en` 누락 키 → ko 폴백, 미존재 키 → 키 반환.
  - `setLang('en')` → nav/렌더된 일차 카드/모달의 표본 문자열이 영어로 바뀜, `<html lang>` = `en`.
  - 언어 피커: 설정 행 → 모달 → `English` 탭 → 적용 + 모달 닫힘 + `localStorage` + 스텁 Firestore `users/u1.lang` 기록.
  - 공유 HTML: `curLang='en'` 일 때 라벨 영어 + `<html lang="en">`.
  - 법적: `openLegal('terms')` 가 `curLang` 에 맞는 `.md` 를 fetch, `-en` 404 시 `-ko` 폴백.
- 한글 단정이 있는 일부 스펙에서 언어 전환을 직접 검증하려면 해당 스펙에서만 `ttv2-lang` 을 바꾼다.

## 리스크 / 완화

| 리스크 | 완화 |
|---|---|
| ~200개 문자열 추출 중 누락 | ko 폴백이 있어 누락 키는 **한국어로 노출**(빈칸/깨짐 아님). 화면별 표본을 테스트로 확인 |
| 영문 법적 초안 품질 | ko 와 동일하게 `Draft` 고지 유지. 공개/유료화 전 전문 검토는 `pre-launch-legal-checklist` 메모리대로 여전히 필수 |
| 테스트 대량 실패 | §8 대로 테스트 환경 ko 고정 (fixtures 한 곳) |
| 파일 크기 증가(~10–15KB) | 단일 파일 원칙 유지가 우선. gzip 후 영향 미미 |
| 언어 전환 시 재렌더 누락 화면 | `rerenderCurrentScreen()` 이 모든 `currentScreen` 분기를 커버하는지 구현 시 체크리스트로 확인 |

## 구현 순서(플랜에서 태스크화)

1. `LANGS` / `detectLang` / `curLang` / 조기 인라인 스크립트 / `t()` / `applyI18n` 스캐폴드 + `i18n.spec.js` 골격
2. 테스트 환경 ko 고정 (fixtures) — 기존 스펙 초록 유지 확인
3. 화면별 문자열 추출: nav → 표지 → 마이페이지 → 설정 → 일정 탭 → 메모 탭 → 지출 → 자료모음 → 모달/alert (각 단계 후 스펙 실행)
4. 언어 피커 UI + `setLang` + 프로필/`localStorage` 저장
5. 공유/PDF 라벨 `t()` 화 + `<html lang>`
6. `LEGAL_DOCS` 언어화 + `terms-en.md` / `privacy-en.md` 초안 + 폴백
7. 전체 스펙 + 신규 i18n 스펙 통과, 라이브 배포 검증
