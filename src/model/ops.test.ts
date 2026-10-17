import { describe, expect, it } from 'vitest';
import { emptyDoc, makeGuest, makeTable } from './factory';
import { assignGuests, compactTable } from './ops';
import { seatPositions } from './seats';
import { splitName } from './names';

describe('assignGuests', () => {
  it('swaps when dropping onto an occupied seat', () => {
    const d = emptyDoc();
    const t = makeTable('round', 0, 0, 'T', { capacity: 4 });
    d.tables[t.id] = t;
    const a = makeGuest({ id: 'a', tableId: t.id, seat: 0 });
    const b = makeGuest({ id: 'b', tableId: t.id, seat: 1 });
    d.guests = { a, b };
    expect(assignGuests(d, ['a'], t.id, 1).ok).toBe(true);
    expect(d.guests.a.seat).toBe(1);
    expect(d.guests.b.seat).toBe(0);
  });
  it('seats a household in consecutive free seats or refuses when full', () => {
    const d = emptyDoc();
    const t = makeTable('round', 0, 0, 'T', { capacity: 4 });
    d.tables[t.id] = t;
    d.guests = {
      x: makeGuest({ id: 'x', tableId: t.id, seat: 1 }),
      a: makeGuest({ id: 'a' }),
      b: makeGuest({ id: 'b' }),
      c: makeGuest({ id: 'c' }),
      e: makeGuest({ id: 'e' }),
    };
    expect(assignGuests(d, ['a', 'b'], t.id, 2).ok).toBe(true);
    expect([d.guests.a.seat, d.guests.b.seat]).toEqual([2, 3]);
    const r = assignGuests(d, ['c', 'e'], t.id, null);
    expect(r.ok).toBe(false);
  });
  it('compacts overflow when capacity shrinks', () => {
    const d = emptyDoc();
    const t = makeTable('round', 0, 0, 'T', { capacity: 4 });
    d.tables[t.id] = t;
    d.guests = { a: makeGuest({ id: 'a', tableId: t.id, seat: 3 }) };
    t.capacity = 2;
    compactTable(d, t.id);
    expect(d.guests.a.seat).toBe(0);
  });
});

describe('seatPositions', () => {
  it('returns one position per seat for every shape', () => {
    for (const shape of ['round', 'rect', 'square', 'oval', 'head', 'sweetheart'] as const) {
      const t = makeTable(shape, 0, 0, 'x');
      expect(seatPositions(t, 9)).toHaveLength(9);
    }
  });
});

describe('splitName', () => {
  it('handles comma and particles', () => {
    expect(splitName('Smith, Jane')).toEqual({ firstName: 'Jane', lastName: 'Smith' });
    expect(splitName('Anna van der Berg')).toEqual({ firstName: 'Anna', lastName: 'van der Berg' });
    expect(splitName('Cher')).toEqual({ firstName: 'Cher', lastName: '' });
  });
});
