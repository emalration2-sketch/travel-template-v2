const { test, expect } = require('./support/fixtures');

test('detectLang: 주 언어 서브태그로 판정, 미지원은 en', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => [
    detectLang('ko-KR'), detectLang('ko'), detectLang('en-US'),
    detectLang('ja'), detectLang('zh-CN'), detectLang(''), detectLang(null),
  ]);
  expect(r).toEqual(['ko','ko','en','en','en','en','en']);
});

test('t(): 보간 + en 누락 시 ko 폴백 + 미존재 키는 키 반환', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    I18N.ko['__test.hello'] = '{who}님 안녕';
    I18N.en['__test.hello'] = 'Hi {who}';
    I18N.ko['__test.only'] = '한국어만';
    curLang = 'en';
    return [ t('__test.hello', { who: 'A' }), t('__test.only'), t('__test.missing') ];
  });
  expect(r).toEqual(['Hi A', '한국어만', '__test.missing']);
});

test('카탈로그: 대표 키가 ko/en 모두 존재', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    const keys = ['common.close','tab.schedule','landing.login','settings.language',
      'note.toChecklist','expense.total','theme.d','share.notes','sync.notSaved'];
    return keys.map(k => [k, I18N.ko[k] != null, I18N.en[k] != null]);
  });
  for (const [k, ko, en] of r) { expect(ko, k + ' ko').toBe(true); expect(en, k + ' en').toBe(true); }
});

test('언어 피커: 설정 행 → 모달 → English → 적용 + 닫힘 + 저장', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => { renderSettings(); showScreen('settings'); });

  await expect(page.locator('#setLang')).not.toHaveClass(/set-disabled/);
  await expect(page.locator('#setLangVal')).toHaveText('한국어');

  await page.locator('#setLang').click();
  await page.locator('#v2Modal .lang-card[data-lang="en"]').click();

  await expect(page.locator('#v2Modal')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  expect(await page.evaluate(() => localStorage.getItem('ttv2-lang'))).toBe('en');
  await expect(page.locator('#setLangVal')).toHaveText('English');
  await expect.poll(() => page.evaluate(() => (window.__test.dump()['users/u1']||{}).lang)).toBe('en');
});

test('정적 마크업: en 전환 시 nav/탭/표지/설정 텍스트가 영어', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => setLang('en'));
  await expect(page.locator('section[data-screen="landing"] .landing-login')).toHaveText('Continue with Google');
  await expect(page.locator('#backToMypage')).toHaveText('← My trips');
  await expect(page.locator('#editTabs .tab[data-tab="schedule"]')).toHaveText('Itinerary');
  await expect(page.locator('#editTabs .tab[data-tab="materials"]')).toHaveText('Files');
  await expect(page.locator('#setLang [data-i18n]')).toHaveText('Language');
  await expect(page.locator('#setTheme span[data-i18n]')).toHaveText('Color theme');
});

test('마이페이지 en: 무제목 여행 + 날짜 미정', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { title:'', startDate:'', endDate:'', dayCount:3 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => setLang('en'));
  await expect(page.locator('.mp-card .mp-title')).toHaveText('Untitled trip');
  await expect(page.locator('.mp-card .mp-dates')).toContainText('Dates TBD');
  await expect(page.locator('.mp-card .mp-dates')).toContainText('3d');
});

test('설정 en: 편집에서 온 뒤로가기 + 아바타 모달 제목/초기화', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => { settingsFrom = 'editor'; renderSettings(); showScreen('settings'); });
  await page.evaluate(() => setLang('en'));
  await expect(page.locator('#setBack')).toHaveText('← Back to editor');

  await page.evaluate(() => openAvatarModal());
  await expect(page.locator('#v2ModalBody > div').first()).toHaveText('Choose avatar');
  await expect(page.locator('#v2ModalActions .av-reset')).toHaveText('Reset to default (✈)');
});

