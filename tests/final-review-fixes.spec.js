const { test, expect } = require('./support/fixtures');

// 브랜치 전체 최종 리뷰에서 나온 교차-태스크 버그들의 회귀 테스트.
// C1: 비-owner 삭제로 공유 여행 파괴, C2: 패치 큐가 여행 간 누수,
// I4: 마이그레이션 중단 시 콘텐츠 영구 누락, I6: onSnapshot 에러 미처리,
// I8: 초대로 참여한 여행이 생성 한도에 포함됨.
// (C3 는 tests/reopen-reconcile.spec.js 를 강화해 커버한다)

/* ========== C1: 비-owner 가 공유 여행을 파괴할 수 있던 버그 ========== */

test('C1: 비-owner 의 deleteTrip 은 거부되고 콘텐츠/첨부/메타가 하나도 지워지지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('trips/t1', {
      ownerUid: 'u1', members: ['u1', 'u2'], memberNames: { u1: '김진', u2: '멤버' },
      title: '공유여행', startDate: '', endDate: '', dayCount: 1,
    });
    window.__test.seed('trips/t1/content/main', {
      dayOrder: ['d1'], days: { d1: { label: '첫날', date: '', itemOrder: [], items: {} } },
      noteOrder: [], notes: {}, linkOrder: [], links: {}, travelers: ['나'], attachments: [],
    });
    window.__test.seed('trips/t1/att/a1', { name: '항공권.png', data: 'xxx' });
    window.__test.seed('users/u2', { avatarId: 'default', tripOrder: ['t1'] });
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '멤버', email: 'u2@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();

  const r = await page.evaluate(async () => {
    let threw = false;
    try { await deleteTrip('t1'); } catch (e) { threw = true; }
    const d = window.__test.dump();
    return {
      threw,
      meta: !!d['trips/t1'],
      content: !!d['trips/t1/content/main'],
      att: !!d['trips/t1/att/a1'],
      contentDayLabel: d['trips/t1/content/main'] && d['trips/t1/content/main'].days.d1.label,
    };
  });
  expect(r.threw).toBe(true);
  // 핵심: 거부되기 전에 아무것도 파괴되지 않아야 한다
  expect(r.content).toBe(true);
  expect(r.contentDayLabel).toBe('첫날');
  expect(r.att).toBe(true);
  expect(r.meta).toBe(true);
});

test('C1: owner 의 정상 삭제는 그대로 콘텐츠·첨부·메타를 모두 지운다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    await tripsCol().doc(id).collection('att').doc('a1').set({ name: '표.png', data: 'xxx' });
    await deleteTrip(id);
    const d = window.__test.dump();
    return {
      meta: !!d['trips/' + id],
      content: !!d['trips/' + id + '/content/main'],
      att: !!d['trips/' + id + '/att/a1'],
      order: d['users/u1'].tripOrder,
      id,
    };
  });
  expect(r.meta).toBe(false);
  expect(r.content).toBe(false);
  expect(r.att).toBe(false);
  expect(r.order).not.toContain(r.id);
});

test('C1: 마이페이지에서 남의 여행 카드에는 ✕ 버튼이 렌더되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u2', { avatarId: 'default', tripOrder: ['mine', 'shared'] });
    window.__test.seed('trips/mine', {
      ownerUid: 'u2', members: ['u2'], memberNames: { u2: '멤버' },
      title: '내여행', startDate: '', endDate: '', dayCount: 1,
    });
    window.__test.seed('trips/shared', {
      ownerUid: 'u1', members: ['u1', 'u2'], memberNames: { u1: '김진', u2: '멤버' },
      title: '남의여행', startDate: '', endDate: '', dayCount: 1,
    });
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u2', displayName: '멤버', email: 'u2@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await expect(page.locator('.mp-card')).toHaveCount(2);
  await expect(page.locator('.mp-card[data-trip-id="mine"] .mp-del')).toHaveCount(1);
  await expect(page.locator('.mp-card[data-trip-id="shared"] .mp-del')).toHaveCount(0);
});

/* ========== C2: 패치 큐가 여행 간 누수 ========== */

test('C2: 트립 A 용으로 쌓인 패치는 트립 B 를 연 뒤 flush 해도 B 에 적용되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const a = await createTrip();
    const b = await createTrip();
    // A 를 연 상태에서 패치를 쌓고 flush 하지 않는다(오프라인/즉시 이탈 상황)
    currentTripId = a;
    state = await loadTrip(a);
    const aDayId = state.days[0].id;
    queuePatch({ travelers: ['A전용값'], ['days.' + aDayId + '.label']: 'A라벨' });
    // flush 없이 B 로 이동한 뒤 flush 가 발화
    await openTrip(b);
    await forceFlush();
    const d = window.__test.dump();
    return { aDayId, bContent: d['trips/' + b + '/content/main'], aContent: d['trips/' + a + '/content/main'] };
  });
  // B 에 A 의 값이 새지 않았다
  expect(r.bContent.travelers).not.toContain('A전용값');
  expect(r.bContent.days[r.aDayId]).toBeUndefined();
  // A 도 부분적으로 덮어써지지 않았다(원래대로)
  expect(r.aContent.travelers).not.toContain('A전용값');
  expect(r.aContent.days[r.aDayId].label).not.toBe('A라벨');
});

