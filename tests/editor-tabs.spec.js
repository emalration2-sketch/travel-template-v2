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
  expect(await page.locator('#editView-schedule #dayRail').count()).toBe(1);
  expect(await page.locator('#dayChips').count()).toBe(0);
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

test('탭 전환 — 한 뷰만 보이고 일차 레일은 일정에서만', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('#editView-schedule')).toBeVisible();
  await expect(page.locator('#dayRail')).toBeVisible();

  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await expect(page.locator('#editView-materials')).toBeVisible();
  await expect(page.locator('#editView-schedule')).toBeHidden();
  await expect(page.locator('#dayRail')).toBeHidden();
  await expect(page.locator('#editTabs .tab[data-tab="materials"]')).toHaveClass(/active/);

  await page.locator('#editTabs .tab[data-tab="schedule"]').click();
  await expect(page.locator('#editView-schedule')).toBeVisible();
  await expect(page.locator('#dayRail')).toBeVisible();
});

test('openTrip 은 항상 schedule 로 초기화', async ({ page }) => {
  await openEditor(page);
  await page.locator('#editTabs .tab[data-tab="expense"]').click();
  await expect(page.locator('#editView-expense')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('#editView-schedule')).toBeVisible();
  expect(await page.evaluate(() => currentEditorTab)).toBe('schedule');
});

test('일차 레일이 dayRail 에 렌더 + 스크롤스파이가 레일 노드만 토글', async ({ page }) => {
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

  const nodes = page.locator('#dayRail .rail-node');
  await expect(nodes).toHaveCount(4);
  await expect(nodes.nth(0)).toHaveAttribute('id', 'rail-d1');
  await expect(nodes.nth(0)).toHaveAttribute('data-day-id', 'd1');
  await expect(nodes.nth(0)).toHaveAttribute('aria-label', 'Day 1');
  await expect(nodes.nth(3)).toHaveAttribute('aria-label', 'Day 4');
  await expect(nodes.nth(0).locator('.rail-lbl')).toHaveText('Day 1');
  // 언어/날짜와 무관하게 항상 "Day N"
  await expect(nodes.nth(1).locator('.rail-lbl')).toHaveText('Day 2');

  // 옛 위치/옛 id 는 없음
  expect(await page.locator('#dayChips').count()).toBe(0);
  expect(await page.evaluate(() => document.getElementById('chip-d1'))).toBeNull();

  // 스크롤스파이는 #daysContainer .day-card 만 관측한다
  expect(await page.evaluate(() => document.querySelectorAll('#daysContainer .day-card').length)).toBe(4);

  // 아래쪽 일차 카드로 스크롤 → #dayRail 노드만 토글되고 (첫 노드 아님)
  // 편집기 상단 탭(#editTabs)의 active 는 스크롤스파이가 건드리지 않는다
  await page.evaluate(() => document.getElementById('day-d4').scrollIntoView({ block: 'center' }));
  await expect(page.locator('#dayRail .rail-node.active')).toHaveCount(1);
  await expect(page.locator('#dayRail #rail-d1')).not.toHaveClass(/active/);
  await expect(page.locator('#editTabs .tab[data-tab="schedule"]')).toHaveClass(/active/);
});

test('레일 노드 클릭 → 해당 일차가 sticky nav 바로 아래로 정렬', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const mkItems = () => Array.from({length:6}, (_,k) =>
      ({ id:'i'+Math.random(), time:'', place:'항목 '+k, memo:'메모 '.repeat(8), expenses:[] }));
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'오사카', travelers:['나'],
      days:[
        {id:'d1',date:'2026-03-14',label:'',items:mkItems()},
        {id:'d2',date:'2026-03-15',label:'',items:mkItems()},
        {id:'d3',date:'2026-03-16',label:'',items:mkItems()},
        {id:'d4',date:'2026-03-17',label:'',items:mkItems()},
      ], notes:[], links:[] }), title:'오사카', dayCount:4 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();

  // 레일은 스크롤 중에만 클릭 가능 → 먼저 노출시킨다
  await page.evaluate(() => showRail());
  await expect(page.locator('#dayRail')).toHaveClass(/scrolling/);
  await page.locator('#dayRail #rail-d3').click();
  await page.waitForTimeout(700); // smooth scroll settle

  // day-d3 카드 상단이 sticky nav 바로 아래(겹치지 않고 근접)에 온다 — "간혹 안 튀는" 버그 회귀 방지
  const top = await page.evaluate(() => document.getElementById('day-d3').getBoundingClientRect().top);
  const navH = await page.evaluate(() =>
    document.querySelector('section[data-screen="editor"] nav.tabs').getBoundingClientRect().height);
  expect(top).toBeGreaterThan(navH - 4);
  expect(top).toBeLessThan(navH + 40);
});

