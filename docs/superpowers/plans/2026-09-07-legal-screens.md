# 앱 내 법적 문서 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이용약관·개인정보처리방침을 앱 안 화면으로 렌더링하고 표지·설정에서 진입하게 한다. 문서 본문은 `docs/legal/*.md` 를 런타임에 불러와 외부 라이브러리 없이 렌더한다.

**Architecture:** `data-screen="terms"|"privacy"` 섹션 2개 추가. `openLegal(doc)` 이 `fetch('docs/legal/<doc>-ko.md')` → 손수 만든 `renderMarkdown(text)` → `#legalBody-<doc>` 주입, 문서별 메모리 캐시. `legalFrom` 으로 뒤로가기 대상 기억. 표지 하단·설정에 진입 링크.

**Tech Stack:** 단일 `index.html` (인라인 CSS/JS), 빌드 없음, GitHub Pages(`/travel-template-v2/` 서브패스) 배포, Playwright E2E + `tests/support/firebase-stub.js` + `page.route`.

**Spec:** `docs/superpowers/specs/2026-09-07-legal-screens-design.md`

## Global Constraints

- 모든 편집은 `index.html` 한 파일 (T4 검증 제외). 인라인 CSS/JS, 빌드 스텝·외부 라이브러리 없음.
- 배포 URL이 `/travel-template-v2/` 서브패스 → fetch 는 **상대경로** `docs/legal/terms-ko.md` / `docs/legal/privacy-ko.md`. 절대경로(`/docs/...`) 금지.
- `docs/legal/*.md` 가 문서 본문의 **단일 원본**. HTML 사본을 만들지 않는다.
- 화면 전환은 기존 `showScreen(name)` + `section[data-screen]` `hidden` 토글. `showScreen` 은 `currentScreen` 전역도 갱신함.
- `renderMarkdown` 지원 문법은 현재 두 문서가 쓰는 것만: `#`/`##`/`###` 제목, `` `코드` ``, `- ` 목록, `| 표 |`+`|---|`, `> ` 인용, 단독 `---` 구분선, `[텍스트](URL)` 링크, 빈 줄 구분 문단. `**굵게**` 규칙도 넣되(향후 대비) 현재 문서엔 없음. **모든 텍스트는 이스케이프 후 인라인 규칙 적용** (XSS 방지). 파일 첫 줄이 `# ` 로 시작하면 그 한 줄만 제거.
- 문서 화면은 `data-screen` 섹션이라 활성 테마 토큰이 그대로 적용됨. 별도 테마 처리 없음.
- `fetch(url, { cache: 'no-cache' })` 로 조건부 요청. 한 번 받은 문서는 `legalCache[doc]` 에 저장해 재요청 안 함.
- fetch 실패 → `.legal-error` + GitHub 원본 링크(`https://github.com/emalration2-sketch/travel-template-v2/blob/main/docs/legal/<doc>-ko.md`).
- 범위: `terms` + `privacy` 화면만. `ecommerce` 화면·차단형 동의 체크박스는 범위 밖.
- 회귀 기준선: 전체 89 테스트 통과.
- 테스트는 `page.route('**/docs/legal/*-ko.md', …)` 로 결정적 픽스처를 주입 (실제 파일 대신).

## File Structure

- `index.html` — 유일한 코드 변경 파일:
  - `<style>` 에 `.legal-*`, `.landing-consent`, `.landing-foot`, `.landing-copy` 규칙
  - `section[data-screen="settings"]` 뒤에 `terms`/`privacy` 섹션 2개
  - 표지(`.landing`) 에 동의 문구 + 푸터
  - 설정(`.set`) 에 문서 링크 행 2개
  - JS: `renderMarkdown`, `legalCache`, `legalFrom`, `openLegal`, 클릭 위임 2건(`open-legal`, `legal-back`)
- `tests/legal-screens.spec.js` — 신규 스펙

---

## Task 1: renderMarkdown (미니 마크다운 렌더러)

**Files:**
- Modify: `index.html` — JS 유틸 영역 (예: `showScreen` 근처)에 `renderMarkdown` 추가
- Test: `tests/legal-screens.spec.js` (Create)