test('C2: 같은 여행에 쌓인 패치는 정상적으로 그대로 반영된다(폐기 로직 과잉 적용 방지)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const a = await createTrip();
    currentTripId = a;
    state = await loadTrip(a);
    const dayId = state.days[0].id;
    queuePatch({ ['days.' + dayId + '.label']: '정상라벨' });
    await forceFlush();
    const d = window.__test.dump();
    return { label: d['trips/' + a + '/content/main'].days[dayId].label };
  });
  expect(r.label).toBe('정상라벨');
});

test('C2: 오프라인으로 flush 실패한 A 의 패치는 B 를 열고 B 를 편집해도 B 에 새지 않는다', async ({ page }) => {
  // 재리뷰에서 발견: flushCloud 의 불일치 폐기만으로는 부족하다. 모든 mutator 가
  // queuePatch → save() 순서라, B 에서 편집을 하는 순간 queuePatch 가 큐를 B 로
  // 재태깅해버려 flushCloud 의 검사가 통과해버린다(A 의 dot-path 가 B 문서에 기록됨).
  // 그래서 queuePatch 자체에도 여행 변경 시 폐기 로직이 필요하다.
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const a = await createTrip();
    const b = await createTrip();
    await openTrip(a);
    const aDayId = state.days[0].id;
    // 오프라인 상태로 A 를 편집 → flush 실패, 패치가 큐에 A 태그로 남는다
    window.__test.setOffline(true);
    queuePatch({ travelers: ['A전용값'], ['days.' + aDayId + '.label']: 'A라벨' });
    save();
    await flushCloud();
    // 온라인 복귀 후 B 를 평범하게 열고(캐시는 A 것이라 복구 경로 아님) 편집한다
    window.__test.setOffline(false);
    unsubscribeTripContent();
    await openTrip(b);
    const bDayId = state.days[0].id;
    queuePatch({ ['days.' + bDayId + '.label']: 'B라벨' });
    save();
    await forceFlush();
    const d = window.__test.dump();
    return { aDayId, bDayId, bContent: d['trips/' + b + '/content/main'] };
  });
  expect(r.bContent.travelers).not.toContain('A전용값');
  expect(r.bContent.days[r.aDayId]).toBeUndefined();
  expect(r.bContent.days[r.bDayId].label).toBe('B라벨');   // B 자신의 편집은 정상 반영
});

test('C2: dirty 캐시 복구 경로(C3)로 B 를 열어도 A 의 잔여 패치가 B 에 섞이지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const a = await createTrip();
    const b = await createTrip();
    currentTripId = a;
    state = await loadTrip(a);
    const aDayId = state.days[0].id;
    queuePatch({ travelers: ['A전용값'], ['days.' + aDayId + '.label']: 'A라벨' });
    // B 의 로컬 캐시를 dirty 로 만들어 openTrip 의 복구 경로를 태운다
    const stB = await loadTrip(b);
    stB.title = 'B로컬미저장';
    localStorage.setItem('ttv2-current-trip', JSON.stringify({
      tripId: b, data: JSON.stringify(stB), dirty: true, localUpdatedAt: Date.now(),
    }));
    await openTrip(b);
    await forceFlush();
    const d = window.__test.dump();
    return { aDayId, bContent: d['trips/' + b + '/content/main'], bMeta: d['trips/' + b] };
  });
  expect(r.bContent.travelers).not.toContain('A전용값');
  expect(r.bContent.days[r.aDayId]).toBeUndefined();
  expect(r.bMeta.title).toBe('B로컬미저장');   // C3 복구 자체는 그대로 동작
});

/* ========== I4: 마이그레이션 중단(메타만 성공) 복구 ========== */

