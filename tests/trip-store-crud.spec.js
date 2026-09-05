const { test, expect } = require('./support/fixtures');

async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('createTrip → listTrips 에 메타와 함께 등장, tripOrder 갱신', async ({ page }) => {
  await signedIn(page);
  const id = await page.evaluate(() => createTrip());
  expect(typeof id).toBe('string');
  const list = await page.evaluate(() => listTrips());
  expect(list.length).toBe(1);
  expect(list[0]).toMatchObject({ id, title: '', startDate: '', endDate: '', dayCount: 1 });
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual([id]);
});

test('loadTrip 은 저장된 상태를 파싱해 돌려준다', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => window.__test.seed('users/u1/trips/t9', {
    data: JSON.stringify({ title: '제주', travelers: ['나'], days: [{ id: 'd1', date: '2026-01-05', label: '', items: [] }], notes: [], links: [] }),
    title: '제주', startDate: '2026-01-05', endDate: '2026-01-05', dayCount: 1,
  }));
  const st = await page.evaluate(() => loadTrip('t9'));
  expect(st.title).toBe('제주');
  expect(st.days[0].date).toBe('2026-01-05');
});
