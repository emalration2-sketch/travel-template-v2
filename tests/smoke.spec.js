const { test, expect } = require('./support/fixtures');

test('페이지가 스텁과 함께 로드된다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.__test)).toBe('object');
  expect(await page.evaluate(() => typeof firebase.firestore)).toBe('function');
  expect(errors).toEqual([]);
});
