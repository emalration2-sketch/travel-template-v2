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

test('URL 미입력 링크는 보기모드에서 href 없는 비활성 상태 (튕김 버그 회귀)', async ({ page }) => {
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

  // 링크 추가만 하고 라벨·URL 둘 다 미입력 상태로 둠
  await page.locator('#editView-materials [data-action="add-link"]').click();
  const linkBtn = page.locator('#editView-materials .link-btn');

  await page.evaluate(() => setMode('view'));
  // href="#" 로 남으면 모바일 웹뷰에서 튕김을 유발 — href 자체가 없어야 함
  await expect(linkBtn).not.toHaveAttribute('href');
  await expect(linkBtn).not.toHaveAttribute('target');

  // 수정모드로 돌아가 URL 을 입력하면 실시간으로 href 가 생겨야 함
  await page.evaluate(() => setMode('edit'));
  await page.locator('#editView-materials .link-url').fill('https://example.com');
  await expect(linkBtn).toHaveAttribute('href', 'https://example.com');
  await expect(linkBtn).toHaveAttribute('target', '_blank');

  // URL 을 다시 지우면 href 가 제거되어야 함 (남아있으면 재현 버그와 동일한 상태)
  await page.locator('#editView-materials .link-url').fill('');
  await expect(linkBtn).not.toHaveAttribute('href');
});
