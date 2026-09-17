const { test, expect } = require('./support/fixtures');

// backfillJoinNotesOnce(): 참여 노트 기능이 생기기 전에 이미 참여해 있던 멤버들에게
// 소급으로 "참여했습니다" 노트를 한 번만 붙여주는 일회성 백필.
// 실제 조인 플로우(joinTrip)를 거치지 않고 tripMetaRef 를 직접 patch 해서
// "기능이 생기기 전에 이미 멤버였던 사람"을 흉내낸다.

test('오너 소유 여행: 비오너 멤버 2명 → 각자 이름이 담긴 노트가 하나씩 생기고 noteOrder/플래그가 갱신된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  // joinTrip 을 거치지 않고 멤버만 직접 추가 — "노트 기능 이전에 참여한 멤버" 시뮬레이션
  await page.evaluate(async (tid) => {
    await tripMetaRef(tid).update({
      members: firebase.firestore.FieldValue.arrayUnion('u2', 'u3'),
      'memberNames.u2': '멤버투',
      'memberNames.u3': '멤버쓰리',
    });
    await refreshTripList();
  }, tripId);

  const result = await page.evaluate(async (tid) => {
    await backfillJoinNotesOnce();
    const contentSnap = await tripContentRef(tid).get();
    const metaSnap = await tripMetaRef(tid).get();
    return { content: contentSnap.data(), meta: metaSnap.data() };
  }, tripId);

  const noteIds = Object.keys(result.content.notes || {});
  expect(noteIds.length).toBe(2);
  const contents = noteIds.map(id => result.content.notes[id].content);
  expect(contents.some(c => c.includes('멤버투'))).toBe(true);
  expect(contents.some(c => c.includes('멤버쓰리'))).toBe(true);
  noteIds.forEach(id => expect(result.content.noteOrder).toContain(id));
  expect(result.meta.joinNotesBackfilled).toBe(true);
});

test('멱등성: 같은 여행에 두 번째로 실행해도 노트가 추가로 생기지 않는다', async ({ page }) => {
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
    await backfillJoinNotesOnce();
  }, tripId);

  const countBefore = await page.evaluate((tid) =>
    tripContentRef(tid).get().then(s => Object.keys(s.data().notes || {}).length), tripId);
  expect(countBefore).toBe(1);

  // 두 번째 실행
  await page.evaluate(() => backfillJoinNotesOnce());
  const countAfter = await page.evaluate((tid) =>
    tripContentRef(tid).get().then(s => Object.keys(s.data().notes || {}).length), tripId);
  expect(countAfter).toBe(1);
});

test('이미 joinNotesBackfilled 가 true 인 여행은 처음부터 손대지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(async (tid) => {
    await tripMetaRef(tid).update({
      members: firebase.firestore.FieldValue.arrayUnion('u2'),
      'memberNames.u2': '멤버투',
      joinNotesBackfilled: true,
    });
    await refreshTripList();
  }, tripId);

  const result = await page.evaluate(async (tid) => {
    await backfillJoinNotesOnce();
    const contentSnap = await tripContentRef(tid).get();
    const metaSnap = await tripMetaRef(tid).get();
    return { content: contentSnap.data(), meta: metaSnap.data() };
  }, tripId);

  expect(Object.keys(result.content.notes || {}).length).toBe(0);
  expect(result.meta.joinNotesBackfilled).toBe(true);
  expect(result.meta.members).toContain('u2'); // 멤버 목록 자체는 그대로
});

test('오너 혼자뿐인 여행: 새 노트는 0개지만 joinNotesBackfilled 는 true 로 마킹된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(() => refreshTripList());

  const result = await page.evaluate(async (tid) => {
    await backfillJoinNotesOnce();
    const contentSnap = await tripContentRef(tid).get();
    const metaSnap = await tripMetaRef(tid).get();
    return { content: contentSnap.data(), meta: metaSnap.data() };
  }, tripId);

  expect(Object.keys(result.content.notes || {}).length).toBe(0);
  expect(result.meta.joinNotesBackfilled).toBe(true);
});

test('내가 오너가 아닌(멤버로만 속한) 여행은 내 계정으로 백필을 돌려도 건드리지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn()); // u1 = 오너
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  // u2 를 노트 기능 이전 방식으로 멤버에 직접 추가(플래그 없음)
  await page.evaluate(async (tid) => {
    await tripMetaRef(tid).update({
      members: firebase.firestore.FieldValue.arrayUnion('u2'),
      'memberNames.u2': '멤버투',
    });
  }, tripId);

  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '멤버투', email: 'u2@example.com' }));
  await page.waitForTimeout(50); // handleAuthChange 가 refreshTripList + backfillJoinNotesOnce 를 이미 한 번 자동 실행함

  const result = await page.evaluate(async (tid) => {
    await backfillJoinNotesOnce(); // u2 계정으로 명시적으로 한 번 더 실행 — 오너가 아니므로 여전히 스킵되어야 함
    const contentSnap = await tripContentRef(tid).get();
    const metaSnap = await tripMetaRef(tid).get();
    return { content: contentSnap.data(), meta: metaSnap.data() };
  }, tripId);

  expect(Object.keys(result.content.notes || {}).length).toBe(0);
  expect(result.meta.joinNotesBackfilled).toBeFalsy();
});
