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
