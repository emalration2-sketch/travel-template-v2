const { test, expect } = require('./support/fixtures');

async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('문서 없으면 기본값', async ({ page }) => {
  await signedIn(page);
  const p = await page.evaluate(() => loadProfile());
  expect(p).toEqual({ avatarId: 'default', tripOrder: [], theme: 'a', lang: 'ko' });
});

test('saveProfile 후 재로드 round-trip', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => saveProfile({ avatarId: 'fox', tripOrder: ['t1', 't2'] }));
  const raw = await page.evaluate(() => window.__test.dump()['users/u1']);
  expect(raw).toMatchObject({ avatarId: 'fox', tripOrder: ['t1', 't2'] });
  const p = await page.evaluate(() => loadProfile());
  expect(p).toEqual({ avatarId: 'fox', tripOrder: ['t1', 't2'], theme: 'a', lang: 'ko' });
});
