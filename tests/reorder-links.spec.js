const { test, expect } = require('./support/fixtures');

async function setup(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', {
      data: JSON.stringify({ title: 'T', travelers: ['나'], days: [{ id: 'd1', date: '', label: '', items: [] }],
        notes: [], links: [
          { id: 'l1', label: '숙소', url: 'https://a.com' },
          { id: 'l2', label: '항공권', url: 'https://b.com' },
          { id: 'l3', label: '입장권', url: 'https://c.com' },
        ], attachments: [] }),
      title: 'T', dayCount: 1,
    });
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.evaluate(() => setMode('edit'));
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await expect(page.locator('.link-card')).toHaveCount(3);
}

test('링크: 가운데 항목 ▲ → 위로', async ({ page }) => {
  await setup(page);
  await page.locator('.link-card[data-link-id="l2"] [data-action="move-link-up"]').click();
  const ids = await page.locator('#linksContainer .link-card').evaluateAll(els => els.map(e => e.dataset.linkId));
  expect(ids).toEqual(['l2', 'l1', 'l3']);
  const savedOrder = await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('ttv2-current-trip'));
    return JSON.parse(cache.data).links.map(l => l.id);
  });
  expect(savedOrder).toEqual(['l2', 'l1', 'l3']);
});

test('링크: 맨 위 ▲ 비활성, 맨 아래 ▼ 비활성', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.link-card[data-link-id="l1"] [data-action="move-link-up"]')).toBeDisabled();
  await expect(page.locator('.link-card[data-link-id="l3"] [data-action="move-link-down"]')).toBeDisabled();
});

test('링크: 보기 모드에서는 화살표(.link-edit 전체)가 보이지 않는다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => setMode('view'));
  await expect(page.locator('.link-card[data-link-id="l1"] [data-action="move-link-down"]')).toBeHidden();
});
