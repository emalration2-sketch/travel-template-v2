const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('카드 탭 → 편집기에 해당 여행 로드', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', {
      data: JSON.stringify({ title: '교토 여행', travelers: ['나'], days: [{ id: 'd1', date: '', label: '', items: [] }], notes: [], links: [] }),
      title: '교토 여행', dayCount: 1,
    });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await page.locator('.mp-card[data-trip-id="t1"] .mp-title').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await expect(page.locator('#inputTitle')).toHaveValue('교토 여행');
  await expect(page.locator('#backToMypage')).toBeVisible();
});

test('← 마이페이지 → 목록 복귀', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: 'X', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: 'X', dayCount: 1 });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await page.locator('.mp-card[data-trip-id="t1"] .mp-title').click();
  await page.locator('#backToMypage').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
});

test('← 마이페이지 → 오프라인이어도 즉시 복귀 (네트워크 대기 안 함)', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: 'X', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[] }), title: 'X', dayCount: 1 });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await page.locator('.mp-card[data-trip-id="t1"] .mp-title').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  // 편집 후 오프라인 — forceFlush / refreshTripList 가 reject 되지만 뒤로가기는 막히지 않아야
  await page.evaluate(() => { document.getElementById('inputTitle').value = 'X2'; save(); window.__test.setOffline(true); });
  await page.locator('#backToMypage').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('.mp-card[data-trip-id="t1"]')).toBeVisible();
});

test('← 마이페이지: 편집한 제목이 목록 카드에 반영 (재조회 없이 로컬 메타 갱신)', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title: '옛 제목', travelers:['나'], days:[{id:'d1',date:'2026-05-01',label:'',items:[]}], notes:[], links:[] }), title: '옛 제목', startDate:'2026-05-01', dayCount: 1 });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await page.locator('.mp-card[data-trip-id="t1"] .mp-title').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  // 제목 편집 후, 목록 재조회를 막아도(오프라인) 카드가 새 제목을 보여준다
  await page.evaluate(() => { state.title = '새 제목'; save(); window.__test.setOffline(true); });
  await page.locator('#backToMypage').click();
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('.mp-card[data-trip-id="t1"] .mp-title')).toHaveText('새 제목');
});

test('편집기 nav 에 로그인/유저 UI 없음', async ({ page }) => {
  await page.goto('/');
  expect(await page.locator('#loginBtn').count()).toBe(0);
  expect(await page.locator('#userInfo').count()).toBe(0);
});
