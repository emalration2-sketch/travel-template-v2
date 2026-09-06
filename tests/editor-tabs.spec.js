const { test, expect } = require('./support/fixtures');

async function openEditor(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', {
      data: JSON.stringify({ title: '오사카', travelers:['나'],
        days:[{id:'d1',date:'',label:'',items:[{id:'i1',time:'',place:'',memo:'',expenses:[]}]}],
        notes:[], links:[] }),
      title: '오사카', dayCount: 1,
    });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('편집기에 4개 뷰 + 탭바 + 일차칩 컨테이너', async ({ page }) => {
  await openEditor(page);
  for (const v of ['schedule','notes','expense','materials']) {
    expect(await page.locator(`#editView-${v}`).count()).toBe(1);
  }
  await expect(page.locator('#editTabs .tab[data-tab="schedule"]')).toHaveText('일정');
  await expect(page.locator('#editTabs .tab[data-tab="materials"]')).toHaveText('자료모음');
  expect(await page.locator('#editTabs .tab').count()).toBe(4);
  expect(await page.locator('#dayChips').count()).toBe(1);
  // 자료모음 안에 링크 컨테이너 + 이미지 리스트
  expect(await page.locator('#editView-materials #linksContainer').count()).toBe(1);
  expect(await page.locator('#editView-materials #attList').count()).toBe(1);
  // 제거된 것들
  expect(await page.locator('.tab.tab-add').count()).toBe(0);
  expect(await page.locator('.header-card .hint').count()).toBe(0);
  expect(await page.locator('#editTabs .tab', { hasText: '참고 링크' }).count()).toBe(0);
});

test('힌트 문구가 푸터로 이동', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('footer')).toContainText('[수정모드]에서 모든 항목을 자유롭게');
  await expect(page.locator('footer')).toContainText('로그인한 계정에 자동 저장됩니다');
});

test('탭 전환 — 한 뷰만 보이고 일차칩은 일정에서만', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('#editView-schedule')).toBeVisible();
  await expect(page.locator('#dayChips')).toBeVisible();

  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await expect(page.locator('#editView-materials')).toBeVisible();
  await expect(page.locator('#editView-schedule')).toBeHidden();
  await expect(page.locator('#dayChips')).toBeHidden();
  await expect(page.locator('#editTabs .tab[data-tab="materials"]')).toHaveClass(/active/);

  await page.locator('#editTabs .tab[data-tab="schedule"]').click();
  await expect(page.locator('#editView-schedule')).toBeVisible();
  await expect(page.locator('#dayChips')).toBeVisible();
});

test('openTrip 은 항상 schedule 로 초기화', async ({ page }) => {
  await openEditor(page);
  await page.locator('#editTabs .tab[data-tab="expense"]').click();
  await expect(page.locator('#editView-expense')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('#editView-schedule')).toBeVisible();
  expect(await page.evaluate(() => currentEditorTab)).toBe('schedule');
});

test('일차 칩이 dayChips 에 렌더 + 스크롤스파이가 칩만 토글', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'오사카', travelers:['나'],
      days:[
        {id:'d1',date:'2026-03-14',label:'',items:[]},
        {id:'d2',date:'2026-03-15',label:'',items:[]},
        {id:'d3',date:'2026-03-16',label:'',items:[]},
        {id:'d4',date:'2026-03-17',label:'',items:[]},
      ], notes:[], links:[] }), title:'오사카', dayCount:4 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();

  const chips = page.locator('#dayChips .day-chip');
  await expect(chips).toHaveCount(4);
  await expect(chips.nth(0)).toHaveAttribute('href', '#day-d1');
  await expect(chips.nth(0)).toHaveAttribute('id', 'chip-d1');
  await expect(chips.nth(1)).toHaveAttribute('href', '#day-d2');
  await expect(chips.nth(1)).toHaveAttribute('id', 'chip-d2');

  // 옛 위치/옛 id 는 없음
  expect(await page.locator('#dayTabs').count()).toBe(0);
  expect(await page.evaluate(() => document.getElementById('tab-d1'))).toBeNull();

  // 스크롤스파이는 #daysContainer .day-card 만 관측한다
  expect(await page.evaluate(() => document.querySelectorAll('#daysContainer .day-card').length)).toBe(4);

  // 아래쪽 일차 카드로 스크롤 → #dayChips 칩만 토글되고 (첫 칩 아님)
  // 편집기 상단 탭(#editTabs)의 active 는 스크롤스파이가 건드리지 않는다
  await page.evaluate(() => document.getElementById('day-d4').scrollIntoView({ block: 'center' }));
  await expect(page.locator('#dayChips .day-chip.active')).toHaveCount(1);
  await expect(page.locator('#dayChips .day-chip#chip-d1')).not.toHaveClass(/active/);
  await expect(page.locator('#editTabs .tab[data-tab="schedule"]')).toHaveClass(/active/);
});

test('아바타 팝업 안내 문구 삭제됨', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.locator('#mpTop').click();
  await page.locator('#setAvatarRow').click();
  await expect(page.locator('#v2Modal')).toBeVisible();
  await expect(page.locator('#v2Modal')).not.toContainText('기본값은');
});
