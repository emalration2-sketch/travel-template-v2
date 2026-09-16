# 협업 모드(다중 사용자 공동 편집) 설계

## 배경 및 목표

현재 여행 데이터는 `users/{uid}/trips/{tripId}` 문서 하나에 일정·메모·지출·자료가 JSON 문자열 하나로 통째로 들어있다. 소유자 uid 경로에 고정돼 있어 다른 사용자가 접근할 방법이 없고, 저장도 "전체 blob 덮어쓰기" 방식이라 last-write-wins 데이터 유실 위험이 있다.

협업 모드는 **무료 기능**(성장 엔진 — 친구 초대 → 입소문)으로, 여러 명이 같은 여행을 함께 만들고 **동시에 각자 다른 부분을 작업해도 서로 부딪히지 않는 것**을 목표로 한다. 사용자가 원하는 체감은 "다 같이 모여서 우르르 작업하는 재미"이며, 키보드 타이핑을 글자 단위로 실시간 중계할 필요는 없고, **항목(일정 항목/노트/링크) 단위로 몇 초 내 반영**되면 충분하다고 확인했다.

이 프로젝트에서 반복적으로 확인된 원칙: 그럴듯하지만 불안정한 것보다 확실하고 단순한 것을 택한다(드래그앤드롭 기능을 신뢰성 문제로 완전 롤백하고 화살표 버튼으로 대체한 전례). 이 설계도 같은 원칙을 따라, 문자 단위 OT/CRDT 엔진 없이 Firestore의 부분 필드 업데이트만으로 충돌을 최소화한다.

## 선행 조건 (완료됨)

- Firestore 보안 규칙 레포 버전관리 + `firebase deploy --only firestore:rules` CLI 배포 파이프라인 — 완료.
- Firebase App Check (Fraud Defense/reCAPTCHA Enterprise, 모니터링 전용) — 완료, 실 도메인에서 토큰 발급 확인됨.
- 모든 렌더 싱크 XSS 재감사 — 완료, 코드 변경 없음(이미 안전).

## 데이터 모델

### 현재 → 변경

| 현재 | 변경 후 |
|---|---|
| `users/{uid}/trips/{tripId}` (문서 1개, `data` 필드에 JSON 문자열 통째로) | `trips/{tripId}` (메타) + `trips/{tripId}/content/main` (실제 내용) |
| `users/{uid}/trips/{tripId}/att/{attId}` | `trips/{tripId}/att/{attId}` |
| 소유자 uid만 접근 가능 | `members` 배열에 포함된 uid 전원 접근 가능 |
| `days`/`notes`/`links`가 JS 배열 | `days`/`notes`/`links`가 **ID 키 기반 맵**(`{id: {...}}`) |

### `trips/{tripId}` (메타 문서)

```
{
  ownerUid: string,
  members: string[],       // ownerUid를 포함해 접근 가능한 모든 uid
  title: string,
  startDate: string,
  endDate: string,
  dayCount: number,
  updatedAt: Timestamp,
}
```

마이페이지 여행 목록은 이 문서만 읽는다. 지금 `listTrips()`가 여행별 전체 `data` JSON까지 다운로드하던 비효율(이미 알려진 이슈)이 이 분리로 자연 해소된다.

### `trips/{tripId}/content/main` (내용 문서)

```
{
  dayOrder: string[],           // dayId 순서
  days: { [dayId]: { label, date, itemOrder: string[], items: { [itemId]: {time, place, memo, expenses:[...]} } } },
  noteOrder: string[],          // noteId 순서
  notes: { [noteId]: { mode, content, items?, ... } },
  linkOrder: string[],          // linkId 순서
  links: { [linkId]: { label, url } },
  travelers: string[],          // 기존과 동일, 배열 유지 (아래 "travelers 처리" 참고)
  attachments: [{id, name}],    // 매니페스트만, 바이트는 `att` 서브컬렉션
}
```

`days`/`notes`/`links`는 배열에서 맵으로 바뀐다. 맵은 순서가 없으므로 각 맵마다 별도 순서 배열(`dayOrder`/`itemOrder`/`noteOrder`)을 둔다 — 지금 있는 ▲/▼ 순서 변경 버튼(`moveItem`/`moveNote`)이 이 순서 배열의 인덱스를 스플라이스하는 방식으로 그대로 재사용된다. 순서 배열은 통째로 덮어쓰지만(재정렬은 드물고 배열 자체가 ID 문자열뿐이라 가벼움), 각 항목의 실제 내용(`items.{itemId}`, `notes.{noteId}`)은 여전히 점(dot) 경로로 개별 업데이트한다 — 재정렬과 내용 편집이 동시에 일어나도 서로 다른 필드라 충돌하지 않는다. 편집기를 열 때만 이 문서를 읽고, `onSnapshot`으로 구독한다.

### 여행 ID와 초대 링크

Firestore 자동 생성 문서 ID(`tripId`)는 약 20자의 고엔트로피 무작위 문자열이라 추측이 사실상 불가능하다. 별도 초대 코드/토큰 없이 **`tripId` 자체를 비밀로 취급**한다. 초대 링크는 `.../?join=<tripId>` 형태.

