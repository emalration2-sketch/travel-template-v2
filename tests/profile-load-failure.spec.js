const { test, expect } = require('./support/fixtures');

// Fix A/E 회귀: loadProfile() 가 실패하면 기본 프로필을 사용자 문서에 덮어쓰면 안 되고,
// 마이페이지는 재시도 상태를 보여준다.

test('loadProfile 실패 → 기본 프로필 미저장 + 재시도 UI, 복귀 후 정상 렌더', async ({ page }) => {
  await page.goto('/');

  // auth 콜백이 해석되기 전에 오프라인 → loadProfile 의 .get() 이 reject
  await page.evaluate(() => {
    window.__test.setOffline(true);
    window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' });
  });

  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('#mpList .mp-load-error')).toContainText('여행 정보를 불러오지 못했어요');
  await expect(page.locator('#mpCount')).not.toHaveText('0 / 5');

  // saveProfile 은 profileLoaded=false 이므로 no-op → users/u1 문서가 생기지 않아야 한다
  await page.evaluate(() => saveProfile({ avatarId: 'fox' }));
  expect(await page.evaluate(() => window.__test.dump()['users/u1'])).toBeUndefined();

  // 온라인 복귀 + 실제 문서 시드 후 재시도
  await page.evaluate(() => {
    window.__test.setOffline(false);
    window.__test.seed('users/u1', { avatarId: 'cat', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { title: '삿포로', dayCount: 3, startDate: '', endDate: '' });
  });
  await page.locator('[data-action="retry-load"]').click();

  await expect(page.locator('#mpList .mp-card')).toHaveCount(1);
  await expect(page.locator('#mpCount')).toHaveText('1 / 5');
  expect(await page.evaluate(() => window.__test.dump()['users/u1'].avatarId)).toBe('cat');
});
