const { test, expect } = require('./support/fixtures');

test('링크가 자료모음 탭 링크 그룹에 렌더', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[],
      links:[{id:'l1',label:'노선도',url:'https://ex.com'},{id:'l2',label:'예약메일',url:'https://ex2.com'}] }),
      title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await expect(page.locator('#editView-materials .mat-group-title').first()).toContainText('링크');
  await expect(page.locator('#editView-materials #linksContainer .link-card')).toHaveCount(2);
  await expect(page.locator('#editView-materials')).toContainText('이미지');
  await expect(page.locator('#attCount')).toHaveText('0 / 20');
});

test('링크 추가/삭제가 자료모음에서 동작', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await page.locator('#editView-materials [data-action="add-link"]').click();
  await expect(page.locator('#editView-materials #linksContainer .link-card')).toHaveCount(1);
});
