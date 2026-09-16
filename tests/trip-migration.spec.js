const { test, expect } = require('./support/fixtures');

test('로그인 시 옛 users/{uid}/trips 구조가 새 trips/{id} 구조로 마이그레이션된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    // 옛 구조를 직접 시드 — 실제로 옛 버전 앱이 만들었을 법한 문서
    window.__test.seed('users/u1/trips/legacy1', {
      data: JSON.stringify({ title: '옛날여행', travelers: ['나'], days: [{ id:'d1', date:'', label:'', items:[{id:'i1',time:'',place:'',memo:'',expenses:[]}] }], notes: [], links: [], attachments: [] }),
      title: '옛날여행', startDate: '', endDate: '', dayCount: 1,
    });
  });
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    await migrateLegacyTrips();
    const metaSnap = await tripMetaRef('legacy1').get();
    const contentSnap = await tripContentRef('legacy1').get();
    const oldSnap = await fbDb.doc('users/u1/trips/legacy1').get();
    return { meta: metaSnap.data(), content: contentSnap.data(), oldExists: oldSnap.exists };
  });
  expect(result.meta.title).toBe('옛날여행');
  expect(result.meta.ownerUid).toBe('u1');
  expect(result.meta.members).toEqual(['u1']);
  expect(result.content.dayOrder).toEqual(['d1']);
  expect(result.oldExists).toBe(false); // 옛 문서는 성공 후 삭제됨
});

test('마이그레이션은 멱등적이다 — 이미 새 구조가 있으면 내용을 덮어쓰지 않고 옛 문서만 정리', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1/trips/legacy2', { data: JSON.stringify({ title: '옛날버전', travelers: [], days: [], notes: [], links: [], attachments: [] }), title: '옛날버전' });
    window.__test.seed('trips/legacy2', { ownerUid: 'u1', members: ['u1'], memberNames: { u1: '김진' }, title: '이미마이그레이션됨' });
    window.__test.seed('trips/legacy2/content/main', { dayOrder: [], days: {}, noteOrder: [], notes: {}, linkOrder: [], links: {}, travelers: [], attachments: [] });
  });
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    await migrateLegacyTrips();
    const metaSnap = await tripMetaRef('legacy2').get();
    const oldSnap = await fbDb.doc('users/u1/trips/legacy2').get();
    return { title: metaSnap.data().title, oldExists: oldSnap.exists };
  });
  expect(result.title).toBe('이미마이그레이션됨'); // 안 덮어씀
  expect(result.oldExists).toBe(false); // 옛 문서는 정리됨
});

test('data 필드가 아예 없는 레거시 문서(메타만 있음)도 크래시 없이 빈 콘텐츠로 마이그레이션된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    // data 필드 자체가 없는 문서 — 아주 옛날 버전이 메타만 저장했던 경우를 가정
    window.__test.seed('users/u1/trips/legacy3', {
      title: '메타만있음', startDate: '', endDate: '', dayCount: 0,
    });
  });
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    await migrateLegacyTrips();
    const metaSnap = await tripMetaRef('legacy3').get();
    const contentSnap = await tripContentRef('legacy3').get();
    const oldSnap = await fbDb.doc('users/u1/trips/legacy3').get();
    return { meta: metaSnap.data(), content: contentSnap.data(), oldExists: oldSnap.exists };
  });
  expect(result.meta.title).toBe('메타만있음');
  expect(result.content.travelers).toEqual([]);
  expect(result.content.dayOrder).toEqual([]);
  expect(result.oldExists).toBe(false);
});

test('data JSON에 travelers 키가 없는 레거시 문서도 크래시 없이 마이그레이션되고 travelers는 빈 배열이 된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    // travelers 키가 아예 없는 옛 data JSON
    window.__test.seed('users/u1/trips/legacy4', {
      data: JSON.stringify({ title: '트래블러없음', days: [], notes: [], links: [], attachments: [] }),
      title: '트래블러없음', startDate: '', endDate: '', dayCount: 0,
    });
  });
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    await migrateLegacyTrips();
    const contentSnap = await tripContentRef('legacy4').get();
    const oldSnap = await fbDb.doc('users/u1/trips/legacy4').get();
    return { content: contentSnap.data(), oldExists: oldSnap.exists };
  });
  expect(result.content.travelers).toEqual([]);
  expect(result.oldExists).toBe(false);
});

test('첨부 복사가 일부만 끝난 상태(메타/콘텐츠는 이미 생성됨)에서 재시도하면 남은 첨부가 유실 없이 모두 복사된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    // 첫 번째 마이그레이션 시도가 메타+콘텐츠 생성까지는 성공했지만
    // 첨부 복사 도중(2개 중 1개만 복사한 채) 실패해 재시도 대기 중인 상태를 직접 시드한다.
    window.__test.seed('users/u1/trips/legacy5', {
      data: JSON.stringify({ title: '부분복사', travelers: ['나'], days: [], notes: [], links: [], attachments: [] }),
      title: '부분복사', startDate: '', endDate: '', dayCount: 0,
    });
    window.__test.seed('users/u1/trips/legacy5/att/a1', { name: 'a1.png', bytes: 'AAA' });
    window.__test.seed('users/u1/trips/legacy5/att/a2', { name: 'a2.png', bytes: 'BBB' });
    // 새 구조는 이미 생성된 상태(첫 시도에서 성공)
    window.__test.seed('trips/legacy5', { ownerUid: 'u1', members: ['u1'], memberNames: { u1: '김진' }, title: '부분복사' });
    window.__test.seed('trips/legacy5/content/main', { dayOrder: [], days: {}, noteOrder: [], notes: {}, linkOrder: [], links: {}, travelers: ['나'], attachments: [] });
    // 첨부는 a1만 복사 완료, a2는 아직 옛 위치에만 존재(부분 실패 흉내)
    window.__test.seed('trips/legacy5/att/a1', { name: 'a1.png', bytes: 'AAA' });
  });
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    await migrateLegacyTrips();
    const a1 = await fbDb.doc('trips/legacy5/att/a1').get();
    const a2 = await fbDb.doc('trips/legacy5/att/a2').get();
    const oldDoc = await fbDb.doc('users/u1/trips/legacy5').get();
    const oldA1 = await fbDb.doc('users/u1/trips/legacy5/att/a1').get();
    const oldA2 = await fbDb.doc('users/u1/trips/legacy5/att/a2').get();
    return {
      a1Exists: a1.exists, a1Data: a1.data(),
      a2Exists: a2.exists, a2Data: a2.data(),
      oldDocExists: oldDoc.exists, oldA1Exists: oldA1.exists, oldA2Exists: oldA2.exists,
    };
  });
  // 재시도 후 두 첨부 모두 새 위치에 존재해야 함 — a2가 유실되면 안 된다.
  expect(result.a1Exists).toBe(true);
  expect(result.a1Data).toEqual({ name: 'a1.png', bytes: 'AAA' });
  expect(result.a2Exists).toBe(true);
  expect(result.a2Data).toEqual({ name: 'a2.png', bytes: 'BBB' });
  // 옛 문서/첨부는 모두 정리됨
  expect(result.oldDocExists).toBe(false);
  expect(result.oldA1Exists).toBe(false);
  expect(result.oldA2Exists).toBe(false);
});
