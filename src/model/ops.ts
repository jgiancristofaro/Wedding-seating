// Pure seat-assignment operations. They mutate the given doc (use inside an immer recipe).
import type { Guest, PlanDoc } from './types';

export type AssignResult = { ok: true; moved: number } | { ok: false; reason: string };

export function occupiedSeats(
  doc: PlanDoc,
  tableId: string,
  exclude: Set<string> = new Set(),
): Map<number, string> {
  const m = new Map<number, string>();
  for (const g of Object.values(doc.guests)) {
    if (g.tableId === tableId && g.seat != null && !exclude.has(g.id)) m.set(g.seat, g.id);
  }
  return m;
}

export function partyMembers(doc: PlanDoc, guest: Guest): Guest[] {
  if (!guest.partyId) return [guest];
  return Object.values(doc.guests).filter((g) => g.partyId === guest.partyId);
}

export function freeSeatCount(doc: PlanDoc, tableId: string): number {
  const t = doc.tables[tableId];
  if (!t) return 0;
  const occ = occupiedSeats(doc, tableId);
  let n = 0;
  for (let i = 0; i < t.capacity; i++) if (!occ.has(i)) n++;
  return n;
}

/**
 * Seat one or more guests at a table.
 * - Single guest dropped on an occupied seat: swap (occupant takes the mover's old seat, or is unseated).
 * - Otherwise guests fill free seats starting at `seat` (or 0) and continuing clockwise, so households sit together.
 */
export function assignGuests(
  doc: PlanDoc,
  guestIds: string[],
  tableId: string,
  seat?: number | null,
): AssignResult {
  const t = doc.tables[tableId];
  if (!t) return { ok: false, reason: 'That table no longer exists.' };
  const guests = guestIds.map((id) => doc.guests[id]).filter(Boolean);
  if (guests.length === 0) return { ok: false, reason: 'Nothing to seat.' };
  const moving = new Set(guests.map((g) => g.id));
  const occ = occupiedSeats(doc, tableId, moving);

  if (guests.length === 1 && seat != null && seat < t.capacity) {
    const g = guests[0];
    const occupantId = occ.get(seat);
    if (occupantId) {
      const occupant = doc.guests[occupantId];
      if (occupant.locked) return { ok: false, reason: 'That seat is locked.' };
      occupant.tableId = g.tableId;
      occupant.seat = g.seat;
      if (occupant.tableId == null) occupant.seat = null;
    }
    g.tableId = tableId;
    g.seat = seat;
    return { ok: true, moved: 1 };
  }

  const free: number[] = [];
  const start = seat != null && seat < t.capacity ? seat : 0;
  for (let k = 0; k < t.capacity; k++) {
    const i = (start + k) % t.capacity;
    if (!occ.has(i)) free.push(i);
  }
  if (free.length < guests.length) {
    return {
      ok: false,
      reason:
        free.length === 0
          ? `${t.name} is full.`
          : `${t.name} only has ${free.length} free seat${free.length === 1 ? '' : 's'} for ${guests.length} guests.`,
    };
  }
  guests.forEach((g, i) => {
    g.tableId = tableId;
    g.seat = free[i];
  });
  return { ok: true, moved: guests.length };
}

export function unassignGuests(doc: PlanDoc, guestIds: string[]): void {
  for (const id of guestIds) {
    const g = doc.guests[id];
    if (g) {
      g.tableId = null;
      g.seat = null;
    }
  }
}

export function deleteTables(doc: PlanDoc, ids: string[]): void {
  const s = new Set(ids);
  for (const g of Object.values(doc.guests)) {
    if (g.tableId && s.has(g.tableId)) {
      g.tableId = null;
      g.seat = null;
    }
  }
  for (const id of ids) delete doc.tables[id];
}

export function deleteGuests(doc: PlanDoc, ids: string[]): void {
  const s = new Set(ids);
  for (const id of ids) delete doc.guests[id];
  for (const r of Object.values(doc.rules)) if (s.has(r.a) || s.has(r.b)) delete doc.rules[r.id];
  // a party of one is no party
  const counts = new Map<string, number>();
  for (const g of Object.values(doc.guests))
    if (g.partyId) counts.set(g.partyId, (counts.get(g.partyId) ?? 0) + 1);
  for (const g of Object.values(doc.guests)) if (g.partyId && counts.get(g.partyId) === 1) g.partyId = null;
}

/** When capacity shrinks, try to move overflowing guests into free lower seats. */
export function compactTable(doc: PlanDoc, tableId: string): void {
  const t = doc.tables[tableId];
  if (!t) return;
  const occ = occupiedSeats(doc, tableId);
  const free: number[] = [];
  for (let i = 0; i < t.capacity; i++) if (!occ.has(i)) free.push(i);
  for (const g of Object.values(doc.guests)) {
    if (g.tableId === tableId && g.seat != null && g.seat >= t.capacity && free.length)
      g.seat = free.shift()!;
  }
}

/** Fix double-booked seats (e.g. after merging concurrent edits): later duplicates become unseated. */
export function resolveSeatCollisions(doc: PlanDoc): string[] {
  const seen = new Set<string>();
  const bumped: string[] = [];
  for (const g of Object.values(doc.guests)) {
    if (g.tableId == null || g.seat == null) continue;
    if (!doc.tables[g.tableId]) {
      g.tableId = null;
      g.seat = null;
      continue;
    }
    const k = `${g.tableId}:${g.seat}`;
    if (seen.has(k)) {
      g.tableId = null;
      g.seat = null;
      bumped.push(g.id);
    } else seen.add(k);
  }
  return bumped;
}
