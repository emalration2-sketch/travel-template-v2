const { test, expect } = require('./support/fixtures');

test('로그아웃 상태 → landing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();
});

test('로그인 → mypage, 로그아웃 → landing', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => window.__test.signOut());
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();
});
