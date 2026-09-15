const { test, expect } = require('./support/fixtures');

async function setup(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', {
      data: JSON.stringify({ title: 'T', travelers: ['나'], days: [{ id: 'd1', date: '2026-01-01', label: '', items: [
        { id: 'i1', time: '09:00', place: '아침', memo: '', expenses: [] },
        { id: 'i2', time: '12:00', place: '점심', memo: '', expenses: [] },
        { id: 'i3', time: '18:00', place: '저녁', memo: '', expenses: [] },
      ] }], notes: [], links: [], attachments: [] }),
      title: 'T', dayCount: 1,
    });
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.evaluate(() => setMode('edit'));
  await expect(page.locator('.tl-item')).toHaveCount(3);
}

test('일정 항목: 가운데 항목 ▲ → 위로, 같은 일차 안에서만 이동', async ({ page }) => {
  await setup(page);
  await page.locator('.tl-item[data-item-id="i2"] [data-action="move-item-up"]').click();
  const ids = await page.locator('#daysContainer .tl-item').evaluateAll(els => els.map(e => e.dataset.itemId));
  expect(ids).toEqual(['i2', 'i1', 'i3']);
  const savedOrder = await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('ttv2-current-trip'));
    return JSON.parse(cache.data).days[0].items.map(i => i.id);
  });
  expect(savedOrder).toEqual(['i2', 'i1', 'i3']);
});

test('일정 항목: 맨 위 ▲ 비활성, 맨 아래 ▼ 비활성', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.tl-item[data-item-id="i1"] [data-action="move-item-up"]')).toBeDisabled();
  await expect(page.locator('.tl-item[data-item-id="i3"] [data-action="move-item-down"]')).toBeDisabled();
});

test('일정 항목: 보기 모드에서는 화살표가 보이지 않는다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => setMode('view'));
  await expect(page.locator('.tl-item[data-item-id="i1"] [data-action="move-item-down"]')).toBeHidden();
});
