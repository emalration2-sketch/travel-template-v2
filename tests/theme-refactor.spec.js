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

test('일차 헤더 배경이 테마 --fill-strong 을 따른다', async ({ page }) => {
  await openEditor(page);
  // 테마 d: fill-strong = #1E2E48 = rgb(30, 46, 72)
  await page.evaluate(() => document.documentElement.dataset.theme = 'd');
  const bg = await page.evaluate(() => {
    const el = document.querySelector('#daysContainer .day-card .day-head') || document.querySelector('.day-head');
    return getComputedStyle(el).backgroundColor;
  });
  expect(bg).toBe('rgb(30, 46, 72)');
});

test('nav.tabs 하단 띠가 테마 --mode-edit / --mode-view 를 따른다', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'c'; setMode('edit'); });
  const edit = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).borderBottomColor);
  await page.evaluate(() => setMode('view'));
  const view = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).borderBottomColor);
  expect(edit).toBe('rgb(91, 75, 138)');    // c --mode-edit #5B4B8A (인디고, 스왑됨)
  expect(view).toBe('rgb(53, 82, 143)');    // c --mode-view #35528F (강조색)
});

test('아바타 원 배경에 하드코딩 네이비 그라디언트가 없다', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => { renderMypage(); showScreen('mypage'); });
  const img = await page.evaluate(() => {
    const el = document.getElementById('mpAvatar');
    const s = getComputedStyle(el);
    return s.backgroundImage;
  });
  expect(img).toBe('none');   // flat var(--fill-strong), 그라디언트 아님
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

test('style 블록에 background:#fff 하드코딩이 @media print 밖에 남지 않았다', async () => {
  const fs = require('fs');
  const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  // STATIC_CSS 문자열은 </style> 뒤라 이미 제외됨
  let styleBlock = html.slice(0, html.indexOf('</style>'));
  // @media print{ ... } 블록을 먼저 제거 (인쇄물은 항상 라이트라 #fff 허용)
  styleBlock = styleBlock.replace(/@media print\{[\s\S]*?\n  \}/, '');
  expect(styleBlock).not.toContain('background:#fff');
  expect(styleBlock).not.toContain('background: #fff');
});
