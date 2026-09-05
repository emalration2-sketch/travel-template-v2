const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('새 여행 만들기 → 편집기로, 목록에 1개', async ({ page }) => {
  await signedIn(page);
  await page.locator('#mpNewBtn').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' })); // 재라우팅
  await expect(page.locator('#mpCount')).toHaveText('1 / 5');
});

test('5개면 모달, 생성 안 됨', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['a','b','c','d','e'] });
    ['a','b','c','d','e'].forEach(id => window.__test.seed('users/u1/trips/' + id, { title: id, dayCount: 1 }));
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await page.locator('#mpNewBtn').click();
  await expect(page.locator('#v2Modal')).toBeVisible();
  await expect(page.locator('#v2ModalBody')).toContainText('여행계획은 최대 5개까지 저장할 수 있어요.');
  await expect(page.locator('#v2ModalBody')).toContainText('멤버십을 변경하여 여행계획을 더 늘려보세요.');
  await expect(page.locator('section[data-screen="editor"]')).toBeHidden();
});
