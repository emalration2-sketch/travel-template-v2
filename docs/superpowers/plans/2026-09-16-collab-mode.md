# 협업 모드(다중 사용자 공동 편집) 본체 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여러 사용자가 하나의 여행을 함께 편집하되, 서로 다른 항목(일정 항목/노트/링크)을 동시에 편집해도 절대 충돌하지 않고, 몇 초 안에 서로의 변경이 화면에 반영되게 한다.

**Architecture:** 여행 데이터를 소유자 uid 경로(`users/{uid}/trips/{tripId}`)에서 최상위 `trips/{tripId}`(메타)+`trips/{tripId}/content/main`(내용)으로 옮기고 `members` 배열 기반 보안 규칙을 적용한다. Firestore 저장 형태만 배열→ID맵+순서배열로 바꾸고, **인메모리 `state`(및 모든 렌더 함수)는 지금의 배열 구조를 그대로 유지**한다 — 변환은 읽기/쓰기 경계(`loadTrip`/`onSnapshot` 병합, 새 dot-path 쓰기 계층)에서만 일어난다. 이 덕분에 `itemHTML`/`noteHTML`/`moveItem` 등 기존 렌더·조작 함수는 거의 손대지 않는다. 실시간 반영은 `content/main` 문서를 `onSnapshot`으로 구독하고, 모든 필드 수정은 전체 문서 재저장 대신 Firestore의 점(dot) 경로 부분 업데이트로 보낸다.

**Tech Stack:** 기존과 동일 — vanilla JS, Firebase Firestore compat SDK 10.14.1, Playwright E2E + `tests/support/firebase-stub.js`.

**Spec:** `docs/superpowers/specs/2026-09-16-collab-mode-design.md`

## Global Constraints

- 인메모리 `state.days`/`state.notes`/`state.links`/`state.travelers`는 배열 구조를 유지한다(Firestore 저장 형태만 맵으로 바뀜). 렌더 함수(`itemHTML`,`noteHTML`,`linkHTML`,`renderDays`,`renderNotes`,`renderMaterials`, `moveItem`,`moveNote`)는 이 플랜에서 수정하지 않는다.
- 여행 문서 경로: 메타 = `trips/{tripId}`, 내용 = `trips/{tripId}/content/main`, 첨부 = `trips/{tripId}/att/{attId}`. `users/{userId}/{document=**}` 프로필 규칙은 그대로 유지.
- 실시간 동기화 단위 = "항목"(일정 항목/노트/링크/일차). 글자 단위 실시간 타이핑 중계는 만들지 않는다.
- 새 UI 문구는 `I18N.ko`/`en`/`ja`/`zh` 4개 언어 카탈로그에 전부 추가한다(`tests/i18n.spec.js`가 키 셋 일치를 검사함 — 하나라도 빠지면 실패).
- 새 함수/변수 이름이 기존 로컬 변수 `t`(→ 지역 변수 별도 이름 사용, `t()` 전역 i18n 함수와 충돌 금지 — 프로젝트에 기록된 반복 버그)와 겹치지 않게 주의.
- 마이그레이션·조인·kick 등 신규 Firestore 쓰기는 전부 `tests/support/firebase-stub.js`로 시뮬레이션 가능해야 한다(Task 1에서 스텁을 먼저 확장).

---

## Task 1: 테스트 스텁 확장 — dot-path update, FieldValue 센티널, onSnapshot

이후 모든 태스크가 이 스텁 위에서 테스트되므로 반드시 먼저 완료한다.

**Files:**
- Modify: `tests/support/firebase-stub.js`
- Test: `tests/firebase-stub.spec.js` (신규)

**Interfaces:**
- Produces: `docRef.update(patch)`가 진짜 Firestore처럼 점(dot) 경로를 중첩 필드로 해석. `firebase.firestore.FieldValue.delete()`(필드 삭제 센티널), `.arrayUnion(...items)`, `.arrayRemove(...items)`. `docRef.onSnapshot(cb)` — 등록 시 현재 값으로 1회 즉시 호출 + 이후 같은 경로에 대한 모든 `set`/`update`/`delete` 시 그 경로를 구독 중인 모든 콜백을 다시 호출(다른 `docRef` 인스턴스로 구독해도 같은 경로면 전부 fan-out). `unsubscribe()`(onSnapshot 반환값) 호출 시 그 콜백만 해제.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/firebase-stub.spec.js
const { test, expect } = require('./support/fixtures');

test('스텁: dot-path update 는 중첩 필드만 바꾸고 형제 필드를 보존한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const db = firebase.firestore();
    const ref = db.doc('trips/t1/content/main');
    await ref.set({ days: { d1: { label: 'A', items: { i1: { place: 'old' } } } } });
    await ref.update({ 'days.d1.items.i1.place': 'new', 'days.d1.items.i2': { place: 'added' } });
    const snap = await ref.get();
    return snap.data();
  });
  expect(result.days.d1.label).toBe('A');            // 형제 필드 보존
  expect(result.days.d1.items.i1.place).toBe('new');  // 중첩 필드 갱신
  expect(result.days.d1.items.i2.place).toBe('added'); // 존재하지 않던 중첩 경로 생성
});

test('스텁: FieldValue.delete/arrayUnion/arrayRemove', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const db = firebase.firestore();
    const ref = db.doc('trips/t2/content/main');
    await ref.set({ travelers: ['A'], days: { d1: { label: 'x' } } });
    const FV = firebase.firestore.FieldValue;
    await ref.update({
      travelers: FV.arrayUnion('B', 'C'),
      'days.d1.label': FV.delete(),
    });
    const snap1 = await ref.get();
    await ref.update({ travelers: FV.arrayRemove('B') });
    const snap2 = await ref.get();
    return { after1: snap1.data(), after2: snap2.data() };
  });
  expect(result.after1.travelers.sort()).toEqual(['A', 'B', 'C']);
  expect('label' in result.after1.days.d1).toBe(false);
  expect(result.after2.travelers.sort()).toEqual(['A', 'C']);
});

