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

test('owner 는 다른 멤버를 내보낼(kick) 수 있다', async ({ page }) => {
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
  page.once('dialog', d => d.accept());
  await page.click('[data-action="kick-member"][data-uid="u2"]');
  await page.waitForTimeout(50);
  const meta = await page.evaluate((tid) => tripMetaRef(tid).get().then(s => s.data()), tripId);
  expect(meta.members).not.toContain('u2');
  expect('u2' in meta.memberNames).toBe(false);
});
