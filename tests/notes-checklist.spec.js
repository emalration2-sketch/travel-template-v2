const { test, expect } = require('./support/fixtures');

async function openNotes(page, notes){
  await page.goto('/');
  await page.evaluate((notes) => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes, links:[] }), title:'X', dayCount:1 });
  }, notes);
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.locator('#editTabs .tab[data-tab="notes"]').click();
  await expect(page.locator('#editView-notes')).toBeVisible();
}

test('기존 텍스트 메모는 그대로 렌더 (하위호환)', async ({ page }) => {
  await openNotes(page, [{ id:'n1', title:'준비물', content:'여권\n충전기' }]);
  await expect(page.locator('.note-card .note-title')).toHaveValue('준비물');
  await expect(page.locator('.note-card .note-content')).toHaveValue('여권\n충전기');
  await expect(page.locator('.chk-list')).toHaveCount(0);
});

test('☑ 토글 → content 가 문단 단위로 체크리스트 항목이 된다', async ({ page }) => {
  await openNotes(page, [{ id:'n1', title:'준비물', content:'여권\n\n  충전기  \n우산' }]);
  await page.locator('.note-mode-switch[data-note-id="n1"]').click();
  const rows = page.locator('.chk-list .chk-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator('.chk-text')).toHaveValue('여권');
  await expect(rows.nth(1).locator('.chk-text')).toHaveValue('충전기');   // trim 됨
  await expect(rows.nth(2).locator('.chk-text')).toHaveValue('우산');
  await expect(page.locator('.note-mode-switch[data-note-id="n1"]')).toHaveText('메모로 되돌리기');
  const mode = await page.evaluate(() => state.notes[0].mode);
  expect(mode).toBe('checklist');
});

test('체크하면 완료 처리 + 하단 완료 섹션으로 이동 + 저장', async ({ page }) => {
  await openNotes(page, [{ id:'n1', title:'T', mode:'checklist', items:[
    { id:'i1', text:'A', done:false }, { id:'i2', text:'B', done:false }, { id:'i3', text:'C', done:false },
  ]}]);
  await expect(page.locator('.chk-list .chk-row')).toHaveCount(3);
  await expect(page.locator('.note-done-head')).toHaveCount(0);

  await page.locator('.chk-row[data-item-id="i2"] .chk-box').check();

  await expect(page.locator('.chk-list .chk-row')).toHaveCount(2);           // 미완료 2
  await expect(page.locator('.note-done-head')).toContainText('완료된 항목 1개');
  await expect(page.locator('.note-done-list .chk-row[data-item-id="i2"]')).toBeVisible();
  await expect(page.locator('.note-done-list .chk-row[data-item-id="i2"]')).toHaveClass(/done/);
  // state 반영
  const done = await page.evaluate(() => state.notes[0].items.find(i => i.id === 'i2').done);
  expect(done).toBe(true);
});

test('완료 섹션 접기/펼치기', async ({ page }) => {
  await openNotes(page, [{ id:'n1', title:'T', mode:'checklist', items:[
    { id:'i1', text:'A', done:true }, { id:'i2', text:'B', done:false },
  ]}]);
  await expect(page.locator('.note-done-list .chk-row')).toBeVisible();
  await page.locator('.note-done-head[data-note-id="n1"]').click();
  await expect(page.locator('.note-done-head')).toHaveClass(/collapsed/);
  await expect(page.locator('.note-done-list .chk-row')).toBeHidden();
  await page.locator('.note-done-head[data-note-id="n1"]').click();
  await expect(page.locator('.note-done-list .chk-row')).toBeVisible();
});

test('보기 모드에서도 체크 가능 (텍스트 편집·항목추가는 불가)', async ({ page }) => {
  await openNotes(page, [{ id:'n1', title:'T', mode:'checklist', items:[{ id:'i1', text:'A', done:false }] }]);
  await page.evaluate(() => setMode('view'));
  await expect(page.locator('.chk-add')).toBeHidden();
  await expect(page.locator('.chk-row[data-item-id="i1"] .chk-text')).toBeHidden();       // edit-only input
  await expect(page.locator('.chk-row[data-item-id="i1"] .chk-text-view')).toHaveText('A');
  const box = page.locator('.chk-row[data-item-id="i1"] .chk-box');
  await expect(box).toBeEnabled();
  await box.check();
  expect(await page.evaluate(() => state.notes[0].items[0].done)).toBe(true);
  await expect(page.locator('.note-done-list .chk-row[data-item-id="i1"]')).toBeVisible();
});

test('항목 추가 / 삭제', async ({ page }) => {
  await openNotes(page, [{ id:'n1', title:'T', mode:'checklist', items:[{ id:'i1', text:'A', done:false }] }]);
  await page.locator('.chk-add[data-note-id="n1"]').click();
  await expect(page.locator('.chk-list .chk-row')).toHaveCount(2);
  await page.locator('.chk-list .chk-row').nth(1).locator('.chk-text').fill('새 항목');
  await page.locator('.chk-list .chk-row').nth(1).locator('.chk-text').blur();
  expect(await page.evaluate(() => state.notes[0].items.map(i => i.text))).toEqual(['A', '새 항목']);

  await page.locator('.chk-row[data-item-id="i1"] .chk-del').click();
  await expect(page.locator('.chk-list .chk-row')).toHaveCount(1);
  expect(await page.evaluate(() => state.notes[0].items.map(i => i.text))).toEqual(['새 항목']);
});

test('체크리스트 → 텍스트 되돌리면 완료 항목에 (완료) 표시가 붙는다', async ({ page }) => {
  await openNotes(page, [{ id:'n1', title:'T', mode:'checklist', items:[
    { id:'i1', text:'하나', done:true }, { id:'i2', text:'둘', done:false },
  ]}]);
  await page.locator('.note-mode-switch[data-note-id="n1"]').click();
  await expect(page.locator('.note-card .note-content')).toHaveValue('하나 (완료)\n둘');
  expect(await page.evaluate(() => state.notes[0].mode)).toBe('text');
});

test('완료 상태가 메모↔체크리스트 왕복 후에도 유지된다', async ({ page }) => {
  await openNotes(page, [{ id:'n1', title:'T', mode:'checklist', items:[
    { id:'i1', text:'하나', done:true }, { id:'i2', text:'둘', done:false }, { id:'i3', text:'셋', done:true },
  ]}]);
  await page.locator('.note-mode-switch[data-note-id="n1"]').click();   // → 텍스트
  await page.locator('.note-mode-switch[data-note-id="n1"]').click();   // → 체크리스트
  const items = await page.evaluate(() => state.notes[0].items.map(i => ({ text:i.text, done:i.done })));
  expect(items).toEqual([
    { text:'하나', done:true }, { text:'둘', done:false }, { text:'셋', done:true },
  ]);
  await expect(page.locator('.note-done-head')).toHaveText(/완료된 항목 2개/);
});

test('메모에서 (완료) 를 지우면 체크리스트 복귀 시 미완료가 된다', async ({ page }) => {
  await openNotes(page, [{ id:'n1', title:'T', mode:'checklist', items:[
    { id:'i1', text:'하나', done:true }, { id:'i2', text:'둘', done:false },
  ]}]);
  await page.locator('.note-mode-switch[data-note-id="n1"]').click();   // → 텍스트
  await page.locator('.note-card .note-content').fill('하나\n둘');       // (완료) 제거
  await page.locator('.note-mode-switch[data-note-id="n1"]').click();   // → 체크리스트
  const done = await page.evaluate(() => state.notes[0].items.map(i => i.done));
  expect(done).toEqual([false, false]);
});

test('공유 HTML: 체크리스트 메모가 ☑/☐ 로 렌더 (완료는 뒤로)', async ({ page }) => {
  await openNotes(page, [{ id:'n1', title:'짐', mode:'checklist', items:[
    { id:'i1', text:'끝난거', done:true }, { id:'i2', text:'남은거', done:false },
  ]}]);
  const html = await page.evaluate(() => buildStaticGuideHTML(state));
  const body = html.slice(html.indexOf('메모'));
  expect(body).toContain('☐ 남은거');
  expect(body).toContain('☑ 끝난거');
  expect(body.indexOf('남은거')).toBeLessThan(body.indexOf('끝난거'));   // 미완료 먼저
});
