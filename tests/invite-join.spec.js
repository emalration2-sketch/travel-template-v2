const { test, expect } = require('./support/fixtures');

test('?join=<tripId> 링크로 접속하면 members 에 자기 uid 와 이름이 추가되고 그 여행이 열린다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '초대받은사람', email: 'u2@example.com' }));
  await page.goto('/?join=' + tripId);
  await page.waitForTimeout(50);
  const result = await page.evaluate(async (tid) => {
    const metaSnap = await tripMetaRef(tid).get();
    return { members: metaSnap.data().members, memberNames: metaSnap.data().memberNames, currentScreen, currentTripId };
  }, tripId);
  expect(result.members).toContain('u2');
  expect(result.memberNames.u2).toBe('초대받은사람');
  expect(result.currentScreen).toBe('editor');
  expect(result.currentTripId).toBe(tripId);
});

test('?join= 값에 /(경로 구분자)가 섞여 있으면 무시하고 joinTrip 을 호출하지 않는다(경로 탈출 방지)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '초대받은사람', email: 'u2@example.com' }));
  // tripId 뒤에 /content/main 을 이어붙여 실제 콘텐츠 문서 경로로 향하게 만든 악성 join 값
  const maliciousJoin = encodeURIComponent(tripId + '/content/main');
  await page.goto('/?join=' + maliciousJoin);
  await page.waitForTimeout(50);
  const result = await page.evaluate(async (tid) => {
    const metaSnap = await tripMetaRef(tid).get();
    return { members: metaSnap.data().members, currentScreen, currentTripId, url: location.href };
  }, tripId);
  expect(result.members).toEqual(['u1']); // u2 가 추가되지 않았어야 함
  expect(result.currentTripId).not.toBe(tripId); // 해당 여행이 열리지 않았어야 함
  expect(result.currentScreen).toBe('mypage'); // editor 로 넘어가지 않음(크래시 없이 조용히 무시)
  expect(result.url).not.toContain('join='); // 쿼리 파라미터는 정리됨
});

test('이미 멤버인 사람이 자기 여행 조인 링크로 다시 접속하면 members 가 중복되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.goto('/?join=' + tripId);
  await page.waitForTimeout(50);
  const members = await page.evaluate((tid) => tripMetaRef(tid).get().then(s => s.data().members), tripId);
  expect(members).toEqual(['u1']);
});

test('처음 참여하는 멤버는 멤버 활동 기록에 참여 항목이 한 번 추가되고, joinLogged 마커가 설정된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '초대받은사람', email: 'u2@example.com' }));
  await page.goto('/?join=' + tripId);
  await page.waitForTimeout(50);
  const result = await page.evaluate(async (tid) => {
    const content = (await tripContentRef(tid).get()).data();
    const meta = (await tripMetaRef(tid).get()).data();
    return { content, meta };
  }, tripId);
  const logIds = Object.keys(result.content.memberLog || {});
  expect(logIds.length).toBe(1);
  const entry = result.content.memberLog[logIds[0]];
  expect(entry.type).toBe('join');
  expect(entry.uid).toBe('u2');
  expect(entry.name).toBe('초대받은사람');
  expect(result.content.memberLogOrder).toContain(logIds[0]);
  expect(result.meta.joinLogged && result.meta.joinLogged.u2).toBe(true);
  // 기존 notes 는 더 이상 참여 기록에 쓰이지 않는다
  expect(Object.keys(result.content.notes || {}).length).toBe(0);
});

test('이미 멤버인 사람이 다시 조인 링크로 접속해도 멤버 활동 기록이 추가되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.goto('/?join=' + tripId);
  await page.waitForTimeout(50);
  const contentBefore = await page.evaluate((tid) => tripContentRef(tid).get().then(s => s.data()), tripId);
  const countBefore = Object.keys(contentBefore.memberLog || {}).length;
  // 이미 멤버인 u1 이 같은 조인 링크로 다시 접속
  await page.goto('/?join=' + tripId);
  await page.waitForTimeout(50);
  const contentAfter = await page.evaluate((tid) => tripContentRef(tid).get().then(s => s.data()), tripId);
  const countAfter = Object.keys(contentAfter.memberLog || {}).length;
  expect(countAfter).toBe(countBefore);
});

test('회귀방지: 실시간 참여(joinTrip) 직후 소급 백필(backfillMemberLogOnce)이 돌아도 참여 기록이 중복되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn()); // u1 = 오너
  await page.waitForTimeout(50);
  const tripId = await page.evaluate(() => createTrip());
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '초대받은사람', email: 'u2@example.com' }));
  await page.goto('/?join=' + tripId); // u2 가 실시간으로 참여 → memberLog 1건 + joinLogged.u2=true
  await page.waitForTimeout(50);
  await page.evaluate(() => window.__test.signOut());
  await page.evaluate(() => window.__test.signIn()); // 다시 오너(u1)로 로그인
  await page.waitForTimeout(50);
  await page.evaluate(() => refreshTripList());
  await page.evaluate(() => backfillMemberLogOnce()); // 오너가 백필을 (다시) 돌려도 u2 는 이미 joinLogged 라 건너뛰어야 함
  const content = await page.evaluate((tid) => tripContentRef(tid).get().then(s => s.data()), tripId);
  const logIds = Object.keys(content.memberLog || {});
  expect(logIds.length).toBe(1); // 실시간 참여로 생긴 1건뿐, 백필로 추가되지 않음
});
