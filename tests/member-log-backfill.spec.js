const { test, expect } = require('./support/fixtures');

// backfillMemberLogOnce(): 멤버 로그 기능이 생기기 전에 이미 참여해 있던 멤버들에게
// 소급으로 참여 기록을 한 번만 붙여주는 일회성 백필.
// 실제 조인 플로우(joinTrip)를 거치지 않고 tripMetaRef 를 직접 patch 해서
// "기능이 생기기 전에 이미 멤버였던 사람"을 흉내낸다.

test('오너 소유 여행: 비오너 멤버 2명 → 각자 참여 기록이 하나씩 생기고 memberLogOrder/joinLogged/플래그가 갱신된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  // joinTrip 을 거치지 않고 멤버만 직접 추가 — "로그 기능 이전에 참여한 멤버" 시뮬레이션
  await page.evaluate(async (tid) => {
    await tripMetaRef(tid).update({
      members: firebase.firestore.FieldValue.arrayUnion('u2', 'u3'),
      'memberNames.u2': '멤버투',
      'memberNames.u3': '멤버쓰리',
    });
    await refreshTripList();
  }, tripId);

  const result = await page.evaluate(async (tid) => {
    await backfillMemberLogOnce();
    const contentSnap = await tripContentRef(tid).get();
    const metaSnap = await tripMetaRef(tid).get();
    return { content: contentSnap.data(), meta: metaSnap.data() };
  }, tripId);

  const logIds = Object.keys(result.content.memberLog || {});
  expect(logIds.length).toBe(2);
  const names = logIds.map(id => result.content.memberLog[id].name);
  expect(names).toContain('멤버투');
  expect(names).toContain('멤버쓰리');
  logIds.forEach(id => expect(result.content.memberLogOrder).toContain(id));
  expect(result.meta.memberLogBackfilled).toBe(true);
  expect(result.meta.joinLogged.u2).toBe(true);
  expect(result.meta.joinLogged.u3).toBe(true);
});

test('멱등성: 같은 여행에 두 번째로 실행해도 기록이 추가로 생기지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(async (tid) => {
    await tripMetaRef(tid).update({
      members: firebase.firestore.FieldValue.arrayUnion('u2'),
      'memberNames.u2': '멤버투',
    });
    await refreshTripList();
    await backfillMemberLogOnce();
  }, tripId);

  const countBefore = await page.evaluate((tid) =>
    tripContentRef(tid).get().then(s => Object.keys(s.data().memberLog || {}).length), tripId);
  expect(countBefore).toBe(1);

  // 두 번째 실행
  await page.evaluate(() => backfillMemberLogOnce());
  const countAfter = await page.evaluate((tid) =>
    tripContentRef(tid).get().then(s => Object.keys(s.data().memberLog || {}).length), tripId);
  expect(countAfter).toBe(1);
});

test('이미 memberLogBackfilled 가 true 인 여행은 처음부터 손대지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(async (tid) => {
    await tripMetaRef(tid).update({
      members: firebase.firestore.FieldValue.arrayUnion('u2'),
      'memberNames.u2': '멤버투',
      memberLogBackfilled: true,
    });
    await refreshTripList();
  }, tripId);

  const result = await page.evaluate(async (tid) => {
    await backfillMemberLogOnce();
    const contentSnap = await tripContentRef(tid).get();
    const metaSnap = await tripMetaRef(tid).get();
    return { content: contentSnap.data(), meta: metaSnap.data() };
  }, tripId);

  expect(Object.keys(result.content.memberLog || {}).length).toBe(0);
  expect(result.meta.memberLogBackfilled).toBe(true);
  expect(result.meta.members).toContain('u2'); // 멤버 목록 자체는 그대로
});

test('오너 혼자뿐인 여행: 새 기록은 0개지만 memberLogBackfilled 는 true 로 마킹된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(() => refreshTripList());

  const result = await page.evaluate(async (tid) => {
    await backfillMemberLogOnce();
    const contentSnap = await tripContentRef(tid).get();
    const metaSnap = await tripMetaRef(tid).get();
    return { content: contentSnap.data(), meta: metaSnap.data() };
  }, tripId);

  expect(Object.keys(result.content.memberLog || {}).length).toBe(0);
  expect(result.meta.memberLogBackfilled).toBe(true);
});

test('내가 오너가 아닌(멤버로만 속한) 여행은 내 계정으로 백필을 돌려도 건드리지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn()); // u1 = 오너
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  // u2 를 로그 기능 이전 방식으로 멤버에 직접 추가(플래그 없음)
  await page.evaluate(async (tid) => {
    await tripMetaRef(tid).update({
      members: firebase.firestore.FieldValue.arrayUnion('u2'),
      'memberNames.u2': '멤버투',
    });
  }, tripId);

  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '멤버투', email: 'u2@example.com' }));
  await page.waitForTimeout(50); // handleAuthChange 가 refreshTripList + backfillMemberLogOnce 를 이미 한 번 자동 실행함

  const result = await page.evaluate(async (tid) => {
    await backfillMemberLogOnce(); // u2 계정으로 명시적으로 한 번 더 실행 — 오너가 아니므로 여전히 스킵되어야 함
    const contentSnap = await tripContentRef(tid).get();
    const metaSnap = await tripMetaRef(tid).get();
    return { content: contentSnap.data(), meta: metaSnap.data() };
  }, tripId);

  expect(Object.keys(result.content.memberLog || {}).length).toBe(0);
  expect(result.meta.memberLogBackfilled).toBeFalsy();
});

test('실시간 참여(joinLogged=true)로 이미 기록된 멤버는 백필 대상에서 제외되고, 그 외 미기록 멤버만 백필된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(async (tid) => {
    await tripMetaRef(tid).update({
      members: firebase.firestore.FieldValue.arrayUnion('u2', 'u3'),
      'memberNames.u2': '멤버투', 'memberNames.u3': '멤버쓰리',
      'joinLogged.u2': true, // u2 는 이미 실시간 참여로 기록됨(시뮬레이션)
    });
    await refreshTripList();
    await backfillMemberLogOnce();
  }, tripId);

  const content = await page.evaluate((tid) => tripContentRef(tid).get().then(s => s.data()), tripId);
  const names = Object.values(content.memberLog || {}).map(e => e.name);
  expect(names).not.toContain('멤버투'); // 이미 joinLogged 였던 u2 는 중복 기록되지 않음
  expect(names).toContain('멤버쓰리'); // 미기록이었던 u3 만 백필됨
});
