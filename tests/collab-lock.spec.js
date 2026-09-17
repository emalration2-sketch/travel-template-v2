const { test, expect } = require('./support/fixtures');

test('owner 가 잠금 토글을 누르면 trips/{id}.locked 가 true ↔ false 로 전환된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  await page.click('[data-action="toggle-lock"]');
  await page.waitForTimeout(50);
  let meta = await page.evaluate((tid) => tripMetaRef(tid).get().then(s => s.data()), tripId);
  expect(meta.locked).toBe(true);

  await page.click('[data-action="toggle-lock"]');
  await page.waitForTimeout(50);
  meta = await page.evaluate((tid) => tripMetaRef(tid).get().then(s => s.data()), tripId);
  expect(meta.locked).toBe(false);
});

test('owner 가 아닌 멤버가 수정 모드를 켜 둔 상태에서 다른 세션이 여행을 잠그면, 즉시 보기 모드로 전환되고 수정 버튼이 비활성화된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({
    members: firebase.firestore.FieldValue.arrayUnion('u2'),
    ['memberNames.u2']: '멤버2',
  }), tripId);
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '멤버2', email: 'u2@example.com' }));
  await page.waitForTimeout(50);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.evaluate(() => setMode('edit'));
  expect(await page.evaluate(() => currentMode)).toBe('edit');

  // 다른 세션(오너)이 여행을 잠그는 것을 시뮬레이션 — u2 쪽에서 직접 메타 문서를 갱신
  await page.evaluate((tid) => tripMetaRef(tid).update({ locked: true }), tripId);
  await page.waitForTimeout(50);

  expect(await page.evaluate(() => currentMode)).toBe('view');
  const editDisabled = await page.locator('.mode-seg-opt[data-mode="edit"]').isDisabled();
  expect(editDisabled).toBe(true);
});

test('owner 는 자신이 건 잠금의 영향을 받지 않는다 — 잠긴 상태에서도 수정 모드 유지 + 콘텐츠 편집이 큐잉/플러시된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.evaluate((tid) => tripMetaRef(tid).update({ locked: true }), tripId);
  await page.waitForTimeout(50);

  await page.evaluate(() => setMode('edit'));
  expect(await page.evaluate(() => currentMode)).toBe('edit');
  const editDisabled = await page.locator('.mode-seg-opt[data-mode="edit"]').isDisabled();
  expect(editDisabled).toBe(false);

  await page.evaluate(() => { queuePatch({ ['notes.ownerNote']: { mode: 'text', content: '오너 편집' } }); });
  await page.evaluate(() => flushCloud());
  const content = await page.evaluate((tid) => tripContentRef(tid).get().then(s => s.data()), tripId);
  expect(content.notes.ownerNote.content).toBe('오너 편집');
});

test('오너가 아닌 멤버는 잠긴 여행에서 수정 버튼이 비활성화되어 일반 UI 흐름으로는 수정 모드에 진입할 수 없다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({
    members: firebase.firestore.FieldValue.arrayUnion('u2'),
    ['memberNames.u2']: '멤버2',
    locked: true,
  }), tripId);
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '멤버2', email: 'u2@example.com' }));
  await page.waitForTimeout(50);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.waitForTimeout(50);

  const editOpt = page.locator('.mode-seg-opt[data-mode="edit"]');
  await expect(editOpt).toBeDisabled();
});

test('openMembersModal: owner 에게는 잠금 토글 버튼과 상태별 라벨이, 잠긴 여행의 non-owner 에게는 안내문(토글 버튼 없이)이 표시된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());

  // 1) owner, 잠금 전 → "잠그기" 라벨
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  let html = await page.locator('#v2ModalBody').innerHTML();
  expect(html).toContain('data-action="toggle-lock"');
  expect(html).toContain('잠그기');

  // 2) owner, 잠금 후 → "잠금 해제" 라벨
  await page.click('[data-action="toggle-lock"]');
  await page.waitForTimeout(50);
  html = await page.locator('#v2ModalBody').innerHTML();
  expect(html).toContain('data-action="toggle-lock"');
  expect(html).toContain('잠금 해제');
  await page.evaluate(() => { document.getElementById('v2Modal').hidden = true; });

  // 3) non-owner, 잠긴 상태 → 안내문만, 토글 버튼 없음
  await page.evaluate((tid) => tripMetaRef(tid).update({
    members: firebase.firestore.FieldValue.arrayUnion('u2'),
    ['memberNames.u2']: '멤버2',
  }), tripId);
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '멤버2', email: 'u2@example.com' }));
  await page.waitForTimeout(50);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  html = await page.locator('#v2ModalBody').innerHTML();
  expect(html).not.toContain('data-action="toggle-lock"');
  expect(html).toContain('오너가 이 여행을 잠갔어요');
});
