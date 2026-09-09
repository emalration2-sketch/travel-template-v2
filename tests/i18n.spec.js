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
