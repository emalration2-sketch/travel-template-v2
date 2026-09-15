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
  await page.evaluate(() => document.fonts.ready);
}

test('링크: 롱프레스 후 드래그로 순서 변경', async ({ page }) => {
  await setup(page);
  const first = page.locator('.link-card[data-link-id="l1"]');
  const last = page.locator('.link-card[data-link-id="l3"]');
  const b1 = await first.boundingBox();
  const b3 = await last.boundingBox();
  // 카드 정중앙은 편집모드 입력칸(.link-label/.link-url) 위일 수 있으므로,
  // 입력칸이 없는 카드 바깥쪽 여백(패딩) 쪽을 눌러서 드래그를 시작한다.
  await page.mouse.move(b1.x + 6, b1.y + 6);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(first).toHaveClass(/dragging/);
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height + 30, { steps: 8 });
  await page.mouse.up();

  const ids = await page.locator('#linksContainer .link-card').evaluateAll(els => els.map(e => e.dataset.linkId));
  expect(ids).toEqual(['l2', 'l3', 'l1']);
  const savedOrder = await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('ttv2-current-trip'));
    return JSON.parse(cache.data).links.map(l => l.id);
  });
  expect(savedOrder).toEqual(['l2', 'l3', 'l1']);
});

test('링크: 보기 모드에서는 순서가 바뀌지 않고, 링크 탭은 그대로 열린다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => setMode('view'));
  const first = page.locator('.link-card[data-link-id="l1"]');
  const last = page.locator('.link-card[data-link-id="l3"]');
  const b1 = await first.boundingBox();
  const b3 = await last.boundingBox();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(first).not.toHaveClass(/dragging/);
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height + 30, { steps: 8 });
  await page.mouse.up();
  const ids = await page.locator('#linksContainer .link-card').evaluateAll(els => els.map(e => e.dataset.linkId));
  expect(ids).toEqual(['l1', 'l2', 'l3']);
});
