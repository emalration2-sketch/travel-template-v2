# travel-template-v2 — 세션 핸드오프

작성: 2026-09-07 / 마지막 커밋 시점: `336114b` (아이콘 작업 취소 커밋이 그 뒤에 옴)

---

## 1. 프로젝트 개요

| | |
|---|---|
| 형태 | 단일 파일 `index.html` (vanilla HTML/CSS/JS, 빌드 없음) |
| 백엔드 | Firebase **compat** SDK 10.14.1 (app/auth/firestore), 프로젝트 `travel-template-9ccfc`, Google 로그인, Firestore `asia-northeast3`, Spark(무료) 요금제 |
| 레포 | `github.com/emalration2-sketch/travel-template-v2` (Public, owner `emalration2-sketch`, 브랜치 `main`) |
| 배포 | https://emalration2-sketch.github.io/travel-template-v2/ — GitHub Pages, `main` push 시 자동. **서브패스 배포 → 앱 내 fetch 는 반드시 상대경로** (`docs/legal/...`, `/docs/...` 아님) |
| v1 (별개, 건드리지 말 것) | `github.com/emalration2-sketch/travel-template` → `.../travel-template/` |
| 테스트 | `npx playwright test` — `npx serve -l 5199 .` 정적서버 + 주입식 Firebase compat stub (`tests/support/firebase-stub.js`, `window.__test` 헬퍼, `sessionStorage` write-through 로 `page.reload()` 넘어 유지). **현재 123 passing.** |
| 작업 방식 | **`main` 직접 커밋 + 푸시** (솔로 레포, 사용자 동의된 패턴). 배포 검증은 `curl`로 라이브 사이트에서 마커 grep. |
| 커밋 주의 | `git add index.html` 하면 파일 전체가 스테이징됨 — 커밋 메시지와 실제 diff 범위가 어긋난 적 있음(솔로라 재작성 안 함). |
| 커밋 서명 | 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` |

### 유저 컨텍스트
- 사용자 = 김주하(추정), 현재 **본인만 사용**. 지인 얼리액세스·유료화는 나중.
- 이메일 `emalration2@gmail.com` — 식별/귀속용으로만, 외부 서비스 전송 금지.
- **거부된 요청(계속 적용)**: 크롬에서 Firestore 컬렉션 직접 삭제 요청 → 영구 삭제는 금지라 거절, 사용자가 콘솔에서 직접 하도록 클릭 단계 안내함.
- 실기기 iOS(사파리 + 카카오톡 인앱 브라우저)에서 테스트하며 UI 피드백을 촘촘히 줌.

---

## 2. 메모리 파일 (⚠️ 세션 시작 시 자동 로드됨 — `~/.claude/projects/C--Users-jin-holdme/memory/`)

`MEMORY.md` 인덱스에 3개 등록됨:

### `travel-template-v2.md` (type: project)
전체 shipped 상태, 잠긴 기능(never revert), 토큰/CSS 아키텍처, 데이터 모델, 테스트 하네스, SDD 워크플로 스크립트 경로, 디자인 토큰 값, impeccable 훅 sanctioned-exception 목록까지 상세. **이 프로젝트로 작업 시작 전 반드시 정독.**

### `pre-launch-legal-checklist.md` (type: project)
**공개(지인 얼리액세스 포함) 또는 유료화 전** 채워야 할 법적·컴플라이언스 항목. 지금은 솔로라 플레이스홀더 비운 채 배포 OK. 사용자가 "공개한다 / 지인 테스트 연다 / 결제 붙인다" 신호 주면 이 목록으로 하나씩 가이드.
- 원본: `docs/legal/CHECKLIST.md`. 문서 3종: `terms-ko.md`(이용약관), `privacy-ko.md`(개인정보처리방침), `ecommerce-ko.md`(유료·환불, 미발효 초안). `.md` 가 곧 앱 내 화면(런타임 fetch).
- 공개 전: 문의 이메일·시행일·운영자명·**개인정보 보호책임자 성명(법상 필수)** 채우기, `> ⚠️ 초안입니다` 3곳 삭제, 명시적 동의(체크박스) 검토, **전문가 검토**.
- 유료화 전: `ecommerce-ko.md` 발효 + 앱 화면 추가, 가격·구독주기 확정, PG 확정 + privacy 위탁표 반영, 청약철회 UI 구현, **사업자 정보(사업자등록·통신판매업 신고)**, **전문가 검토**.
- 코드 후속: 편집기 안에 법적문서 링크 추가한다면 `open-legal` 이 `forceFlush()` 먼저 + `legal-back` 이 `'editor'` origin 처리.
- 알려진 버그: `terms-ko.md §4` 번호가 "2. 3." 대신 "1. 2." 로 재시작(renderMarkdown 중첩목록 번호 미지원) — 인용블록 좌측 보더 `side-tab` 은 sanctioned-exception 처리됨.

### `pre-scale-security-checklist.md` (type: project)
2026-09-07 코드 점검 결과 중, **지금(솔로~지인 소수)은 괜찮지만 협업 모드 도입 / 테스트 인원 확대 시 처리**할 것.
- **완료(commit `3c4ff1a`)**: `linkify()` href 속성 이스케이프(XSS), 로그아웃 시 `cacheClear()`, `goBackToMypage` 불필요 `refreshTripList()` 제거(로컬 메타 갱신), `createTrip` 고아 doc 롤백, `openTrip` 실패 alert.
- **협업 전 필수**: Firestore 보안 규칙 재설계(`members` 배열 기반) + `firestore.rules` 를 레포로 버전관리(현재 콘솔 전용), 모든 렌더 싱크 XSS 재감사, Firebase App Check, 낙관적 last-write-wins 제거.
- **인원 확대 시 권장**: `listTrips()` 가 여행 `data` blob 전체를 내려받음 → 메타 분리, 첨부 이미지 Firestore→Cloud Storage 이관(무료 1GiB 한도), `console.*` 게이팅, Google Fonts 셀프호스팅, 모달 포커스 트랩, `exportPDF` 대형 여행 OOM.
- 안 건드림: `firebaseConfig.apiKey` 클라 노출은 Firebase 웹 정상.

---

## 3. 향후 개발 계획 (roadmap)

### 확정된 빌드 순서 (2026-09-06 확정, 재배열됨)
```
(1) 편집기 탭 분리 + 자료모음            ✅ SHIPPED
(1.1) 편집기 수정 배치 (실기기 버그 7)    ✅ SHIPPED
(1.2) 썸네일 그리드 + 마이페이지 배너      ✅ SHIPPED
(4) 컬러 테마 5종 (무료)                 ✅ SHIPPED 2026-09-07
──────────────────────────────────────
(3) 오프라인 지속성                      ⬅️ NEXT
(5) 협업 모드                            
(6) 다국어                              
```
각 단계는 자체 brainstorm→spec→plan→SDD 사이클. 수익화 결정은 개발 더 진행 + 지인 얼리액세스 테스트 이후로 미룸.

### (3) 오프라인 지속성 — NEXT
Firestore 내장 오프라인 지속성(`persistentLocalCache` / IndexedDB) 활성화. 커스텀 `ttv2-current-trip` 캐시 + dirty 플래그 + unsynced 티커 상당 부분을 SDK 자체 쓰기 큐로 단순화/대체 가능. Path-1 첨부도 자동으로 오프라인 동작.

### (5) 협업 모드 — 큰 아키텍처 변경
`handoff_v2.md` §B/§F 참조 (members 배열, member 기반 보안 규칙, 항목별 문서, `onSnapshot`, 초대 링크, 호스트 구독 수익화). **`pre-scale-security-checklist.md` 의 "협업 전 필수" 항목이 여기 선행 조건.**

### (6) 다국어 — 문자열 추출, 설정 피커, `profile.lang`, ko/en 먼저

### roadmap 추가분 (2026-09-06 batch 2 — 수익화 + 협업 작업에 흡수, 미스펙)
1. **협업 여행 카드에 친구 아바타 표시** — 마이페이지 여행 목록 카드에 초대된 친구 아바타 아이콘. (5) + `avatarId` 시스템 연계.
2. **여행 완료 후 추억 사진 → 여행별 폴더** — v1 범위: Google Drive/외부 스토리지 링크아웃만(우리 서버에 바이트 저장 X). 직접 저장은 나중(비용).
3. **멤버십 가입 버튼 (내 정보 및 옵션)** — 결제 전 미리 구축. 탭→결제→프리미엄 등록→기능 잠금해제. **여행 1개 단위 프리미엄 구매 경로도 필요**(계정 전체 아님). 테마 페이월 + 첨부 티어(무료 5 / 프리미엄 30, 현재 20 고정) 연계.
4. **무료 티어: 일정공유만 + Google AdSense** — 무료 계정에 AdSense → 광고 슬롯 확보용 **레이아웃 개정 필요**(에디터/마이페이지 안 깨지게). AdSense 전에 슬롯 레이아웃 먼저 계획.

### 잠긴 기능 (절대 되돌리지 말 것)
2-mode only(모드 표시색은 테마별 `--mode-edit`/`--mode-view`); 통화 "숫자+이름" 순서; YYYYMMDD 날짜 입력; 24h 시/분 드롭다운; 항목별 다중 지출; PDF = 섹션별 캡처를 jsPDF 로 조립(프린트 다이얼로그 없음, html2pdf lazy-load); 공유 = 읽기전용 정적 HTML. Excel/JSON import-export 는 의도적으로 제거됨 — 다시 넣지 말 것.

---

## 4. 이번 세션에서 shipped (2026-09-07, 커밋 로그 최신순)

| 커밋 | 내용 |
|---|---|
| `336114b` | **메모 탭 체크리스트 모드** (Google Keep 스타일). 메모별 `mode`/`items`, ☑ 토글로 content 줄단위 항목화, 체크→하단 "완료된 항목 N개" 접기 섹션, 체크박스는 보기·수정 모드 둘 다 동작. 공유 HTML/PDF 반영. `tests/notes-checklist.spec.js` 8종. |
| `3c4ff1a` | 코드점검 후속: `linkify` href XSS 하드닝, 로그아웃 `cacheClear()`, `goBackToMypage` 재조회 제거(로컬 메타), `createTrip` 고아 롤백, `openTrip` 실패 alert. `tests/security.spec.js` 3종. |
| `4111f5e` | 레일 스크롤 중 하단 여백 고무줄 튐 제거(`fitSchedTail` 델타 계산 + `matchMedia orientation` 만 재계산), 페이드 1.2s. |
| `25d2ae8` | 레일 점프 정확도(`scrollIntoView`+`scroll-margin-top:112px`), 활성점 기하학 선택(`syncRailActive`), `.sched-tail` 최소 높이. |
| `d074bd4` | **일차 레일 = 스크롤 중에만 뜨는 반투명 플로팅 인디케이터** (`position:fixed`, `.scrolling` 클래스, `--rail-glass` 토큰). 일정 카드 풀폭 복원. |
| `0d9291c` | 여행 삭제/뒤로가기 즉시 반응(낙관적), PDF 네이티브 공유(`sharePdf` — 카톡 blob 링크 문제 해결), 제목 폰트 Fraunces→Noto Sans KR. |
| `d2c6c6c`, `64877aa` | 일정 날짜 상단바(`#dayChips`) → 좌측 세로 일차 레일 최초 도입. |
| `dfecebc`~`ed33b8f` | 편집기 툴바 2줄 재구성, ⚙ SVG 아이콘, 설정 뒤로가기 컨텍스트 인식, 뒤로가기 버튼 3종 디자인 통일. |
| `3f3c7fb`~`1fafd5d` | **앱 내 법적 화면** (`renderMarkdown` 직접 구현, `terms`/`privacy` `data-screen`, `openLegal` 런타임 fetch, 랜딩 동의 고지 + `© 2026` 푸터). |
| `e7ecca8`~ | 법적 문서 초안 3종 + CHECKLIST 작성. |
| `69dd564`~`3585200` | **컬러 테마 5종** (`a`오션/`b`모노슬레이트/`c`미드나잇/`d`아쿠아마린 갤럭시(다크)/`e`코랄 선라이즈). `--fill-strong`/`--mode-*`/`--banner-bg`/`--nav-bg` 토큰. |

