const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'kim@x.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('상단 바 탭 → 설정, 계정 정보 노출', async ({ page }) => {
  await signedIn(page);
  await page.locator('#mpTop').click();
  await expect(page.locator('section[data-screen="settings"]')).toBeVisible();
  await expect(page.locator('#setName')).toHaveText('김진');
  await expect(page.locator('#setEmail')).toHaveText('kim@x.com');
  await expect(page.locator('#setLang')).toContainText('준비 중');
  await expect(page.locator('#setTheme')).toContainText('준비 중');
});

test('아바타 변경 → 팝업 → 저장 → 마이페이지 반영 + 영속', async ({ page }) => {
  await signedIn(page);
  await page.locator('#mpTop').click();
  await page.locator('#setAvatarRow').click();
  await expect(page.locator('#v2Modal')).toBeVisible();
  await page.locator('#v2Modal [data-avatar="fox"]').click();
  await page.locator('#v2Modal').getByText('저장', { exact: true }).click();
  await expect(page.locator('#setAvatarBig')).toHaveText('🦊');
  await page.locator('#setBack').click();
  await expect(page.locator('#mpAvatar')).toHaveText('🦊');
  expect(await page.evaluate(() => window.__test.dump()['users/u1'].avatarId)).toBe('fox');
});

test('기본으로 되돌리기 → ✈', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => saveProfile({ avatarId: 'bear' }));
  await page.locator('#mpTop').click();
  await page.locator('#setAvatarRow').click();
  await page.locator('#v2Modal').getByText('기본(✈)으로', { exact: true }).click();
  await page.locator('#v2Modal').getByText('저장', { exact: true }).click();
  await expect(page.locator('#setAvatarBig')).toHaveText('✈');
});

test('로그아웃 → 표지', async ({ page }) => {
  await signedIn(page);
  await page.locator('#mpTop').click();
  await page.locator('#setLogout').click();
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();
});
