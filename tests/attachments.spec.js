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

test('이미지 추가 → att 문서 + state.attachments + 여행문서', async ({ page }) => {
  await openMaterials(page, []);
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 40;
    c.getContext('2d').fillRect(0,0,40,40);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await addAttachment(new File([blob], '탑승권.png', { type:'image/png' }));
  });
  await expect(page.locator('#attList .att-row')).toHaveCount(1);
  await expect(page.locator('#attCount')).toHaveText('1 / 20');
  const dump = await page.evaluate(() => window.__test.dump());
  const attKey = Object.keys(dump).find(k => k.startsWith('users/u1/trips/t1/att/'));
  expect(attKey).toBeTruthy();
  expect(dump[attKey].data).toMatch(/^data:image\/jpeg/);
  expect(dump[attKey].name).toBe('탑승권');
  await page.waitForTimeout(1300);
  const dump2 = await page.evaluate(() => window.__test.dump());
  expect(JSON.parse(dump2['users/u1/trips/t1'].data).attachments.length).toBe(1);
});

test('20장이면 추가 버튼 비활성 + 추가 안 됨', async ({ page }) => {
  const many = Array.from({length:20}, (_,i) => ({id:'x'+i, name:'img'+i}));
  await openMaterials(page, many);
  await expect(page.locator('#attAddBtn')).toBeDisabled();
  const before = await page.evaluate(() => state.attachments.length);
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width=10; c.height=10; c.getContext('2d').fillRect(0,0,10,10);
    const blob = await new Promise(r => c.toBlob(r,'image/png'));
    await addAttachment(new File([blob], 'over.png', {type:'image/png'}));
  });
  expect(await page.evaluate(() => state.attachments.length)).toBe(before);
});

test('오프라인이면 이미지 추가 실패 + 상태 불변', async ({ page }) => {
  await openMaterials(page, []);
  page.on('dialog', d => d.accept());
  await page.evaluate(() => window.__test.setOffline(true));
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width=10; c.height=10; c.getContext('2d').fillRect(0,0,10,10);
    const blob = await new Promise(r => c.toBlob(r,'image/png'));
    await addAttachment(new File([blob], 'x.png', {type:'image/png'}));
  });
  expect(await page.evaluate(() => state.attachments.length)).toBe(0);
});

test('이미지 삭제 — 확인 모달 → att 문서 + state 제거', async ({ page }) => {
  await openMaterials(page, [{id:'a1',name:'탑승권'},{id:'a2',name:'입장권'}]);
  await page.evaluate(() => window.__test.seed('users/u1/trips/t1/att/a1', { name:'탑승권', data:'data:image/jpeg;base64,AA' }));
  await page.locator('.att-row[data-att-id="a1"] .att-del').click();
  await expect(page.locator('#v2ModalBody')).toContainText('이 이미지를 삭제할까요?');
  await page.locator('#v2Modal').getByText('삭제', { exact:true }).click();
  await expect(page.locator('#attList .att-row')).toHaveCount(1);
  expect(await page.evaluate(() => state.attachments.map(a => a.id))).toEqual(['a2']);
  expect(await page.evaluate(() => window.__test.dump()['users/u1/trips/t1/att/a1'])).toBeUndefined();
});

test('이름 수정 → att 문서 + state 갱신', async ({ page }) => {
  await openMaterials(page, [{id:'a1',name:'탑승권'}]);
  await page.evaluate(() => window.__test.seed('users/u1/trips/t1/att/a1', { name:'탑승권', data:'data:image/jpeg;base64,AA' }));
  const input = page.locator('.att-row[data-att-id="a1"] .att-name');
  await input.fill('대한항공 탑승권');
  await input.dispatchEvent('change');
  expect(await page.evaluate(() => state.attachments[0].name)).toBe('대한항공 탑승권');
  await expect.poll(() => page.evaluate(() => (window.__test.dump()['users/u1/trips/t1/att/a1']||{}).name)).toBe('대한항공 탑승권');
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

test('compressImage — 대형 그라디언트 1600x1600 도 리사이즈 + 700KB 이하', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1600;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 1600, 1600);
    g.addColorStop(0, '#ff0000'); g.addColorStop(0.5, '#00ff88'); g.addColorStop(1, '#0033ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1600, 1600);
    // 노이즈를 조금 더해 압축이 지나치게 작아지지 않도록
    for(let i = 0; i < 4000; i++){
      ctx.fillStyle = `rgb(${(i*7)%255},${(i*13)%255},${(i*29)%255})`;
      ctx.fillRect((i*97)%1600, (i*53)%1600, 3, 3);
    }
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const file = new File([blob], 'big.png', { type: 'image/png' });
    const out = await compressImage(file);
    const img = new Image(); img.src = out.dataUrl;
    await new Promise(res => { img.onload = res; });
    return { w: img.naturalWidth, h: img.naturalHeight, bytes: out.bytes };
  });
  expect(r.w).toBeLessThanOrEqual(1400);
  expect(r.h).toBeLessThanOrEqual(1400);
  expect(r.bytes).toBeLessThanOrEqual(700 * 1024);
});