**Interfaces:**
- Consumes: 없음
- Produces: 전역 `function renderMarkdown(md) -> string` (HTML 문자열). Task 2 가 `#legalBody-*` 에 주입.

- [ ] **Step 1: Write the failing test**

`tests/legal-screens.spec.js`:
```js
const { test, expect } = require('./support/fixtures');

async function md(page, src){
  return page.evaluate(s => renderMarkdown(s), src);
}

test('renderMarkdown: 제목/문단/목록/인용/구분선/링크/코드', async ({ page }) => {
  await page.goto('/');
  const html = await md(page, [
    '# 문서제목',
    '',
    '## 1. 첫 절',
    '',
    '본문 문단입니다.',
    '',
    '- 항목 하나',
    '- 항목 둘',
    '',
    '> 참고 인용문',
    '',
    '---',
    '',
    '### 소절',
    '자세한 건 [여기](https://example.com)를 보세요. `코드` 조각.',
  ].join('\n'));
  expect(html).not.toContain('문서제목');            // 첫 # 줄 제거
  expect(html).toContain('<h3>1. 첫 절</h3>');
  expect(html).toContain('<h4>소절</h4>');
  expect(html).toContain('<p>본문 문단입니다.</p>');
  expect(html).toMatch(/<ul>\s*<li>항목 하나<\/li>\s*<li>항목 둘<\/li>\s*<\/ul>/);
  expect(html).toContain('<blockquote>참고 인용문</blockquote>');
  expect(html).toContain('<hr>');
  expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener">여기</a>');
  expect(html).toContain('<code>코드</code>');
});

test('renderMarkdown: 표', async ({ page }) => {
  await page.goto('/');
  const html = await md(page, ['| 구분 | 값 |','|---|---|','| 가 | 나 |','| 다 | 라 |'].join('\n'));
  expect(html).toContain('<div class="legal-table">');
  expect(html).toMatch(/<table>\s*<thead>\s*<tr>\s*<th>구분<\/th>\s*<th>값<\/th>/);
  expect(html).toMatch(/<tbody>\s*<tr>\s*<td>가<\/td>\s*<td>나<\/td>\s*<\/tr>\s*<tr>\s*<td>다<\/td>\s*<td>라<\/td>/);
});

test('renderMarkdown: HTML 이스케이프 (XSS 방지)', async ({ page }) => {
  await page.goto('/');
  const html = await md(page, '악성 <script>alert(1)</script> 시도 & <b>태그</b>');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&amp;');
  expect(html).toContain('&lt;b&gt;태그&lt;/b&gt;');
});

test('renderMarkdown: 굵게(**) 도 지원', async ({ page }) => {
  await page.goto('/');
  const html = await md(page, '이건 **강조** 입니다.');
  expect(html).toContain('<strong>강조</strong>');
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx playwright test legal-screens`
Expected: FAIL (`renderMarkdown` 미정의 → ReferenceError).

- [ ] **Step 3: Implement**

`index.html` JS 유틸 영역에 추가:
```js
function renderMarkdown(md){
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const inline = s => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  let lines = md.replace(/\r\n/g, '\n').split('\n');
  if(lines[0] && /^# /.test(lines[0])) lines = lines.slice(1);
  const out = [];
  let i = 0;
  while(i < lines.length){
    let line = lines[i];
    if(!line.trim()){ i++; continue; }
    // 구분선
    if(/^---+\s*$/.test(line)){ out.push('<hr>'); i++; continue; }
    // 제목
    let h = line.match(/^(#{1,3})\s+(.*)$/);
    if(h){ const tag = ['h2','h3','h4'][h[1].length-1]; out.push(`<${tag}>${inline(h[2].trim())}</${tag}>`); i++; continue; }
    // 표
    if(line.trim().startsWith('|') && lines[i+1] && /^\s*\|[-\s|]+\|\s*$/.test(lines[i+1])){
      const cells = r => r.trim().replace(/^\||\|$/g,'').split('|').map(c => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while(i < lines.length && lines[i].trim().startsWith('|')){ body.push(cells(lines[i])); i++; }
      out.push('<div class="legal-table"><table><thead><tr>' +
        head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        body.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }
    // 인용 (연속)
    if(/^>\s?/.test(line)){
      const buf = [];
      while(i < lines.length && /^>\s?/.test(lines[i])){ buf.push(lines[i].replace(/^>\s?/,'')); i++; }
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }
    // 목록 (연속, 선행 공백 허용)
    if(/^\s*-\s+/.test(line)){
      const buf = [];
      while(i < lines.length && /^\s*-\s+/.test(lines[i])){ buf.push(lines[i].replace(/^\s*-\s+/,'')); i++; }
      out.push('<ul>' + buf.map(x => `<li>${inline(x)}</li>`).join('') + '</ul>');
      continue;
    }
    // 문단 (빈 줄까지)
    const buf = [];
    while(i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s?|\s*-\s+|---+\s*$|\|)/.test(lines[i])){ buf.push(lines[i]); i++; }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx playwright test legal-screens`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/legal-screens.spec.js
