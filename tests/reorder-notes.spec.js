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
  await page.evaluate(() => document.fonts.ready);
}

test('메모: 롱프레스 후 드래그로 순서 변경', async ({ page }) => {
  await setup(page);
  const first = page.locator('.note-card[data-note-id="n1"]');
  const last = page.locator('.note-card[data-note-id="n3"]');
  const b1 = await first.boundingBox();
  const b3 = await last.boundingBox();
  // 카드 정중앙은 편집모드 textarea(.note-content, 드래그 제외 대상) 위일 수 있으므로,
  // 아무 입력칸도 없는 카드 바깥쪽 여백(패딩) 쪽을 눌러서 드래그를 시작한다.
  await page.mouse.move(b1.x + 6, b1.y + 6);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(first).toHaveClass(/dragging/);
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height + 30, { steps: 8 });
  await page.mouse.up();

  const ids = await page.locator('#notesContainer .note-card').evaluateAll(els => els.map(e => e.dataset.noteId));
  expect(ids).toEqual(['n2', 'n3', 'n1']);
  const savedOrder = await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('ttv2-current-trip'));
    return JSON.parse(cache.data).notes.map(n => n.id);
  });
  expect(savedOrder).toEqual(['n2', 'n3', 'n1']);
});

test('메모: 제목 입력칸을 길게 눌러도 드래그가 시작되지 않는다(타이핑 방해 방지)', async ({ page }) => {
  await setup(page);
  const card = page.locator('.note-card[data-note-id="n1"]');
  const titleInput = card.locator('.note-title');
  const b = await titleInput.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(card).not.toHaveClass(/dragging/);
  await page.mouse.up();
  const ids = await page.locator('#notesContainer .note-card').evaluateAll(els => els.map(e => e.dataset.noteId));
  expect(ids).toEqual(['n1', 'n2', 'n3']);
});