### 취소된 작업
- **앱 아이콘 교체** — 사용자가 취소. fal.ai MCP 연결까지 했으나 계정 잔액 0(유료)이라 무산. SVG로 직접 그렸으나(`icon.svg`) 최종 "만들지 말자"로 취소, 원본 `icon.png`(비행기 아이콘) 유지. 참조 이미지(플랫 + 네온 버전)는 사용자 보유. `.gitignore` 에 `.mcp.json` 라인은 유지(향후 안전장치).

---

## 5. 핵심 워크플로 / 주의사항

- **스킬**: 새 기능·컴포넌트·동작 변경 전 `superpowers:brainstorming` 먼저. 버그는 `superpowers:systematic-debugging`. 큰 기능은 spec→`superpowers:writing-plans`→`superpowers:subagent-driven-development`. bounded(레포에 이미 있는 흐름의 소규모 변경)는 인챗 짧은 설계 + 승인 후 바로 구현(스펙 문서 없음).
- **SDD 스크립트**: `C:/Users/jin/.claude/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/subagent-driven-development/scripts/` (`sdd-workspace`, `task-brief`, `review-package`). `SendMessage` 비활성 — fix 라운드는 새 implementer 디스패치.
- **배포 검증**: 푸시 후 `until curl -s "https://emalration2-sketch.github.io/travel-template-v2/index.html?$(date +%s)" | grep -q '<마커>'; do sleep 5; done` 로 Pages 반영 대기 + 마커 확인.
- **브라우저 스크린샷**: 데스크톱 앱에서 자주 타임아웃(창 최소화/숨김). 대안 = 스로어웨이 Playwright 스펙으로 시드→렌더→`page.screenshot`, 또는 `javascript_tool` DOM 검증. (Playwright 는 이 프로젝트에 설치돼 있음)
- **impeccable 훅**: `.impeccable/config.json`(git-ignored)에 sanctioned-exception 저장. hook-admin: `C:/Users/jin/holdme/.claude/skills/impeccable/scripts/hook-admin.mjs`, 문법 `ignore-value <rule> <value> --file <glob> --reason "..."` (positional).
- **CSS 테마**: `:root` = 테마 a (명시적 `[data-theme="a"]` 블록 없음). 새 토큰 추가 시 5개 테마 블록 전부 + 다크(d) 특수 처리 주의.
- **firebase-stub**: `window.__test.setOffline(true)` 로 모든 op reject 시뮬레이션 가능(테스트에서 낙관적 UI 회귀 검증에 사용).

---

## 6. 새 세션에서 바로 할 수 있는 것

1. 이 파일 + 3개 메모리 정독
2. `travel-template-v2.md` 메모리의 "current shipped state" 로 코드 현황 파악
3. 다음 작업 후보:
   - **(3) 오프라인 지속성** (roadmap 상 NEXT) — brainstorming 부터
   - 또는 사용자가 실기기 피드백으로 새 요청을 줄 것 (이번 세션 내내 그런 패턴이었음)
4. `pre-launch-legal-checklist` / `pre-scale-security-checklist` 는 사용자가 "공개/협업/유료화" 신호를 줄 때만 꺼냄
