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

test('스텁: onSnapshot 직후 동기적으로 unsubscribe 하면 초기 콜백이 아예 호출되지 않는다', async ({ page }) => {
  await page.goto('/');
  const callCount = await page.evaluate(async () => {
    const db = firebase.firestore();
    await db.doc('trips/t4/content/main').set({ v: 1 });
    let calls = 0;
    const unsub = db.doc('trips/t4/content/main').onSnapshot(() => { calls++; });
    unsub(); // 큐에 들어간 초기 발화 마이크로태스크가 돌기 전에 즉시 해제
    await new Promise(r => setTimeout(r, 0)); // 마이크로태스크가 돌 시간을 준다
    return calls;
  });
  expect(callCount).toBe(0); // 해제 후에는 아무 것도 호출되지 않아야 한다
});

test('스텁: onSnapshot 직후 await 없이 동기적으로 쓰면 초기값이 새 값보다 먼저 전달된다', async ({ page }) => {
  await page.goto('/');
  const seen = await page.evaluate(async () => {
    const db = firebase.firestore();
    await db.doc('trips/t5/content/main').set({ v: 'old' });
    const seen = [];
    db.doc('trips/t5/content/main').onSnapshot(snap => seen.push(snap.data().v));
    // await 없이 곧바로 동기 쓰기 (fire-and-forget) — 순서가 뒤집히면 안 된다
    db.doc('trips/t5/content/main').set({ v: 'new' });
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    return seen;
  });
  expect(seen).toEqual(['old', 'new']); // 초기 스냅샷(old)이 쓰기 알림(new)보다 먼저 와야 한다
});

test('스텁: notify() 로 전달된 스냅샷은 이후 쓰기(중첩 필드 mutate)가 일어나도 생성 시점 값을 그대로 유지한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const db = firebase.firestore();
    const ref = db.doc('trips/t6/content/main');
    await ref.set({ nested: { v: 'first' } });
    const snaps = [];
    ref.onSnapshot(snap => { snaps.push(snap); });
    await new Promise(r => setTimeout(r, 0)); // 초기 스냅샷(snaps[0]) 수신 대기

    // update() 로 전달되는 스냅샷(snaps[1])을 캡처한다 — notify() 경로의 버그 재현 지점.
    await ref.update({ 'nested.v': 'second' });
    await new Promise(r => setTimeout(r, 0)); // snaps[1] 수신 대기
    const capturedAfterFirstWrite = snaps[snaps.length - 1];

    // 캡처 "이후"에 store 를 다시 mutate (setDeep 은 in-place 로 nested 객체를 변경한다)
    await ref.update({ 'nested.v': 'third' });
    await new Promise(r => setTimeout(r, 0));

    // .data() 를 나중에 호출해도 캡처 시점(second) 값을 유지해야 한다 — third 로 오염되면 안 된다.
    return capturedAfterFirstWrite.data().nested.v;
  });
  expect(result).toBe('second');
});
