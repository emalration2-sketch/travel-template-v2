const { test, expect } = require('./support/fixtures');

async function setup(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', {
      data: JSON.stringify({ title: 'T', travelers: ['나'], days: [{ id: 'd1', date: '', label: '', items: [] }],
        notes: [
          { id: 'n1', title: '첫번째', content: '' },
          { id: 'n2', title: '두번째', content: '' },
          { id: 'n3', title: '세번째', content: '' },
        ], links: [], attachments: [] }),
      title: 'T', dayCount: 1,
    });
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.evaluate(() => setMode('edit'));
  await page.locator('#editTabs .tab[data-tab="notes"]').click();
  await expect(page.locator('.note-card')).toHaveCount(3);
}

test('메모: 가운데 항목 ▲ → 위로', async ({ page }) => {
  await setup(page);
  await page.locator('.note-card[data-note-id="n2"] [data-action="move-note-up"]').click();
  const ids = await page.locator('#notesContainer .note-card').evaluateAll(els => els.map(e => e.dataset.noteId));
  expect(ids).toEqual(['n2', 'n1', 'n3']);
  const savedOrder = await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('ttv2-current-trip'));
    return JSON.parse(cache.data).notes.map(n => n.id);
  });
  expect(savedOrder).toEqual(['n2', 'n1', 'n3']);
});

test('메모: 맨 위 ▲ 비활성, 맨 아래 ▼ 비활성', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.note-card[data-note-id="n1"] [data-action="move-note-up"]')).toBeDisabled();
  await expect(page.locator('.note-card[data-note-id="n3"] [data-action="move-note-down"]')).toBeDisabled();
});

test('메모: 보기 모드에서는 화살표가 보이지 않는다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => setMode('view'));
  await expect(page.locator('.note-card[data-note-id="n1"] [data-action="move-note-down"]')).toBeHidden();
});
