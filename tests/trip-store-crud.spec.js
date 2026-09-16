const { test, expect } = require('./support/fixtures');

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