test('I4: 메타는 이미 있고 콘텐츠만 없는 중단 상태를 재시도하면 콘텐츠가 복구된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1/trips/legacy6', {
      data: JSON.stringify({
        title: '중단복구', travelers: ['나'],
        days: [{ id: 'd1', date: '2026-01-01', label: '첫날', items: [{ id: 'i1', time: '09:00', place: '공항', memo: '', expenses: [] }] }],
        notes: [], links: [], attachments: [],
      }),
      title: '중단복구', startDate: '2026-01-01', endDate: '2026-01-01', dayCount: 1,
    });
    // 이전 시도에서 메타 쓰기까지만 성공한 상태 — 콘텐츠 문서는 없다
    window.__test.seed('trips/legacy6', {
      ownerUid: 'u1', members: ['u1'], memberNames: { u1: '김진' },
      title: '중단복구', startDate: '2026-01-01', endDate: '2026-01-01', dayCount: 1,
    });
  });
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    await migrateLegacyTrips();
    const d = window.__test.dump();
    return { content: d['trips/legacy6/content/main'], oldExists: !!d['users/u1/trips/legacy6'] };
  });
  expect(r.content).toBeTruthy();
  expect(r.content.dayOrder).toEqual(['d1']);
  expect(r.content.days.d1.label).toBe('첫날');
  expect(r.content.days.d1.items.i1.place).toBe('공항');
  expect(r.content.travelers).toEqual(['나']);
  expect(r.oldExists).toBe(false);
});

/* ========== I6: onSnapshot 에러 처리 ========== */

test('I6: onSnapshot 에러가 나면 리스너를 정리하고 미동기화 표시를 켠다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn());
  await page.waitForTimeout(50);
  const r = await page.evaluate(async () => {
    const id = await createTrip();
    currentTripId = id;
    state = await loadTrip(id);
    subscribeTripContent(id);
    await new Promise(res => setTimeout(res, 0));   // 초기 스냅샷 소진
    const dayId = state.days[0].id, itemId = state.days[0].items[0].id;
    const fired = window.__test.triggerSnapshotError('trips/' + id + '/content/main', 'permission-denied');
    const statusAfterError = document.getElementById('syncStatus').textContent;
    const unsubCleared = tripContentUnsub === null;
    // 리스너가 끊겼으므로 이후 원격 변경은 state 에 반영되지 않아야 한다
    await tripContentRef(id).update({ ['days.' + dayId + '.items.' + itemId + '.place']: '끊긴뒤원격' });
    await new Promise(res => setTimeout(res, 0));
    const place = state.days.find(d => d.id === dayId).items.find(i => i.id === itemId).place;
    stopUnsyncedTicker();
    return { fired, statusAfterError, unsubCleared, place };
  });
  expect(r.fired).toBe(1);                       // 에러 콜백이 실제로 등록돼 있었다
  expect(r.statusAfterError).not.toBe('');       // 사용자에게 보이는 신호가 켜졌다
  expect(r.unsubCleared).toBe(true);             // 리스너가 정리됐다
  expect(r.place).not.toBe('끊긴뒤원격');        // 더는 스냅샷을 받지 않는다
});

/* ========== I8: 초대로 참여한 여행은 생성 한도에 안 들어간다 ========== */

test('I8: 내 여행 5개 + 초대로 참여한 1개 → 카운터는 5 / 5, 새 여행 생성은 여전히 차단', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['a', 'b', 'c', 'd', 'e', 'shared'] });
    ['a', 'b', 'c', 'd', 'e'].forEach(id => window.__test.seedTrip(id, { title: id, dayCount: 1 }));
    window.__test.seed('trips/shared', {
      ownerUid: 'u9', members: ['u9', 'u1'], memberNames: { u9: '남', u1: '김진' },
      title: '초대받은여행', startDate: '', endDate: '', dayCount: 2,
    });
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });

  await expect(page.locator('.mp-card')).toHaveCount(6);          // 목록에는 6개 다 보이고
  await expect(page.locator('#mpCount')).toHaveText('5 / 5');     // 카운터는 내가 만든 것만 센다(6 / 5 아님)
  await expect(page.locator('.mp-card[data-trip-id="shared"] .mp-del')).toHaveCount(0);

  // 이미 내 여행이 5개이므로 생성은 차단된다
  await page.locator('#mpNewBtn').click();
  await expect(page.locator('#v2Modal')).toBeVisible();
  await expect(page.locator('#v2ModalBody')).toContainText('여행계획은 최대 5개까지 저장할 수 있어요.');
  await expect(page.locator('section[data-screen="editor"]')).toBeHidden();
});

test('I8: 내 여행 4개 + 초대로 참여한 2개면 6번째가 아니라 5번째 내 여행을 만들 수 있다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['a', 'b', 'c', 'd', 's1', 's2'] });
    ['a', 'b', 'c', 'd'].forEach(id => window.__test.seedTrip(id, { title: id, dayCount: 1 }));
    ['s1', 's2'].forEach(id => window.__test.seed('trips/' + id, {
      ownerUid: 'u9', members: ['u9', 'u1'], memberNames: { u9: '남', u1: '김진' },
      title: id, startDate: '', endDate: '', dayCount: 1,
    }));
  });
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); });
  await expect(page.locator('#mpCount')).toHaveText('4 / 5');
  await page.locator('#mpNewBtn').click();
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await expect(page.locator('#v2Modal')).toBeHidden();
});