git commit -m "feat: 미니 마크다운 렌더러 (renderMarkdown)"
```

---

## Task 2: 법적 문서 화면 + fetch/캐시/뒤로가기

**Files:**
- Modify: `index.html` — `section[data-screen="settings"]` 뒤에 섹션 2개; JS 에 `legalCache`/`legalFrom`/`openLegal` + `legal-back` 위임
- Test: `tests/legal-screens.spec.js` (Modify — 추가)

**Interfaces:**
- Consumes: `renderMarkdown` (T1), `showScreen` / `currentScreen` (기존), `currentUser` (기존 전역)
- Produces: 전역 `openLegal(doc)` ('terms'|'privacy'), `legalFrom` 전역, `#legalBody-terms`/`#legalBody-privacy` DOM

- [ ] **Step 1: Write the failing test** — `tests/legal-screens.spec.js` 에 추가:

```js
const TERMS_MD = ['# 이용약관','','## 제1조','내용 A.','','| K | V |','|---|---|','| a | b |'].join('\n');
const PRIV_MD  = ['# 개인정보처리방침','','## 1. 수집','내용 B. <script>x</script>'].join('\n');

async function routeLegal(page, { termsStatus = 200 } = {}){
  await page.route('**/docs/legal/terms-ko.md', r =>
    termsStatus === 200 ? r.fulfill({ contentType:'text/markdown', body: TERMS_MD })
                        : r.fulfill({ status: termsStatus, body: 'err' }));
  await page.route('**/docs/legal/privacy-ko.md', r =>
    r.fulfill({ contentType:'text/markdown', body: PRIV_MD }));
}

test('openLegal: 문서 fetch → 렌더 → 화면 표시', async ({ page }) => {
  await routeLegal(page);
  await page.goto('/');
  await page.evaluate(() => { legalFrom = 'landing'; openLegal('terms'); });
  await expect(page.locator('section[data-screen="terms"]')).toBeVisible();
  await expect(page.locator('#legalBody-terms h3')).toHaveText('제1조');
  await expect(page.locator('#legalBody-terms .legal-table table')).toBeVisible();
  await expect(page.locator('#legalBody-terms')).not.toContainText('이용약관');   // 첫 # 줄 제거
});

test('legal-back: 온 화면으로 복귀', async ({ page }) => {
  await routeLegal(page);
  await page.goto('/');
  await page.evaluate(() => { legalFrom = 'landing'; openLegal('privacy'); });
  await expect(page.locator('section[data-screen="privacy"]')).toBeVisible();
  await page.locator('section[data-screen="privacy"] [data-action="legal-back"]').click();
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();
});

test('openLegal: 재진입 시 fetch 1회만 (캐시)', async ({ page }) => {
  let hits = 0;
  await page.route('**/docs/legal/terms-ko.md', r => { hits++; r.fulfill({ contentType:'text/markdown', body: TERMS_MD }); });
  await page.route('**/docs/legal/privacy-ko.md', r => r.fulfill({ contentType:'text/markdown', body: PRIV_MD }));
  await page.goto('/');
  await page.evaluate(async () => { legalFrom='landing'; openLegal('terms'); });
  await expect(page.locator('#legalBody-terms h3')).toBeVisible();
  await page.evaluate(() => showScreen('landing'));
  await page.evaluate(async () => { openLegal('terms'); });
  await expect(page.locator('section[data-screen="terms"]')).toBeVisible();
  await page.waitForTimeout(200);
  expect(hits).toBe(1);
});

test('openLegal: fetch 실패 시 에러 + GitHub 링크', async ({ page }) => {
  await routeLegal(page, { termsStatus: 500 });
  await page.goto('/');
  await page.evaluate(() => { legalFrom='landing'; openLegal('terms'); });
  await expect(page.locator('#legalBody-terms .legal-error')).toBeVisible();
  await expect(page.locator('#legalBody-terms .legal-error a')).toHaveAttribute('href', /github\.com.*terms-ko\.md/);
});

test('렌더러 이스케이프: 문서 본문의 <script> 는 텍스트', async ({ page }) => {
  await routeLegal(page);
  await page.goto('/');
  await page.evaluate(() => { legalFrom='landing'; openLegal('privacy'); });
  await expect(page.locator('#legalBody-privacy')).toContainText('<script>x</script>');
  expect(await page.locator('#legalBody-privacy script').count()).toBe(0);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx playwright test legal-screens`
