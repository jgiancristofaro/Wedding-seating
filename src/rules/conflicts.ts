import { fullName } from '../model/names';
import { tableReach } from '../model/seats';
import type { PlanDoc, Table } from '../model/types';

export type ConflictKind = 'overCapacity' | 'together' | 'apart' | 'partySplit' | 'declinedSeated';

export interface Conflict {
  id: string;
  kind: ConflictKind;
  severity: 'error' | 'warning';
  message: string;
  guestIds: string[];
  tableIds: string[];
}

export interface ConflictReport {
  list: Conflict[];
  byGuest: Map<string, Conflict[]>;
  byTable: Map<string, Conflict[]>;
  errors: number;
  warnings: number;
}

/** Extra clearance (cm) between two tables' chair rings that still counts as "nearby". */
export const NEARBY_SLACK = 180;

export function tablesNearby(a: Pick<Table, 'x' | 'y' | 'w' | 'h'>, b: Pick<Table, 'x' | 'y' | 'w' | 'h'>): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tableReach(a) + tableReach(b) + NEARBY_SLACK;
}

const cache = new WeakMap<object, { tables: object; rules: object; report: ConflictReport }>();

export function detectConflicts(doc: Pick<PlanDoc, 'guests' | 'tables' | 'rules'>): ConflictReport {
  const hit = cache.get(doc.guests);
  if (hit && hit.tables === doc.tables && hit.rules === doc.rules) return hit.report;

  const list: Conflict[] = [];
  const { guests, tables } = doc;
  const name = (id: string) => (guests[id] ? fullName(guests[id]) : 'Unknown');

  // capacity
  const perTable = new Map<string, string[]>();
  for (const g of Object.values(guests)) {
    if (!g.tableId || g.seat == null || !tables[g.tableId]) continue;
    const arr = perTable.get(g.tableId);
    if (arr) arr.push(g.id);
    else perTable.set(g.tableId, [g.id]);
  }
  for (const [tid, ids] of perTable) {
    const t = tables[tid];
    const over = ids.filter((id) => (guests[id].seat ?? 0) >= t.capacity);
    if (over.length) {
      list.push({
        id: `cap:${tid}`,
        kind: 'overCapacity',
        severity: 'error',
        message: `${t.name} is over capacity (${ids.length}/${t.capacity}).`,
        guestIds: over,
        tableIds: [tid],
      });
    }
  }

  // pairwise rules
  for (const r of Object.values(doc.rules)) {
    const a = guests[r.a];
    const b = guests[r.b];
    if (!a || !b || !a.tableId || !b.tableId || !tables[a.tableId] || !tables[b.tableId]) continue;
    const same = a.tableId === b.tableId;
    const near = same || tablesNearby(tables[a.tableId], tables[b.tableId]);
    let violated = false;
    if (r.kind === 'together') violated = r.scope === 'table' ? !same : !near;
    else violated = r.scope === 'table' ? same : near;
    if (violated) {
      const where = r.scope === 'table' ? 'at the same table' : 'near each other';
      list.push({
        id: `rule:${r.id}`,
        kind: r.kind,
        severity: 'error',
        message:
          r.kind === 'together'
            ? `${name(r.a)} and ${name(r.b)} should sit ${where}.`
            : `${name(r.a)} and ${name(r.b)} must not sit ${where}.`,
        guestIds: [r.a, r.b],
        tableIds: [...new Set([a.tableId, b.tableId])],
      });
    }
  }

  // households split across tables
  const parties = new Map<string, string[]>();
  for (const g of Object.values(guests)) {
    if (!g.partyId) continue;
    const arr = parties.get(g.partyId);
    if (arr) arr.push(g.id);
    else parties.set(g.partyId, [g.id]);
  }
  for (const [pid, ids] of parties) {
    const seatedTables = new Set(ids.map((id) => guests[id].tableId).filter((t): t is string => !!t && !!tables[t]));
    if (seatedTables.size > 1) {
      list.push({
        id: `party:${pid}`,
        kind: 'partySplit',
        severity: 'warning',
        message: `${ids.map(name).join(' & ')} are a household but sit at different tables.`,
        guestIds: ids,
        tableIds: [...seatedTables],
      });
    }
  }

  for (const g of Object.values(guests)) {
    if (g.rsvp === 'declined' && g.tableId && tables[g.tableId]) {
      list.push({
        id: `declined:${g.id}`,
        kind: 'declinedSeated',
        severity: 'warning',
        message: `${name(g.id)} declined but still has a seat.`,
        guestIds: [g.id],
        tableIds: [g.tableId],
      });
    }
  }

  const byGuest = new Map<string, Conflict[]>();
  const byTable = new Map<string, Conflict[]>();
  for (const c of list) {
    for (const id of c.guestIds) byGuest.set(id, [...(byGuest.get(id) ?? []), c]);
    for (const id of c.tableIds) byTable.set(id, [...(byTable.get(id) ?? []), c]);
  }
  const report: ConflictReport = {
    list,
    byGuest,
    byTable,
    errors: list.filter((c) => c.severity === 'error').length,
    warnings: list.filter((c) => c.severity === 'warning').length,
  };
  cache.set(doc.guests, { tables: doc.tables, rules: doc.rules, report });
  return report;
}
