const { test, expect } = require('./support/fixtures');

test('deleteTrip 이 att 하위 문서도 삭제', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1','t2'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'A', days:[], notes:[], links:[], attachments:[{id:'a1',name:'x'}] }), title:'A', dayCount:0 });
    window.__test.seed('users/u1/trips/t2', { data: JSON.stringify({ title:'B', days:[], notes:[], links:[] }), title:'B', dayCount:0 });
    window.__test.seed('users/u1/trips/t1/att/a1', { name:'x', data:'data:image/jpeg;base64,AA' });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); await deleteTrip('t1'); });
  const dump = await page.evaluate(() => window.__test.dump());
  expect(dump['users/u1/trips/t1']).toBeUndefined();
  expect(dump['users/u1/trips/t1/att/a1']).toBeUndefined();
});
