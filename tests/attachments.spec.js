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

test('자료모음 첫 진입 시 att 하위 컬렉션 1회 로드', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[],
      attachments:[{id:'a1',name:'탑승권'}] }), title:'X', dayCount:1 });
    window.__test.seed('users/u1/trips/t1/att/a1', { name:'탑승권', mime:'image/jpeg', data:'data:image/jpeg;base64,AAAA' });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  // 아직 materials 안 열었으면 캐시 비어있음
  expect(await page.evaluate(() => Object.keys(attachmentsCache).length)).toBe(0);
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await expect.poll(() => page.evaluate(() => attachmentsCache['a1'] || '')).toContain('data:image/jpeg');
  expect(await page.evaluate(() => loadedAttTripId)).toBe('t1');
});

test('compressImage — 장변 1400 이하, 700KB 이하', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    // 2000x100 빨간 PNG 를 canvas 로 만들어 File 로
    const c = document.createElement('canvas'); c.width = 2000; c.height = 100;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#f00'; ctx.fillRect(0,0,2000,100);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const file = new File([blob], 'wide.png', { type: 'image/png' });
    const out = await compressImage(file);
    const img = new Image(); img.src = out.dataUrl;
    await new Promise(res => { img.onload = res; });
    return { w: img.naturalWidth, h: img.naturalHeight, bytes: out.bytes, mime: out.dataUrl.slice(5, 15) };
  });
  expect(r.w).toBeLessThanOrEqual(1400);
  expect(r.bytes).toBeLessThanOrEqual(700 * 1024);
  expect(r.mime).toContain('image/jpeg');
});
