const { test, expect } = require('./support/fixtures');

test('queuePatch 로 쌓인 변경이 디바운스 뒤 한 번의 update() 로 콘텐츠 문서에 반영되고, 메타도 같이 갱신된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id;
    state = await loadTrip(id);
    state.title = '새 제목';
    queuePatch({ ['days.' + state.days[0].id + '.items.' + state.days[0].items[0].id + '.place']: '공항' });
    save();
    await forceFlush();
    const metaSnap = await tripMetaRef(id).get();
    const contentSnap = await tripContentRef(id).get();
    return { meta: metaSnap.data(), content: contentSnap.data(), dayId: state.days[0].id, itemId: state.days[0].items[0].id };
  });
  expect(result.meta.title).toBe('새 제목');
  expect(result.content.days[result.dayId].items[result.itemId].place).toBe('공항');
});

test('flushCloud 실패 시 대기 중이던 패치가 유실되지 않고 다음 flush 에 합쳐진다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const result = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id;
    state = await loadTrip(id);
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    window.__test.setOffline(true);
    queuePatch({ ['days.' + dayId + '.items.' + itemId + '.place']: '실패시도' });
    save();
    await forceFlush().catch(() => {}); // 실패 예상
    window.__test.setOffline(false);
    queuePatch({ ['days.' + dayId + '.items.' + itemId + '.memo']: '두번째' });
    save();
    await forceFlush();
    const contentSnap = await tripContentRef(id).get();
    return contentSnap.data().days[dayId].items[itemId];
  });
  expect(result.place).toBe('실패시도'); // 첫 시도의 패치도 결국 반영됨
  expect(result.memo).toBe('두번째');
});
