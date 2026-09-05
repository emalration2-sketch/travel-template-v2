const { test, expect } = require('./support/fixtures');
test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('showScreen 이 한 화면만 보인다', async ({ page }) => {
  await page.evaluate(() => showScreen('mypage'));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('section[data-screen="editor"]')).toBeHidden();
  await expect(page.locator('section[data-screen="landing"]')).toBeHidden();
  await page.evaluate(() => showScreen('editor'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await expect(page.locator('section[data-screen="mypage"]')).toBeHidden();
  expect(await page.evaluate(() => currentScreen)).toBe('editor');
});