test('테마 피커 en: 카드명/제목/잠금 오버레이/업셀 알림', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__test.seed('users/u1', { avatarId:'default', tripOrder:[] }); });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => { renderSettings(); showScreen('settings'); });
  await page.evaluate(() => setLang('en'));

  // 1) 모달 열기 → 영어 카드명 + 제목
  await page.evaluate(() => openThemeModal());
  const body = page.locator('#v2ModalBody');
  await expect(body).toContainText('Ocean');
  await expect(body).toContainText('Mono Slate');
  await expect(body).toContainText('Midnight');
  await expect(body).toContainText('Aquamarine');
  await expect(body).toContainText('Sunrise');
  await expect(body).toContainText('Color theme');

  // 2) #setThemeVal 은 현재 테마(a) 영어명
  await page.evaluate(() => pickTheme('a'));
  await expect(page.locator('#setThemeVal')).toHaveText('Ocean');

  // 3) 테마 잠금 → 재오픈 시 오버레이/뱃지 영어
  await page.evaluate(() => { THEME_LIST.find(x => x.id === 'e').locked = true; });
  await page.evaluate(() => openThemeModal());
  const locked = page.locator('#v2Modal .theme-card[data-theme="e"]');
  await expect(locked.locator('.tprev-lock')).toContainText('Members only');
  await expect(locked.locator('.tbadge')).toContainText('Membership');

  // 4) alert 스텁 → 잠긴 테마 선택 시 영어 업셀 메시지
  const msg = await page.evaluate(() => {
    let captured = '';
    const orig = window.alert;
    window.alert = m => { captured = m; };
    pickTheme('e');
    window.alert = orig;
    return captured;
  });
  expect(msg).toContain('members-only theme');

  await page.evaluate(() => { THEME_LIST.find(x => x.id === 'e').locked = false; });
});

test('표지 동의문: ko/en 어순', async ({ page }) => {
  await page.goto('/');
  const ko = await page.locator('.landing-consent').textContent();
  expect(ko.replace(/\s+/g,' ').trim()).toBe('계속하면 이용약관 및 개인정보처리방침에 동의하게 됩니다.');
  await page.evaluate(() => setLang('en'));
  const en = await page.locator('.landing-consent').textContent();
  expect(en.replace(/\s+/g,' ').trim()).toBe('By continuing, you agree to the Terms of Service and Privacy Policy.');
});

test('일정 탭 en: 일차/항목 템플릿의 placeholder·버튼·aria', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{ id:'d1', date:'', label:'', items:[{ id:'i1', time:'', place:'', memo:'', expenses:[] }] }],
      notes:[], links:[], attachments:[] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();

  await page.evaluate(() => { setLang('en'); });

  await expect(page.locator('#daysContainer .day-label')).toHaveAttribute('placeholder', 'Day title');
  await expect(page.locator('#daysContainer .add-item')).toHaveText('+ Add stop');
  await expect(page.locator('#daysContainer .tl-place')).toHaveAttribute('placeholder', 'Place / to-do');
  await expect(page.locator('#daysContainer .exp-icon')).toHaveAttribute('aria-label', 'Add expense');
  await expect(page.locator('#daysContainer .tl-memo')).toHaveAttribute('placeholder', 'Note');
  await expect(page.locator('#newTravelerInput')).toHaveAttribute('placeholder', '+ Add name');
});

test('메모 탭 en: placeholder·전환버튼·완료헤더 + (완료) 태그 언어무관 왕복', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{ id:'d1', date:'', label:'', items:[] }],
      notes:[
        { id:'n1', title:'', content:'' },
        { id:'n2', title:'T2', mode:'checklist', items:[
          { id:'a1', text:'x', done:true }, { id:'a2', text:'y', done:true } ] },
        { id:'n3', title:'T3', mode:'checklist', items:[
          { id:'b1', text:'하나', done:true } ] },
      ], links:[], attachments:[] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await page.locator('#editTabs .tab[data-tab="notes"]').click();
  await expect(page.locator('#editView-notes')).toBeVisible();

  // 왕복 1: ko(기본 픽스처)에서 체크리스트 → 메모, content 는 ' (완료)' 로 끝난다
  await page.locator('.note-mode-switch[data-note-id="n3"]').click();
  await expect(page.locator('.note-content[data-note-id="n3"]')).toHaveValue(/ \(완료\)$/);

  // en 전환
  await page.evaluate(() => setLang('en'));
  await expect(page.locator('.note-title[data-note-id="n1"]')).toHaveAttribute('placeholder', 'Title (e.g. Packing, Notes)');
  await expect(page.locator('.note-mode-switch[data-note-id="n1"]')).toContainText('Switch to checklist');
  await expect(page.locator('.note-done-head[data-note-id="n2"]')).toContainText('2 completed');

  // 왕복 2: en 에서 메모 → 체크리스트, ko 태그(완료)를 파서가 인식해 done 유지
  await page.locator('.note-mode-switch[data-note-id="n3"]').click();
  await expect(page.locator('.chk-row[data-note-id="n3"][data-item-id="b1"]')).toHaveClass(/done/);

  // 왕복 3: en 에서 체크리스트 → 메모, content 는 ' (done)' 로 끝난다
  await page.locator('.note-mode-switch[data-note-id="n3"]').click();
  await expect(page.locator('.note-content[data-note-id="n3"]')).toHaveValue(/ \(done\)$/);
});

