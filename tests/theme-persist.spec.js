const { test, expect } = require('./support/fixtures');

test('applyTheme: data-theme 세팅 + 잘못된 값은 a', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => { applyTheme('c'); return document.documentElement.dataset.theme; })).toBe('c');
  expect(await page.evaluate(() => { applyTheme('zzz'); return document.documentElement.dataset.theme; })).toBe('a');
  expect(await page.evaluate(() => { try{ return localStorage.getItem('ttv2-theme'); }catch(e){ return null; } })).toBe('a');
});

test('부트: localStorage ttv2-theme 를 첫 페인트에 적용', async ({ page }) => {
  await page.addInitScript(() => { try{ localStorage.setItem('ttv2-theme','d'); }catch(e){} });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('d');
});

test('프로필 라운드트립: 저장 → 재로드 → data-theme', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => saveProfile({ theme:'e' }));
  await expect.poll(() => page.evaluate(() => (window.__test.dump()['users/u1']||{}).theme)).toBe('e');
  await page.reload();
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('e');
});

test('기존 사용자(theme 필드 없음) → loadProfile 이 낡은 캐시를 a 로 덮어쓴다', async ({ page }) => {
  // 부트 스크립트가 낡은 'd' 캐시를 먼저 적용하도록 세팅
  await page.addInitScript(() => { try{ localStorage.setItem('ttv2-theme','d'); }catch(e){} });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('d'); // 부트가 낡은 캐시 적용
  await page.evaluate(() => { window.__test.seed('users/u2', { avatarId:'cat', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u2', displayName:'박', email:'c@d.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  // loadProfile → applyTheme('a') 가 낡은 'd' 를 덮어써야 함
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('a');
  expect(await page.evaluate(() => { try{ return localStorage.getItem('ttv2-theme'); }catch(e){ return null; } })).toBe('a');
});
