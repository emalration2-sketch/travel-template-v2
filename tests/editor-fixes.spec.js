const { test, expect } = require('./support/fixtures');

test('PDF: loadPdfLibs 존재 + 옛 html2pdf 참조 없음', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => typeof loadPdfLibs)).toBe('function');
  expect(await page.evaluate(() => typeof window.loadHtml2Pdf)).toBe('undefined');
  // exportPDF 소스가 loadPdfLibs 를 부르는지 (함수 문자열 검사)
  const src = await page.evaluate(() => exportPDF.toString());
  expect(src).toContain('loadPdfLibs');
  expect(src).not.toContain('loadHtml2Pdf');
});

test('PDF: loadPdfLibs 가 jsPDF+html2canvas 전역을 갖춘다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => loadPdfLibs());
  await expect.poll(() => page.evaluate(() => typeof (window.jspdf && window.jspdf.jsPDF))).toBe('function');
  expect(await page.evaluate(() => typeof window.html2canvas)).toBe('function');
  // 실제 jsPDF 인스턴스가 exportPDF 가 쓰는 메서드를 갖는지
  const m = await page.evaluate(() => { const { jsPDF } = window.jspdf; const d = new jsPDF('p','mm','a4');
    return [typeof d.addImage, typeof d.splitTextToSize, typeof d.text, typeof d.save].join(','); });
  expect(m).toBe('function,function,function,function');
});

async function openTrip1(page, seedAtt = [{id:'a1',name:'IMG_1'}]){
  await page.goto('/');
  await page.evaluate((att) => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[], attachments: att }), title:'X', dayCount:1 });
    att.forEach(a => window.__test.seed('users/u1/trips/t1/att/'+a.id, { name:a.name, data:'data:image/jpeg;base64,AA' }));
  }, seedAtt);
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('이미지 이름: 보기모드 재렌더 후에도 잠김, 수정모드는 편집 가능', async ({ page }) => {
  await openTrip1(page);
  // 보기모드 전환 후 자료모음 첫 진입(→ ensureAttachmentsLoaded → renderMaterials 재렌더)
  await page.evaluate(() => setMode('view'));
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await expect.poll(() => page.evaluate(() => { const el=document.querySelector('#attList .att-name'); return el && el.disabled; })).toBe(true);
  // 수정모드로
  await page.evaluate(() => setMode('edit'));
  expect(await page.evaluate(() => document.querySelector('#attList .att-name').disabled)).toBe(false);
  // 수정모드에서 renderMaterials 재호출해도 편집 가능 유지
  await page.evaluate(() => renderMaterials());
  expect(await page.evaluate(() => document.querySelector('#attList .att-name').disabled)).toBe(false);
});

test('초기화 버튼: 일정 뷰 안, 링크형, 푸터엔 없음', async ({ page }) => {
  await openTrip1(page);
  expect(await page.locator('#editView-schedule .reset-link[data-action="reset"]').count()).toBe(1);
  expect(await page.locator('footer .foot-btns.foot-edit').count()).toBe(0);
  expect(await page.locator('footer .foot-btns.foot-view').count()).toBe(1); // PDF/공유 유지
  // 보기모드에선 숨김
  await page.evaluate(() => setMode('view'));
  await expect(page.locator('#editView-schedule .reset-link')).toBeHidden();
  await page.evaluate(() => setMode('edit'));
  await expect(page.locator('#editView-schedule .reset-link')).toBeVisible();
});

test('힌트 문구 줄바꿈', async ({ page }) => {
  await page.goto('/');
  const html = await page.evaluate(() => [...document.querySelectorAll('footer .foot-note')].map(n => n.innerHTML).join('|'));
  expect(html).toContain('<br>');
  expect(html).toContain('[보기모드]에서는 조회만 가능합니다');
});

test('동행자 칩: 보기모드 좌우 여백 대칭', async ({ page }) => {
  await openTrip1(page);
  await page.evaluate(() => { state.travelers = ['나','길동']; renderTravelers(); setMode('view'); });
  const pad = await page.evaluate(() => { const c = document.querySelector('#travelersWrap .chip');
    const s = getComputedStyle(c); return { l: s.paddingLeft, r: s.paddingRight }; });
  expect(pad.l).toBe(pad.r);
});

test('마이페이지 카드: user-select none', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { title:'A', dayCount:1 });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  const us = await page.evaluate(() => getComputedStyle(document.querySelector('.mp-card')).userSelect
    || getComputedStyle(document.querySelector('.mp-card')).webkitUserSelect);
  expect(us).toBe('none');
});

test('모드 색 띠: 수정=teal, 보기=ink-soft', async ({ page }) => {
  await openTrip1(page);
  await page.evaluate(() => setMode('edit'));
  const edit = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).borderBottomColor);
  await page.evaluate(() => setMode('view'));
  const view = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).borderBottomColor);
  expect(edit).not.toBe(view);
  expect(edit).toBe('rgb(34, 127, 118)');   // --teal #227F76
  expect(view).toBe('rgb(74, 81, 120)');    // --ink-soft #4A5178
});
