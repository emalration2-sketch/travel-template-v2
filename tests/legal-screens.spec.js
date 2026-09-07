const { test, expect } = require('./support/fixtures');

async function md(page, src){
  return page.evaluate(s => renderMarkdown(s), src);
}

test('renderMarkdown: 제목/문단/목록/인용/구분선/링크/코드', async ({ page }) => {
  await page.goto('/');
  const html = await md(page, [
    '# 문서제목',
    '',
    '## 1. 첫 절',
    '',
    '본문 문단입니다.',
    '',
    '- 항목 하나',
    '- 항목 둘',
    '',
    '> 참고 인용문',
    '',
    '---',
    '',
    '### 소절',
    '자세한 건 [여기](https://example.com)를 보세요. `코드` 조각.',
  ].join('\n'));
  expect(html).not.toContain('문서제목');            // 첫 # 줄 제거
  expect(html).toContain('<h3>1. 첫 절</h3>');
  expect(html).toContain('<h4>소절</h4>');
  expect(html).toContain('<p>본문 문단입니다.</p>');
  expect(html).toMatch(/<ul>\s*<li>항목 하나<\/li>\s*<li>항목 둘<\/li>\s*<\/ul>/);
  expect(html).toContain('<blockquote>참고 인용문</blockquote>');
  expect(html).toContain('<hr>');
  expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener">여기</a>');
  expect(html).toContain('<code>코드</code>');
});

test('renderMarkdown: 표', async ({ page }) => {
  await page.goto('/');
  const html = await md(page, ['| 구분 | 값 |','|---|---|','| 가 | 나 |','| 다 | 라 |'].join('\n'));
  expect(html).toContain('<div class="legal-table">');
  expect(html).toMatch(/<table>\s*<thead>\s*<tr>\s*<th>구분<\/th>\s*<th>값<\/th>/);
  expect(html).toMatch(/<tbody>\s*<tr>\s*<td>가<\/td>\s*<td>나<\/td>\s*<\/tr>\s*<tr>\s*<td>다<\/td>\s*<td>라<\/td>/);
});

test('renderMarkdown: HTML 이스케이프 (XSS 방지)', async ({ page }) => {
  await page.goto('/');
  const html = await md(page, '악성 <script>alert(1)</script> 시도 & <b>태그</b>');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&amp;');
  expect(html).toContain('&lt;b&gt;태그&lt;/b&gt;');
});

test('renderMarkdown: 굵게(**) 도 지원', async ({ page }) => {
  await page.goto('/');
  const html = await md(page, '이건 **강조** 입니다.');
  expect(html).toContain('<strong>강조</strong>');
});

test('renderMarkdown: 무한루프 방지 - 고아 | 라인', async ({ page }) => {
  test.setTimeout(10000);
  await page.goto('/');
  // 단독 | 라인은 유효한 테이블이 아니므로 무한루프 없이 반환되어야 함
  const html = await md(page, '|');
  expect(html).toBeDefined();
  expect(html).toContain('|');  // 파이프는 리터럴 텍스트로 처리됨
});

test('renderMarkdown: 무한루프 방지 - 구분선 없는 표', async ({ page }) => {
  test.setTimeout(10000);
  await page.goto('/');
  // 구분선이 없는 표 형식은 무한루프 없이 반환되고 파이프를 리터럴로 포함해야 함
  const html = await md(page, ['| a | b |','| c | d |'].join('\n'));
  expect(html).toBeDefined();
  expect(html).toContain('a | b');  // 파이프가 리터럴 텍스트로 포함됨
});

const TERMS_MD = ['# 이용약관','','## 제1조','내용 A.','','| K | V |','|---|---|','| a | b |'].join('\n');
const PRIV_MD  = ['# 개인정보처리방침','','## 1. 수집','내용 B. <script>x</script>'].join('\n');