test('마지막 일차도 화면 상단까지 스크롤 가능 (하단 스페이서)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'오사카', travelers:['나'],
      days:[
        {id:'d1',date:'',label:'',items:[{id:'i1',time:'',place:'a',memo:'',expenses:[]}]},
        {id:'d2',date:'',label:'',items:[{id:'i2',time:'',place:'b',memo:'',expenses:[]}]},
        {id:'d3',date:'',label:'',items:[{id:'i3',time:'',place:'c',memo:'',expenses:[]}]},
      ], notes:[], links:[] }), title:'오사카', dayCount:3 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();

  await page.evaluate(() => { showRail(); scrollToDay('d3'); });
  await page.waitForTimeout(700);
  const top = await page.evaluate(() => document.getElementById('day-d3').getBoundingClientRect().top);
  const navH = await page.evaluate(() =>
    document.querySelector('section[data-screen="editor"] nav.tabs').getBoundingClientRect().height);
  // 짧은 마지막 일차라도 상단(nav 바로 아래)까지 올라온다
  expect(top).toBeGreaterThan(navH - 4);
  expect(top).toBeLessThan(navH + 40);
});

test('레일은 스크롤 중에만 노출(반투명) + 레이아웃 차지 안 함', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const mk = () => Array.from({length:6}, (_,k) => ({ id:'i'+Math.random(), time:'', place:'x', memo:'메모 '.repeat(8), expenses:[] }));
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'오사카', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:mk()},{id:'d2',date:'',label:'',items:mk()},{id:'d3',date:'',label:'',items:mk()}],
      notes:[], links:[] }), title:'오사카', dayCount:3 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();

  const rail = page.locator('#dayRail');
  const lbl = page.locator('#dayRail .rail-node.active .rail-lbl');

  // 정지 상태: 레일 투명 + 라벨 투명 + 포인터 통과(레이아웃/탭 방해 X)
  await expect(rail).not.toHaveClass(/scrolling/);
  await expect(rail).toHaveCSS('opacity', '0');
  await expect(rail).toHaveCSS('pointer-events', 'none');
  await expect(rail).toHaveCSS('position', 'fixed');
  await expect(lbl).toHaveCSS('opacity', '0');

  // 스크롤 발생 → .scrolling 붙고 레일·라벨 나타남
  await page.evaluate(() => window.scrollBy(0, 400));
  await expect(rail).toHaveClass(/scrolling/);
  await expect(rail).toHaveCSS('opacity', '1');
  await expect(lbl).toHaveCSS('opacity', '1');

  // 멈추면 ~1.2s 뒤 자동으로 사라짐
  await expect(rail).not.toHaveClass(/scrolling/, { timeout: 2500 });
  await expect(rail).toHaveCSS('opacity', '0');
  await expect(lbl).toHaveCSS('opacity', '0');
});

test('아바타 팝업 안내 문구 삭제됨', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.locator('#mpSettingsRow').click();
  await page.locator('#setAvatarRow').click();
  await expect(page.locator('#v2Modal')).toBeVisible();
  await expect(page.locator('#v2Modal')).not.toContainText('기본값은');
});

test('편집기 ⚙ 버튼 → 설정, 마이페이지 이름 탭은 설정 안 감', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[], attachments:[] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();

  // 이름/아바타 탭은 더 이상 설정으로 안 감
  await page.locator('#mpName').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('section[data-screen="settings"]')).toBeHidden();

  // 편집기 안에서 ⚙ → 설정 → 뒤로 → 편집기 (마이페이지 아님)
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await page.locator('#editorOptBtn').click();
  await expect(page.locator('section[data-screen="settings"]')).toBeVisible();
  await expect(page.locator('#setBack')).toHaveText('← 편집으로');
  await page.locator('#setBack').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await expect(page.locator('section[data-screen="mypage"]')).toBeHidden();
});

test('마이페이지 → 설정 → 뒤로 → 마이페이지', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.locator('#mpSettingsRow').click();
  await expect(page.locator('section[data-screen="settings"]')).toBeVisible();
  await expect(page.locator('#setBack')).toHaveText('← 내 여행');
  await page.locator('#setBack').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
});
