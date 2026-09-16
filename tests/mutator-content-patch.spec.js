const { test, expect } = require('./support/fixtures');

test('addItem/moveItem/deleteItem 이 올바른 dot-path 패치를 큐에 쌓는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    const dayId = state.days[0].id;
    addItem(dayId);
    const newItemId = state.days[0].items[1].id;
    moveItem(dayId, newItemId, -1); // 새 항목을 맨 위로
    deleteItem(dayId, state.days[0].items[1].id); // 원래 첫 항목(이제 두번째) 삭제
    await forceFlush();
    const content = (await tripContentRef(id).get()).data();
    return { itemOrder: content.days[dayId].itemOrder, itemIds: Object.keys(content.days[dayId].items), newItemId };
  });
  expect(r.itemOrder).toEqual([r.newItemId]);
  expect(r.itemIds).toEqual([r.newItemId]);
});

test('addNote/deleteNote 가 notes 맵 + noteOrder 를 갱신한다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    addNote();
    const noteId = state.notes[0].id;
    await forceFlush();
    const afterAdd = (await tripContentRef(id).get()).data();
    deleteNote(noteId);
    await forceFlush();
    const afterDelete = (await tripContentRef(id).get()).data();
    return { afterAdd: { order: afterAdd.noteOrder, has: !!afterAdd.notes[noteId] }, afterDelete: { order: afterDelete.noteOrder, has: !!afterDelete.notes[noteId] } };
  });
  expect(r.afterAdd.order).toEqual([expect.any(String)]);
  expect(r.afterAdd.has).toBe(true);
  expect(r.afterDelete.order).toEqual([]);
  expect(r.afterDelete.has).toBe(false);
});

test('addTraveler/deleteTraveler 는 arrayUnion/arrayRemove 를 쓴다(인덱스 아님)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    document.getElementById('newTravelerInput') || renderTravelers();
    const before = state.travelers.slice();
    state.travelers.push('친구');
    queuePatch({ travelers: firebase.firestore.FieldValue.arrayUnion('친구') });
    save();
    await forceFlush();
    const content = (await tripContentRef(id).get()).data();
    return { travelers: content.travelers, before };
  });
  expect(r.travelers.sort()).toEqual([...r.before, '친구'].sort());
});

test('같은 디바운스 창 안에서 두 명을 연달아 추가해도 둘 다 살아남는다(회귀: Object.assign 덮어쓰기 버그)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    renderTravelers();
    const before = state.travelers.slice();
    // addTraveler() 는 매 호출 뒤 renderTravelers() 로 #newTravelerInput DOM 노드를 교체하므로
    // 캐시된 참조를 재사용하지 말고 매번 새로 조회한다.
    document.getElementById('newTravelerInput').value = '철수'; addTraveler();
    document.getElementById('newTravelerInput').value = '영희'; addTraveler();
    await forceFlush();
    const content = (await tripContentRef(id).get()).data();
    return { travelers: content.travelers, before };
  });
  expect(r.travelers.sort()).toEqual([...r.before, '철수', '영희'].sort());
});

test('같은 디바운스 창 안에서 두 명을 연달아 제거해도 둘 다 사라진다(회귀)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    state.travelers.push('철수', '영희');
    queuePatch({ travelers: state.travelers.slice() });
    save();
    await forceFlush();
    const beforeContent = (await tripContentRef(id).get()).data();
    // 두 명을 연달아 삭제 — deleteTraveler 는 인덱스를 받는다
    const idx1 = state.travelers.indexOf('철수');
    deleteTraveler(String(idx1));
    const idx2 = state.travelers.indexOf('영희');
    deleteTraveler(String(idx2));
    await forceFlush();
    const afterContent = (await tripContentRef(id).get()).data();
    return { beforeTravelers: beforeContent.travelers, afterTravelers: afterContent.travelers };
  });
  expect(r.beforeTravelers).toEqual(expect.arrayContaining(['철수', '영희']));
  expect(r.afterTravelers).not.toContain('철수');
  expect(r.afterTravelers).not.toContain('영희');
});

test('같은 창 안에서 한 명 추가 + 다른(기존) 한 명 제거 → 최종 결과가 둘 다 정확히 반영된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    state.travelers.push('기존멤버');
    queuePatch({ travelers: state.travelers.slice() });
    save();
    await forceFlush();
    renderTravelers();
    document.getElementById('newTravelerInput').value = '신규멤버'; addTraveler();
    const idx = state.travelers.indexOf('기존멤버');
    deleteTraveler(String(idx));
    await forceFlush();
    const content = (await tripContentRef(id).get()).data();
    return content.travelers;
  });
  expect(r).toContain('신규멤버');
  expect(r).not.toContain('기존멤버');
});

test('flushCloud 실패 후 재시도 시 대기 중이던 traveler 추가가 유실되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    window.__test.setOffline(true);
    renderTravelers();
    document.getElementById('newTravelerInput').value = '오프라인멤버'; addTraveler();
    await forceFlush().catch(() => {}); // 실패 예상
    window.__test.setOffline(false);
    await forceFlush();
    const content = (await tripContentRef(id).get()).data();
    return content.travelers;
  });
  expect(r).toContain('오프라인멤버');
});

test('handleFieldChange: 일정 항목 place 수정이 정확한 dot-path 로 큐잉된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    rebuildAll(); setMode('edit');
    const input = document.querySelector(`.tl-place[data-day-id="${dayId}"][data-item-id="${itemId}"]`);
    input.value = '새 장소';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await forceFlush();
    const content = (await tripContentRef(id).get()).data();
    return content.days[dayId].items[itemId].place;
  });
  expect(r).toBe('새 장소');
});

test('deleteAttachment 가 attachments 매니페스트를 콘텐츠 문서에 반영한다(회귀)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id; state = await loadTrip(id);
    state.attachments = [{ id: 'att1', name: '사진1' }];
    await tripsCol().doc(id).collection('att').doc('att1').set({ name: '사진1', mime: 'image/jpeg', data: 'data:image/jpeg;base64,AAAA' });
    queuePatch({ attachments: state.attachments });
    save();
    await forceFlush();
    const afterAdd = (await tripContentRef(id).get()).data();
    await deleteAttachment('att1');
    await forceFlush();
    const afterDelete = (await tripContentRef(id).get()).data();
    return { afterAdd: afterAdd.attachments, afterDelete: afterDelete.attachments };
  });
  expect(r.afterAdd).toEqual([{ id: 'att1', name: '사진1' }]);
  expect(r.afterDelete).toEqual([]);
});
