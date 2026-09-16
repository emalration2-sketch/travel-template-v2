const { test, expect } = require('./support/fixtures');

test('tripStateToContentDoc and contentDocToTripState round-trip', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const state = {
      title: 'Test Trip',
      travelers: ['Alice', 'Bob'],
      days: [
        { id: 'd1', date: '2026-01-01', label: 'Day 1', items: [
          { id: 'i1', time: '09:00', place: 'Station', memo: '', expenses: [] },
          { id: 'i2', time: '13:00', place: 'Museum', memo: 'Great place', expenses: [] },
        ] },
      ],
      notes: [{ id: 'n1', mode: 'text', content: 'Important note' }],
      links: [{ id: 'l1', label: 'Map', url: 'https://maps.example' }],
      attachments: [{ id: 'a1', name: 'Photo1' }],
    };
    const doc = tripStateToContentDoc(state);
    const back = contentDocToTripState(doc);
    return { doc, back };
  });
  expect(result.doc.dayOrder).toEqual(['d1']);
  expect(result.doc.days.d1.itemOrder).toEqual(['i1', 'i2']);
  expect(result.doc.days.d1.items.i2.place).toBe('Museum');
  expect(result.doc.noteOrder).toEqual(['n1']);
  expect(result.doc.linkOrder).toEqual(['l1']);

  expect(result.back.travelers).toEqual(['Alice', 'Bob']);
  expect(result.back.days).toHaveLength(1);
  expect(result.back.days[0].id).toBe('d1');
  expect(result.back.days[0].items.map(i => i.id)).toEqual(['i1', 'i2']);
  expect(result.back.notes[0].id).toBe('n1');
  expect(result.back.links[0].url).toBe('https://maps.example');
  expect(result.back.attachments).toEqual([{ id: 'a1', name: 'Photo1' }]);
});

test('contentDocToTripState: order arrays with missing items/notes/links should be filtered', async ({ page }) => {
  await page.goto('/');
  const back = await page.evaluate(() => {
    const doc = {
      dayOrder: ['d1', 'd-ghost'],
      days: { d1: { label: '', date: '', itemOrder: ['i1'], items: { i1: { place: 'x' } } } },
      noteOrder: [], notes: {}, linkOrder: [], links: {},
      travelers: [], attachments: [],
    };
    return contentDocToTripState(doc);
  });
  expect(back.days.map(d => d.id)).toEqual(['d1']);
});
