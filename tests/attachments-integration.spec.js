const { test, expect } = require('./support/fixtures');

test('deleteTrip 이 att 하위 문서도 삭제', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1','t2'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'A', days:[], notes:[], links:[], attachments:[{id:'a1',name:'x'}] }), title:'A', dayCount:0 });
    window.__test.seed('users/u1/trips/t2', { data: JSON.stringify({ title:'B', days:[], notes:[], links:[] }), title:'B', dayCount:0 });
    window.__test.seed('users/u1/trips/t1/att/a1', { name:'x', data:'data:image/jpeg;base64,AA' });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(async () => { await loadProfile(); await refreshTripList(); renderMypage(); await deleteTrip('t1'); });
  const dump = await page.evaluate(() => window.__test.dump());
  expect(dump['users/u1/trips/t1']).toBeUndefined();
  expect(dump['users/u1/trips/t1/att/a1']).toBeUndefined();
});

test('exportPDF 캡처 전 4개 뷰 임시 노출, 완료 후 원래 탭 복원', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'], days:[{id:'d1',date:'',label:'',items:[]}], notes:[], links:[], attachments:[] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김진', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await page.locator('#editTabs .tab[data-tab="expense"]').click();
  await expect(page.locator('#editView-expense')).toBeVisible();
  // html2canvas / jsPDF 를 스텁
  await page.evaluate(() => {
    window.__seenVisible = null;
    window.loadHtml2Pdf = async () => {
      window.html2canvas = async () => {
        window.__seenVisible = ['schedule','notes','expense','materials']
          .filter(v => !document.getElementById('editView-'+v).hidden);
        return { width: 10, height: 10, toDataURL: () => 'data:image/jpeg;base64,AA' };
      };
      window.jspdf = { jsPDF: function(){ return {
        internal:{ pageSize:{ getWidth:()=>210, getHeight:()=>297 } },
        addImage(){}, addPage(){}, save(){},
      }; } };
    };
  });
  await page.evaluate(() => exportPDF());
  await expect.poll(() => page.evaluate(() => (window.__seenVisible||[]).length)).toBe(4);
  expect(await page.evaluate(() => currentEditorTab)).toBe('expense');
  await expect(page.locator('#editView-expense')).toBeVisible();
});
