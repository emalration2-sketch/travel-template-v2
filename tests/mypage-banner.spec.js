const { test, expect } = require('./support/fixtures');

test('마이페이지: 이름과 "내 여행" 사이에 Travel Template 배너', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'홍길동', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();

  const banner = page.locator('.mp-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Travel Template');

  // DOM 순서: .mp-top → .mp-banner → .mp-h
  const order = await page.evaluate(() => {
    const kids = [...document.querySelector('section[data-screen="mypage"] .mp').children];
    return { top: kids.indexOf(document.querySelector('.mp-top')),
             banner: kids.indexOf(document.querySelector('.mp-banner')),
             h: kids.indexOf(document.querySelector('.mp-h')) };
  });
  expect(order.top).toBeLessThan(order.banner);
  expect(order.banner).toBeLessThan(order.h);

  // teal 배경
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.mp-banner')).backgroundColor);
  expect(bg).toBe('rgb(34, 127, 118)');
});
