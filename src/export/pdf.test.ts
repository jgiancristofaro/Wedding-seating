import { describe, expect, it } from 'vitest';
import { emptyDoc, makeGuest, makeTable } from '../model/factory';
import { placeCardsPdf, seatingChartPdf } from './pdf';

function plan() {
  const doc = emptyDoc('Test');
  const t = makeTable('round', 0, 0, 'Table 1');
  doc.tables[t.id] = t;
  const g = makeGuest({
    firstName: 'Ada',
    lastName: 'Lovelace',
    rsvp: 'attending',
    tableId: t.id,
    seat: 0,
    meal: 'Short rib',
    dietary: ['Vegan'],
  });
  doc.guests[g.id] = g;
  return doc;
}
const text = async (b: Blob) => Buffer.from(await b.arrayBuffer()).toString('latin1');

describe('meal choices in PDFs', () => {
  it('table pages include meals by default and omit them when turned off', async () => {
    const opts = { paper: 'letter' as const, overview: false, tables: true, lookup: false };
    const on = await text(await seatingChartPdf(plan(), opts));
    expect(on).toContain('Short rib');
    expect(on).toContain('MEAL / NEEDS');
    const off = await text(await seatingChartPdf(plan(), { ...opts, meals: false }));
    expect(off).not.toContain('Short rib');
    expect(off).toContain('Vegan'); // other needs still listed
  });

  it('place cards include meals by default and omit them when turned off', async () => {
    expect(await text(await placeCardsPdf(plan(), 'letter'))).toContain('Short rib');
    const off = await text(await placeCardsPdf(plan(), 'letter', { meals: false }));
    expect(off).not.toContain('Short rib');
    expect(off).toContain('Vegan');
  });
});