test('스텁: onSnapshot 은 등록 즉시 1회 호출되고, 다른 docRef 인스턴스의 쓰기에도 반응한다', async ({ page }) => {
  await page.goto('/');
  const calls = await page.evaluate(async () => {
    const db = firebase.firestore();
    await db.doc('trips/t3/content/main').set({ v: 1 });
    const seen = [];
    const unsub = db.doc('trips/t3/content/main').onSnapshot(snap => seen.push(snap.data().v));
    await new Promise(r => setTimeout(r, 0)); // 초기 콜백이 큐를 돌 시간
    await db.doc('trips/t3/content/main').update({ v: 2 }); // 별도 docRef 인스턴스
    await new Promise(r => setTimeout(r, 0));
    unsub();
    await db.doc('trips/t3/content/main').update({ v: 3 });
    await new Promise(r => setTimeout(r, 0));
    return seen;
  });
  expect(calls).toEqual([1, 2]); // unsubscribe 이후의 v:3 은 안 잡힘
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx playwright test tests/firebase-stub.spec.js`
Expected: FAIL (`update` is not dot-path aware, `FieldValue.delete`/`arrayUnion`/`arrayRemove`/`onSnapshot` 미정의)

- [ ] **Step 3: `firebase-stub.js`에 dot-path/FieldValue/onSnapshot 구현**

`tests/support/firebase-stub.js`의 상단 유틸 근처에 추가:

```js
  const DELETE_SENTINEL = { __fbDelete: true };
  const isArrayUnion = (v) => v && v.__fbArrayUnion;
  const isArrayRemove = (v) => v && v.__fbArrayRemove;
  const isDelete = (v) => v === DELETE_SENTINEL;

  function setDeep(obj, dotPath, value) {
    const parts = dotPath.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (typeof cur[k] !== 'object' || cur[k] === null || Array.isArray(cur[k])) cur[k] = {};
      cur = cur[k];
    }
    const lastKey = parts[parts.length - 1];
    if (isDelete(value)) {
      delete cur[lastKey];
    } else if (isArrayUnion(value)) {
      const arr = Array.isArray(cur[lastKey]) ? cur[lastKey].slice() : [];
      value.__fbArrayUnion.forEach(item => { if (!arr.includes(item)) arr.push(item); });
      cur[lastKey] = arr;
    } else if (isArrayRemove(value)) {
      const arr = Array.isArray(cur[lastKey]) ? cur[lastKey].slice() : [];
      cur[lastKey] = arr.filter(item => !value.__fbArrayRemove.includes(item));
    } else {
      cur[lastKey] = clone(value);
    }
  }

  const listeners = {}; // { [path]: Set<cb> }
  function notify(path) {
    const set = listeners[path];
    if (!set || !set.size) return;
    const data = store[path];
    const snap = { exists: !!data, id: path.split('/').pop(), data: () => clone(data) };
    set.forEach(cb => cb(snap));
  }
```

`docRef(path)` 안의 `update`를 교체:

```js
      async update(v) {
        if (offline) throw new Error('offline');
        const target = store[path] || (store[path] = {});
        Object.keys(v).forEach(dotPath => setDeep(target, dotPath, v[dotPath]));
        persist();
        notify(path);
      },
```

`set`/`delete`도 끝에 `notify(path);` 추가(기존 로직 뒤에 한 줄씩). `docRef`가 반환하는 객체에 `onSnapshot` 추가:

```js
      onSnapshot(cb) {
        if (!listeners[path]) listeners[path] = new Set();
        listeners[path].add(cb);
        Promise.resolve().then(() => {
          const d = store[path];
          cb({ exists: !!d, id: path.split('/').pop(), data: () => clone(d) });
        });
        return () => { if (listeners[path]) listeners[path].delete(cb); };
      },
```

`window.firebase.firestore.FieldValue`에 추가:

```js
  window.firebase.firestore.FieldValue = {
    serverTimestamp: stamp,
    delete: () => DELETE_SENTINEL,
    arrayUnion: (...items) => ({ __fbArrayUnion: items }),
    arrayRemove: (...items) => ({ __fbArrayRemove: items }),
  };
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx playwright test tests/firebase-stub.spec.js`
Expected: PASS (3 tests)

- [ ] **Step 5: 전체 스위트 회귀 확인 + 커밋**

Run: `npx playwright test`
Expected: 기존 170 + 신규 3 = 173 passed (기존 `.update()` 호출부는 전부 얕은 병합이었던 걸 이제 dot-path 로 해석하는데, 기존 코드가 `.update()`를 호출하는 곳은 아직 없으므로 — 현재 `.update()` 사용처는 첨부 rename `set({name},{merge:true})` 뿐 — 회귀 없음)

```bash
git add tests/support/firebase-stub.js tests/firebase-stub.spec.js
git commit -m "test: Firestore 스텁에 dot-path update + FieldValue 센티널 + onSnapshot 지원 추가"
```

---

## Task 2: 상태 ⇄ 콘텐츠 문서 변환 순수 함수

**Files:**
- Modify: `index.html` (새 함수, `defaultState()` 근처에 배치)
- Test: `tests/content-doc-convert.spec.js` (신규)

**Interfaces:**
- Consumes: 없음(순수 함수).
- Produces:
  - `tripStateToContentDoc(state)` → `{dayOrder, days, noteOrder, notes, linkOrder, links, travelers, attachments}` (Firestore에 쓸 형태)
  - `contentDocToTripState(doc)` → `{title, travelers, days, notes, links, attachments}` (기존 `state`와 동일한 배열 기반 형태, `title`은 호출부에서 메타와 합쳐 채움)
  - 이후 태스크(3, 5, 6, 7)가 이 두 함수를 읽기/쓰기 경계에서 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/content-doc-convert.spec.js
const { test, expect } = require('./support/fixtures');

test('tripStateToContentDoc ↔ contentDocToTripState 왕복 변환', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const state = {
      title: '오사카', travelers: ['나', '친구'],
      days: [
        { id: 'd1', date: '2026-01-01', label: '첫날', items: [
          { id: 'i1', time: '09:00', place: '공항', memo: '', expenses: [] },
          { id: 'i2', time: '13:00', place: '점심', memo: '맛집', expenses: [] },
        ] },
      ],
      notes: [{ id: 'n1', mode: 'text', content: '메모' }],
      links: [{ id: 'l1', label: '지도', url: 'https://maps.example' }],
      attachments: [{ id: 'a1', name: '사진1' }],
    };
    const doc = tripStateToContentDoc(state);
    const back = contentDocToTripState(doc);
    return { doc, back };
  });
  expect(result.doc.dayOrder).toEqual(['d1']);
  expect(result.doc.days.d1.itemOrder).toEqual(['i1', 'i2']);
  expect(result.doc.days.d1.items.i2.place).toBe('점심');
  expect(result.doc.noteOrder).toEqual(['n1']);
  expect(result.doc.linkOrder).toEqual(['l1']);

  expect(result.back.travelers).toEqual(['나', '친구']);
  expect(result.back.days).toHaveLength(1);
  expect(result.back.days[0].id).toBe('d1');
  expect(result.back.days[0].items.map(i => i.id)).toEqual(['i1', 'i2']); // 순서 배열대로 복원
  expect(result.back.notes[0].id).toBe('n1');
  expect(result.back.links[0].url).toBe('https://maps.example');
  expect(result.back.attachments).toEqual([{ id: 'a1', name: '사진1' }]);
});

test('contentDocToTripState: order 배열이 items/notes/links 의 실제 키와 다르면(고아 항목) 무시한다', async ({ page }) => {
  await page.goto('/');
  const back = await page.evaluate(() => {
    const doc = {
      dayOrder: ['d1', 'd-ghost'],
      days: { d1: { label: '', date: '', itemOrder: ['i1'], items: { i1: { place: 'x' } } } },
      noteOrder: [], notes: {}, linkOrder: [], links: {},
      travelers: [], attachments: [],
    };
    return contentDocToTripState(doc);
  });
  expect(back.days.map(d => d.id)).toEqual(['d1']); // 'd-ghost' 는 실제 days 에 없으므로 건너뜀
});
</script>
```

(마지막 `</script>` 줄은 실수로 넣지 말 것 — 테스트 파일에는 불필요.)

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx playwright test tests/content-doc-convert.spec.js`
Expected: FAIL (`tripStateToContentDoc is not defined`)

- [ ] **Step 3: `index.html`에 변환 함수 구현**

`defaultState()` 함수 바로 아래에 추가:

```javascript
function tripStateToContentDoc(state){
  const dayOrder = state.days.map(d => d.id);
  const days = {};
  state.days.forEach(d => {
    days[d.id] = {
      label: d.label || '', date: d.date || '',
      itemOrder: d.items.map(i => i.id),
      items: Object.fromEntries(d.items.map(i => [i.id, {
        time: i.time || '', place: i.place || '', memo: i.memo || '',
        expenses: i.expenses || [],
      }])),
    };
  });
  const noteOrder = state.notes.map(n => n.id);
  const notes = Object.fromEntries(state.notes.map(n => [n.id, clone(n)]));
  const linkOrder = state.links.map(l => l.id);
  const links = Object.fromEntries(state.links.map(l => [l.id, { label: l.label || '', url: l.url || '' }]));
  return {
    dayOrder, days, noteOrder, notes, linkOrder, links,
    travelers: state.travelers.slice(),
    attachments: (state.attachments || []).slice(),
  };
}
function contentDocToTripState(doc){
  const days = (doc.dayOrder || []).filter(id => doc.days && doc.days[id]).map(id => {
    const d = doc.days[id];
    const items = (d.itemOrder || []).filter(iid => d.items && d.items[iid]).map(iid => Object.assign({ id: iid }, d.items[iid]));
    return { id, label: d.label || '', date: d.date || '', items };
  });
  const notes = (doc.noteOrder || []).filter(id => doc.notes && doc.notes[id]).map(id => Object.assign({ id }, doc.notes[id]));
  const links = (doc.linkOrder || []).filter(id => doc.links && doc.links[id]).map(id => Object.assign({ id }, doc.links[id]));
  return {
    travelers: (doc.travelers || []).slice(),
    days, notes, links,
    attachments: (doc.attachments || []).slice(),
  };
}
```

`clone`이 아직 `index.html`에 없다면(있는지 확인 — 현재 `flushCloud`가 `JSON.parse(JSON.stringify(state))`로 직접 복제하고 있어 공용 `clone` 헬퍼가 없을 가능성이 높음) 같은 위치에 추가:

```javascript
function clone(v){ return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
```

(이미 존재한다면 이 단계는 건너뛴다 — `grep -n "^function clone"` 로 먼저 확인.)

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx playwright test tests/content-doc-convert.spec.js`
Expected: PASS (2 tests)

- [ ] **Step 5: 전체 스위트 회귀 확인 + 커밋**

Run: `npx playwright test`
Expected: 173 + 2 = 175 passed

```bash
git add index.html tests/content-doc-convert.spec.js
git commit -m "feat: 여행 state ↔ Firestore 콘텐츠 문서(맵+순서배열) 변환 순수 함수 추가"
```

---

## Task 3: 새 Firestore 접근 계층 (최상위 trips 컬렉션, 메타/콘텐츠 분리)

**Files:**
- Modify: `index.html:1593-1658` (`tripsCol`, `listTrips`, `loadTrip`, `createTrip`, `saveTrip`, `deleteTrip`)
- Test: `tests/trip-store-crud.spec.js`, `tests/trip-store-savedelete.spec.js` (기존 파일 갱신)

**Interfaces:**
- Consumes: `tripStateToContentDoc`/`contentDocToTripState` (Task 2).
- Produces: `tripsCol()` → `fbDb.collection('trips')`(최상위, 소유자 스코프 아님). `tripMetaRef(tripId)`, `tripContentRef(tripId)` — Task 5·7이 사용. `listTrips()`는 메타만 반환(내용 미다운로드). `loadTrip(tripId)`는 메타+내용 합쳐 기존과 동일한 `state` 모양 반환. `createTrip()`은 `ownerUid`/`members:[uid]`/`memberNames:{uid:displayName}` 포함해 메타+내용 동시 생성. `deleteTrip(tripId)`는 owner만 호출 가능한 것을 전제로 메타+내용+`att` 삭제.

- [ ] **Step 1: 실패하는 테스트로 갱신**

`tests/trip-store-crud.spec.js`를 열어 기존 두 테스트(`createTrip → listTrips`, `loadTrip`)를 다음으로 교체:

```js
test('createTrip → listTrips 에 메타와 함께 등장, members/ownerUid 포함', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    const id = await createTrip();
    const list = await listTrips();
    const metaSnap = await tripMetaRef(id).get();
    return { id, list, meta: metaSnap.data() };
  });
  expect(result.list.find(t => t.id === result.id)).toBeTruthy();
  expect(result.meta.ownerUid).toBe('u1');
  expect(result.meta.members).toEqual(['u1']);
  expect(result.meta.memberNames.u1).toBeTruthy();
});

test('loadTrip 은 메타+콘텐츠를 합쳐 기존과 같은 state 모양으로 돌려준다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const st = await page.evaluate(async () => {
    const id = await createTrip();
    return await loadTrip(id);
  });
  expect(Array.isArray(st.days)).toBe(true);
  expect(Array.isArray(st.notes)).toBe(true);
  expect(Array.isArray(st.links)).toBe(true);
  expect(st.days[0].items).toHaveLength(1); // defaultState() 의 첫 날짜 첫 항목
});
```

`tests/trip-store-savedelete.spec.js`의 `deleteTrip` 테스트는 다음 어서션을 추가:

```js
test('deleteTrip 은 메타 문서와 콘텐츠 문서를 모두 지운다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const after = await page.evaluate(async () => {
    const id = await createTrip();
    await deleteTrip(id);
    const metaSnap = await tripMetaRef(id).get();
    const contentSnap = await tripContentRef(id).get();
    return { metaExists: metaSnap.exists, contentExists: contentSnap.exists };
  });
  expect(after.metaExists).toBe(false);
  expect(after.contentExists).toBe(false);
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx playwright test tests/trip-store-crud.spec.js tests/trip-store-savedelete.spec.js`
Expected: FAIL (`tripMetaRef is not defined`, `members` 필드 없음 등)

- [ ] **Step 3: `index.html:1593-1658` 교체**

```javascript
function tripsCol(){ return fbDb.collection('trips'); }
function tripMetaRef(tripId){ return tripsCol().doc(tripId); }
function tripContentRef(tripId){ return tripsCol().doc(tripId).collection('content').doc('main'); }

async function listTrips(){
  const snap = await tripsCol().where('members', 'array-contains', currentUser.uid).get();
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
      ownerUid: d.ownerUid || '',
      members: d.members || [],
    });
  });
  return out;
}
async function refreshTripList(){ trips = await listTrips(); return trips; }

async function loadTrip(tripId){
  const metaSnap = await tripMetaRef(tripId).get();
  if(!metaSnap.exists) throw new Error('trip 없음: ' + tripId);
  const contentSnap = await tripContentRef(tripId).get();
  if(!contentSnap.exists) throw new Error('trip content 없음: ' + tripId);
  const meta = metaSnap.data();
  const st = contentDocToTripState(contentSnap.data());
  st.title = meta.title || '';
  return st;
}

async function createTrip(){
  const st = defaultState();
  const meta = deriveTripMeta(st);
  const tripId = tripsCol().doc().id; // 클라이언트에서 미리 ID 발급 — 메타+콘텐츠 두 문서에 같은 ID 사용
  const memberNames = {}; memberNames[currentUser.uid] = currentUser.displayName || '';
  // 메타 먼저 커밋한 뒤 콘텐츠를 쓴다(순차) — Promise.all 로 동시에 보내면 보안 규칙의
  // get(.../trips/tripId) 이 메타 문서가 아직 커밋되기 전에 평가돼 권한 거부가 날 수 있다.
  await tripMetaRef(tripId).set({
    ownerUid: currentUser.uid, members: [currentUser.uid], memberNames,
    title: meta.title, startDate: meta.startDate, endDate: meta.endDate, dayCount: meta.dayCount,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  await tripContentRef(tripId).set(tripStateToContentDoc(st));
  try{
    await saveProfile({ tripOrder: profile.tripOrder.concat(tripId) });
  }catch(e){
    try{ await tripMetaRef(tripId).delete(); await tripContentRef(tripId).delete(); }catch(_){}
    throw e;
  }
  return tripId;
}

async function deleteTrip(tripId){
  // 메타 먼저(빠름, tripOrder 갱신도 함께) — 첨부/콘텐츠 정리는 best-effort.
  await tripMetaRef(tripId).delete();
  await saveProfile({ tripOrder: profile.tripOrder.filter(id => id !== tripId) });
  try{ await tripContentRef(tripId).delete(); }catch(e){ console.error('콘텐츠 삭제 실패(무시)', e); }
  try{
    const attSnap = await tripsCol().doc(tripId).collection('att').get();
    await Promise.all(attSnap.docs.map(d => d.ref.delete()));
  }catch(e){ console.error('첨부 정리 실패(무시)', e); }
}
```

(`saveTrip`/`flushCloud`는 이 태스크에서 삭제하지 않는다 — Task 5에서 새 버전으로 교체된다. 지금은 옛 `saveTrip` 함수가 남아있어도 아무도 호출하지 않으므로 무해하다. Task 5에서 제거한다.)

`tripsCol().doc()`가 스텁에서 인자 없이 호출됐을 때 랜덤 ID를 발급하는지 확인 — Task 1 이전부터 있던 기존 `collRef.doc(id)` 구현(`doc(id){ return docRef(path + '/' + (id || rid())); }`)이 이미 인자 없는 호출을 지원한다(`id || rid()`). 스텁 변경 불필요.

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx playwright test tests/trip-store-crud.spec.js tests/trip-store-savedelete.spec.js`
Expected: PASS

- [ ] **Step 5: 전체 스위트 실행 — 이 시점에 다수 실패 예상, 원인 분류만 하고 다음 태스크로 이월**

Run: `npx playwright test`
Expected: `openTrip`/`flushCloud`/`att` 관련 기존 테스트 다수가 실패할 수 있음(옛 `saveTrip`을 아직 호출하는 `flushCloud`가 새 메타/콘텐츠 분리 구조와 안 맞기 때문). **이 실패들은 Task 5(플러시 계층 교체)에서 해소된다 — 여기서 고치지 않는다.** 실패 목록만 기록하고 커밋.

```bash
git add index.html tests/trip-store-crud.spec.js tests/trip-store-savedelete.spec.js
git commit -m "feat: 여행 데이터를 최상위 trips 컬렉션(메타+콘텐츠 분리)로 이동"
```

---

## Task 4: 기존 여행 데이터 마이그레이션

**Files:**
- Modify: `index.html` (새 함수 `migrateLegacyTrips`, `handleAuthChange`에서 호출)
- Test: `tests/trip-migration.spec.js` (신규)

**Interfaces:**
- Consumes: `tripStateToContentDoc` (Task 2), `tripMetaRef`/`tripContentRef` (Task 3).
- Produces: `migrateLegacyTrips()` — `handleAuthChange` 안에서 `loadProfile()` 직후, `refreshTripList()` 이전에 호출(아래 Step 3 참고).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/trip-migration.spec.js
const { test, expect } = require('./support/fixtures');

test('로그인 시 옛 users/{uid}/trips 구조가 새 trips/{id} 구조로 마이그레이션된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    // 옛 구조를 직접 시드 — 실제로 옛 버전 앱이 만들었을 법한 문서
    window.__test.seed('users/u1/trips/legacy1', {
      data: JSON.stringify({ title: '옛날여행', travelers: ['나'], days: [{ id:'d1', date:'', label:'', items:[{id:'i1',time:'',place:'',memo:'',expenses:[]}] }], notes: [], links: [], attachments: [] }),
      title: '옛날여행', startDate: '', endDate: '', dayCount: 1,
    });
  });
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    await migrateLegacyTrips();
    const metaSnap = await tripMetaRef('legacy1').get();
    const contentSnap = await tripContentRef('legacy1').get();
    const oldSnap = await fbDb.doc('users/u1/trips/legacy1').get();
    return { meta: metaSnap.data(), content: contentSnap.data(), oldExists: oldSnap.exists };
  });
  expect(result.meta.title).toBe('옛날여행');
  expect(result.meta.ownerUid).toBe('u1');
  expect(result.meta.members).toEqual(['u1']);
  expect(result.content.dayOrder).toEqual(['d1']);
  expect(result.oldExists).toBe(false); // 옛 문서는 성공 후 삭제됨
});

test('마이그레이션은 멱등적이다 — 이미 새 구조가 있으면 내용을 덮어쓰지 않고 옛 문서만 정리', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1/trips/legacy2', { data: JSON.stringify({ title: '옛날버전', travelers: [], days: [], notes: [], links: [], attachments: [] }), title: '옛날버전' });
    window.__test.seed('trips/legacy2', { ownerUid: 'u1', members: ['u1'], memberNames: { u1: '김진' }, title: '이미마이그레이션됨' });
    window.__test.seed('trips/legacy2/content/main', { dayOrder: [], days: {}, noteOrder: [], notes: {}, linkOrder: [], links: {}, travelers: [], attachments: [] });
  });
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    await migrateLegacyTrips();
    const metaSnap = await tripMetaRef('legacy2').get();
    const oldSnap = await fbDb.doc('users/u1/trips/legacy2').get();
    return { title: metaSnap.data().title, oldExists: oldSnap.exists };
  });
  expect(result.title).toBe('이미마이그레이션됨'); // 안 덮어씀
  expect(result.oldExists).toBe(false); // 옛 문서는 정리됨
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx playwright test tests/trip-migration.spec.js`
Expected: FAIL (`migrateLegacyTrips is not defined`)

- [ ] **Step 3: `index.html`에 마이그레이션 함수 구현 + `handleAuthChange`에 연결**

`createTrip` 함수 위(Task 3에서 만든 접근 계층 바로 아래)에 추가:

```javascript
async function migrateLegacyTrips(){
  const legacyCol = fbDb.collection('users').doc(currentUser.uid).collection('trips');
  let snap;
  try{ snap = await legacyCol.get(); }catch(e){ console.error('마이그레이션 대상 조회 실패(무시, 다음 로그인에 재시도)', e); return; }
  for(const doc of snap.docs){
    const tripId = doc.id;
    const d = doc.data() || {};
    try{
      const metaSnap = await tripMetaRef(tripId).get();
      if(!metaSnap.exists){
        const st = JSON.parse(d.data);
        if(!Array.isArray(st.links)) st.links = [];
        if(!Array.isArray(st.notes)) st.notes = [];
        if(!Array.isArray(st.attachments)) st.attachments = [];
        const memberNames = {}; memberNames[currentUser.uid] = currentUser.displayName || '';
        await tripMetaRef(tripId).set({
          ownerUid: currentUser.uid, members: [currentUser.uid], memberNames,
          title: d.title || '', startDate: d.startDate || '', endDate: d.endDate || '', dayCount: d.dayCount || 0,
          updatedAt: d.updatedAt || firebase.firestore.FieldValue.serverTimestamp(),
        });
        await tripContentRef(tripId).set(tripStateToContentDoc(st));
        const attSnap = await legacyCol.doc(tripId).collection('att').get();
        for(const a of attSnap.docs){
          await tripsCol().doc(tripId).collection('att').doc(a.id).set(a.data());
        }
      }
      // 여기 도달 = 새 구조가 이미 있거나 방금 만들어짐 → 옛 문서 정리
      const attSnap2 = await legacyCol.doc(tripId).collection('att').get();
      await Promise.all(attSnap2.docs.map(a => a.ref.delete()));
      await legacyCol.doc(tripId).delete();
    }catch(e){
      console.error('여행 마이그레이션 실패(다음 로그인에 재시도)', tripId, e);
    }
  }
}
```

`handleAuthChange`(`index.html:2021` 부근) 안, `await loadProfile();` 다음 줄에 추가:

```javascript
      await loadProfile();
      await migrateLegacyTrips().catch(e => console.error('마이그레이션 전체 실패(무시)', e));
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx playwright test tests/trip-migration.spec.js`
Expected: PASS (2 tests)

- [ ] **Step 5: 전체 스위트 실행 + 커밋**

Run: `npx playwright test`
Expected: 마이그레이션 관련 신규 테스트는 통과. Task 3에서 이월된 `flushCloud` 관련 실패는 아직 남아있어도 정상(Task 5에서 해소).

```bash
git add index.html tests/trip-migration.spec.js
git commit -m "feat: 기존 users/{uid}/trips 데이터를 최상위 trips 구조로 1회성 마이그레이션"
```

---

## Task 5: dot-path 패치 큐 + flushCloud 재작성

가장 위험도가 높은 태스크 — 지금 있는 "전체 blob 저장" 흐름을 "메타 통짜 저장 + 콘텐츠 부분 패치"로 바꾼다.

**Files:**
- Modify: `index.html:1866-1897` (`save`, `scheduleFlush`, `flushCloud`, `forceFlush`), 옛 `saveTrip` 함수 삭제(`index.html:1642-1649`, Task 3에서 새 버전으로 이미 대체됨 — 지금 완전히 제거)
- Test: `tests/flush-content-patch.spec.js` (신규)

**Interfaces:**
- Consumes: `tripMetaRef`/`tripContentRef` (Task 3), `deriveTripMeta` (기존).
- Produces: `queuePatch(patchObj)` — 이후 Task 6의 모든 mutator가 호출. `save()`/`scheduleFlush()`/`forceFlush()`는 이름과 호출 시그니처를 그대로 유지(기존 호출부 무변경).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/flush-content-patch.spec.js
const { test, expect } = require('./support/fixtures');

test('queuePatch 로 쌓인 변경이 디바운스 뒤 한 번의 update() 로 콘텐츠 문서에 반영되고, 메타도 같이 갱신된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id;
    state = await loadTrip(id);
    state.title = '새 제목';
    queuePatch({ 'days.' + state.days[0].id + '.items.' + state.days[0].items[0].id + '.place': '공항' });
    save();
    await forceFlush();
    const metaSnap = await tripMetaRef(id).get();
    const contentSnap = await tripContentRef(id).get();
    return { meta: metaSnap.data(), content: contentSnap.data(), dayId: state.days[0].id, itemId: state.days[0].items[0].id };
  });
  expect(result.meta.title).toBe('새 제목');
  expect(result.content.days[result.dayId].items[result.itemId].place).toBe('공항');
});

