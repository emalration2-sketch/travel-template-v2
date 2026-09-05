const { test, expect } = require('./support/fixtures');

test('dirty 로컬 캐시가 있으면 그 버전으로 열고 클라우드에 밀어올린다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: '클라우드제목', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: '클라우드제목', dayCount: 1 });
    localStorage.setItem('ttv2-current-trip', JSON.stringify({
      tripId: 't1',
      data: JSON.stringify({ title: '로컬미저장제목', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }),
      dirty: true, localUpdatedAt: Date.now(),
    }));
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('#inputTitle')).toHaveValue('로컬미저장제목');
  await page.waitForTimeout(300);
  const raw = await page.evaluate(() => window.__test.dump()['users/u1/trips/t1']);
  expect(raw.title).toBe('로컬미저장제목');
});

test('캐시가 다른 여행 것이면 클라우드 버전으로 연다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: '클라우드', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: '클라우드', dayCount: 1 });
    localStorage.setItem('ttv2-current-trip', JSON.stringify({ tripId: 'OTHER', data: JSON.stringify({ title: '엉뚱', days: [] }), dirty: true, localUpdatedAt: Date.now() }));
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('#inputTitle')).toHaveValue('클라우드');
});
