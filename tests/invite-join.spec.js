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

test('?join= 값에 /(경로 구분자)가 섞여 있으면 무시하고 joinTrip 을 호출하지 않는다(경로 탈출 방지)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '초대받은사람', email: 'u2@example.com' }));
  // tripId 뒤에 /content/main 을 이어붙여 실제 콘텐츠 문서 경로로 향하게 만든 악성 join 값
  const maliciousJoin = encodeURIComponent(tripId + '/content/main');
  await page.goto('/?join=' + maliciousJoin);
  await page.waitForTimeout(50);
  const result = await page.evaluate(async (tid) => {
    const metaSnap = await tripMetaRef(tid).get();
    return { members: metaSnap.data().members, currentScreen, currentTripId, url: location.href };
  }, tripId);
  expect(result.members).toEqual(['u1']); // u2 가 추가되지 않았어야 함
  expect(result.currentTripId).not.toBe(tripId); // 해당 여행이 열리지 않았어야 함
  expect(result.currentScreen).toBe('mypage'); // editor 로 넘어가지 않음(크래시 없이 조용히 무시)
  expect(result.url).not.toContain('join='); // 쿼리 파라미터는 정리됨
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
