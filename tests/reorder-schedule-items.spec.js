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
  await page.evaluate(() => document.fonts.ready);
}

test('일정 항목: 롱프레스 후 드래그로 같은 일차 안에서 순서 변경', async ({ page }) => {
  await setup(page);
  const first = page.locator('.tl-item[data-item-id="i1"]');
  const third = page.locator('.tl-item[data-item-id="i3"]');
  const b1 = await first.boundingBox();
  const b3 = await third.boundingBox();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(first).toHaveClass(/dragging/);
  // 마지막 항목의 중앙이 아니라 "그 아래로 확실히 지나서"까지 이동해야, 드래그 중 형제들이
  // 위로 밀리는 리플로우와 무관하게 항상 맨 끝으로 떨어진다(경계값 근처는 결과가 민감함).
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height + 30, { steps: 8 });
  await page.mouse.up();

  const ids = await page.locator('#daysContainer .tl-item').evaluateAll(els => els.map(e => e.dataset.itemId));
  expect(ids).toEqual(['i2', 'i3', 'i1']);
  // 실제 state.days[].items 배열도 같은 순서로 바뀌고 저장돼야 한다(재로드 시 유지)
  const savedOrder = await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('ttv2-current-trip'));
    return JSON.parse(cache.data).days[0].items.map(i => i.id);
  });
  expect(savedOrder).toEqual(['i2', 'i3', 'i1']);
});

test('일정 항목: 새로 추가한 항목을 드래그로 두 시간대 사이에 끼워넣을 수 있다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => addItem('d1'));
  await expect(page.locator('.tl-item')).toHaveCount(4);
  const newItem = page.locator('.day-card[id="day-d1"] .tl-item').last();
  const newId = await newItem.getAttribute('data-item-id');
  const second = page.locator('.tl-item[data-item-id="i2"]'); // 09:00 과 12:00 사이로 옮길 목표 지점
  const bNew = await newItem.boundingBox();
  const bSecond = await second.boundingBox();
  await page.mouse.move(bNew.x + bNew.width / 2, bNew.y + bNew.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.move(bSecond.x + bSecond.width / 2, bSecond.y + 5, { steps: 8 }); // i2 카드 상단 근처 → i1과 i2 사이
  await page.mouse.up();

  const ids = await page.locator('#daysContainer .tl-item').evaluateAll(els => els.map(e => e.dataset.itemId));
  expect(ids).toEqual(['i1', newId, 'i2', 'i3']);
});

test('일정 항목: 보기 모드에서는 드래그로 순서가 바뀌지 않는다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => setMode('view'));
  const first = page.locator('.tl-item[data-item-id="i1"]');
  const third = page.locator('.tl-item[data-item-id="i3"]');
  const b1 = await first.boundingBox();
  const b3 = await third.boundingBox();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(first).not.toHaveClass(/dragging/);
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2, { steps: 8 });
  await page.mouse.up();
  const ids = await page.locator('#daysContainer .tl-item').evaluateAll(els => els.map(e => e.dataset.itemId));
  expect(ids).toEqual(['i1', 'i2', 'i3']);
});