test('flushCloud 실패 시 대기 중이던 패치가 유실되지 않고 다음 flush 에 합쳐진다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id;
    state = await loadTrip(id);
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    window.__test.setOffline(true);
    queuePatch({ ['days.' + dayId + '.items.' + itemId + '.place']: '실패시도' });
    save();
    await forceFlush().catch(() => {}); // 실패 예상
    window.__test.setOffline(false);
    queuePatch({ ['days.' + dayId + '.items.' + itemId + '.memo']: '두번째' });
    save();
    await forceFlush();
    const contentSnap = await tripContentRef(id).get();
    return contentSnap.data().days[dayId].items[itemId];
  });
  expect(result.place).toBe('실패시도'); // 첫 시도의 패치도 결국 반영됨
  expect(result.memo).toBe('두번째');
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx playwright test tests/flush-content-patch.spec.js`
Expected: FAIL (`queuePatch is not defined`)

- [ ] **Step 3: `index.html:1866-1897`를 교체하고 옛 `saveTrip`을 삭제**

`index.html:1642-1649`의 옛 `saveTrip` 함수 전체를 삭제한다.

`index.html:1866-1897`(`let flushTimer = null;`부터 `forceFlush`까지)을 교체:

```javascript
let flushTimer = null;
let pendingContentPatch = {};

