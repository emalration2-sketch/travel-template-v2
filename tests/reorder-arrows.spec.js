const { test, expect } = require('./support/fixtures');
async function setup(page, order){
  await page.goto('/');
  await page.evaluate((order) => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: order });
    order.forEach(id => window.__test.seed('users/u1/trips/' + id, { title: id.toUpperCase(), dayCount: 1 }));
  }, order);
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
}

test('가운데 항목 ▲ → 위로', async ({ page }) => {
  await setup(page, ['a', 'b', 'c']);
  await page.locator('.mp-card[data-trip-id="b"] [data-action="move-up"]').click();
  const ids = await page.locator('.mp-card').evaluateAll(els => els.map(e => e.dataset.tripId));
  expect(ids).toEqual(['b', 'a', 'c']);
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual(['b', 'a', 'c']);
});

test('맨 위 ▲ 비활성, 맨 아래 ▼ 비활성', async ({ page }) => {
  await setup(page, ['a', 'b']);
  await expect(page.locator('.mp-card[data-trip-id="a"] [data-action="move-up"]')).toBeDisabled();
  await expect(page.locator('.mp-card[data-trip-id="b"] [data-action="move-down"]')).toBeDisabled();
});
