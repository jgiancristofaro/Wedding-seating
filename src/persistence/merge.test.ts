import { describe, expect, it } from 'vitest';
import { emptyDoc, makeGuest, makeTable } from '../model/factory';
import { merge3 } from './merge';

function base() {
  const d = emptyDoc();
  const t = makeTable('round', 0, 0, 'Table 1');
  d.tables[t.id] = t;
  const a = makeGuest({ id: 'a', firstName: 'A' });
  const b = makeGuest({ id: 'b', firstName: 'B' });
  d.guests = { a, b };
  return { d, t };
}

describe('merge3', () => {
  it('keeps both sides’ edits to different entities and fields', () => {
    const { d, t } = base();
    const mine = structuredClone(d);
    const theirs = structuredClone(d);
    mine.guests.a.notes = 'mine';
    theirs.guests.a.rsvp = 'attending';
    theirs.guests.b.firstName = 'Bee';
    mine.tables[t.id].x = 100;
    const g = makeGuest({ id: 'c', firstName: 'C' });
    theirs.guests.c = g;
    const { doc } = merge3(d, mine, theirs);
    expect(doc.guests.a.notes).toBe('mine');
    expect(doc.guests.a.rsvp).toBe('attending');
    expect(doc.guests.b.firstName).toBe('Bee');
    expect(doc.guests.c).toBeTruthy();
    expect(doc.tables[t.id].x).toBe(100);
  });

  it('local deletions win over untouched remote; remote deletions apply when untouched locally', () => {
    const { d } = base();
    const mine = structuredClone(d);
    const theirs = structuredClone(d);
    delete mine.guests.a;
    delete theirs.guests.b;
    const { doc } = merge3(d, mine, theirs);
    expect(Object.keys(doc.guests)).toEqual([]);
  });

  it('same field edited on both sides: mine wins', () => {
    const { d } = base();
    const mine = structuredClone(d);
    const theirs = structuredClone(d);
    mine.guests.a.firstName = 'Mine';
    theirs.guests.a.firstName = 'Theirs';
    expect(merge3(d, mine, theirs).doc.guests.a.firstName).toBe('Mine');
  });

  it('resolves double-booked seats', () => {
    const { d, t } = base();
    const mine = structuredClone(d);
    const theirs = structuredClone(d);
    Object.assign(mine.guests.a, { tableId: t.id, seat: 0 });
    Object.assign(theirs.guests.b, { tableId: t.id, seat: 0 });
    const { doc, bumped } = merge3(d, mine, theirs);
    expect(bumped).toHaveLength(1);
    const seated = Object.values(doc.guests).filter((g) => g.tableId);
    expect(seated).toHaveLength(1);
  });
});