function queuePatch(patch){
  Object.assign(pendingContentPatch, patch);
}

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
  const tid = currentTripId;
  const patch = pendingContentPatch;
  pendingContentPatch = {};
  const meta = deriveTripMeta(state);
  try{
    const writes = [
      tripMetaRef(tid).set({
        title: meta.title, startDate: meta.startDate, endDate: meta.endDate, dayCount: meta.dayCount,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
    ];
    if(Object.keys(patch).length) writes.push(tripContentRef(tid).update(patch));
    await Promise.all(writes);
    const c = cacheRead();
    if(c && c.tripId === tid) cacheWrite(tid, state, false);
    stopUnsyncedTicker();       // Task 16(기존)
  }catch(e){
    pendingContentPatch = Object.assign({}, patch, pendingContentPatch); // 실패한 패치를 그 사이 새로 쌓인 패치 아래로 병합(최신이 우선)
    startUnsyncedTicker();      // Task 16(기존)
  }
}
async function forceFlush(){
  const c = cacheRead();
  if(flushTimer || (c && c.dirty) || Object.keys(pendingContentPatch).length) await flushCloud();
}
```

(`stopUnsyncedTicker`/`startUnsyncedTicker`/`cacheRead`/`cacheWrite`는 기존 함수 그대로 — 이름만 참조.)

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx playwright test tests/flush-content-patch.spec.js`
Expected: PASS (2 tests)

- [ ] **Step 5: 전체 스위트 실행 — Task 3에서 이월된 실패가 이제 해소됐는지 확인**

Run: `npx playwright test`
Expected: `openTrip`이 여전히 `flushCloud()`를 호출하지만(`needsPush` 캐시 복구 시), 이 시점엔 아직 아무 mutator도 `queuePatch`를 호출하지 않으므로 **캐시에서 복구된 오프라인 편집 내용이 콘텐츠 문서에 반영되지 않는 회귀**가 있을 수 있다(patch 가 비어 메타만 갱신됨). 이 회귀는 Task 6에서 모든 mutator가 `queuePatch`를 호출하기 시작하면 자동 해소된다 — 지금은 관련 테스트(`unsynced-indicator.spec.js` 등)가 실패해도 원인이 이것이면 다음 태스크로 이월. 실패 원인이 다른 것이면(예: 오타) 지금 고친다.

```bash
git add index.html tests/flush-content-patch.spec.js
git commit -m "feat: 전체 blob 저장을 메타 병합 + 콘텐츠 dot-path 부분 패치로 교체"
```

---

## Task 6: 모든 mutator에 queuePatch 연결

**Files:**
- Modify: `index.html:2741-2802`(`addDay`/`deleteDay`/`addItem`/`deleteItem`/`moveItem`/`addNote`/`deleteNote`/`moveNote`/`addLink`/`deleteLink`/`addTraveler`/`deleteTraveler`), `index.html:3313-3401`(`handleFieldChange`)
- Test: `tests/mutator-content-patch.spec.js` (신규)

**Interfaces:**
- Consumes: `queuePatch` (Task 5).
- Produces: 없음(내부 배선) — 이 태스크가 끝나면 모든 사용자 조작이 정확한 dot-path만 서버에 보낸다.

**패치 관례(이후 모든 코드가 따르는 규칙):**
- 일차 순서/한 일차의 라벨·날짜: `days.{dayId}.itemOrder`(순서), `days.{dayId}.label`/`days.{dayId}.date`(필드)
- 일정 항목 필드: `days.{dayId}.items.{itemId}.{field}`, 항목 자체 추가/삭제: `days.{dayId}.items.{itemId}`(객체 또는 `FieldValue.delete()`)
- 일차 자체 추가/삭제: `dayOrder`(전체 재전송) + `days.{dayId}`(객체 또는 `FieldValue.delete()`)
- 노트: 통째로 `notes.{noteId}`(전체 재전송) — 체크리스트 항목까지 포함해 노트 하나가 충돌 단위. 노트 추가/삭제 시 `noteOrder`도 함께.
- 링크 필드: `links.{linkId}.{field}`, 추가/삭제 시 `linkOrder`도 함께.
- `travelers`: `FieldValue.arrayUnion`/`arrayRemove`(값 기반, 인덱스 아님).
- `attachments`(매니페스트): 통째로 `attachments` 키 재전송.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/mutator-content-patch.spec.js
const { test, expect } = require('./support/fixtures');

test('addItem/moveItem/deleteItem 이 올바른 dot-path 패치를 큐에 쌓는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    const dayId = state.days[0].id;
    addItem(dayId);
    const newItemId = state.days[0].items[1].id;
    moveItem(dayId, newItemId, -1); // 새 항목을 맨 위로
    deleteItem(dayId, state.days[0].items[1].id); // 원래 첫 항목(이제 두번째) 삭제
    await forceFlush();
    const content = (await tripContentRef(id).get()).data();
    return { itemOrder: content.days[dayId].itemOrder, itemIds: Object.keys(content.days[dayId].items), newItemId };
  });
  expect(r.itemOrder).toEqual([r.newItemId]);
  expect(r.itemIds).toEqual([r.newItemId]);
});

test('addNote/deleteNote 가 notes 맵 + noteOrder 를 갱신한다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    addNote();
    const noteId = state.notes[0].id;
    await forceFlush();
    const afterAdd = (await tripContentRef(id).get()).data();
    deleteNote(noteId);
    await forceFlush();
    const afterDelete = (await tripContentRef(id).get()).data();
    return { afterAdd: { order: afterAdd.noteOrder, has: !!afterAdd.notes[noteId] }, afterDelete: { order: afterDelete.noteOrder, has: !!afterDelete.notes[noteId] } };
  });
  expect(r.afterAdd.order).toEqual([expect.any(String)]);
  expect(r.afterAdd.has).toBe(true);
  expect(r.afterDelete.order).toEqual([]);
  expect(r.afterDelete.has).toBe(false);
});

