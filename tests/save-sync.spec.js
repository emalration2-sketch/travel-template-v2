const { test, expect } = require('./support/fixtures');
async function openEditor(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: '초기', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: '초기', dayCount: 1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('제목 편집 → 로컬 즉시, 클라우드는 ~1초 뒤', async ({ page }) => {
  await openEditor(page);
  await page.fill('#inputTitle', '삿포로');
  await page.dispatchEvent('#inputTitle', 'input');
  // 로컬 캐시 즉시
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('ttv2-current-trip')));
  expect(cached.tripId).toBe('t1');
  expect(JSON.parse(cached.data).title).toBe('삿포로');
  expect(cached.dirty).toBe(true);
  // 클라우드 반영 대기
  await page.waitForTimeout(1300);
  const raw = await page.evaluate(() => window.__test.dump()['users/u1/trips/t1']);
  expect(raw.title).toBe('삿포로');
  expect(JSON.parse(raw.data).title).toBe('삿포로');
  const c2 = await page.evaluate(() => JSON.parse(localStorage.getItem('ttv2-current-trip')));
  expect(c2.dirty).toBe(false);
});

test('구 v1 키를 더 이상 쓰지 않는다', async ({ page }) => {
  await openEditor(page);
  await page.fill('#inputTitle', 'x');
  await page.dispatchEvent('#inputTitle', 'input');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => localStorage.getItem('travel-template-data-v1'))).toBeNull();
});
