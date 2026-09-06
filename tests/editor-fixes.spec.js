const { test, expect } = require('./support/fixtures');

test('PDF: loadPdfLibs 존재 + 옛 html2pdf 참조 없음', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => typeof loadPdfLibs)).toBe('function');
  expect(await page.evaluate(() => typeof window.loadHtml2Pdf)).toBe('undefined');
  // exportPDF 소스가 loadPdfLibs 를 부르는지 (함수 문자열 검사)
  const src = await page.evaluate(() => exportPDF.toString());
  expect(src).toContain('loadPdfLibs');
  expect(src).not.toContain('loadHtml2Pdf');
});

test('PDF: loadPdfLibs 가 jsPDF+html2canvas 전역을 갖춘다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => loadPdfLibs());
  await expect.poll(() => page.evaluate(() => typeof (window.jspdf && window.jspdf.jsPDF))).toBe('function');
  expect(await page.evaluate(() => typeof window.html2canvas)).toBe('function');
  // 실제 jsPDF 인스턴스가 exportPDF 가 쓰는 메서드를 갖는지
  const m = await page.evaluate(() => { const { jsPDF } = window.jspdf; const d = new jsPDF('p','mm','a4');
    return [typeof d.addImage, typeof d.splitTextToSize, typeof d.text, typeof d.save].join(','); });
  expect(m).toBe('function,function,function,function');
});
