const { test, expect } = require('./support/fixtures');
async function openEditor(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: 'A', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: 'A', dayCount: 1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('오프라인 편집 → 문구 두 개가 번갈아, 온라인 복귀 → 사라짐', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => window.__test.setOffline(true));
  await page.fill('#inputTitle', '오프라인편집');
  await page.dispatchEvent('#inputTitle', 'input');
  await page.waitForTimeout(1300);           // flush 시도 → 실패 → ticker 시작
  await expect(page.locator('#syncStatus')).toHaveText('클라우드 저장 안됨');
  await page.waitForTimeout(2100);
  await expect(page.locator('#syncStatus')).toHaveText('인터넷 연결 확인');
  // 로컬엔 남아있다
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('ttv2-current-trip')));
  expect(JSON.parse(cached.data).title).toBe('오프라인편집');
  // 복귀
  await page.evaluate(() => window.__test.setOffline(false));
  await page.fill('#inputTitle', '복구됨');
  await page.dispatchEvent('#inputTitle', 'input');
  await page.waitForTimeout(1300);
  await expect(page.locator('#syncStatus')).toHaveText('');
  const raw = await page.evaluate(() => window.__test.dump()['users/u1/trips/t1']);
  expect(raw.title).toBe('복구됨');
});