Expected: FAIL (`openLegal` 미정의, `section[data-screen="terms"]` 없음).

- [ ] **Step 3: Implement**

**마크업** — `section[data-screen="settings"] ... </section>` 바로 뒤:
```html
<section data-screen="terms" hidden>
  <div class="v2-wrap legal">
    <button class="set-back" data-action="legal-back">← 뒤로</button>
    <h2 class="legal-title">이용약관</h2>
    <div class="legal-body" id="legalBody-terms"></div>
  </div>
</section>
<section data-screen="privacy" hidden>
  <div class="v2-wrap legal">
    <button class="set-back" data-action="legal-back">← 뒤로</button>
    <h2 class="legal-title">개인정보처리방침</h2>
    <div class="legal-body" id="legalBody-privacy"></div>
  </div>
</section>
```

**JS** (`renderMarkdown` 근처):
```js
const LEGAL_DOCS = {
  terms:   { file: 'docs/legal/terms-ko.md',   gh: 'https://github.com/emalration2-sketch/travel-template-v2/blob/main/docs/legal/terms-ko.md' },
  privacy: { file: 'docs/legal/privacy-ko.md', gh: 'https://github.com/emalration2-sketch/travel-template-v2/blob/main/docs/legal/privacy-ko.md' },
};
const legalCache = {};
let legalFrom = 'landing';
async function openLegal(doc){
  const meta = LEGAL_DOCS[doc];
  if(!meta) return;
  showScreen(doc);
  window.scrollTo(0, 0);
  const body = document.getElementById('legalBody-' + doc);
  if(legalCache[doc]){ body.innerHTML = legalCache[doc]; return; }
  body.innerHTML = '<div class="legal-loading">문서를 불러오는 중…</div>';
  try{
    const res = await fetch(meta.file, { cache: 'no-cache' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const html = renderMarkdown(await res.text());
    legalCache[doc] = html;
    body.innerHTML = html;
  }catch(e){
    body.innerHTML = '<div class="legal-error">문서를 불러오지 못했어요. ' +
      '<a href="' + meta.gh + '" target="_blank" rel="noopener">GitHub에서 보기</a></div>';
  }
}
```

**클릭 위임** — `document.addEventListener('click', ...)` 안, `else if(a === 'go-mypage')` 근처:
```js
  else if(a === 'legal-back'){
    showScreen(legalFrom === 'settings' ? 'settings' : (currentUser ? 'settings' : 'landing'));
  }
```
(`open-legal` 액션은 Task 3 에서 추가.)

- [ ] **Step 4: Run — expect PASS**

Run: `npx playwright test legal-screens`
Expected: PASS (T1 4개 + T2 5개 = 9).

- [ ] **Step 5: Regression**

Run: `npx playwright test routing shell`
Expected: PASS (화면 토글 회귀 없음).

- [ ] **Step 6: Commit**

```bash
git add index.html tests/legal-screens.spec.js
git commit -m "feat: 이용약관/개인정보처리방침 화면 + 런타임 fetch/캐시"
```

---

## Task 3: 진입점 (표지·설정) + 스타일

**Files:**
- Modify: `index.html` — 표지 `.landing` / 설정 `.set` 마크업, `open-legal` 클릭 위임, `<style>` 에 `.legal-*`·`.landing-consent`·`.landing-foot`
- Test: `tests/legal-screens.spec.js` (Modify — 추가)

