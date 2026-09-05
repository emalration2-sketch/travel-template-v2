const { test, expect } = require('./support/fixtures');
async function setup(page, order){
  await page.goto('/');
  await page.evaluate((order) => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: order });
    order.forEach(id => window.__test.seed('users/u1/trips/' + id, {
      data: JSON.stringify({ title: id.toUpperCase(), travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }),
      title: id.toUpperCase(), dayCount: 1,
    }));
  }, order);
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  // 웹폰트 로드 완료를 기다림 — boundingBox 좌표가 로드 후 리플로우로 어긋나는 것 방지
  await page.evaluate(() => document.fonts.ready);
}

test('롱프레스 후 드래그로 순서 변경', async ({ page }) => {
  await setup(page, ['a', 'b', 'c']);
  const first = page.locator('.mp-card[data-trip-id="a"]');
  const third = page.locator('.mp-card[data-trip-id="c"]');
  const b1 = await first.boundingBox();
  const b3 = await third.boundingBox();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);                       // 롱프레스 임계 통과
  await expect(first).toHaveClass(/dragging/);
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2, { steps: 8 });
  await page.mouse.up();
  const ids = await page.locator('.mp-card').evaluateAll(els => els.map(e => e.dataset.tripId));
  expect(ids).toEqual(['b', 'c', 'a']);
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual(['b', 'c', 'a']);
});

test('빠른 탭(롱프레스 아님) → 여행 열기', async ({ page }) => {
  await setup(page, ['a', 'b']);
  await page.locator('.mp-card[data-trip-id="b"] .mp-title').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await expect(page.locator('#inputTitle')).toHaveValue('B');
});
