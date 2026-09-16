const { test, expect } = require('./support/fixtures');

test('App Check: 플레이스홀더 사이트 키인 동안은 activate() 를 호출하지 않는다', async ({ page }) => {
  // firebase-stub.js 는 appCheck 를 아예 정의하지 않는다(실제 스텁엔 없음) —
  // 그 경우에도 initFirebase() 가 안전한지는 smoke.spec.js 가 이미 검증한다.
  // 여기서는 "만약 appCheck 가 있었다면 플레이스홀더 키로는 activate 를 부르지 않는다"를 검증한다.
  await page.addInitScript(() => {
    window.__appCheckActivateCalls = [];
    window.__fakeAppCheck = () => ({ activate: (key, auto) => window.__appCheckActivateCalls.push({ key, auto }) });
  });
  await page.goto('/');
  // 스텁 로드 후 window.firebase 에 가짜 appCheck 를 얹고, initFirebase() 를 다시 호출해도
  // 플레이스홀더 키인 이상 activate 가 호출되지 않아야 한다(가드가 코드 경로에 있는지 확인).
  await page.evaluate(() => { firebase.appCheck = window.__fakeAppCheck; });
  await page.evaluate(() => { fbAuth = null; initFirebase(); }); // fbAuth 리셋해서 재초기화 유도
  const calls = await page.evaluate(() => window.__appCheckActivateCalls);
  expect(calls).toEqual([]);
});
