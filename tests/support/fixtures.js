const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const STUB = fs.readFileSync(path.join(__dirname, 'firebase-stub.js'), 'utf8');

exports.test = base.test.extend({
  page: async ({ page }, use) => {
    // 실제 Firebase SDK 로드 차단 → 주입한 스텁이 window.firebase 를 유지
    await page.route('**/www.gstatic.com/firebasejs/**', (r) => r.abort());
    await page.addInitScript(STUB);
    await page.addInitScript(() => { try { localStorage.setItem('ttv2-lang', 'ko'); } catch (e) {} });
    await use(page);
  },
});
exports.expect = base.expect;
