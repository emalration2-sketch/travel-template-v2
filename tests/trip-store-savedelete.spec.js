const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('saveTrip 은 data + 메타를 함께 쓴다', async ({ page }) => {
  await signedIn(page);
  const id = await page.evaluate(() => createTrip());
  await page.evaluate((id) => saveTrip(id, {
    title: '도쿄', travelers: ['나'],
    days: [{ id: 'd1', date: '2026-04-01', label: '', items: [] }, { id: 'd2', date: '2026-04-03', label: '', items: [] }],
    notes: [], links: [],
  }), id);
  const raw = await page.evaluate((id) => window.__test.dump()['users/u1/trips/' + id], id);
  expect(raw).toMatchObject({ title: '도쿄', startDate: '2026-04-01', endDate: '2026-04-03', dayCount: 2 });
  expect(JSON.parse(raw.data).title).toBe('도쿄');
});

test('deleteTrip 은 문서와 tripOrder 에서 제거', async ({ page }) => {
  await signedIn(page);
  const a = await page.evaluate(() => createTrip());
  const b = await page.evaluate(() => createTrip());
  await page.evaluate((a) => deleteTrip(a), a);
  expect(await page.evaluate((a) => window.__test.dump()['users/u1/trips/' + a], a)).toBeUndefined();
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual([b]);
});