## 보안 규칙

```
match /trips/{tripId} {
  // get(단건 조회) 은 인증만 되어 있으면 누구나 — "추측 불가능한 tripId 를 아는 것" 자체가
  // 진짜 게이트. list(쿼리) 는 문서 단위로 평가되므로 멤버로 제한 — 그래야 남이 임의의
  // uid 로 array-contains 쿼리를 던져 다른 사람의 여행 목록을 통째로 훑는 걸 막는다.
  allow get: if request.auth != null;
  allow list: if request.auth != null && request.auth.uid in resource.data.members;

  // 최초 생성: 생성자 본인이 owner이자 유일한 member일 때만
  allow create: if request.auth != null
    && request.resource.data.ownerUid == request.auth.uid
    && request.resource.data.members == [request.auth.uid];

  // ownerUid 는 항상 불변. 아래 두 분기는 독립적 — 자진 참여는 "아직 멤버가 아닌"
  // 사람만 통과해야 하므로 "이미 멤버"를 요구하는 분기와 최상위에서 AND로 묶으면 안 된다
  // (한 번 이 실수로 자진 참여 자체가 영원히 불가능해지는 버그를 냈었음 — 재발 방지 주석).
  allow update: if request.auth != null
    && request.resource.data.ownerUid == resource.data.ownerUid
    && (
      // 이미 멤버: 무변경 / 자진 탈퇴 / owner의 강제 제거(kick)
      (request.auth.uid in resource.data.members && (
        request.resource.data.members == resource.data.members
        || (request.auth.uid != resource.data.ownerUid
            && request.resource.data.members == resource.data.members.removeAll([request.auth.uid]))
        || (request.auth.uid == resource.data.ownerUid
            && resource.data.members.hasAll(request.resource.data.members)
            && request.resource.data.members.hasAll([request.auth.uid]))
      ))
      // 아직 멤버가 아님: 자진 참여만 — 정확히 자기 uid 하나만 추가
      || (!(request.auth.uid in resource.data.members)
          && request.resource.data.members == resource.data.members.concat([request.auth.uid]))
    );

  allow delete: if request.auth != null && request.auth.uid == resource.data.ownerUid;

  match /content/main {
    allow read, write: if request.auth != null
      && request.auth.uid in get(/databases/$(database)/documents/trips/$(tripId)).data.members;
  }
  match /att/{attId} {
    allow read, write: if request.auth != null
      && request.auth.uid in get(/databases/$(database)/documents/trips/$(tripId)).data.members;
  }
}
```

`users/{userId}/{document=**}` 기존 규칙(프로필용)은 그대로 유지한다.

`content/main`/`att` 는 그대로 "멤버만" 게이트 — 참여 흐름은 메타 문서만 건드리고, `openTrip()`의 콘텐츠 읽기는 자진 참여가 끝난 **이후**에 실행되므로 그 시점엔 이미 실제 멤버라 별도 예외가 필요 없다.

## 실시간 동기화 & 충돌 처리

- 편집기에서 여행을 여는 동안 `trips/{tripId}/content/main`을 `onSnapshot`으로 구독한다.
- 원격 변경 수신 시 `state`에 병합 후 기존 `renderDays()`/`renderNotes()`/`renderMaterials()`를 그대로 재사용해 다시 그린다.
- 모든 필드 수정은 전체 `content/main` 문서를 다시 쓰는 대신, **점(dot) 경로로 그 필드 하나만 업데이트**한다. 예: `contentRef.update({'days.d3.items.i7.memo': '새 메모'})`. 항목 추가는 내용 추가 + 순서 배열 갱신을 한 번의 `update()`에 같이 담는다 — `{'days.d3.items.i9': {...}, 'days.d3.itemOrder': firebase.firestore.FieldValue.arrayUnion('i9')}`(둘 다 원자적으로 적용). 삭제도 마찬가지로 `{'days.d3.items.i9': FieldValue.delete(), 'days.d3.itemOrder': FieldValue.arrayRemove('i9')}`. 순서만 바꾸는 재정렬(▲/▼)은 `itemOrder` 배열 전체를 다시 쓴다.
- **타이핑 중 원격 갱신 지연:** `document.activeElement`가 편집 필드(`input`/`textarea`)를 가리키는 동안 수신한 원격 스냅샷은 즉시 반영하지 않고 대기시켰다가, 포커스가 빠지는 순간(blur) 적용한다. 여러 번의 원격 갱신이 대기 중이면 마지막 스냅샷만 적용한다.
- **충돌 시나리오:** 서로 다른 항목을 동시에 고치면 충돌하지 않는다(핵심 목표). 정확히 같은 항목의 같은 필드를 같은 순간 고치는 경우만 나중에 저장한 쪽이 이긴다 — 피해 범위가 필드 하나뿐이라 감내 가능한 수준으로 판단, 별도 "충돌 알림" UI는 만들지 않는다(YAGNI).

## 멤버 관리

