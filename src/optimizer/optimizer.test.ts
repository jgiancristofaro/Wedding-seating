import { describe, expect, it } from 'vitest';
import { buildDemoDoc } from '../model/demo';
import { emptyDoc, makeGuest, makeTable } from '../model/factory';
import { detectConflicts } from '../rules/conflicts';
import type { PlanDoc } from '../model/types';
import { optimize, type OptimizerOptions } from './optimizer';

const opts: OptimizerOptions = {
  mode: 'all',
  includePending: true,
  groupWeight: 1,
  balanceWeight: 1,
  mixGroups: [],
  seed: 7,
};

function run(doc: PlanDoc, o: Partial<OptimizerOptions> = {}) {
  return optimize({
    guests: Object.values(doc.guests),
    tables: Object.values(doc.tables),
    rules: Object.values(doc.rules),
    options: { ...opts, ...o },
  });
}

function applyTo(doc: PlanDoc, res: ReturnType<typeof run>) {
  const next = structuredClone(doc);
  for (const [id, a] of Object.entries(res.assignments)) {
    next.guests[id].tableId = a?.tableId ?? null;
    next.guests[id].seat = a?.seat ?? null;
  }
  return next;
}

describe('optimizer', () => {
  it('seats the demo wedding with no hard-rule violations and no double-booking', () => {
    const doc = buildDemoDoc();
    const res = run(doc);
    const next = applyTo(doc, res);
    const report = detectConflicts(next);
    expect(report.list.filter((c) => c.kind === 'together' || c.kind === 'apart')).toEqual([]);
    expect(report.list.filter((c) => c.kind === 'overCapacity')).toEqual([]);
    expect(report.list.filter((c) => c.kind === 'partySplit')).toEqual([]);
    expect(res.stats.unplaced).toBe(0);
    const seats = new Set<string>();
    for (const g of Object.values(next.guests)) {
      if (!g.tableId) continue;
      const k = `${g.tableId}:${g.seat}`;
      expect(seats.has(k)).toBe(false);
      seats.add(k);
      expect(g.seat!).toBeLessThan(next.tables[g.tableId].capacity);
    }
    expect(res.score).toBeGreaterThan(70);
    expect(res.breakdown.groups).toBeGreaterThan(0.5);
  });

  it('never moves locked guests or uses locked tables', () => {
    const doc = buildDemoDoc();
    const tables = Object.values(doc.tables);
    const lockedTable = tables.find((t) => t.name === 'Table 1')!;
    lockedTable.locked = true;
    const someone = Object.values(doc.guests).find((g) => !g.tableId && g.rsvp === 'attending')!;
    Object.assign(someone, { tableId: tables.find((t) => t.name === 'Table 5')!.id, seat: 3, locked: true });
    const res = run(doc);
    expect(res.assignments[someone.id]).toBeUndefined(); // fixed guests aren't part of the output
    expect(Object.values(res.assignments).some((a) => a?.tableId === lockedTable.id)).toBe(false);
    expect(Object.values(res.assignments).some((a) => a?.tableId === someone.tableId && a.seat === 3)).toBe(
      false,
    );
  });

  it('keeps households together and groups cohesive', () => {
    const doc = emptyDoc();
    for (let i = 0; i < 4; i++) {
      const t = makeTable('round', i * 400, 0, `T${i}`, { capacity: 6 });
      doc.tables[t.id] = t;
    }
    doc.groups.a = { id: 'a', name: 'A', color: '#fff' };
    doc.groups.b = { id: 'b', name: 'B', color: '#fff' };
    for (let i = 0; i < 12; i++) {
      const g = makeGuest({
        firstName: `G${i}`,
        rsvp: 'attending',
        groupId: i < 6 ? 'a' : 'b',
        partyId: i % 2 === 0 ? `p${i}` : `p${i - 1}`,
      });
      doc.guests[g.id] = g;
    }
    const next = applyTo(doc, run(doc));
    const tablesOf = (grp: string) =>
      new Set(
        Object.values(next.guests)
          .filter((g) => g.groupId === grp)
          .map((g) => g.tableId),
      );
    expect(tablesOf('a').size).toBe(1);
    expect(tablesOf('b').size).toBe(1);
    expect(detectConflicts(next).list).toEqual([]);
  });

  it('explains when there are not enough seats', () => {
    const doc = emptyDoc();
    const t = makeTable('round', 0, 0, 'Only', { capacity: 2 });
    doc.tables[t.id] = t;
    for (let i = 0; i < 3; i++) {
      const g = makeGuest({ firstName: `G${i}`, rsvp: 'attending' });
      doc.guests[g.id] = g;
    }
    const res = run(doc);
    expect(res.stats.unplaced).toBe(1);
    expect(res.issues.join(' ')).toMatch(/need 1 more seat/);
  });

  it('respects must-not-sit-together when feasible', () => {
    const doc = emptyDoc();
    for (let i = 0; i < 2; i++) {
      const t = makeTable('round', i * 2000, 0, `T${i}`, { capacity: 4 });
      doc.tables[t.id] = t;
    }
    doc.groups.a = { id: 'a', name: 'A', color: '#fff' };
    const gs = Array.from({ length: 6 }, (_, i) => {
      const g = makeGuest({ firstName: `G${i}`, rsvp: 'attending', groupId: 'a' });
      doc.guests[g.id] = g;
      return g;
    });
    doc.rules.r1 = { id: 'r1', kind: 'apart', scope: 'table', a: gs[0].id, b: gs[1].id };
    doc.rules.r2 = { id: 'r2', kind: 'together', scope: 'table', a: gs[2].id, b: gs[3].id };
    const res = run(doc);
    expect(res.stats.rulesBroken).toBe(0);
    expect(detectConflicts(applyTo(doc, res)).errors).toBe(0);
  });

  it('runs fast on 500 guests and 50 tables', () => {
    const doc = emptyDoc();
    for (let i = 0; i < 50; i++) {
      const t = makeTable('round', (i % 10) * 400, Math.floor(i / 10) * 400, `T${i}`, { capacity: 10 });
      doc.tables[t.id] = t;
    }
    for (let k = 0; k < 12; k++) doc.groups[`g${k}`] = { id: `g${k}`, name: `G${k}`, color: '#fff' };
    const ids: string[] = [];
    for (let i = 0; i < 500; i++) {
      const g = makeGuest({
        firstName: `P${i}`,
        rsvp: 'attending',
        groupId: `g${i % 12}`,
        partyId: i % 3 === 0 ? `h${i}` : i % 3 === 1 ? `h${i - 1}` : null,
      });
      doc.guests[g.id] = g;
      ids.push(g.id);
    }
    for (let r = 0; r < 20; r++)
      doc.rules[`r${r}`] = {
        id: `r${r}`,
        kind: r % 2 ? 'apart' : 'together',
        scope: 'table',
        a: ids[r * 7 + 2],
        b: ids[r * 11 + 5],
      };
    const res = run(doc);
    expect(res.stats.unplaced).toBe(0);
    expect(res.stats.ms).toBeLessThan(15000);
  });
});