test('자료모음 탭 en: 링크/이미지 placeholder + 동기화 티커 + 여행삭제 모달', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['나'],
      days:[{ id:'d1', date:'', label:'', items:[] }], notes:[],
      links:[{ id:'l1', label:'', url:'' }],
      attachments:[{ id:'a1', name:'' }] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await page.locator('#editTabs .tab[data-tab="materials"]').click();
  await page.evaluate(() => setLang('en'));

  // 링크 라벨 input placeholder
  await expect(page.locator('#linksContainer .link-label')).toHaveAttribute(
    'placeholder', 'Button label (e.g. Tickets, Map, Hotel)');
  // 이미지 이름 input placeholder
  await expect(page.locator('#attList .att-name')).toHaveAttribute('placeholder', '+ Add a name');

  // 동기화 상태 티커: msgs[0] → msgs[1]
  await page.evaluate(() => startUnsyncedTicker());
  await expect(page.locator('#syncStatus')).toHaveText('Not saved to cloud');
  await page.waitForTimeout(2100);
  await expect(page.locator('#syncStatus')).toHaveText('Check your connection');
  await page.evaluate(() => stopUnsyncedTicker());

  // 여행 삭제 모달: #v2ModalBody 텍스트 (\n 은 실제 개행)
  await page.evaluate(() => showDeleteModal('t1'));
  await expect(page.locator('#v2ModalBody')).toHaveText('Delete this trip?\nThis can’t be undone.');
});

test('공유 HTML: en 라벨 + <html lang="en">', async ({ page }) => {
  await page.goto('/');
  const html = await page.evaluate(() => {
    curLang = 'en';
    const out = buildStaticGuideHTML({ title:'Kyoto', travelers:['Me'],
      days:[{ id:'d1', date:'2026-05-01', label:'Day one', items:[
        { id:'i1', time:'09:00', place:'Airport', memo:'', expenses:[] } ] }],
      notes:[{ id:'n1', title:'Pack', mode:'text', content:'passport' }],
      links:[{ id:'l1', label:'', url:'https://x' }] });
    curLang = 'ko';   // 다른 테스트로 en 상태가 새지 않도록 복구
    return out;
  });
  expect(html).toContain('<html lang="en">');
  expect(html).toMatch(/>\s*Notes\s*</);
  expect(html).toMatch(/>\s*Links\s*</);
  expect(html).not.toContain('메모');
});

test('법적 문서: 언어별 md fetch + -ko 폴백', async ({ page }) => {
  const seen = [];
  await page.route('**/docs/legal/*.md', route => {
    const u = route.request().url();
    seen.push(u.split('/').pop());
    if(u.includes('terms-en.md')) return route.fulfill({ status: 404, body: 'nope' });
    return route.fulfill({ status: 200, headers: { 'content-type':'text/markdown' }, body: '# T\n\nhello' });
  });
  await page.goto('/');
  await page.evaluate(() => { curLang = 'en'; openLegal('terms'); });
  await expect(page.locator('#legalBody-terms')).toContainText('hello');
  expect(seen).toEqual(['terms-en.md', 'terms-ko.md']);   // en 시도 → 404 → ko 폴백
  await page.evaluate(() => { curLang = 'ko'; });   // en 상태가 다른 테스트로 새지 않도록 복구
});

/* ── Task 12: 지출 탭 + 모달 + 통화 선택 ─────────────────────────── */

async function openExpenseEditor(page, expenses){
  await page.goto('/');
  await page.evaluate((exps) => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['Me'],
      days:[{ id:'d1', date:'', label:'', items:[{ id:'i1', time:'', place:'Airport', memo:'', expenses:exps }] }],
      notes:[], links:[], attachments:[] }), title:'X', dayCount:1 });
  }, expenses || []);
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
}

