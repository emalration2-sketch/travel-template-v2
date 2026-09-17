const { test, expect } = require('./support/fixtures');

test('멤버 관리 모달에 초대 링크와 멤버 목록(이름)이 뜨고, owner 는 자기 자신에게 내보내기 버튼이 없다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({ ['memberNames.u1']: '김진' }), tripId);
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  const html = await page.locator('#v2ModalBody').innerHTML();
  expect(html).toContain('김진');
  expect(html).toContain('/?join=' + tripId);
  const kickButtons = await page.locator('#v2ModalBody [data-action="kick-member"]').count();
  expect(kickButtons).toBe(0); // 멤버가 자기 자신뿐이라 kick 대상 없음
});

test('owner 가 아닌 멤버는 "여행 나가기" 버튼을 볼 수 있고, 누르면 members 에서 자기 자신이 빠지고 마이페이지로 이동한다', async ({ page }) => {
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
  await page.click('#tripMembersBtn');
  page.once('dialog', d => d.accept());
  await page.click('[data-action="leave-trip"]');
  await page.waitForTimeout(50);
  const result = await page.evaluate(async (tid) => {
    const meta = (await tripMetaRef(tid).get()).data();
    return { members: meta.members, hasName: 'u2' in meta.memberNames, screen: currentScreen };
  }, tripId);
  expect(result.members).not.toContain('u2');
  expect(result.hasName).toBe(false);
  expect(result.screen).toBe('mypage');
});

test('leaveTrip 이 실패하면(오프라인) 알림을 띄우고 모달/화면은 조용히 방치되지 않는다', async ({ page }) => {
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
  await page.click('#tripMembersBtn');
  await page.evaluate(() => window.__test.setOffline(true));
  const dialogMessages = [];
  page.on('dialog', d => { dialogMessages.push(d.message()); d.accept(); });
  await page.click('[data-action="leave-trip"]');
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__test.setOffline(false));
  const result = await page.evaluate(async (tid) => {
    const meta = (await tripMetaRef(tid).get()).data();
    return {
      members: meta.members,
      modalHidden: document.getElementById('v2Modal').hidden,
      currentTripId,
      screen: currentScreen,
    };
  }, tripId);
  // 실패했으므로 members 에서 빠지지 않아야 하고, currentTripId 도 그대로 유지되어야 한다(자동 로그아웃/이동 없음)
  expect(result.members).toContain('u2');
  expect(result.currentTripId).toBe(tripId);
  expect(result.screen).toBe('editor');
  expect(dialogMessages.some(m => m.includes('실패'))).toBe(true);
});

test('kickMember 가 실패하면(오프라인) 알림을 띄우고 멤버 목록은 변경되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({
    members: firebase.firestore.FieldValue.arrayUnion('u2'),
    ['memberNames.u2']: '멤버2',
  }), tripId);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  await page.evaluate(() => window.__test.setOffline(true));
  const dialogMessages = [];
  page.on('dialog', d => { dialogMessages.push(d.message()); d.accept(); });
  await page.click('[data-action="kick-member"][data-uid="u2"]');
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__test.setOffline(false));
  const meta = await page.evaluate((tid) => tripMetaRef(tid).get().then(s => s.data()), tripId);
  expect(meta.members).toContain('u2');
  expect('u2' in meta.memberNames).toBe(true);
  expect(dialogMessages.some(m => m.includes('실패'))).toBe(true);
});

test('owner 는 다른 멤버를 내보낼(kick) 수 있다 — 확인 대화상자 2번 모두 수락해야 진행된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({
    members: firebase.firestore.FieldValue.arrayUnion('u2'),
    ['memberNames.u2']: '멤버2',
  }), tripId);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  let dialogCount = 0;
  page.on('dialog', d => { dialogCount++; d.accept(); });
  await page.click('[data-action="kick-member"][data-uid="u2"]');
  await page.waitForTimeout(50);
  expect(dialogCount).toBe(2); // 2단계 확인
  const meta = await page.evaluate((tid) => tripMetaRef(tid).get().then(s => s.data()), tripId);
  expect(meta.members).not.toContain('u2');
  expect('u2' in meta.memberNames).toBe(false);
});