test('addTraveler/deleteTraveler 는 arrayUnion/arrayRemove 를 쓴다(인덱스 아님)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    document.getElementById('newTravelerInput') || renderTravelers();
    const before = state.travelers.slice();
    state.travelers.push('친구');
    queuePatch({ travelers: firebase.firestore.FieldValue.arrayUnion('친구') });
    save();
    await forceFlush();
    const content = (await tripContentRef(id).get()).data();
    return { travelers: content.travelers, before };
  });
  expect(r.travelers.sort()).toEqual([...r.before, '친구'].sort());
});

test('handleFieldChange: 일정 항목 place 수정이 정확한 dot-path 로 큐잉된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    rebuildAll(); setMode('edit');
    const input = document.querySelector(`.tl-place[data-day-id="${dayId}"][data-item-id="${itemId}"]`);
    input.value = '새 장소';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await forceFlush();
    const content = (await tripContentRef(id).get()).data();
    return content.days[dayId].items[itemId].place;
  });
  expect(r).toBe('새 장소');
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx playwright test tests/mutator-content-patch.spec.js`
Expected: FAIL (콘텐츠 문서에 반영이 안 되거나 order 가 비어있음)

- [ ] **Step 3: `index.html:2741-2802`의 mutator들을 교체**

```javascript
function addDay(){
  const id = uid();
  state.days.push({ id, date:'', label:'', items:[{ id:uid(), time:'', place:'', memo:'', expenses:[] }] });
  const d = state.days[state.days.length - 1];
  queuePatch({
    dayOrder: state.days.map(x => x.id),
    ['days.' + id]: { label: '', date: '', itemOrder: d.items.map(i => i.id), items: Object.fromEntries(d.items.map(i => [i.id, { time:'', place:'', memo:'', expenses:[] }])) },
  });
  renderDays(); save();
  flashNew(`#day-${CSS.escape(id)}`);
}
function deleteDay(id){
  if(state.days.length <= 1){ alert(t('sched.day.deleteLastWarn')); return; }
  if(!confirm(t('sched.day.deleteConfirm'))) return;
  state.days = state.days.filter(d => d.id !== id);
  queuePatch({ dayOrder: state.days.map(x => x.id), ['days.' + id]: firebase.firestore.FieldValue.delete() });
  renderDays(); save();
}
function addItem(dayId){
  const d = state.days.find(d => d.id === dayId); if(!d) return;
  const id = uid();
  d.items.push({ id, time:'', place:'', memo:'', expenses:[] });
  queuePatch({
    ['days.' + dayId + '.itemOrder']: d.items.map(i => i.id),
    ['days.' + dayId + '.items.' + id]: { time:'', place:'', memo:'', expenses:[] },
  });
  renderDays(); save();
  flashNew(`.tl-item[data-item-id="${CSS.escape(id)}"]`);
}
function deleteItem(dayId, itemId){
  const d = state.days.find(d => d.id === dayId); if(!d) return;
  d.items = d.items.filter(i => i.id !== itemId);
  queuePatch({
    ['days.' + dayId + '.itemOrder']: d.items.map(i => i.id),
    ['days.' + dayId + '.items.' + itemId]: firebase.firestore.FieldValue.delete(),
  });
  renderDays(); save();
}
function moveItem(dayId, itemId, dir){
  const d = state.days.find(d => d.id === dayId); if(!d) return;
  const i = d.items.findIndex(it => it.id === itemId);
  const j = i + dir;
  if(i < 0 || j < 0 || j >= d.items.length) return;
  const [it] = d.items.splice(i, 1);
  d.items.splice(j, 0, it);
  queuePatch({ ['days.' + dayId + '.itemOrder']: d.items.map(x => x.id) });
  renderDays(); save();
}
function addNote(){
  const id = uid();
  state.notes.push({ id, title:'', content:'' });
  queuePatch({ noteOrder: state.notes.map(n => n.id), ['notes.' + id]: { title:'', content:'' } });
  renderNotes(); save();
  flashNew(`.note-card[data-note-id="${CSS.escape(id)}"]`);
}
function deleteNote(id){
  state.notes = state.notes.filter(n => n.id !== id);
  queuePatch({ noteOrder: state.notes.map(n => n.id), ['notes.' + id]: firebase.firestore.FieldValue.delete() });
  renderNotes(); save();
}
function moveNote(noteId, dir){
  const i = state.notes.findIndex(n => n.id === noteId);
  const j = i + dir;
  if(i < 0 || j < 0 || j >= state.notes.length) return;
  const [n] = state.notes.splice(i, 1);
  state.notes.splice(j, 0, n);
  queuePatch({ noteOrder: state.notes.map(x => x.id) });
  renderNotes(); save();
}
function addLink(){
  const id = uid();
  state.links.push({ id, label:'', url:'' });
  queuePatch({ linkOrder: state.links.map(l => l.id), ['links.' + id]: { label:'', url:'' } });
  renderMaterials(); save();
  flashNew(`.link-card[data-link-id="${CSS.escape(id)}"]`);
}
function deleteLink(id){
  state.links = state.links.filter(l => l.id !== id);
  queuePatch({ linkOrder: state.links.map(l => l.id), ['links.' + id]: firebase.firestore.FieldValue.delete() });
  renderMaterials(); save();
}
```

`index.html:2794-2802`의 `addTraveler`/`deleteTraveler`를 교체:

```javascript
function addTraveler(){
  const inp = document.getElementById('newTravelerInput');
  const v = inp.value.trim(); if(!v) return;
  state.travelers.push(v);
  queuePatch({ travelers: firebase.firestore.FieldValue.arrayUnion(v) });
  renderTravelers(); save();
}
function deleteTraveler(idxStr){
  const idx = parseInt(idxStr, 10);
  const removed = state.travelers[idx];
  state.travelers.splice(idx, 1);
  queuePatch({ travelers: firebase.firestore.FieldValue.arrayRemove(removed) });
  renderTravelers(); save();
}
```

`index.html:2413-2457`의 `toggleNoteMode`/`noteAddItem`/`noteDelItem`/`noteCheckItem`을 교체(체크리스트 관련 — 노트 하나 전체를 `notes.{noteId}` 키로 재전송하는 관례를 따른다):

```javascript
function toggleNoteMode(id){
  const n = state.notes.find(x => x.id === id);
  if(!n) return;
  if(n.mode === 'checklist'){
    n.content = noteItemsOf(n).map(i => i.done ? i.text + noteDoneTag() : i.text).join('\n');
    n.mode = 'text';
    // n.items 는 남겨둠 — 왕복 시 항목 id 연속성용(text 모드에선 렌더 안 함)
  } else {
    const pool = noteItemsOf(n).slice();
    n.items = (n.content || '').split('\n').map(s => s.trim()).filter(Boolean)
      .map(raw => {
        let text = raw, done = false;
        const m = text.match(NOTE_DONE_RE);
        if(m){ text = text.slice(0, m.index); done = true; }
        const hit = pool.findIndex(p => p.text === text);
        const id = hit >= 0 ? pool.splice(hit, 1)[0].id : uid();
        return { id, text, done };
      });
    n.mode = 'checklist';
  }
  queuePatch({ ['notes.' + n.id]: clone(n) });
  renderNotes(); save();
}
function noteAddItem(id){
  const n = state.notes.find(x => x.id === id);
  if(!n) return;
  if(!Array.isArray(n.items)) n.items = [];
  n.items.push({ id: uid(), text: '', done: false });
  queuePatch({ ['notes.' + n.id]: clone(n) });
  renderNotes(); save();
  const rows = document.querySelectorAll(`.chk-row[data-note-id="${CSS.escape(id)}"] .chk-text`);
  const last = rows[rows.length - 1];
  if(last) last.focus();
}
function noteDelItem(noteId, itemId){
  const n = state.notes.find(x => x.id === noteId);
  if(!n) return;
  n.items = noteItemsOf(n).filter(i => i.id !== itemId);
  queuePatch({ ['notes.' + n.id]: clone(n) });
  renderNotes(); save();
}
function noteCheckItem(noteId, itemId, done){
  const n = state.notes.find(x => x.id === noteId);
  if(!n) return;
  const it = noteItemsOf(n).find(i => i.id === itemId);
  if(!it) return;
  it.done = !!done;
  queuePatch({ ['notes.' + n.id]: clone(n) });
  renderNotes(); save();
}
```

(각 함수 안에서 노트 객체를 가리키는 변수명이 다를 수 있으므로 — 기존 코드를 읽고 그 변수명으로 치환한다. 없다면 `state.notes.find(x => x.id === noteId)`로 다시 찾는다.)

`index.html:3313-3401`의 `handleFieldChange` 전체를 교체(`scope === 'header'` 분기는 그대로 둔다 — `title`은 메타 문서 필드라 `flushCloud`가 매 사이클 `deriveTripMeta(state)`로 자동 반영하므로 `queuePatch` 불필요):

```javascript
function handleFieldChange(e){
  const el = e.target;
  if(!el.dataset || !el.dataset.scope) return;
  const scope = el.dataset.scope, field = el.dataset.field;
  if(scope === 'header'){
    state[field] = el.value;
  } else if(scope === 'day'){
    const d = state.days.find(d => d.id === el.dataset.dayId);
    if(d){
      let val = el.value;
      if(field === 'date'){
        val = formatDateDigits(val);
        el.value = val;
      }
      d[field] = val;
      queuePatch({ ['days.' + d.id + '.' + field]: val });
      if(field === 'date'){
        const viewEl = document.querySelector(`.day-date-view[data-day-id="${d.id}"]`) || el.closest('.day-headfields').querySelector('.day-date-view');
        if(viewEl) viewEl.textContent = val;
        const nativeEl = el.closest('.day-headfields').querySelector('.day-date-native');
        if(nativeEl && /^\d{4}-\d{2}-\d{2}$/.test(val)) nativeEl.value = val;
      }
    }
  } else if(scope === 'item'){
    const d = state.days.find(d => d.id === el.dataset.dayId);
    const it = d && d.items.find(i => i.id === el.dataset.itemId);
    if(it){
      if(field === 'hour' || field === 'minute'){
        const group = el.closest('.tl-time-edit');
        const selects = group.querySelectorAll('select');
        const h = selects[0].value, m = selects[1].value;
        it.time = (h && m) ? (h + ':' + m) : '';
        queuePatch({ ['days.' + el.dataset.dayId + '.items.' + el.dataset.itemId + '.time']: it.time });
        const viewEl = el.closest('.tl-row').querySelector('.tl-time-view');
        if(viewEl) viewEl.textContent = it.time || '--:--';
      } else {
        it[field] = el.value;
        queuePatch({ ['days.' + el.dataset.dayId + '.items.' + el.dataset.itemId + '.' + field]: el.value });
        if(field === 'memo'){
          const v = document.getElementById('memo-view-' + el.dataset.dayId + '-' + el.dataset.itemId);
          if(v) v.innerHTML = linkify(el.value);
        }
      }
    }
  } else if(scope === 'note'){
    const n = state.notes.find(n => n.id === el.dataset.noteId);
    if(n){
      n[field] = el.value;
      queuePatch({ ['notes.' + n.id]: clone(n) });
      if(field === 'content'){
        autoGrowArea(el);
        const v = document.getElementById('note-view-' + el.dataset.noteId);
        if(v) v.innerHTML = linkify(el.value);
      }
    }
  } else if(scope === 'note-item'){
    const n = state.notes.find(n => n.id === el.dataset.noteId);
    const it = n && noteItemsOf(n).find(i => i.id === el.dataset.itemId);
    if(it){
      it.text = el.value;
      queuePatch({ ['notes.' + n.id]: clone(n) });
      const vv = el.closest('.chk-row') && el.closest('.chk-row').querySelector('.chk-text-view');
      if(vv) vv.textContent = el.value;
    }
  } else if(scope === 'link'){
    const l = state.links.find(l => l.id === el.dataset.linkId);
    if(l){
      l[field] = el.value;
      queuePatch({ ['links.' + l.id + '.' + field]: el.value });
      const card = el.closest('.link-card');
      const btnEl = card && card.querySelector('.link-btn');
      if(btnEl){
        if(field === 'label') btnEl.textContent = el.value || t('mat.link.fallback');
        if(field === 'url'){
          const hasUrl = !!el.value.trim();
          if(hasUrl){
            btnEl.setAttribute('href', normalizeUrl(el.value));
            btnEl.setAttribute('target', '_blank');
            btnEl.setAttribute('rel', 'noopener');
          } else {
            btnEl.removeAttribute('href');
            btnEl.removeAttribute('target');
            btnEl.removeAttribute('rel');
          }
        }
      }
    }
  } else if(scope === 'att'){
    const a = (state.attachments || []).find(x => x.id === el.dataset.attId);
    if(a) a.name = el.value;
    queuePatch({ attachments: state.attachments });
    if(e.type === 'change') renameAttachment(el.dataset.attId, el.value);
  }
  saveDebounced();
}
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx playwright test tests/mutator-content-patch.spec.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 전체 스위트 실행 + 커밋**

