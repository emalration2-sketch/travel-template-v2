const { test, expect } = require('./support/fixtures');

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('제목/날짜/일수 도출', async ({ page }) => {
  const r = await page.evaluate(() => deriveTripMeta({
    title: '오사카',
    days: [
      { date: '2026-03-16', items: [] },
      { date: '', items: [] },
      { date: '2026-03-14', items: [] },
    ],
    notes: [], links: [], travelers: [],
  }));
  expect(r).toEqual({ title: '오사카', startDate: '2026-03-14', endDate: '2026-03-16', dayCount: 3 });
});

test('빈 상태 기본값', async ({ page }) => {
  const r = await page.evaluate(() => deriveTripMeta({ title: '', days: [{ date: '', items: [] }] }));
  expect(r).toEqual({ title: '', startDate: '', endDate: '', dayCount: 1 });
});
