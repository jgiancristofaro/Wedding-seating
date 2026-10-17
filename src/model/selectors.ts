import type { Guest, PlanDoc } from './types';

export interface PlanIndex {
  /** tableId -> (seat -> guest) */
  seating: Map<string, Map<number, Guest>>;
  parties: Map<string, Guest[]>;
  seatedCount: number;
  unseatedCount: number;
  /** guests that should be seated (attending, plus pending if enabled) */
  activeCount: number;
}

const cache = new WeakMap<object, PlanIndex>();

/** Memoised on the guests/tables objects (immer keeps them referentially stable when untouched). */
export function planIndex(doc: Pick<PlanDoc, 'guests' | 'tables' | 'settings'>): PlanIndex {
  const hit = cache.get(doc.guests);
  if (hit && (hit as PlanIndex & { _t?: object })._t === doc.tables) return hit;
  const seating = new Map<string, Map<number, Guest>>();
  const parties = new Map<string, Guest[]>();
  let seated = 0;
  let unseated = 0;
  let active = 0;
  for (const g of Object.values(doc.guests)) {
    if (g.partyId) {
      const arr = parties.get(g.partyId);
      if (arr) arr.push(g);
      else parties.set(g.partyId, [g]);
    }
    const isActive = isSeatable(g, doc.settings.includePending);
    if (isActive) active++;
    if (g.tableId && g.seat != null && doc.tables[g.tableId]) {
      seated++;
      let m = seating.get(g.tableId);
      if (!m) seating.set(g.tableId, (m = new Map()));
      m.set(g.seat, g);
    } else if (isActive) unseated++;
  }
  const idx = {
    seating,
    parties,
    seatedCount: seated,
    unseatedCount: unseated,
    activeCount: active,
    _t: doc.tables,
  };
  cache.set(doc.guests, idx);
  return idx;
}

export const isSeatable = (g: Guest, includePending: boolean) =>
  g.rsvp === 'attending' || (includePending && g.rsvp === 'pending');

export function guestsAtTable(index: PlanIndex, tableId: string): Guest[] {
  const m = index.seating.get(tableId);
  return m ? [...m.values()] : [];
}
