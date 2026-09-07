const { test, expect } = require('./support/fixtures');
async function signedInWith(page, order){
  await page.goto('/');
  await page.evaluate((order) => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: order });
    order.forEach(id => window.__test.seed('users/u1/trips/' + id, { title: id.toUpperCase(), dayCount: 1 }));
  }, order);
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
}

test('✕ → 확인 모달 → 삭제 시 목록/순서에서 제거', async ({ page }) => {
  await signedInWith(page, ['a', 'b']);
  await page.locator('.mp-card[data-trip-id="a"] .mp-del').click();
  await expect(page.locator('#v2ModalBody')).toContainText('이 여행을 삭제할까요?');
  await expect(page.locator('#v2ModalBody')).toContainText('되돌릴 수 없습니다.');
  await page.locator('#v2Modal').getByText('삭제', { exact: true }).click();
  await expect(page.locator('.mp-card')).toHaveCount(1);
  await expect(page.locator('.mp-card').first()).toHaveAttribute('data-trip-id', 'b');
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual(['b']);
});

test('취소 시 아무 일 없음', async ({ page }) => {
  await signedInWith(page, ['a', 'b']);
  await page.locator('.mp-card[data-trip-id="a"] .mp-del').click();
  await page.locator('#v2Modal').getByText('취소', { exact: true }).click();
  await expect(page.locator('.mp-card')).toHaveCount(2);
});

test('삭제 실패(오프라인) 시 목록 원복 + 경고', async ({ page }) => {
  await signedInWith(page, ['a', 'b']);
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.evaluate(() => window.__test.setOffline(true));
  await page.locator('.mp-card[data-trip-id="a"] .mp-del').click();
  await page.locator('#v2Modal').getByText('삭제', { exact: true }).click();
  // 낙관적으로 사라졌다가 백그라운드 삭제 실패 → 되돌아온다
  await expect(page.locator('.mp-card')).toHaveCount(2);
  await expect(page.locator('.mp-card[data-trip-id="a"]')).toBeVisible();
  expect(dialogs.join(' ')).toContain('삭제에 실패');
});
