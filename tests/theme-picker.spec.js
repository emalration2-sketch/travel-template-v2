const { test, expect } = require('./support/fixtures');

async function toSettings(page){
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'홍길동', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => { renderSettings(); showScreen('settings'); });
}

test('설정 행 → 팝업 5카드 → 탭 시 즉시 적용 + 저장 + 모달 유지', async ({ page }) => {
  await toSettings(page);
  await expect(page.locator('#setTheme')).toBeVisible();
  await expect(page.locator('#setThemeVal')).toContainText('오션');

  await page.locator('#setTheme').click();
  await expect(page.locator('#v2Modal .theme-card')).toHaveCount(5);

  await page.locator('#v2Modal .theme-card[data-theme="d"]').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('d');
  await expect(page.locator('#v2Modal .theme-card[data-theme="d"]')).toHaveClass(/sel/);
  await expect(page.locator('#v2Modal')).toBeVisible();   // 모달 유지
  await expect.poll(() => page.evaluate(() => (window.__test.dump()['users/u1']||{}).theme)).toBe('d');

  await page.locator('#v2Modal [data-action="v2modal-close"]').click();
  await expect(page.locator('#v2Modal')).toBeHidden();
  await expect(page.locator('#setThemeVal')).toContainText('아쿠아마린 갤럭시');
});

test('멤버십 전용 테마: 뱃지 표시 + 탭해도 적용 안 되고 안내', async ({ page }) => {
  await toSettings(page);
  await page.evaluate(() => {
    THEME_LIST.find(t => t.id === 'e').locked = true;
    window.__alerts = [];
    window.alert = m => window.__alerts.push(m);
  });
  await page.locator('#setTheme').click();

  const locked = page.locator('#v2Modal .theme-card[data-theme="e"]');
  await expect(locked).toHaveClass(/locked/);
  await expect(locked.locator('.tbadge')).toBeVisible();
  await expect(locked.locator('.tprev-lock')).toBeVisible();

  await locked.click();
  await expect.poll(() => page.evaluate(() => window.__alerts.length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.dataset.theme || 'a')).toBe('a');  // 그대로
  await expect(locked).not.toHaveClass(/sel/);

  await page.evaluate(() => { THEME_LIST.find(t => t.id === 'e').locked = false; });
});
