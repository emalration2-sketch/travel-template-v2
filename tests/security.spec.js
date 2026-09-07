const { test, expect } = require('./support/fixtures');

test('linkify: href 속성 탈출 불가 (XSS 하드닝)', async ({ page }) => {
  await page.goto('/');
  const html = await page.evaluate(() =>
    linkify('메모 http://a.com/"onmouseover="alert(1) 끝'));
  // href 속성 안에서 큰따옴표가 엔티티로 인코딩돼 속성 탈출이 불가능하다
  const href = html.match(/href="([^"]*)"/)[1];
  expect(href).toBe('http://a.com/&quot;onmouseover=&quot;alert(1)');
  expect(href).not.toContain('"');
  // 정상 URL 은 여전히 링크가 된다
  const ok = await page.evaluate(() => linkify('보기 https://example.com/path?x=1'));
  expect(ok).toContain('<a href="https://example.com/path?x=1"');
  expect(ok).toContain('rel="noopener"');
});

test('linkify: 화면에 렌더해도 이벤트 핸들러가 안 붙는다', async ({ page }) => {
  await page.goto('/');
  const attrs = await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = linkify('x http://a.com/"onmouseover="alert(1) y');
    const a = d.querySelector('a');
    return a ? a.getAttributeNames() : [];
  });
  expect(attrs).not.toContain('onmouseover');
  expect(attrs.sort()).toEqual(['href', 'rel', 'target']);
});

test('로그아웃 시 로컬 여행 캐시가 지워진다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('ttv2-current-trip', JSON.stringify({ tripId:'t1', data:'{"title":"비밀 여행"}', dirty:false }));
    logoutUser();
  });
  const cache = await page.evaluate(() => localStorage.getItem('ttv2-current-trip'));
  expect(cache).toBeNull();
});
