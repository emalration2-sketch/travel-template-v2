const { test, expect } = require('./support/fixtures');

async function openEditor(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'2026-01-01',label:'',items:[]}], notes:[], links:[], attachments:[] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('일차 헤더 배경이 테마 --fill-strong(선셋 그라디언트) 을 따른다', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => document.documentElement.dataset.theme = 'd');
  const bgImg = await page.evaluate(() => {
    const el = document.querySelector('#daysContainer .day-card .day-head') || document.querySelector('.day-head');
    return getComputedStyle(el).backgroundImage;
  });
  // 테마 d fill-strong = 배너와 같은 3-stop 그라디언트
  expect(bgImg).toContain('linear-gradient');
  expect(bgImg).toMatch(/gradient.*rgb.*rgb.*rgb/);
});

test('nav.tabs 하단 띠가 테마 --mode-edit / --mode-view 를 따른다', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'c'; setMode('edit'); });
  await page.waitForTimeout(260); // nav.tabs border-color 전환 애니메이션(200ms) 완료 대기
  const edit = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).borderBottomColor);
  await page.evaluate(() => setMode('view'));
  await page.waitForTimeout(260);
  const view = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).borderBottomColor);
  expect(edit).toBe('rgb(51, 56, 62)');     // --mode-edit 차콜 #33383E (전 테마 공통)
  expect(view).toBe('rgb(53, 82, 143)');    // c --mode-view #35528F (강조색)
});

test('아바타 원 배경이 var(--fill-strong) 토큰을 쓰고 하드코딩 네이비가 아니다', async ({ page }) => {
  await openEditor(page);   // 기본 테마 a
  await page.evaluate(() => { renderMypage(); showScreen('mypage'); });
  const img = await page.evaluate(() => getComputedStyle(document.getElementById('mpAvatar')).backgroundImage);
  expect(img).toContain('linear-gradient');       // 테마 --fill-strong 그라디언트를 따름
  expect(img).not.toContain('36, 48, 87');        // 옛 하드코딩 #243057 아님
  expect(img).not.toContain('27, 35, 64');        // #1B2340 아님 (테마 a 는 틸)
});

test('index.html 에 #243057 / #1B2340 하드코딩이 배경으로 남지 않았다', async () => {
  const fs = require('fs');
  const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const styleBlock = html.slice(0, html.indexOf('</style>'));
  expect(styleBlock).not.toContain('#243057');
  // #1B2340 은 [data-theme="c"] 팔레트 정의 + 피커 미리보기 팔레트(.tprev-c)에만 허용
  const cleaned = styleBlock
    .replace(/:root\[data-theme="c"\]\{[\s\S]*?\}/, '')
    .replace(/\.tprev-[a-e]\{[^}]*\}/g, '');
  expect(cleaned).not.toContain('#1B2340');
});

test('style 블록에 background:#fff 하드코딩이 @media print / 표지 밖에 남지 않았다', async () => {
  const fs = require('fs');
  const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  // STATIC_CSS 문자열은 </style> 뒤라 이미 제외됨
  let styleBlock = html.slice(0, html.indexOf('</style>'));
  // @media print{ ... } 는 인쇄물이라 라이트 고정 → #fff 허용
  styleBlock = styleBlock.replace(/@media print\{[\s\S]*?\n  \}/, '');
  // .landing-login 은 로그아웃 표지(테마 무관 고정 브랜드) → 흰 버튼 허용
  styleBlock = styleBlock.replace(/\.landing-login\{[^}]*\}/, '');
  expect(styleBlock).not.toContain('background:#fff');
  expect(styleBlock).not.toContain('background: #fff');
});
