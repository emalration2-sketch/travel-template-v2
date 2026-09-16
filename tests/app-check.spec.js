const { test, expect } = require('./support/fixtures');

test('App Check: 실제 Enterprise 사이트 키로 ReCaptchaEnterpriseProvider 를 감싸 activate() 를 부른다', async ({ page }) => {
  // Firebase 가 reCAPTCHA 클래식 등록을 막고 Fraud Defense(reCAPTCHA Enterprise) 로
  // 전환했기 때문에, activate() 에는 사이트 키 문자열이 아니라
  // new firebase.appCheck.ReCaptchaEnterpriseProvider(key) 인스턴스를 넘겨야 한다.
  await page.addInitScript(() => {
    window.__appCheckActivateCalls = [];
    function FakeProvider(key){ this.key = key; }
    window.__fakeAppCheck = () => ({ activate: (provider, auto) => window.__appCheckActivateCalls.push({ provider, auto }) });
    window.__fakeAppCheck.ReCaptchaEnterpriseProvider = FakeProvider;
  });
  await page.goto('/');
  await page.evaluate(() => { firebase.appCheck = window.__fakeAppCheck; });
  await page.evaluate(() => { fbAuth = null; initFirebase(); });
  const calls = await page.evaluate(() => window.__appCheckActivateCalls.map(c => ({ key: c.provider && c.provider.key, auto: c.auto, isProvider: c.provider instanceof window.__fakeAppCheck.ReCaptchaEnterpriseProvider })));
  const siteKey = await page.evaluate(() => APP_CHECK_SITE_KEY);
  expect(siteKey).not.toBe('YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY'); // 플레이스홀더로 되돌아가지 않았는지 회귀 확인
  expect(calls).toEqual([{ key: siteKey, auto: true, isProvider: true }]);
});
