const { test, expect } = require('./support/fixtures');

test('exportPDF: 한 섹션이 한 페이지보다 크면 잘리지 않고 여러 페이지로 이어붙는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'PDF', travelers:['나'],
      days:[{id:'d1',date:'2026-01-01',label:'',items:[]}], notes:[], links:[], attachments:[] }), title:'PDF', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));

  // exportPDF() 는 자신의 내부 promise chain 을 리턴하지 않으므로(알려진 이슈), 완료 신호를
  // window 에 남겨두고 폴링으로 기다린다(기존 theme-pdf.spec.js 와 같은 패턴).
  await page.evaluate(() => {
    window.loadPdfLibs = () => Promise.resolve();
    window.__pdfRec = { addImage: [], addPage: 0, done: false };
    window.jspdf = { jsPDF: function(){ return {
      internal:{ pageSize:{ getWidth:()=>210, getHeight:()=>297 } },
      addImage(data, fmt, x, y, w, h){ window.__pdfRec.addImage.push({ x, y, w, h }); },
      addPage(){ window.__pdfRec.addPage++; },
      setFontSize(){}, splitTextToSize:(s)=>[s], text(){},
      save(){ window.__pdfRec.done = true; }
    }; } };
    // 실제 렌더 폭(1000px)이 PDF 폭(190mm)보다 훨씬 커서, 높이(6000px)가 한 페이지 가용 높이(277mm)를 크게 넘는 섹션을 흉내낸다.
    // 실제 html2canvas 처럼 진짜 <canvas> 엘리먼트를 리턴해야 새 코드의 drawImage(캔버스 슬라이싱)가 동작한다.
    window.html2canvas = async () => {
      const c = document.createElement('canvas');
      c.width = 1000; c.height = 6000;
      return c;
    };
    exportPDF();
  });
  await expect.poll(() => page.evaluate(() => window.__pdfRec.done)).toBe(true);
  const record = await page.evaluate(() => window.__pdfRec);

  const pageHeight = 297, margin = 10;
  const maxY = pageHeight - margin + 0.01;
  expect(record.addImage.length).toBeGreaterThan(1); // 한 장짜리 거대 이미지로 잘려 사라지지 않고 여러 조각으로 나뉨
  for(const c of record.addImage){
    expect(c.y + c.h).toBeLessThanOrEqual(maxY); // 어떤 조각도 페이지 아래로 넘치지 않음 (내용 유실 없음)
  }
  // 픽셀→mm 환산: 190mm 폭 기준 1000px 캔버스이므로 pxPerMm = 1000/190. 6000px 높이 섹션 하나의 실제 mm 높이:
  const pxPerMm = 1000 / 190;
  const oneSectionMm = 6000 / pxPerMm;
  const totalH = record.addImage.reduce((s, c) => s + c.h, 0);
  // 헤더 카드 + 일차 카드, 최소 두 섹션이 모두 온전히 배치되어야 총 높이가 한 섹션 분량을 넘는다
  expect(totalH).toBeGreaterThan(oneSectionMm);
});

test('exportPDF(실제 html2canvas/jsPDF): 일정 항목이 페이지 경계에서 반쪽으로 잘리지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const items = [];
    for (let i = 0; i < 25; i++) {
      items.push({ id: 'i' + i, time: String(8 + (i % 14)).padStart(2, '0') + ':00', place: '장소 ' + i, memo: '', expenses: [] });
    }
    window.__test.seed('users/u1', { avatarId: 'default', tripOrder: ['t1'] });
    window.__test.seed('users/u1/trips/t1', {
      data: JSON.stringify({ title: '많은 일정', travelers: ['나'], days: [{ id: 'd1', date: '2026-01-01', label: '바쁜 하루', items }], notes: [], links: [], attachments: [] }),
      title: '많은 일정', dayCount: 1
    });
  });
  await page.evaluate(() => window.__test.signIn({ uid: 'u1', displayName: '김진', email: 'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('.day-card')).toBeVisible();

  // 실제 html2canvas/jsPDF 를 그대로 쓰되, addImage/addPage 호출만 가로채서 배치 기록을 남긴다.
  const record = await page.evaluate(async () => {
    return new Promise((resolve) => {
      loadPdfLibs().then(() => {
        const OrigJsPDF = window.jspdf.jsPDF;
        const placements = [];
        window.jspdf.jsPDF = function (...args) {
          const inst = new OrigJsPDF(...args);
          const origAddImage = inst.addImage.bind(inst);
          inst.addImage = (data, fmt, x, y, w, h) => { placements.push(h); return origAddImage(data, fmt, x, y, w, h); };
          inst.save = () => resolve({ placements, pages: inst.internal.getNumberOfPages() });
          return inst;
        };
        exportPDF();
      });
    });
  });

  expect(record.pages).toBeGreaterThan(1); // 25개 일정이면 한 페이지로 안 끝남
  // 일정 항목 25개는 전부 똑같은 내용이라 "온전한 항목 하나"의 높이는 거의 동일해야 한다(최빈값).
  // 항목이 페이지 경계에서 둘로 잘리면, 연속된 두 addImage 호출이 "각자는 최빈값보다 작지만
  // 둘을 더하면 최빈값과 비슷"한 패턴으로 나타난다 — 그 패턴이 있는지만 확인한다(헤더/일차
  // 머리글처럼 원래부터 높이가 다른 단일 요소는 앞뒤와 합쳐도 최빈값에 안 맞으므로 오탐되지 않는다).
  const rounded = record.placements.map(h => Math.round(h * 10) / 10);
  const counts = {};
  rounded.forEach(h => { counts[h] = (counts[h] || 0) + 1; });
  const mode = Number(Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b));
  let splitPairFound = false;
  for (let i = 0; i < rounded.length - 1; i++) {
    const a = rounded[i], b = rounded[i + 1];
    if (a < mode * 0.9 && b < mode * 0.9 && Math.abs((a + b) - mode) < mode * 0.15) {
      splitPairFound = true;
    }
  }
  expect(splitPairFound).toBe(false);
});