async function routeLegal(page, { termsStatus = 200 } = {}){
  await page.route('**/docs/legal/terms-ko.md', r =>
    termsStatus === 200 ? r.fulfill({ contentType:'text/markdown', body: TERMS_MD })
                        : r.fulfill({ status: termsStatus, body: 'err' }));
  await page.route('**/docs/legal/privacy-ko.md', r =>
    r.fulfill({ contentType:'text/markdown', body: PRIV_MD }));
}

test('openLegal: 문서 fetch → 렌더 → 화면 표시', async ({ page }) => {
  await routeLegal(page);
  await page.goto('/');
  await page.evaluate(() => { legalFrom = 'landing'; openLegal('terms'); });
  await expect(page.locator('section[data-screen="terms"]')).toBeVisible();
  await expect(page.locator('#legalBody-terms h3')).toHaveText('제1조');
  await expect(page.locator('#legalBody-terms .legal-table table')).toBeVisible();
  await expect(page.locator('#legalBody-terms')).not.toContainText('이용약관');   // 첫 # 줄 제거
});

test('legal-back: 온 화면으로 복귀', async ({ page }) => {
  await routeLegal(page);
  await page.goto('/');
  await page.evaluate(() => { legalFrom = 'landing'; openLegal('privacy'); });
  await expect(page.locator('section[data-screen="privacy"]')).toBeVisible();
  await page.locator('section[data-screen="privacy"] [data-action="legal-back"]').click();
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();
});

test('openLegal: 재진입 시 fetch 1회만 (캐시)', async ({ page }) => {
  let hits = 0;
  await page.route('**/docs/legal/terms-ko.md', r => { hits++; r.fulfill({ contentType:'text/markdown', body: TERMS_MD }); });
  await page.route('**/docs/legal/privacy-ko.md', r => r.fulfill({ contentType:'text/markdown', body: PRIV_MD }));
  await page.goto('/');
  await page.evaluate(async () => { legalFrom='landing'; openLegal('terms'); });
  await expect(page.locator('#legalBody-terms h3')).toBeVisible();
  await page.evaluate(() => showScreen('landing'));
  await page.evaluate(async () => { openLegal('terms'); });
  await expect(page.locator('section[data-screen="terms"]')).toBeVisible();
  await page.waitForTimeout(200);
  expect(hits).toBe(1);
});

test('openLegal: fetch 실패 시 에러 + GitHub 링크', async ({ page }) => {
  await routeLegal(page, { termsStatus: 500 });
  await page.goto('/');
  await page.evaluate(() => { legalFrom='landing'; openLegal('terms'); });
  await expect(page.locator('#legalBody-terms .legal-error')).toBeVisible();
  await expect(page.locator('#legalBody-terms .legal-error a')).toHaveAttribute('href', /github\.com.*terms-ko\.md/);
});

test('렌더러 이스케이프: 문서 본문의 <script> 는 텍스트', async ({ page }) => {
  await routeLegal(page);
  await page.goto('/');
  await page.evaluate(() => { legalFrom='landing'; openLegal('privacy'); });
  await expect(page.locator('#legalBody-privacy')).toContainText('<script>x</script>');
  expect(await page.locator('#legalBody-privacy script').count()).toBe(0);
});

test('표지 링크 → 이용약관, 뒤로 → 표지', async ({ page }) => {
  await routeLegal(page);
  await page.goto('/');
  await expect(page.locator('.landing-consent')).toContainText('이용약관');
  await page.locator('.landing-foot [data-doc="terms"]').click();
  await expect(page.locator('section[data-screen="terms"]')).toBeVisible();
  await page.locator('section[data-screen="terms"] [data-action="legal-back"]').click();
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();
});

test('설정 링크 → 개인정보처리방침, 뒤로 → 설정', async ({ page }) => {
  await routeLegal(page);
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.locator('.mp-opt-btn').click();
  await expect(page.locator('section[data-screen="settings"]')).toBeVisible();
  await page.locator('.set-row[data-doc="privacy"]').click();
  await expect(page.locator('section[data-screen="privacy"]')).toBeVisible();
  await page.locator('section[data-screen="privacy"] [data-action="legal-back"]').click();
  await expect(page.locator('section[data-screen="settings"]')).toBeVisible();
});