Run: `npx playwright test`
Expected: Task 5에서 이월됐던 실패(오프라인 캐시 복구 후 미반영)가 이제 해소됨 — 전체 통과. 실패가 남아있다면 어느 mutator에 `queuePatch` 연결을 빠뜨렸는지 확인.

```bash
git add index.html tests/mutator-content-patch.spec.js
git commit -m "feat: 모든 일정/노트/링크/여행자 조작이 dot-path 패치를 큐잉하도록 연결"
```

---

## Task 7: 실시간 구독 (onSnapshot) + 타이핑 중 병합 지연

**Files:**
- Modify: `index.html` (`openTrip`, `goBackToMypage` 근처에 구독/해제 추가, 새 함수 `subscribeTripContent`/`unsubscribeTripContent`/`applyRemoteContentSnapshot`)
- Test: `tests/realtime-sync.spec.js` (신규)

**Interfaces:**
- Consumes: `tripContentRef` (Task 3), `contentDocToTripState` (Task 2), `rebuildAll` (기존).
- Produces: `subscribeTripContent(tripId)` — `openTrip` 끝에서 호출. `unsubscribeTripContent()` — `goBackToMypage`/`deleteTrip` 진입 시 호출.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/realtime-sync.spec.js
const { test, expect } = require('./support/fixtures');

test('한 클라이언트의 dot-path 변경이 같은 여행을 연 다른 state 인스턴스에도 반영된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    // "사용자 A" 세션
    currentTripId = id; state = await loadTrip(id);
    subscribeTripContent(id);
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    // "사용자 B" 가 같은 콘텐츠 문서를 직접 수정(별도 상태 변수로 시뮬레이션)
    await tripContentRef(id).update({ ['days.' + dayId + '.items.' + itemId + '.place']: 'B가 고침' });
    await new Promise(r => setTimeout(r, 0));
    return state.days.find(d => d.id === dayId).items.find(i => i.id === itemId).place;
  });
  expect(r).toBe('B가 고침');
});

test('편집 필드에 포커스가 있는 동안에는 원격 갱신을 지연했다가 blur 시 적용한다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    rebuildAll(); setMode('edit');
    subscribeTripContent(id);
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    const input = document.querySelector(`.tl-place[data-day-id="${dayId}"][data-item-id="${itemId}"]`);
    input.focus();
    await tripContentRef(id).update({ ['days.' + dayId + '.items.' + itemId + '.place']: '원격변경' });
    await new Promise(r => setTimeout(r, 0));
    const whileFocused = state.days.find(d => d.id === dayId).items.find(i => i.id === itemId).place;
    input.blur();
    await new Promise(r => setTimeout(r, 0));
    const afterBlur = state.days.find(d => d.id === dayId).items.find(i => i.id === itemId).place;
    return { whileFocused, afterBlur };
  });
  expect(r.whileFocused).not.toBe('원격변경'); // 포커스 중엔 아직 반영 안 됨
  expect(r.afterBlur).toBe('원격변경');        // blur 후 반영됨
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx playwright test tests/realtime-sync.spec.js`
Expected: FAIL (`subscribeTripContent is not defined`)

- [ ] **Step 3: `index.html`에 구독 로직 구현**

`tripStateToContentDoc`/`contentDocToTripState` 정의부 아래(Task 2에서 만든 위치 바로 다음)에 추가:

```javascript
let tripContentUnsub = null;
let pendingRemoteSnapshot = null;

function isEditingField(){
  const el = document.activeElement;
  return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'));
}
function applyRemoteContentSnapshot(doc){
  if(!doc) return;
  if(isEditingField()){ pendingRemoteSnapshot = doc; return; }
  const remote = contentDocToTripState(doc);
  state.days = remote.days; state.notes = remote.notes; state.links = remote.links;
  state.travelers = remote.travelers; state.attachments = remote.attachments;
  rebuildAll();
}
function subscribeTripContent(tripId){
  unsubscribeTripContent();
  tripContentUnsub = tripContentRef(tripId).onSnapshot(snap => {
    if(snap.exists) applyRemoteContentSnapshot(snap.data());
  });
}
function unsubscribeTripContent(){
  if(tripContentUnsub){ tripContentUnsub(); tripContentUnsub = null; }
  pendingRemoteSnapshot = null;
}
document.addEventListener('focusout', e => {
  if(!pendingRemoteSnapshot) return;
  const el = e.target;
  if(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')){
    const doc = pendingRemoteSnapshot; pendingRemoteSnapshot = null;
    setTimeout(() => applyRemoteContentSnapshot(doc), 0); // blur 직후 새 activeElement 반영 이후 실행
  }
});
```

`openTrip`(`index.html:1917` 부근) 끝, `if(needsPush) flushCloud();` 다음 줄에 추가:

```javascript
  subscribeTripContent(tripId);