test('내보내기 2번째 확인을 취소하면 멤버가 내보내지지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({
    members: firebase.firestore.FieldValue.arrayUnion('u2'),
    ['memberNames.u2']: '멤버2',
  }), tripId);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  let dialogCount = 0;
  page.on('dialog', d => {
    dialogCount++;
    if(dialogCount === 1) d.accept(); else d.dismiss(); // 1차 확인은 수락, 2차 확인은 취소
  });
  await page.click('[data-action="kick-member"][data-uid="u2"]');
  await page.waitForTimeout(50);
  expect(dialogCount).toBe(2);
  const meta = await page.evaluate((tid) => tripMetaRef(tid).get().then(s => s.data()), tripId);
  expect(meta.members).toContain('u2'); // 취소했으므로 그대로 남아있어야 함
  expect('u2' in meta.memberNames).toBe(true);
});

test('owner 가 멤버를 내보내면 멤버 활동 기록에 kick 항목이 하나 새로 추가된다(notes 에는 쓰지 않는다)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({
    members: firebase.firestore.FieldValue.arrayUnion('u2'),
    ['memberNames.u2']: '멤버2',
  }), tripId);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  const contentBefore = await page.evaluate((tid) => tripContentRef(tid).get().then(s => s.data()), tripId);
  const logIdsBefore = Object.keys(contentBefore.memberLog || {});
  page.on('dialog', d => d.accept());
  await page.click('[data-action="kick-member"][data-uid="u2"]');
  await page.waitForTimeout(50);
  const content = await page.evaluate((tid) => tripContentRef(tid).get().then(s => s.data()), tripId);
  const logIdsAfter = Object.keys(content.memberLog || {});
  expect(logIdsAfter.length).toBe(logIdsBefore.length + 1);
  const newLogId = logIdsAfter.find(id => !logIdsBefore.includes(id));
  expect(content.memberLog[newLogId].type).toBe('kick');
  expect(content.memberLog[newLogId].name).toBe('멤버2');
  expect(content.memberLogOrder).toContain(newLogId);
  expect(Object.keys(content.notes || {}).length).toBe(0);
});

test('내보내기 기록 추가 시 uid() 전역 생성기가 정상 호출된다(파라미터 섀도잉 회귀 방지) — 새 기록 id 는 kick 된 uid 와 다르다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate((tid) => tripMetaRef(tid).update({
    members: firebase.firestore.FieldValue.arrayUnion('u2'),
    ['memberNames.u2']: '멤버2',
  }), tripId);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('#tripMembersBtn');
  page.on('dialog', d => d.accept());
  await page.click('[data-action="kick-member"][data-uid="u2"]');
  await page.waitForTimeout(50);
  const content = await page.evaluate((tid) => tripContentRef(tid).get().then(s => s.data()), tripId);
  const logIds = Object.keys(content.memberLog || {});
  expect(logIds.length).toBe(1);
  expect(logIds[0]).not.toBe('u2'); // uid() 가 섀도잉으로 인해 던졌다면 애초에 기록 자체가 생기지 않으므로, 이 값 검증까지 도달했다는 것 자체가 정상 동작의 증거
});

test('멤버 활동 기록은 오너에게만 삭제 버튼이 보이고, 삭제하면 목록에서 제거된다(비오너에게는 삭제 버튼이 없다)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn()); // u1 = 오너
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '멤버2', email: 'u2@example.com' }));
  await page.goto('/?join=' + tripId); // u2 참여 → memberLog 1건 생성
  await page.waitForTimeout(50);

  // 비오너(u2) 화면에는 삭제 버튼이 없어야 한다
  await page.click('[data-action="set-mode"][data-mode="edit"]');
  await page.evaluate(() => showEditorTab('notes'));
  let delCount = await page.locator('[data-action="delete-member-log"]').count();
  expect(delCount).toBe(0);

  // 오너(u1)로 다시 로그인하면 삭제 버튼이 보이고, 클릭하면 기록이 사라진다
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  await page.evaluate((tid) => openTrip(tid), tripId);
  await page.click('[data-action="set-mode"][data-mode="edit"]');
  await page.evaluate(() => showEditorTab('notes'));
  delCount = await page.locator('[data-action="delete-member-log"]').count();
  expect(delCount).toBe(1);
  await page.click('[data-action="delete-member-log"]');
  await page.evaluate(() => forceFlush());
  const content = await page.evaluate((tid) => tripContentRef(tid).get().then(s => s.data()), tripId);
  expect(Object.keys(content.memberLog || {}).length).toBe(0);
});
