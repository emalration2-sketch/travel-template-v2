const { test, expect } = require('./support/fixtures');

const EXPECT = {
  a: { paper:'rgb(241, 246, 244)', teal:'rgb(28, 122, 111)',  fillStrong:'rgb(22, 48, 45)',  modeEdit:'rgb(28, 122, 111)', modeView:'rgb(65, 90, 120)' },
  b: { paper:'rgb(244, 243, 241)', teal:'rgb(62, 107, 138)',  fillStrong:'rgb(30, 33, 36)',  modeEdit:'rgb(62, 107, 138)', modeView:'rgb(46, 50, 54)' },
  c: { paper:'rgb(242, 244, 249)', teal:'rgb(53, 82, 143)',   fillStrong:'rgb(27, 35, 64)',  modeEdit:'rgb(53, 82, 143)',  modeView:'rgb(138, 110, 46)' },
  d: { paper:'rgb(12, 21, 36)',    teal:'rgb(51, 214, 192)',  fillStrong:'rgb(30, 46, 72)',  modeEdit:'rgb(51, 214, 192)', modeView:'rgb(108, 123, 224)' },
  e: { paper:'rgb(254, 243, 236)', teal:'rgb(216, 88, 60)',   fillStrong:'rgb(67, 32, 47)',  modeEdit:'rgb(216, 88, 60)',  modeView:'rgb(168, 112, 62)' },
};

test('5개 테마 토큰이 data-theme 로 적용된다', async ({ page }) => {
  await page.goto('/');
  for(const [id, exp] of Object.entries(EXPECT)){
    const got = await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      const s = getComputedStyle(document.documentElement);
      const g = n => s.getPropertyValue(n).trim();
      // css var 원시값은 hex 라 비교용으로 실제 렌더 색을 뽑는다
      const probe = document.createElement('div');
      probe.style.cssText = 'color:var(--paper)';
      document.body.appendChild(probe);
      const rgb = k => { probe.style.color = 'var(' + k + ')'; return getComputedStyle(probe).color; };
      const out = { paper:rgb('--paper'), teal:rgb('--teal'), fillStrong:rgb('--fill-strong'),
                    modeEdit:rgb('--mode-edit'), modeView:rgb('--mode-view'), bannerBg:g('--banner-bg') };
      probe.remove();
      return out;
    }, id);
    expect(got.paper, id+' paper').toBe(exp.paper);
    expect(got.teal, id+' teal').toBe(exp.teal);
    expect(got.fillStrong, id+' fill-strong').toBe(exp.fillStrong);
    expect(got.modeEdit, id+' mode-edit').toBe(exp.modeEdit);
    expect(got.modeView, id+' mode-view').toBe(exp.modeView);
  }
});

test('d/e 배너는 그라디언트, a/b/c 는 단색', async ({ page }) => {
  await page.goto('/');
  const kind = await page.evaluate(() => {
    const r = {};
    for(const t of ['a','b','c','d','e']){
      document.documentElement.dataset.theme = t;
      r[t] = getComputedStyle(document.documentElement).getPropertyValue('--banner-bg').includes('gradient');
    }
    return r;
  });
  expect(kind).toEqual({ a:false, b:false, c:false, d:true, e:true });
});