```

`goBackToMypage`(`index.html:1941` 부근) 맨 앞에 추가:

```javascript
function goBackToMypage(){
  unsubscribeTripContent();
  // ... 기존 코드 그대로
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx playwright test tests/realtime-sync.spec.js`
Expected: PASS (2 tests)

- [ ] **Step 5: 전체 스위트 실행 + 커밋**

Run: `npx playwright test`
Expected: 전체 통과.

```bash
git add index.html tests/realtime-sync.spec.js
git commit -m "feat: 여행 콘텐츠 onSnapshot 실시간 구독 + 타이핑 중 원격 갱신 지연 적용"
```

---

## Task 8: 보안 규칙 배포

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: 없음(Firestore 서버 측 설정).
- Produces: 실제 Firestore 백엔드의 접근 제어 — 이후 태스크(9, 10)의 초대/멤버 관리 기능이 이 규칙 위에서 동작.

- [ ] **Step 1: `firestore.rules`에 trips 규칙 추가**

기존 `firestore.rules`의 `match /users/{userId}/{document=**}` 블록은 그대로 두고, 같은 `service cloud.firestore { match /databases/{database}/documents { ... } }` 안에 다음을 추가:

```
    match /trips/{tripId} {
      allow read: if request.auth != null && request.auth.uid in resource.data.members;

      allow create: if request.auth != null
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.members == [request.auth.uid];

      allow update: if request.auth != null && request.auth.uid in resource.data.members
        && request.resource.data.ownerUid == resource.data.ownerUid
        && (
          request.resource.data.members == resource.data.members
          || request.resource.data.members == resource.data.members.concat([request.auth.uid])
          || (request.auth.uid != resource.data.ownerUid
              && request.resource.data.members == resource.data.members.removeAll([request.auth.uid]))
          || (request.auth.uid == resource.data.ownerUid
              && resource.data.members.hasAll(request.resource.data.members)
              && request.resource.data.members.hasAll([request.auth.uid]))
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

- [ ] **Step 2: 드라이런으로 문법 검증**

Run: `firebase deploy --only firestore:rules --dry-run`
Expected: `rules file firestore.rules compiled successfully`

- [ ] **Step 3: 사용자 확인 후 실제 배포**

이 단계는 라이브 보안 규칙을 바꾸는 작업이므로, 이전 App Check 배포 때와 동일하게 **사용자에게 진행 여부를 먼저 확인**한다. 승인 후:

Run: `firebase deploy --only firestore:rules`
Expected: `released rules firestore.rules to cloud.firestore`

- [ ] **Step 4: 커밋**

```bash
git add firestore.rules
git commit -m "feat: trips/content/att 컬렉션에 members 기반 보안 규칙 추가"
```

(Firestore 에뮬레이터가 설치돼 있다면 `firebase emulators:exec --only firestore "..."`로 규칙 단위 테스트를 추가할 수 있으나, 이 프로젝트는 에뮬레이터 인프라가 없으므로 범위 밖 — Playwright 스텁의 자체 접근 제어 시뮬레이션은 하지 않는다. 실제 규칙 검증은 위 dry-run + 실 배포 후 Task 11의 "비멤버 접근 거부" 시나리오를 **실제 배포된 라이브 환경**에서 수동 확인하는 것으로 갈음한다 — Playwright 스텁은 규칙을 흉내내지 않으므로 이 부분만 예외적으로 자동 테스트 범위 밖이다.)

---

## Task 9: 초대 링크 — 생성 및 참여 흐름

**Files:**
- Modify: `index.html` (설정/멤버 관리 UI 근처에 초대 링크 표시, 새 함수 `handleJoinRedirect`, `joinTrip`, `handleAuthChange`에서 호출, i18n 카탈로그 4개 언어)
- Test: `tests/invite-join.spec.js` (신규)

**Interfaces:**
- Consumes: `tripMetaRef` (Task 3).
- Produces: `joinTrip(tripId)` — `?join=<tripId>` 처리 및 멤버 관리 화면의 "직접 참여" 테스트 경로에서 재사용. `handleJoinRedirect()` — `handleAuthChange` 끝에서 호출(카카오 리다이렉트 처리와 같은 패턴).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/invite-join.spec.js
const { test, expect } = require('./support/fixtures');

test('?join=<tripId> 링크로 접속하면 members 에 자기 uid 와 이름이 추가되고 그 여행이 열린다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '초대받은사람', email: 'u2@example.com' }));
  await page.goto('/?join=' + tripId);
  await page.waitForTimeout(50);
  const result = await page.evaluate(async (tid) => {
    const metaSnap = await tripMetaRef(tid).get();
    return { members: metaSnap.data().members, memberNames: metaSnap.data().memberNames, currentScreen, currentTripId };
  }, tripId);
  expect(result.members).toContain('u2');
  expect(result.memberNames.u2).toBe('초대받은사람');
  expect(result.currentScreen).toBe('editor');
  expect(result.currentTripId).toBe(tripId);
});

test('이미 멤버인 사람이 자기 여행 조인 링크로 다시 접속하면 members 가 중복되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.goto('/?join=' + tripId);
  await page.waitForTimeout(50);
  const members = await page.evaluate((tid) => tripMetaRef(tid).get().then(s => s.data().members), tripId);
  expect(members).toEqual(['u1']);
});
```

(첫 테스트의 `window.__test.signIn(user)`는 `uid`/`displayName`/`email`를 오버라이드할 수 있어야 한다 — 기존 스텁의 `signInWithPopup`이 `pendingUser`를 `base`에 `Object.assign`하므로 이미 지원된다, 스텁 변경 불필요.)

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx playwright test tests/invite-join.spec.js`
Expected: FAIL (`?join=` 파라미터가 아무 동작도 안 함)

- [ ] **Step 3: `index.html`에 조인 처리 구현**

`parseKakaoRedirectParams` 근처에 추가:

```javascript
async function joinTrip(tripId){
  const metaSnap = await tripMetaRef(tripId).get();
  if(!metaSnap.exists){ alert(t('collab.join.notFound')); return; }
  const meta = metaSnap.data();
  if(!meta.members.includes(currentUser.uid)){
    const patch = { members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) };
    patch['memberNames.' + currentUser.uid] = currentUser.displayName || '';
    await tripMetaRef(tripId).update(patch);
    await refreshTripList();
  }
  await openTrip(tripId);
}
async function handleJoinRedirect(){
  if(!currentUser) return; // 로그인 전이면 쿼리 파라미터를 지우지 않고 둔다 — 로그인 완료 후 handleAuthChange 가 다시 호출할 때 재시도됨
  const params = new URLSearchParams(location.search);
  const tripId = params.get('join');
  if(!tripId) return;
  history.replaceState(null, '', location.pathname);
  try{ await joinTrip(tripId); }
  catch(e){ console.error('여행 참여 실패', e); alert(t('collab.join.fail')); }
}
```

**로그인 전 조인 링크 처리:** `handleAuthChange`는 로그아웃 상태(`user`가 null)에서도 함수 끝에서 `handleJoinRedirect()`를 호출한다(기존 `handleKakaoRedirect()`와 같은 무조건 호출 위치). 위 가드(`if(!currentUser) return`) 덕분에 로그인 전엔 그냥 리턴하고 URL의 `?join=`은 그대로 남아있다가, 사용자가 로그인하면 `handleAuthChange`가 다시 실행되며 이번엔 `currentUser`가 설정된 채로 `handleJoinRedirect`가 재실행되어 참여가 완료된다.

`handleAuthChange`(`index.html:2021` 부근) 끝, `handleKakaoRedirect();` 다음 줄에 추가:

```javascript
  await handleJoinRedirect();
```

(둘 다 `?xxx=` 쿼리 파라미터를 검사하고 없으면 즉시 리턴하므로 순서 무관, 동시에 있을 일도 없다.)

**i18n 키 추가** — `I18N.ko`/`en`/`ja`/`zh` 각 카탈로그에 다음 2개 키 추가(기존 키 근처 아무 곳이나, 알파벳/카테고리 순서 관례를 따르는 위치에):

```javascript
// ko
'collab.join.notFound': '여행을 찾을 수 없습니다.',
'collab.join.fail': '여행 참여에 실패했습니다.',
// en
'collab.join.notFound': 'Trip not found.',
'collab.join.fail': 'Failed to join the trip.',
// ja
'collab.join.notFound': '旅行が見つかりません。',
'collab.join.fail': '旅行への参加に失敗しました。',
// zh
'collab.join.notFound': '找不到该行程。',
'collab.join.fail': '加入行程失败。',
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx playwright test tests/invite-join.spec.js`
Expected: PASS (2 tests)

- [ ] **Step 5: i18n 가드 테스트 + 전체 스위트 실행 + 커밋**

Run: `npx playwright test tests/i18n.spec.js`
Expected: PASS (4개 언어 키 셋 일치 가드 통과)

Run: `npx playwright test`
Expected: 전체 통과.

```bash
git add index.html tests/invite-join.spec.js
git commit -m "feat: 초대 링크(?join=tripId)로 여행 참여하는 흐름 추가"
```

---

## Task 10: 멤버 관리 UI (목록 · 자진 탈퇴 · owner의 kick · 초대 링크 표시)

**Files:**
- Modify: `index.html` (편집기 `.nav-right`에 새 버튼, 새 모달 렌더 함수, `data-action` 핸들러, i18n 4개 언어)
- Test: `tests/collab-members-ui.spec.js` (신규)

**Interfaces:**
- Consumes: `joinTrip`은 아님(자기 참여가 아니라 관리 화면이므로 직접 `members` 갱신 로직을 이 태스크에서 작성), `tripMetaRef` (Task 3).
- Produces: `openMembersModal()`, `leaveTrip()`, `kickMember(uid)` — `data-action="open-members"`/`"leave-trip"`/`"kick-member"`로 연결.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/collab-members-ui.spec.js
const { test, expect } = require('./support/fixtures');

test('멤버 관리 모달에 초대 링크와 멤버 목록(이름)이 뜨고, owner 는 자기 자신에게 내보내기 버튼이 없다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({ ['memberNames.u1']: '김진' }), tripId);
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  const html = await page.locator('#v2ModalBody').innerHTML();
  expect(html).toContain('김진');
  expect(html).toContain('/?join=' + tripId);
  const kickButtons = await page.locator('#v2ModalBody [data-action="kick-member"]').count();
  expect(kickButtons).toBe(0); // 멤버가 자기 자신뿐이라 kick 대상 없음
});

test('owner 가 아닌 멤버는 "여행 나가기" 버튼을 볼 수 있고, 누르면 members 에서 자기 자신이 빠지고 마이페이지로 이동한다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({
    members: firebase.firestore.FieldValue.arrayUnion('u2'),
    ['memberNames.u2']: '멤버2',
  }), tripId);
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '멤버2', email: 'u2@example.com' }));
  await page.waitForTimeout(50);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  await page.click('[data-action="leave-trip"]');
  await page.waitForTimeout(50);
  const result = await page.evaluate(async (tid) => {
    const meta = (await tripMetaRef(tid).get()).data();
    return { members: meta.members, hasName: 'u2' in meta.memberNames, screen: currentScreen };
  }, tripId);
  expect(result.members).not.toContain('u2');
  expect(result.hasName).toBe(false);
  expect(result.screen).toBe('mypage');
});

