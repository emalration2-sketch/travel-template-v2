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
