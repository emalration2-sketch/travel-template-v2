const { test, expect } = require('./support/fixtures');

async function openMaterials(page, attachments = []){
  await page.goto('/');
  await page.evaluate((att) => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[], attachments: att }),
      title:'X', dayCount:1 });
  }, attachments);
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
}

test('이미지 그룹이 state.attachments 로부터 렌더', async ({ page }) => {
  await openMaterials(page, [{id:'a1',name:'탑승권'},{id:'a2',name:'입장권 QR'}]);
  await expect(page.locator('#attCount')).toHaveText('2 / 20');
  await expect(page.locator('#attList .att-row')).toHaveCount(2);
  // 이름은 .att-name input 의 value 로 렌더된다 (toContainText 는 input value 를 읽지 않음)
  await expect(page.locator('#attList .att-row').first().locator('.att-name')).toHaveValue('탑승권');
});

test('이미지 행 탭 → 뷰어 열림, 닫기 → 리스트', async ({ page }) => {
  await openMaterials(page, [{id:'a1',name:'탑승권'}]);
  await page.evaluate(() => { attachmentsCache['a1'] = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='; });
  // 행 좌측 패딩 영역(=att-row 자체) 탭 → 뷰어 열림. .att-name input 탭은 가드로 무시됨.
  await page.locator('#attList .att-row').first().click({ position: { x: 4, y: 10 } });
  await expect(page.locator('#attViewer')).toBeVisible();
  await expect(page.locator('#attViewerImg')).toHaveAttribute('src', /^data:image\/jpeg/);
  await page.locator('#attViewerClose').click();
  await expect(page.locator('#attViewer')).toBeHidden();
});

test('뷰 모드: 행 가운데(.att-name 위치) 탭도 뷰어를 연다', async ({ page }) => {
  await openMaterials(page, [{id:'a1',name:'탑승권'}]);
  await page.evaluate(() => { attachmentsCache['a1'] = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='; });
  await page.evaluate(() => setMode('view'));
  // position 오프셋 없이 행 중앙 클릭 → .att-name(disabled) 가 pointer-events:none 이라 .att-row 로 폴스루
  await page.locator('#attList .att-row').first().click();
  await expect(page.locator('#attViewer')).toBeVisible();
  await expect(page.locator('#attViewerImg')).toHaveAttribute('src', /^data:image\/jpeg/);
  await page.locator('#attViewerClose').click();
  await expect(page.locator('#attViewer')).toBeHidden();
});

test('.att-name input 탭은 뷰어를 열지 않는다', async ({ page }) => {
  await openMaterials(page, [{id:'a1',name:'탑승권'}]);
  await page.evaluate(() => { attachmentsCache['a1'] = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='; });
  await page.locator('#attList .att-row').first().locator('.att-name').click();
  await expect(page.locator('#attViewer')).toBeHidden();
});