test('Task 12 지출 탭 en: 빈 상태 / 합계 pill / 모달 버튼 / 통화 옵션', async ({ page }) => {
  await openExpenseEditor(page, []);
  await page.locator('#editTabs .tab[data-tab="expense"]').click();
  await page.evaluate(() => setLang('en'));

  await expect(page.locator('#editView-expense .empty-hint'))
    .toHaveText('No expenses yet. Use the + on a stop to add one.');

  await page.evaluate(() => {
    state.days[0].items[0].expenses.push({ id:'e1', name:'Coffee', amount:'5', currency:'USD', note:'' });
    renderExpenseTab();
  });
  await expect(page.locator('#editView-expense .sum-cur').first()).toHaveText(/^Total \(/);

  await page.evaluate(() => openExpenseModal('d1', 'i1'));
  await expect(page.locator('#saveExpenseBtn')).toHaveText('+ Add');
  const opts = await page.evaluate(() =>
    [...document.querySelectorAll('#mCurrency option')].map(o => o.textContent));
  expect(opts).toContain('USD');
  expect(opts).toContain('Other (custom)');

  await page.evaluate(() => { closeExpenseModal(); setLang('ko'); });
});

test('Task 12 R1 통화 왕복: en 에서 USD 저장 → ko 재저장해도 currency 유지', async ({ page }) => {
  await openExpenseEditor(page, []);
  await page.evaluate(() => {
    setLang('en');
    openExpenseModal('d1', 'i1');
    document.getElementById('mName').value = 'Taxi';
    document.getElementById('mAmount').value = '20';
    document.getElementById('mCurrency').value = 'USD';
    saveExpense();
  });
  expect(await page.evaluate(() => state.days[0].items[0].expenses[0].currency)).toBe('USD');

  await page.evaluate(() => {
    setLang('ko');
    const ex = state.days[0].items[0].expenses[0];
    editExpense('d1', 'i1', ex.id);
    saveExpense();               // 필드 변경 없이 재저장
  });
  const after = await page.evaluate(() => state.days[0].items[0].expenses[0].currency);
  expect(after).toBe('USD');     // '' 로도 '원' 으로도 덮이지 않는다
  expect(after).not.toBe('');

  await page.evaluate(() => { curLang = 'ko'; });
});

/* ── C1: 카탈로그 정합성 ─────────────────────────────────────────── */

test('C1 카탈로그: ko/en 키 집합 동일 + 빈 문자열 값 없음', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => ({
    ko: Object.keys(I18N.ko).sort(),
    en: Object.keys(I18N.en).sort(),
    emptyKo: Object.entries(I18N.ko).filter(([, v]) => v === '').map(([k]) => k),
    emptyEn: Object.entries(I18N.en).filter(([, v]) => v === '').map(([k]) => k),
  }));
  expect(r.ko).toEqual(r.en);
  expect(r.emptyKo).toEqual([]);
  expect(r.emptyEn).toEqual([]);
});

/* ── C2: en 모드 한글 스모크 ─────────────────────────────────────── */

test('C2 en 스모크: 편집기 탭 4종 + 지출 모달 + 설정 + 테마 모달에 한글 없음', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__test.seed('users/u1', { avatarId:'default', tripOrder:['t1'] });
    window.__test.seed('users/u1/trips/t1', { data: JSON.stringify({ title:'X', travelers:['Me'],
      days:[{ id:'d1', date:'', label:'', items:[{ id:'i1', time:'', place:'Airport', memo:'ride',
        expenses:[{ id:'e1', name:'Coffee', amount:'5', currency:'USD', note:'' }] }] }],
      notes:[{ id:'n1', title:'Pack', mode:'checklist', items:[
        { id:'c1', text:'passport', done:true }, { id:'c2', text:'socks', done:false } ] }],
      links:[{ id:'l1', label:'Map', url:'https://x' }],
      attachments:[{ id:'a1', name:'hotel.pdf' }] }), title:'X', dayCount:1 });
  });
  await page.evaluate(() => window.__test.signIn({ uid:'u1', displayName:'K', email:'a@b.com' }));
  await expect(page.locator('section[data-screen="mypage"]')).toBeVisible();
  await page.evaluate(() => openTrip('t1'));
  await expect(page.locator('section[data-screen="editor"]')).toBeVisible();
  await page.evaluate(() => setLang('en'));

  const hasHangul = s => /[가-힣]/.test(s || '');

  for (const tab of ['schedule', 'notes', 'expense', 'materials']) {
    await page.locator(`#editTabs .tab[data-tab="${tab}"]`).click();
    await expect(page.locator(`#editView-${tab}`)).toBeVisible();
    const txt = await page.locator(`#editView-${tab}`).innerText();
    expect(hasHangul(txt), `editor tab "${tab}" still has Hangul:\n` + txt).toBe(false);
  }

  await page.evaluate(() => openExpenseModal('d1', 'i1'));
  const modalTxt = await page.locator('#modalOverlay').innerText();
  expect(hasHangul(modalTxt), 'expense modal still has Hangul:\n' + modalTxt).toBe(false);
  await page.evaluate(() => closeExpenseModal());

  await page.evaluate(() => { renderSettings(); showScreen('settings'); });
  const setTxt = await page.locator('section[data-screen="settings"]').innerText();
  expect(hasHangul(setTxt), 'settings screen still has Hangul:\n' + setTxt).toBe(false);

  await page.evaluate(() => openThemeModal());
  const thmTxt = await page.locator('#v2Modal').innerText();
  expect(hasHangul(thmTxt), 'theme modal still has Hangul:\n' + thmTxt).toBe(false);

  await page.evaluate(() => { curLang = 'ko'; });
});
