const { test, expect } = require('./support/fixtures');

test('서로 다른 일차 항목을 "동시에" 수정해도 서로의 변경이 유실되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    addDay(); // 두 번째 날 추가
    await forceFlush();
    const day1 = state.days[0].id, day2 = state.days[1].id;
    const item1 = state.days[0].items[0].id, item2 = state.days[1].items[0].id;

    // "두 사람"이 각자 다른 날짜의 항목을 동시에 고침(같은 debounce 창 안에서)
    queuePatch({ ['days.' + day1 + '.items.' + item1 + '.place']: 'A가 고침' });
    save();
    await tripContentRef(id).update({ ['days.' + day2 + '.items.' + item2 + '.place']: 'B가 고침(직접 씀)' });
    await forceFlush();

    const content = (await tripContentRef(id).get()).data();
    return { p1: content.days[day1].items[item1].place, p2: content.days[day2].items[item2].place };
  });
  expect(r.p1).toBe('A가 고침');
  expect(r.p2).toBe('B가 고침(직접 씀)'); // A의 flush 가 B의 직접 쓰기를 덮어쓰지 않음
});

test('같은 항목의 같은 필드를 동시에 고치면 나중 쓰기가 이기되, 다른 필드는 안전하다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    await forceFlush();

    queuePatch({ ['days.' + dayId + '.items.' + itemId + '.memo']: 'A의 메모' }); // 아직 안 보냄
    await tripContentRef(id).update({
      ['days.' + dayId + '.items.' + itemId + '.place']: 'B의 장소', // 다른 필드
    });
    await forceFlush(); // A의 큐가 지금 나감 → memo 만 덮어씀, place 는 안 건드림(dot-path 덕분)

    const content = (await tripContentRef(id).get()).data();
    return content.days[dayId].items[itemId];
  });
  expect(r.memo).toBe('A의 메모');
  expect(r.place).toBe('B의 장소'); // 서로 다른 필드라 공존
});

test('비멤버는 loadTrip 이 실패한다(권한 시뮬레이션 — 실제 규칙은 Task 8에서 라이브로 검증)', async ({ page }) => {
  // 스텁은 보안 규칙을 흉내내지 않으므로, 이 테스트는 "존재하지 않는 트립을 열면 실패"만 검증해
  // loadTrip 의 에러 경로 자체가 살아있는지 확인하는 회귀 가드다.
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const threw = await page.evaluate(async () => {
    try{ await loadTrip('존재하지않는아이디'); return false; }catch(e){ return true; }
  });
  expect(threw).toBe(true);
});