**Interfaces:**
- Consumes: `openLegal` / `legalFrom` (T2), `currentScreen` (기존)
- Produces: 표지·설정의 문서 링크 (`data-action="open-legal" data-doc="…"`)

- [ ] **Step 1: Write the failing test** — 추가:

```js
test('표지 링크 → 이용약관, 뒤로 → 표지', async ({ page }) => {
  await routeLegal(page);
  await page.goto('/');
  await expect(page.locator('.landing-consent')).toContainText('이용약관');
  await page.locator('.landing-foot [data-doc="terms"]').click();
  await expect(page.locator('section[data-screen="terms"]')).toBeVisible();
  await page.locator('[data-action="legal-back"]').click();
  await expect(page.locator('section[data-screen="landing"]')).toBeVisible();
});

test('설정 링크 → 개인정보처리방침, 뒤로 → 설정', async ({ page }) => {
  await routeLegal(page);
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'김', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.locator('.mp-opt-btn').click();
  await expect(page.locator('section[data-screen="settings"]')).toBeVisible();
  await page.locator('.set-row[data-doc="privacy"]').click();
  await expect(page.locator('section[data-screen="privacy"]')).toBeVisible();
  await page.locator('[data-action="legal-back"]').click();
  await expect(page.locator('section[data-screen="settings"]')).toBeVisible();
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx playwright test legal-screens`
Expected: FAIL (`.landing-consent` 없음, `open-legal` 액션 없음).

- [ ] **Step 3: Implement**

**표지** — `#landingLoginBtn` 다음 줄에:
```html
    <p class="landing-consent">계속하면 <a data-action="open-legal" data-doc="terms">이용약관</a> 및
      <a data-action="open-legal" data-doc="privacy">개인정보처리방침</a>에 동의하게 됩니다.</p>
    <div class="landing-foot">
      <a data-action="open-legal" data-doc="terms">이용약관</a>
      <span aria-hidden="true">·</span>
      <a data-action="open-legal" data-doc="privacy">개인정보처리방침</a>
      <div class="landing-copy">© 2026 Travel Template</div>
    </div>
```

**설정** — `#setTheme` 행과 `#setLogout` 사이:
```html
    <div class="set-row" data-action="open-legal" data-doc="terms"><span>이용약관</span><span class="set-chev">›</span></div>
    <div class="set-row" data-action="open-legal" data-doc="privacy"><span>개인정보처리방침</span><span class="set-chev">›</span></div>
```

**클릭 위임** — `legal-back` 옆:
```js
  else if(a === 'open-legal'){ legalFrom = currentScreen; openLegal(btn.dataset.doc); }
```

**CSS** — `<style>` 안 (설정/표지 규칙 근처):
```css
  .legal{padding-top:16px; padding-bottom:60px;}
  .legal-title{font-family:'Fraunces',serif; font-size:20px; font-weight:700; color:var(--ink); margin:6px 0 14px;}
  .legal-body{font-size:13px; line-height:1.75; color:var(--ink-soft);}
  .legal-body h2{font-size:15px; font-weight:700; color:var(--ink); margin:22px 0 8px;}
  .legal-body h3{font-size:13.5px; font-weight:700; color:var(--ink); margin:16px 0 6px;}
  .legal-body h4{font-size:13px; font-weight:700; color:var(--ink-soft); margin:12px 0 4px;}
  .legal-body p{margin:8px 0;}
  .legal-body ul{margin:8px 0; padding-left:18px;}
  .legal-body li{margin:3px 0;}
  .legal-body strong{color:var(--ink);}
  .legal-body code{font-family:'Space Mono',monospace; font-size:12px; background:var(--paper-2); padding:1px 4px; border-radius:4px;}
  .legal-body a{color:var(--teal); text-decoration:underline; word-break:break-all;}
  .legal-body blockquote{margin:10px 0; padding:8px 12px; background:var(--paper-2); border-left:3px solid var(--gold); border-radius:0 8px 8px 0; font-size:12.5px;}
  .legal-body hr{border:none; border-top:1px solid var(--line); margin:18px 0;}
  .legal-table{overflow-x:auto; margin:10px 0;}
  .legal-body table{border-collapse:collapse; width:100%; font-size:12px;}
  .legal-body th,.legal-body td{border:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top;}
  .legal-body th{background:var(--paper-2); font-weight:700; color:var(--ink); white-space:nowrap;}
  .legal-loading,.legal-error{font-size:12.5px; color:var(--ink-faint); padding:20px 0;}
  .landing-consent{font-size:11px; color:var(--ink-faint); margin:12px 0 0; line-height:1.6;}
  .landing-consent a{color:var(--ink-soft); text-decoration:underline;}
  .landing-foot{margin-top:40px; font-size:11.5px; color:var(--ink-faint);}
  .landing-foot a{color:var(--ink-soft); text-decoration:underline; margin:0 4px;}
  .landing-copy{margin-top:8px; font-size:10.5px; color:var(--ink-faint);}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx playwright test legal-screens`
