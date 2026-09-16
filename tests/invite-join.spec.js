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
