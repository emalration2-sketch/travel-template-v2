const { test, expect } = require('./support/fixtures');
async function signedIn(page){
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
}

test('flushCloud 는 메타 문서에 파생 필드(title/startDate/endDate/dayCount)를 병합 저장한다', async ({ page }) => {
  // 옛 saveTrip(전체 blob 저장)은 Task 5에서 flushCloud(메타 병합 + 콘텐츠 부분 패치)로 완전히 대체되어 삭제됨.
  await signedIn(page);
  const id = await page.evaluate(() => createTrip());
  const raw = await page.evaluate(async (id) => {
    currentTripId = id;
    state = await loadTrip(id);
    state.title = '도쿄';
    state.days = [
      { id: 'd1', date: '2026-04-01', label: '', items: [] },
      { id: 'd2', date: '2026-04-03', label: '', items: [] },
    ];
    save();
    await forceFlush();
    return window.__test.dump()['trips/' + id];
  }, id);
  expect(raw).toMatchObject({ title: '도쿄', startDate: '2026-04-01', endDate: '2026-04-03', dayCount: 2 });
});

test('deleteTrip 은 문서와 tripOrder 에서 제거', async ({ page }) => {
  await signedIn(page);
  const a = await page.evaluate(() => createTrip());
  const b = await page.evaluate(() => createTrip());
  await page.evaluate((a) => deleteTrip(a), a);
  expect(await page.evaluate((a) => window.__test.dump()['trips/' + a], a)).toBeUndefined();
  const p = await page.evaluate(() => loadProfile());
  expect(p.tripOrder).toEqual([b]);
});

test('deleteTrip 은 메타 문서와 콘텐츠 문서를 모두 지운다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const after = await page.evaluate(async () => {
    const id = await createTrip();
    await deleteTrip(id);
    const metaSnap = await tripMetaRef(id).get();
    const contentSnap = await tripContentRef(id).get();
    return { metaExists: metaSnap.exists, contentExists: contentSnap.exists };
  });
  expect(after.metaExists).toBe(false);
  expect(after.contentExists).toBe(false);
});

test('deleteTrip 은 att 서브컬렉션 첨부 문서도 정리하고, 메타 삭제보다 먼저 지운다(부모 문서가 살아있는 동안 att 규칙 get() 이 통과하도록)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const after = await page.evaluate(async () => {
    const id = await createTrip();
    window.__test.seed('trips/' + id + '/att/a1', { name: 'a1.png', bytes: 'AAA' });
    window.__test.seed('trips/' + id + '/att/a2', { name: 'a2.png', bytes: 'BBB' });
    await deleteTrip(id);
    const attSnap = await tripsCol().doc(id).collection('att').get();
    const metaSnap = await tripMetaRef(id).get();
    return { attCount: attSnap.docs.length, metaExists: metaSnap.exists };
  });
  expect(after.attCount).toBe(0);
  expect(after.metaExists).toBe(false);
});
