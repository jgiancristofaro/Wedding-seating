import { describe, expect, it } from 'vitest';
import { emptyDoc, makeGuest, makeTable } from '../model/factory';
import { detectConflicts } from './conflicts';
import type { PlanDoc } from '../model/types';

function setup() {
  const doc: PlanDoc = emptyDoc();
  const t1 = makeTable('round', 0, 0, 'Table 1', { capacity: 2 });
  const t2 = makeTable('round', 300, 0, 'Table 2'); // close to t1
  const t3 = makeTable('round', 3000, 0, 'Table 3'); // far away
  for (const t of [t1, t2, t3]) doc.tables[t.id] = t;
  const [a, b, c] = ['A', 'B', 'C'].map((n) => {
    const g = makeGuest({ firstName: n, rsvp: 'attending' });
    doc.guests[g.id] = g;
    return g;
  });
  return { doc, t1, t2, t3, a, b, c };
}

describe('detectConflicts', () => {
  it('flags apart rule at the same table', () => {
    const { doc, t1, a, b } = setup();
    Object.assign(a, { tableId: t1.id, seat: 0 });
    Object.assign(b, { tableId: t1.id, seat: 1 });
    doc.rules.r = { id: 'r', kind: 'apart', scope: 'table', a: a.id, b: b.id };
    const r = detectConflicts(doc);
    expect(r.errors).toBe(1);
    expect(r.byGuest.get(a.id)?.[0].kind).toBe('apart');
    expect(r.byTable.get(t1.id)).toHaveLength(1);
  });

  it('nearby scope: apart is violated at an adjacent table but not a distant one', () => {
    const { doc, t1, t2, t3, a, b } = setup();
    doc.rules.r = { id: 'r', kind: 'apart', scope: 'nearby', a: a.id, b: b.id };
    Object.assign(a, { tableId: t1.id, seat: 0 });
    Object.assign(b, { tableId: t2.id, seat: 0 });
    expect(detectConflicts({ ...doc, guests: { ...doc.guests } }).errors).toBe(1);
    Object.assign(b, { tableId: t3.id });
    expect(detectConflicts({ ...doc, guests: { ...doc.guests } }).errors).toBe(0);
  });

  it('together rule: table vs nearby', () => {
    const { doc, t1, t2, a, b } = setup();
    Object.assign(a, { tableId: t1.id, seat: 0 });
    Object.assign(b, { tableId: t2.id, seat: 0 });
    doc.rules.r = { id: 'r', kind: 'together', scope: 'table', a: a.id, b: b.id };
    expect(detectConflicts(doc).errors).toBe(1);
    doc.rules = { r: { ...doc.rules.r, scope: 'nearby' } };
    expect(detectConflicts({ ...doc, guests: { ...doc.guests } }).errors).toBe(0);
  });

  it('ignores rules when a guest is unseated', () => {
    const { doc, t1, a, b } = setup();
    Object.assign(a, { tableId: t1.id, seat: 0 });
    doc.rules.r = { id: 'r', kind: 'together', scope: 'table', a: a.id, b: b.id };
    expect(detectConflicts(doc).list).toHaveLength(0);
  });

  it('flags over-capacity, split households and declined guests', () => {
    const { doc, t1, t2, a, b, c } = setup();
    Object.assign(a, { tableId: t1.id, seat: 0, partyId: 'p' });
    Object.assign(b, { tableId: t2.id, seat: 0, partyId: 'p' });
    Object.assign(c, { tableId: t1.id, seat: 2, rsvp: 'declined' }); // seat 2 >= capacity 2
    const r = detectConflicts(doc);
    expect(r.list.map((x) => x.kind).sort()).toEqual(['declinedSeated', 'overCapacity', 'partySplit']);
    expect(r.errors).toBe(1);
    expect(r.warnings).toBe(2);
  });
});
