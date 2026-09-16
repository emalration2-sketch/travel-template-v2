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
