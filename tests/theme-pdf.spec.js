const { test, expect } = require('./support/fixtures');

test('exportPDF 는 현재 테마로 캡처한다 (강제 라이트 없음)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'PDF', travelers:['나'],
      days:[{id:'d1',date:'2026-01-01',label:'',items:[]}], notes:[], links:[], attachments:[] }), title:'PDF', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));

  await page.evaluate(async () => {
    document.documentElement.dataset.theme = 'd';        // 다크 테마 상태에서 시작
    window.__themeAtCapture = null;
    window.__bgAtCapture = null;
    window.loadPdfLibs = () => Promise.resolve();
    window.jspdf = { jsPDF: function(){ return {
      internal:{ pageSize:{ getWidth:()=>210, getHeight:()=>297 } },
      addImage(){}, addPage(){}, setFontSize(){}, splitTextToSize:(s)=>[s], text(){}, save(){}
    }; } };
    window.html2canvas = async (sec, opts) => {
      window.__themeAtCapture = document.documentElement.dataset.theme;
      window.__bgAtCapture = opts && opts.backgroundColor;
      return { width:0, height:0, toDataURL:()=>'' };
    };
    await exportPDF();
  });
  // 캡처는 활성 테마(d)에서 일어나고, 이후에도 d 로 유지된다
  await expect.poll(() => page.evaluate(() => window.__themeAtCapture)).toBe('d');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('d');
  // html2canvas 배경색이 테마 d 의 --paper (#0C1524)
  expect(await page.evaluate(() => window.__bgAtCapture)).toBe('#0C1524');
});
