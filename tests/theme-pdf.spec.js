const { test, expect } = require('./support/fixtures');

test('exportPDF 캡처 중 테마 a 강제, 이후 원복', async ({ page }) => {
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
    window.loadPdfLibs = () => Promise.resolve();
    window.jspdf = { jsPDF: function(){ return {
      internal:{ pageSize:{ getWidth:()=>210, getHeight:()=>297 } },
      addImage(){}, addPage(){}, setFontSize(){}, splitTextToSize:(s)=>[s], text(){}, save(){}
    }; } };
    window.html2canvas = async () => { window.__themeAtCapture = document.documentElement.dataset.theme;
      return { width:0, height:0, toDataURL:()=>'' }; };
    await exportPDF();
  });
  // exportPDF 가 프로미스 체인을 반환하지 않으므로 캡처/원복을 poll 로 관측
  await expect.poll(() => page.evaluate(() => window.__themeAtCapture)).toBe('a');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('d');
});
