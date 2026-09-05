const { test, expect } = require('./support/fixtures');

test('로그인 → 새 여행 → 편집 → 목록 복귀 → 재오픈 → 삭제', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();

  await page.locator('#landingLoginBtn').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('#mpCount')).toHaveText('0 / 5');

  await page.locator('#mpNewBtn').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await page.fill('#inputTitle', '방콕 4일');
  await page.dispatchEvent('#inputTitle', 'input');
  await page.waitForTimeout(1300);

  await page.locator('#backToMypage').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('#mpCount')).toHaveText('1 / 5');
  await expect(page.locator('.mp-card')).toContainText('방콕 4일');

  await page.locator('.mp-card .mp-title').click();
  await expect(page.locator('#inputTitle')).toHaveValue('방콕 4일');

  await page.locator('#backToMypage').click();
  await page.locator('.mp-card .mp-del').click();
  await page.locator('#v2Modal').getByText('삭제', { exact: true }).click();
  await expect(page.locator('.mp-card')).toHaveCount(0);
  await expect(page.locator('#mpCount')).toHaveText('0 / 5');
});