Expected: PASS (T1 4 + T2 5 + T3 2 = 11).

- [ ] **Step 5: Regression**

Run: `npx playwright test routing settings-avatar editor-tabs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/legal-screens.spec.js
git commit -m "feat: 표지·설정에 법적 문서 링크 + 화면 스타일"
```

---

## Task 4: 회귀 + 브라우저 확인 (컨트롤러 실행)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 스위트**

Run: `npx playwright test`
Expected: 기존 89 + 신규 11 = 100 통과.

- [ ] **Step 2: 로컬 서버 + 브라우저**

`npx serve -l 5199 .` → 브라우저로 `http://localhost:5199/`.
- 표지에서 "이용약관" / "개인정보처리방침" 링크 → 화면 전환, 실제 `docs/legal/*.md` 가 fetch·렌더되는지 (제목·표·인용·링크·구분선). "← 뒤로" → 표지.
- 로그인(스텁) → 설정 → 두 행 → 각 문서 화면, "← 뒤로" → 설정.
- 테마를 d(다크)로 바꾼 뒤 문서 화면 — 텍스트·표·인용 대비 확인.
- 모바일 폭에서 개인정보처리방침의 넓은 표(5열) 가로 스크롤(`.legal-table`) 동작, `body` 가로 스크롤 없음.
- 문서 화면·표지 스크린샷 확보.

- [ ] **Step 3: 배포 확인**

푸시 후 GitHub Pages 에서 `data-screen="terms"` / `renderMarkdown` / `legal-body` 마커 + 실제 문서 fetch(`.../docs/legal/terms-ko.md` 200) 확인.

---

## Self-Review

**Spec coverage:**
- §2 전달 방식(fetch·미니 렌더러·첫 # 제거·이스케이프·no-cache·캐시·실패 처리) → T1(렌더러) + T2(fetch/캐시/실패)
- §3 화면 마크업 → T2
- §4 진입점(표지 하단·동의 문구·설정 행) → T3
- §5 내비게이션(`legalFrom`·`open-legal`·`legal-back`) → T2(back) + T3(open)
- §6 동의: 고지 문구만 (`.landing-consent`) → T3. 차단형 체크박스 제외 = Global Constraints 에 명시
- §7 스타일 → T3
- §8 엣지(스크롤 top, 표 넘침, no-cache, 미지원 문법) → T1/T2 코드 + T4 브라우저 확인
- §9 테스트 → 각 Task 스펙 + T4
- §1 범위 밖(ecommerce 화면, 체크박스) → 계획에 없음 ✓

**Placeholder scan:** "적절히"/"TBD" 없음. 각 코드 스텝에 실제 코드.

**Type consistency:** `renderMarkdown`(T1 정의) → T2 소비. `openLegal`/`legalFrom`/`legalCache`/`LEGAL_DOCS`(T2 정의) → T3 의 `open-legal` 위임이 `legalFrom`·`openLegal` 소비. `#legalBody-terms`/`#legalBody-privacy` id, `data-action="open-legal"`+`data-doc`, `data-action="legal-back"` 문자열 T2/T3 일치. `.legal-table`/`.legal-body`/`.legal-error`/`.legal-loading` 클래스 렌더러 출력(T1)·CSS(T3)·테스트 일치.

**스펙 모순:** 없음. (§6 동의 방식은 스펙이 이미 "고지 문구만, 체크박스는 별도"로 결정.)
