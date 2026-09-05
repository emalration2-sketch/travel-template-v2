const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('여행 0개 — 카운트 0/5, 카드 없음', async ({ page }) => {
  await signedIn(page);
  await expect(page.locator('#mpCount')).toHaveText('0 / 5');
  expect(await page.locator('.mp-card').count()).toBe(0);
  await expect(page.locator('#mpNewBtn')).toBeVisible();
  await expect(page.locator('#mpName')).toHaveText('김진');
});

test('여행 2개 — tripOrder 순서대로 카드, 빈 값 처리', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['b', 'a'] });
    window.__test.seed('users/u1/trips/a', { title: '오사카', startDate: '2026-03-14', endDate: '2026-03-17', dayCount: 4 });
    window.__test.seed('users/u1/trips/b', { title: '', startDate: '', endDate: '', dayCount: 3 });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await expect(page.locator('#mpCount')).toHaveText('2 / 5');
  const cards = page.locator('.mp-card');
  await expect(cards.nth(0)).toHaveAttribute('data-trip-id', 'b');
  await expect(cards.nth(0)).toContainText('제목 없는 여행');
  await expect(cards.nth(0)).toContainText('날짜 미정');
  await expect(cards.nth(0)).toContainText('3일');
  await expect(cards.nth(1)).toContainText('오사카');
  await expect(cards.nth(1)).toContainText('2026-03-14');
});
