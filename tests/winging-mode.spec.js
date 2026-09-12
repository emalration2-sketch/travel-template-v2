const { test, expect } = require('./support/fixtures');

async function openEditor(page){
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[], attachments:[] }),
      title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('스위치를 켜면 즉흥 모드가 뜨고 끄면 원래 탭으로 돌아간다', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('#editView-schedule')).toBeVisible();
  await expect(page.locator('#editView-winging')).toBeHidden();

  await page.locator('#wingSwitch').click();
  await expect(page.locator('#editView-winging')).toBeVisible();
  await expect(page.locator('#editView-schedule')).toBeHidden();
  await expect(page.locator('#wingSwitch')).toHaveClass(/on/);

  const t1 = await page.locator('#wingText1').textContent();
  const t2 = await page.locator('#wingText2').textContent();
  const inPool = await page.evaluate(([a, b]) => WINGING_PROMPTS.includes(a) && WINGING_PROMPTS.includes(b), [t1, t2]);
  expect(inPool).toBe(true);
  expect(t1).not.toBe(t2);

  await page.locator('#wingSwitch').click();
  await expect(page.locator('#editView-winging')).toBeHidden();
  await expect(page.locator('#editView-schedule')).toBeVisible();
  await expect(page.locator('#wingSwitch')).not.toHaveClass(/on/);
});

test('같은 날 다시 열면 같은 미션 2개가 유지된다', async ({ page }) => {
  await openEditor(page);
  await page.locator('#wingSwitch').click();
  const first1 = await page.locator('#wingText1').textContent();
  const first2 = await page.locator('#wingText2').textContent();

  await page.locator('#wingSwitch').click();  // 끄기
  await page.locator('#wingSwitch').click();  // 다시 켜기 (같은 날)

  await expect(page.locator('#wingText1')).toHaveText(first1);
  await expect(page.locator('#wingText2')).toHaveText(first2);
});

test('다시 뽑기를 누르면 미션이 계정 프로필에도 저장된다', async ({ page }) => {
  await openEditor(page);
  await page.locator('#wingSwitch').click();

  await page.locator('[data-action="reroll-winging"]').click();
  const t1 = await page.locator('#wingText1').textContent();
  const t2 = await page.locator('#wingText2').textContent();
  const inPool = await page.evaluate(([a, b]) => WINGING_PROMPTS.includes(a) && WINGING_PROMPTS.includes(b), [t1, t2]);
  expect(inPool).toBe(true);

  const saved = await page.evaluate(() => window.__test.dump()['users/u1']);
  expect(Array.isArray(saved.wingingPicks)).toBe(true);
  expect(saved.wingingPicks.length).toBe(2);
  expect(typeof saved.wingingDate).toBe('string');
  expect(saved.wingingDate.length).toBeGreaterThan(0);
});
