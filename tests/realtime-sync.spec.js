const { test, expect } = require('./support/fixtures');

test('한 클라이언트의 dot-path 변경이 같은 여행을 연 다른 state 인스턴스에도 반영된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    // "사용자 A" 세션
    currentTripId = id; state = await loadTrip(id);
    subscribeTripContent(id);
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    // "사용자 B" 가 같은 콘텐츠 문서를 직접 수정(별도 상태 변수로 시뮬레이션)
    await tripContentRef(id).update({ ['days.' + dayId + '.items.' + itemId + '.place']: 'B가 고침' });
    await new Promise(r => setTimeout(r, 0));
    return state.days.find(d => d.id === dayId).items.find(i => i.id === itemId).place;
  });
  expect(r).toBe('B가 고침');
});

test('편집 필드에 포커스가 있는 동안에는 원격 갱신을 지연했다가 blur 시 적용한다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    rebuildAll(); setMode('edit');
    showScreen('editor'); showEditorTab('schedule'); // input.focus() 가 실제로 동작하려면 화면이 보여야 함(hidden 이면 포커스 불가)
    subscribeTripContent(id);
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    const input = document.querySelector(`.tl-place[data-day-id="${dayId}"][data-item-id="${itemId}"]`);
    input.focus();
    await tripContentRef(id).update({ ['days.' + dayId + '.items.' + itemId + '.place']: '원격변경' });
    await new Promise(r => setTimeout(r, 0));
    const whileFocused = state.days.find(d => d.id === dayId).items.find(i => i.id === itemId).place;
    input.blur();
    await new Promise(r => setTimeout(r, 0));
    const afterBlur = state.days.find(d => d.id === dayId).items.find(i => i.id === itemId).place;
    return { whileFocused, afterBlur };
  });
  expect(r.whileFocused).not.toBe('원격변경'); // 포커스 중엔 아직 반영 안 됨
  expect(r.afterBlur).toBe('원격변경');        // blur 후 반영됨
});

test('한 필드를 blur 하고 바로 다른 편집 필드로 포커스를 옮기면, 지연된 setTimeout(0) 시점에 최신 원격 스냅샷이 유실 없이 반영 대기 상태를 유지한다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    rebuildAll(); setMode('edit');
    showScreen('editor'); showEditorTab('schedule'); // input.focus() 가 실제로 동작하려면 화면이 보여야 함(hidden 이면 포커스 불가)
    subscribeTripContent(id);
    const dayId = state.days[0].id;
    const itemIdA = state.days[0].items[0].id;
    // 둘째 일정 항목 추가 (B 필드용)
    state.days[0].items.push({ id: 'itemB', time: '', place: '', memo: '', expenses: [] });
    rebuildAll();
    const inputA = document.querySelector(`.tl-place[data-day-id="${dayId}"][data-item-id="${itemIdA}"]`);
    const inputB = document.querySelector(`.tl-place[data-day-id="${dayId}"][data-item-id="itemB"]`);
    inputA.focus();
    // 첫 번째 원격 갱신 — A에 포커스 있는 동안 도착 → pending 으로 저장됨
    await tripContentRef(id).update({ ['days.' + dayId + '.items.' + itemIdA + '.place']: 'V1' });
    await new Promise(r => setTimeout(r, 0));
    // A blur, 곧바로 B로 포커스 이동 (동기적으로, setTimeout(0) 매크로태스크가 돌기 전에)
    inputA.blur();
    inputB.focus();
    // A의 blur 로 예약된 setTimeout(0) 이 아직 실행되기 전, 두 번째(더 최신) 원격 갱신이 도착
    await tripContentRef(id).update({ ['days.' + dayId + '.items.' + itemIdA + '.place']: 'V2-최신' });
    await new Promise(r => setTimeout(r, 0));
    const placeAfterDeferredFires = state.days.find(d => d.id === dayId).items.find(i => i.id === itemIdA).place;
    // B blur 하면 이제는 최신(V2) 값이 반영되어야 한다 — V1 으로 되돌아가면 버그
    inputB.blur();
    await new Promise(r => setTimeout(r, 0));
    const placeAfterBBlur = state.days.find(d => d.id === dayId).items.find(i => i.id === itemIdA).place;
    return { placeAfterDeferredFires, placeAfterBBlur };
  });
  // B 가 여전히 포커스 중이므로 A blur 로 예약된 지연 적용 시점엔 아직 반영되면 안 된다
  expect(r.placeAfterDeferredFires).not.toBe('V1');
  expect(r.placeAfterDeferredFires).not.toBe('V2-최신');
  // B blur 후에는 가장 최신 값(V2)이 반영되어야 한다 (오래된 V1 로 되돌아가면 안 됨)
  expect(r.placeAfterBBlur).toBe('V2-최신');
});
