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
  expect(bg).toBe('rgb(28, 122, 111)');  // --teal #1C7A6F (theme A)
});

test('배너: 태그라인 + 브랜드 골드 ✈ + 테마별 배경', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'홍길동', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();

  await expect(page.locator('.mp-banner .mpb-tag')).toHaveText('여행의 모든 순간을 한 곳에');

  // ✈ 는 전 테마 #DE9A34 = rgb(222, 154, 52)
  for(const t of ['a','c','d']){
    const c = await page.evaluate((th) => {
      document.documentElement.dataset.theme = th;
      return getComputedStyle(document.querySelector('.mp-banner .mpb-plane')).color;
    }, t);
    expect(c, t).toBe('rgb(222, 154, 52)');
  }

  // c = 단색, d = 그라디언트(background-image != none)
  const c_img = await page.evaluate(() => { document.documentElement.dataset.theme='c';
    return getComputedStyle(document.querySelector('.mp-banner')).backgroundImage; });
  const d_img = await page.evaluate(() => { document.documentElement.dataset.theme='d';
    return getComputedStyle(document.querySelector('.mp-banner')).backgroundImage; });
  expect(c_img).toBe('none');
  expect(d_img).toContain('gradient');
});