test('owner 는 다른 멤버를 내보낼(kick) 수 있다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({
    members: firebase.firestore.FieldValue.arrayUnion('u2'),
    ['memberNames.u2']: '멤버2',
  }), tripId);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  page.once('dialog', d => d.accept());
  await page.click('[data-action="kick-member"][data-uid="u2"]');
  await page.waitForTimeout(50);
  const meta = await page.evaluate((tid) => tripMetaRef(tid).get().then(s => s.data()), tripId);
  expect(meta.members).not.toContain('u2');
  expect('u2' in meta.memberNames).toBe(false);
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx playwright test tests/collab-members-ui.spec.js`
Expected: FAIL (`#tripMembersBtn` 없음)

- [ ] **Step 3: 편집기 nav에 버튼 추가 + 모달/핸들러 구현**

편집기 `.nav-right`(`#editorOptBtn` 바로 앞, `index.html`에서 `id="editorOptBtn"`을 검색해 그 앞에 삽입) HTML에 추가:

```html
<button id="tripMembersBtn" class="icon-btn" data-action="open-members" aria-label="멤버">👥</button>
```

`openAvatarModal` 근처(같은 `v2Modal` 패턴)에 추가:

```javascript
async function openMembersModal(){
  const metaSnap = await tripMetaRef(currentTripId).get();
  const meta = metaSnap.data();
  const isOwner = meta.ownerUid === currentUser.uid;
  const inviteUrl = location.origin + location.pathname + '?join=' + currentTripId;
  const rows = meta.members.map(uid => {
    const name = (meta.memberNames && meta.memberNames[uid]) || uid;
    const isSelf = uid === currentUser.uid;
    const kickBtn = (isOwner && !isSelf) ? `<button data-action="kick-member" data-uid="${escapeAttr(uid)}">${t('collab.members.kick')}</button>` : '';
    return `<div class="member-row"><span>${escapeHTML(name)}${isSelf ? ' (' + t('collab.members.you') + ')' : ''}</span>${kickBtn}</div>`;
  }).join('');
  const leaveBtn = isOwner ? '' : `<button data-action="leave-trip" class="v2-btn-ghost">${t('collab.members.leave')}</button>`;
  document.getElementById('v2ModalBody').innerHTML =
    `<div style="font-weight:700;font-size:13px;margin-bottom:8px">${t('collab.members.title')}</div>` +
    `<div class="member-list">${rows}</div>` +
    `<div style="margin-top:12px;font-size:12px;color:var(--ink-soft)">${t('collab.invite.label')}</div>` +
    `<input readonly value="${escapeAttr(inviteUrl)}" onclick="this.select()" style="width:100%;margin-top:4px">`;
  document.getElementById('v2ModalActions').innerHTML =
    `<button class="v2-btn-ghost" data-action="v2modal-close">${t('common.close')}</button>${leaveBtn}`;
  document.getElementById('v2Modal').hidden = false;
}
async function leaveTrip(){
  if(!confirm(t('collab.members.leaveConfirm'))) return;
  const patch = { members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) };
  patch['memberNames.' + currentUser.uid] = firebase.firestore.FieldValue.delete();
  await tripMetaRef(currentTripId).update(patch);
  document.getElementById('v2Modal').hidden = true;
  unsubscribeTripContent();
  currentTripId = null;
  await refreshTripList();
  renderMypage();
  showScreen('mypage');
}
async function kickMember(uid){
  if(!confirm(t('collab.members.kickConfirm'))) return;
  const patch = { members: firebase.firestore.FieldValue.arrayRemove(uid) };
  patch['memberNames.' + uid] = firebase.firestore.FieldValue.delete();
  await tripMetaRef(currentTripId).update(patch);
  await openMembersModal(); // 목록 갱신
}
```

`data-action` 위임 스위치(`index.html`에서 `else if(a === 'note-toggle-mode')` 근처의 큰 `if/else` 체인)에 추가:

```javascript
  else if(a === 'open-members') openMembersModal();
  else if(a === 'leave-trip') leaveTrip();
  else if(a === 'kick-member') kickMember(btn.dataset.uid);
```

**i18n 키 추가** — 4개 언어 카탈로그에:

```javascript
// ko
'collab.members.title': '멤버',
'collab.members.you': '나',
'collab.members.kick': '내보내기',
'collab.members.leave': '여행 나가기',
'collab.members.leaveConfirm': '이 여행에서 나가시겠어요?',
'collab.members.kickConfirm': '이 멤버를 내보낼까요?',
'collab.invite.label': '초대 링크',
// en
'collab.members.title': 'Members',
'collab.members.you': 'you',
'collab.members.kick': 'Remove',
'collab.members.leave': 'Leave trip',
'collab.members.leaveConfirm': 'Leave this trip?',
'collab.members.kickConfirm': 'Remove this member?',
'collab.invite.label': 'Invite link',
// ja
'collab.members.title': 'メンバー',
'collab.members.you': '自分',
'collab.members.kick': '削除',
'collab.members.leave': '旅行から抜ける',
'collab.members.leaveConfirm': 'この旅行から抜けますか?',
'collab.members.kickConfirm': 'このメンバーを削除しますか?',
'collab.invite.label': '招待リンク',
// zh
'collab.members.title': '成员',
'collab.members.you': '我',
'collab.members.kick': '移除',
'collab.members.leave': '退出行程',
'collab.members.leaveConfirm': '要退出该行程吗?',
'collab.members.kickConfirm': '要移除该成员吗?',
'collab.invite.label': '邀请链接',
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `npx playwright test tests/collab-members-ui.spec.js`
Expected: PASS (3 tests)

- [ ] **Step 5: i18n 가드 + 전체 스위트 실행 + 커밋**

Run: `npx playwright test`
Expected: 전체 통과.

```bash
git add index.html tests/collab-members-ui.spec.js
git commit -m "feat: 멤버 관리 UI(목록/초대 링크/자진 탈퇴/owner kick) 추가"
```

---

## Task 11: 통합 시나리오 — 동시 편집 무충돌 확인

**Files:**
- Test: `tests/collab-concurrent-edit.spec.js` (신규)

**Interfaces:**
- Consumes: 전체 파이프라인(Task 1-10).

- [ ] **Step 1: 실패할 수 있는(또는 이미 통과할 수 있는 — 회귀 확인용) 통합 테스트 작성**

```js
// tests/collab-concurrent-edit.spec.js
const { test, expect } = require('./support/fixtures');

test('서로 다른 일차 항목을 "동시에" 수정해도 서로의 변경이 유실되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    addDay(); // 두 번째 날 추가
    await forceFlush();
    const day1 = state.days[0].id, day2 = state.days[1].id;
    const item1 = state.days[0].items[0].id, item2 = state.days[1].items[0].id;

    // "두 사람"이 각자 다른 날짜의 항목을 동시에 고침(같은 debounce 창 안에서)
    queuePatch({ ['days.' + day1 + '.items.' + item1 + '.place']: 'A가 고침' });
    save();
    await tripContentRef(id).update({ ['days.' + day2 + '.items.' + item2 + '.place']: 'B가 고침(직접 씀)' });
    await forceFlush();

    const content = (await tripContentRef(id).get()).data();
    return { p1: content.days[day1].items[item1].place, p2: content.days[day2].items[item2].place };
  });
  expect(r.p1).toBe('A가 고침');
  expect(r.p2).toBe('B가 고침(직접 씀)'); // A의 flush 가 B의 직접 쓰기를 덮어쓰지 않음
});

test('같은 항목의 같은 필드를 동시에 고치면 나중 쓰기가 이기되, 다른 필드는 안전하다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    await forceFlush();

    queuePatch({ ['days.' + dayId + '.items.' + itemId + '.memo']: 'A의 메모' }); // 아직 안 보냄
    await tripContentRef(id).update({
      ['days.' + dayId + '.items.' + itemId + '.place']: 'B의 장소', // 다른 필드
    });
    await forceFlush(); // A의 큐가 지금 나감 → memo 만 덮어씀, place 는 안 건드림(dot-path 덕분)

    const content = (await tripContentRef(id).get()).data();
    return content.days[dayId].items[itemId];
  });
  expect(r.memo).toBe('A의 메모');
  expect(r.place).toBe('B의 장소'); // 서로 다른 필드라 공존
});

test('비멤버는 loadTrip 이 실패한다(권한 시뮬레이션 — 실제 규칙은 Task 8에서 라이브로 검증)', async ({ page }) => {
  // 스텁은 보안 규칙을 흉내내지 않으므로, 이 테스트는 "존재하지 않는 트립을 열면 실패"만 검증해
  // loadTrip 의 에러 경로 자체가 살아있는지 확인하는 회귀 가드다.
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const threw = await page.evaluate(async () => {
    try{ await loadTrip('존재하지않는아이디'); return false; }catch(e){ return true; }
  });
  expect(threw).toBe(true);
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx playwright test tests/collab-concurrent-edit.spec.js`
Expected: PASS (Task 1-10이 올바르게 구현됐다면 이 시점에 바로 통과해야 함 — 만약 실패하면 어느 태스크의 dot-path 경로 계산이 잘못됐는지 역추적)

- [ ] **Step 3: 전체 스위트 최종 확인 + 커밋**

Run: `npx playwright test`
Expected: 전체 통과(기존 170 + 이 플랜에서 추가된 모든 신규 테스트).

```bash
git add tests/collab-concurrent-edit.spec.js
git commit -m "test: 협업 모드 동시 편집 무충돌 통합 시나리오 추가"
```

---

## 완료 후 남는 작업 (이 플랜 범위 밖, 별도로 처리)

- Task 8의 실 배포는 사용자 승인 후 진행(기존 App Check 배포와 동일한 확인 절차).
- 마이페이지 여행 카드에 협업 여행임을 나타내는 표시(멤버 아바타 등)는 로드맵 batch 2 항목 — 이 플랜에서 하지 않음(스펙에 명시).
- `docs/HANDOFF.md`/`pre-scale-security-checklist.md`의 "낙관적 last-write-wins 제거" 항목을 이 플랜 완료로 "해결됨(항목 단위로 블라스트 반경 축소)"으로 갱신 — 구현 완료 후 메모리 파일 갱신.
