const { test, expect } = require('./support/fixtures');

test('detectLang: 주 언어 서브태그로 판정, 미지원은 en', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => [
    detectLang('ko-KR'), detectLang('ko'), detectLang('en-US'),
    detectLang('ja'), detectLang('zh-CN'), detectLang(''), detectLang(null),
  ]);
  expect(r).toEqual(['ko','ko','en','en','en','en','en']);
});

test('t(): 보간 + en 누락 시 ko 폴백 + 미존재 키는 키 반환', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    I18N.ko['__test.hello'] = '{who}님 안녕';
    I18N.en['__test.hello'] = 'Hi {who}';
    I18N.ko['__test.only'] = '한국어만';
    curLang = 'en';
    return [ t('__test.hello', { who: 'A' }), t('__test.only'), t('__test.missing') ];
  });
  expect(r).toEqual(['Hi A', '한국어만', '__test.missing']);
});

test('카탈로그: 대표 키가 ko/en 모두 존재', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    const keys = ['common.close','tab.schedule','landing.login','settings.language',
      'note.toChecklist','expense.total','theme.d','share.notes','sync.notSaved'];
    return keys.map(k => [k, I18N.ko[k] != null, I18N.en[k] != null]);
  });
  for (const [k, ko, en] of r) { expect(ko, k + ' ko').toBe(true); expect(en, k + ' en').toBe(true); }
});

test('언어 피커: 설정 행 → 모달 → English → 적용 + 닫힘 + 저장', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => { renderSettings(); showScreen('settings'); });

  await expect(page.locator('#setLang')).not.toHaveClass(/set-disabled/);
  await expect(page.locator('#setLangVal')).toHaveText('한국어');

  await page.locator('#setLang').click();
  await page.locator('#v2Modal .lang-card[data-lang="en"]').click();

  await expect(page.locator('#v2Modal')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  expect(await page.evaluate(() => localStorage.getItem('ttv2-lang'))).toBe('en');
  await expect(page.locator('#setLangVal')).toHaveText('English');
  await expect.poll(() => page.evaluate(() => (window.__test.dump()['users/u1']||{}).lang)).toBe('en');
});

test('정적 마크업: en 전환 시 nav/탭/표지/설정 텍스트가 영어', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => setLang('en'));
  await expect(page.locator('section[data-screen="landing"] .landing-login')).toHaveText('Continue with Google');
  await expect(page.locator('#backToMypage')).toHaveText('← My trips');
  await expect(page.locator('#editTabs .tab[data-tab="schedule"]')).toHaveText('Itinerary');
  await expect(page.locator('#editTabs .tab[data-tab="materials"]')).toHaveText('Files');
  await expect(page.locator('#setLang [data-i18n]')).toHaveText('Language');
  await expect(page.locator('#setTheme span[data-i18n]')).toHaveText('Color theme');
});

test('마이페이지 en: 무제목 여행 + 날짜 미정', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { title:'', startDate:'', endDate:'', dayCount:3 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => setLang('en'));
  await expect(page.locator('.mp-card .mp-title')).toHaveText('Untitled trip');
  await expect(page.locator('.mp-card .mp-dates')).toContainText('Dates TBD');
  await expect(page.locator('.mp-card .mp-dates')).toContainText('3d');
});

test('표지 동의문: ko/en 어순', async ({ page }) => {
  await page.goto('/');
  const ko = await page.locator('.landing-consent').textContent();
  expect(ko.replace(/\s+/g,' ').trim()).toBe('계속하면 이용약관 및 개인정보처리방침에 동의하게 됩니다.');
  await page.evaluate(() => setLang('en'));
  const en = await page.locator('.landing-consent').textContent();
  expect(en.replace(/\s+/g,' ').trim()).toBe('By continuing, you agree to the Terms of Service and Privacy Policy.');
});