- 참여 시 전원 동등한 편집 권한. 권한 차등(뷰어 전용 등)은 v1 범위 밖.
- 여행 삭제는 owner만 가능.
- 멤버는 언제든 자진 탈퇴 가능(자기 uid를 `members`에서 제거). owner 본인은 자진 탈퇴 불가(삭제만 가능) — "주인 없는 여행"을 방지하기 위한 단순화.
- owner는 다른 멤버를 강제 제거(kick)할 수 있다.
- **트레이드오프 (사용자 확인 완료):** 초대 링크에 만료/1회성 제한이 없다. 링크를 아는 사람은 계속 참여할 수 있고, 유출 시 owner가 직접 kick하는 것 외엔 막을 방법이 없다. 지인 소수 대상 앱 규모에서는 충분한 것으로 합의.

## 마이그레이션

기존 `users/{uid}/trips/{tripId}` 데이터를 새 구조로 옮긴다. 현재 실사용자가 사실상 1명뿐이므로 Cloud Function 없이 **클라이언트 측 1회성 마이그레이션**으로 처리한다:

1. 로그인 시 `users/{uid}/trips` 컬렉션에 문서가 남아있으면 옛 구조로 판단.
2. 각 문서를 새 `trips/{tripId}`(메타) + `trips/{tripId}/content/main`(내용, 배열→맵 변환) + `att` 서브컬렉션 이동으로 복사, `members:[uid]`/`ownerUid:uid` 부여.
3. 복사 성공 후 옛 문서(및 `att` 서브컬렉션) 삭제.
4. 실패 시(오프라인 등) 옛 구조를 그대로 두고 다음 로그인 때 재시도(옛 문서 존재 여부로 판단).
5. `profile.tripOrder`는 `tripId` 값 자체가 안 바뀌므로 그대로 재사용된다.
6. **멱등성:** 2단계(복사) 성공 후 3단계(옛 문서 삭제)가 실패하면 다음 로그인에서 같은 옛 문서를 다시 마이그레이션 시도하게 된다. 복사 전 `trips/{tripId}`가 이미 존재하면(직전 시도의 잔여) 건너뛰고 바로 옛 문서 삭제만 재시도 — 내용을 덮어쓰지 않는다.

## 에러 처리

- **오프라인 편집:** 기존 "클라우드 저장 안됨" 인디케이터 로직 재사용 — dot-path 업데이트 실패 시 동일한 재시도/알림 흐름.
- **`onSnapshot` 연결 끊김/재연결:** Firestore SDK가 자동 재구독하므로 별도 처리 불필요.
- **비멤버가 여행을 열려는 경우:** 보안 규칙이 읽기를 막으므로 `loadTrip` 실패 → 기존 "여행 열기 실패" alert 재사용.
- **초대 링크로 참여 시도 시 문서가 없거나 이미 멤버인 경우:** 이미 멤버면 그냥 열기, 문서 없음(삭제된 여행)이면 "여행을 찾을 수 없습니다" 안내.

## 테스트 전략

- Playwright 스텁(`tests/support/firebase-stub.js`)에 `onSnapshot` 구독과 점(dot) 경로 `update()` 지원 추가 필요(현재는 `.set(merge:true)` 중심).
- 신규 시나리오: (1) 서로 다른 항목 동시 편집 시 충돌 없음, (2) 같은 필드 동시 편집 시 나중 쓰기 승리(피해 범위 확인), (3) 타이핑 중 원격 갱신이 지연 적용됨, (4) 초대 링크로 비멤버가 합류, (5) owner의 kick, (6) 멤버 자진 탈퇴, (7) 마이그레이션 스크립트(구 구조 → 신 구조 변환 정확성, 실패 시 재시도).

## 범위 밖 (v1에서 하지 않음)

- 글자 단위 실시간 타이핑 중계(OT/CRDT 엔진) — 항목 단위 갱신으로 충분하다고 확인됨.
- 뷰어 전용 등 멤버 권한 차등.
- 초대 링크 만료/1회성 제한, 재발급(트립 ID 로테이션).
- 협업 여행 카드에 멤버 아바타 표시(로드맵 batch 2 항목) — 별도 후속 작업.
- `listTrips()` 목록 정렬을 서버 쿼리로 옮기는 것 — 각자 `profile.tripOrder`로 클라이언트 정렬 유지, composite index 불필요.

## `travelers` 처리

코드 확인 결과 지출(expense)이 여행자를 배열 인덱스로 참조하는 로직은 없다(지출 분배 기능 자체가 아직 미구현 로드맵 항목). `travelers`는 이름 문자열 배열로 유지하되, 추가/삭제는 인덱스 기반 `splice` 대신 **`FieldValue.arrayUnion`/`arrayRemove`(값 기반)**로 전환한다 — Firestore가 서버에서 원자적으로 처리하므로 동시 추가/삭제도 충돌하지 않는다. 이름 변경(rename)은 발생 빈도가 낮고 충돌 시 피해도 작아 기존 방식(배열 전체 재저장)을 유지해도 무방하다.
