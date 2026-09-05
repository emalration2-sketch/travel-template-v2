const { test, expect } = require('./support/fixtures');

test('표지에 소개 + 로그인 버튼', async ({ page }) => {
  await page.goto('/');
  const landing = page.locator('section[data-screen="landing"]');
  await expect(landing.getByText('Travel Template')).toBeVisible();
  await expect(landing.locator('#landingLoginBtn')).toBeVisible();
});

test('로그인 버튼 클릭 → mypage', async ({ page }) => {
  await page.goto('/');
  await page.locator('#landingLoginBtn').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
});
