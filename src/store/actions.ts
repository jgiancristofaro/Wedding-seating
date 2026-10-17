// User-level commands. Each is one undoable step.
import { nextGroupColor } from '../lib/colors';
import { uid } from '../lib/id';
import { makeElement, makeGuest, makeTable, nextTableNumber, isSegment } from '../model/factory';
import { fullName } from '../model/names';
import {
  assignGuests,
  compactTable,
  deleteGuests,
  deleteTables,
  partyMembers,
  unassignGuests,
} from '../model/ops';
import type { ElementKind, FloorElement, Guest, Group, PlanDoc, Rule, Table, TableShape } from '../model/types';
import { commit, getDoc } from './planStore';
import { toast } from './toastStore';
import { useUi } from './uiStore';

const touchLayout = (d: PlanDoc) => {
  if (d.settings.sampleLayout) d.settings.sampleLayout = false;
};

// ---------- guests
export function addGuest(over: Partial<Guest> = {}): string {
  const g = makeGuest({ rsvp: 'attending', ...over });
  commit('Add guest', (d) => {
    d.guests[g.id] = g;
  });
  return g.id;
}

export function updateGuest(id: string, patch: Partial<Guest>) {
  commit('Edit guest', (d) => {
    const g = d.guests[id];
    if (!g) return false;
    Object.assign(g, patch);
    if (patch.rsvp === 'declined' && g.tableId && !g.locked) {
      g.tableId = null;
      g.seat = null;
    }
  });
}

export function updateGuests(ids: string[], patch: Partial<Guest>) {
  commit('Edit guests', (d) => {
    for (const id of ids) if (d.guests[id]) Object.assign(d.guests[id], patch);
  });
}

export function removeGuests(ids: string[]) {
  if (!ids.length) return;
  const label = ids.length === 1 ? fullName(getDoc().guests[ids[0]]) : `${ids.length} guests`;
  commit('Delete guests', (d) => deleteGuests(d, ids));
  toast.info(`Removed ${label}.`, { label: 'Undo', run: () => import('./planStore').then((m) => m.undo()) });
}

export function linkHousehold(ids: string[]) {
  if (ids.length < 2) return;
  commit('Link household', (d) => {
    const existing = ids.map((id) => d.guests[id]?.partyId).find(Boolean);
    const pid = existing ?? uid();
    for (const id of ids) if (d.guests[id]) d.guests[id].partyId = pid;
  });
}

export function unlinkHousehold(id: string) {
  commit('Unlink household', (d) => {
    const g = d.guests[id];
    if (!g?.partyId) return false;
    const pid = g.partyId;
    g.partyId = null;
    const rest = Object.values(d.guests).filter((x) => x.partyId === pid);
    if (rest.length === 1) rest[0].partyId = null;
  });
}

export function addPlusOne(hostId: string) {
  commit('Add plus-one', (d) => {
    const host = d.guests[hostId];
    if (!host) return false;
    if (!host.partyId) host.partyId = uid();
    const g = makeGuest({
      firstName: 'Guest of',
      lastName: fullName(host),
      groupId: host.groupId,
      partyId: host.partyId,
      rsvp: host.rsvp,
    });
    d.guests[g.id] = g;
  });
}

// ---------- seating
/** Seat a guest (and, if `withParty`, their household) at a table / seat. */
export function seatGuests(guestIds: string[], tableId: string, seat: number | null, withParty = false): boolean {
  const doc = getDoc();
  let ids = guestIds;
  if (withParty) {
    const all = new Set<string>();
    for (const id of guestIds) for (const m of partyMembers(doc, doc.guests[id])) all.add(m.id);
    ids = [...all];
  }
  const locked = ids.filter((id) => doc.guests[id]?.locked && doc.guests[id].tableId !== tableId);
  if (locked.length) {
    toast.warn(`${fullName(doc.guests[locked[0]])} is locked. Unlock them to move.`);
    return false;
  }
  if (doc.tables[tableId]?.locked) {
    toast.warn(`${doc.tables[tableId].name} is locked.`);
    return false;
  }
  const declined = ids.filter((id) => doc.guests[id]?.rsvp === 'declined');
  let reason = '';
  const ok = commit(ids.length > 1 ? 'Seat household' : 'Seat guest', (d) => {
    const r = assignGuests(d, ids, tableId, seat);
    if (!r.ok) {
      reason = r.reason;
      return false;
    }
    return true;
  });
  if (!ok) {
    if (reason) toast.warn(reason);
    return false;
  }
  if (declined.length) toast.info(`Note: ${fullName(doc.guests[declined[0]])} has declined.`);
  return true;
}

export function unseatGuests(ids: string[]) {
  const doc = getDoc();
  const movable = ids.filter((id) => !doc.guests[id]?.locked);
  if (movable.length < ids.length) toast.warn('Locked guests stay in their seats.');
  if (!movable.length) return;
  commit('Unseat', (d) => unassignGuests(d, movable));
}

export function clearSeating(tableIds?: string[]) {
  commit('Clear seats', (d) => {
    for (const g of Object.values(d.guests)) {
      if (g.locked || !g.tableId) continue;
      if (d.tables[g.tableId]?.locked) continue;
      if (tableIds && !tableIds.includes(g.tableId)) continue;
      g.tableId = null;
      g.seat = null;
    }
  });
}

export function applyAssignments(assignments: Record<string, { tableId: string; seat: number } | null>) {
  commit('Auto-seat', (d) => {
    for (const [id, a] of Object.entries(assignments)) {
      const g = d.guests[id];
      if (!g || g.locked) continue;
      g.tableId = a?.tableId ?? null;
      g.seat = a?.seat ?? null;
    }
  });
}

// ---------- tables
export function addTable(shape: TableShape, x: number, y: number): string {
  const doc = getDoc();
  const name =
    shape === 'head' ? 'Head table' : shape === 'sweetheart' ? 'Sweetheart table' : `Table ${nextTableNumber(doc)}`;
  const t = makeTable(shape, x, y, name);
  commit('Add table', (d) => {
    d.tables[t.id] = t;
    touchLayout(d);
  });
  useUi.getState().set({ selection: [t.id] });
  return t.id;
}

export function updateTable(id: string, patch: Partial<Table>) {
  commit('Edit table', (d) => {
    const t = d.tables[id];
    if (!t) return false;
    Object.assign(t, patch);
    if (patch.capacity != null) compactTable(d, id);
    touchLayout(d);
  });
}

export function moveItems(moves: { id: string; x: number; y: number; x2?: number; y2?: number }[]) {
  commit('Move', (d) => {
    for (const m of moves) {
      const t = d.tables[m.id];
      if (t) {
        t.x = m.x;
        t.y = m.y;
        continue;
      }
      const e = d.elements[m.id];
      if (e) {
        e.x = m.x;
        e.y = m.y;
        if (m.x2 != null) e.x2 = m.x2;
        if (m.y2 != null) e.y2 = m.y2;
      }
    }
    touchLayout(d);
  });
}

export function duplicateItems(ids: string[]) {
  const newIds: string[] = [];
  commit('Duplicate', (d) => {
    let n = nextTableNumber(d);
    for (const id of ids) {
      const t = d.tables[id];
      if (t) {
        const c: Table = {
          ...t,
          id: uid(),
          x: t.x + 60,
          y: t.y + 60,
          locked: false,
          name: /\d+\s*$/.test(t.name) ? t.name.replace(/\d+\s*$/, String(n++)) : `${t.name} copy`,
        };
        d.tables[c.id] = c;
        newIds.push(c.id);
      }
      const e = d.elements[id];
      if (e) {
        const c: FloorElement = { ...e, id: uid(), x: e.x + 60, y: e.y + 60 };
        if (c.x2 != null) c.x2 += 60;
        if (c.y2 != null) c.y2 += 60;
        d.elements[c.id] = c;
        newIds.push(c.id);
      }
    }
    touchLayout(d);
  });
  useUi.getState().set({ selection: newIds });
}

export function deleteItems(ids: string[]) {
  if (!ids.length) return;
  const doc = getDoc();
  const seated = Object.values(doc.guests).filter((g) => g.tableId && ids.includes(g.tableId)).length;
  commit('Delete', (d) => {
    deleteTables(
      d,
      ids.filter((id) => d.tables[id]),
    );
    for (const id of ids) delete d.elements[id];
    touchLayout(d);
  });
  useUi.getState().set({ selection: [] });
  toast.info(seated ? `Deleted. ${seated} guest(s) moved back to the unseated list.` : 'Deleted.', {
    label: 'Undo',
    run: () => import('./planStore').then((m) => m.undo()),
  });
}

export function clearSampleLayout() {
  commit('Clear layout', (d) => {
    deleteTables(d, Object.keys(d.tables));
    d.elements = {};
    d.settings.sampleLayout = false;
  });
}

export function setLocked(ids: string[], locked: boolean) {
  commit(locked ? 'Lock' : 'Unlock', (d) => {
    for (const id of ids) {
      if (d.tables[id]) d.tables[id].locked = locked;
      if (d.guests[id]) d.guests[id].locked = locked;
    }
  });
}

// ---------- floor elements
export function addElement(kind: ElementKind, x: number, y: number, over: Partial<FloorElement> = {}): string {
  const e = makeElement(kind, x, y, over);
  commit(`Add ${kind}`, (d) => {
    d.elements[e.id] = e;
    touchLayout(d);
  });
  return e.id;
}

export function addSegments(kind: ElementKind, segs: { x: number; y: number; x2: number; y2: number }[]) {
  if (!isSegment(kind) || !segs.length) return;
  commit(segs.length > 1 ? `Add ${segs.length} walls` : 'Add wall', (d) => {
    for (const s of segs) {
      const e = makeElement(kind, 0, 0, s);
      d.elements[e.id] = e;
    }
    touchLayout(d);
  });
}

export function updateElement(id: string, patch: Partial<FloorElement>) {
  commit('Edit element', (d) => {
    const e = d.elements[id];
    if (!e) return false;
    Object.assign(e, patch);
  });
}

// ---------- groups & rules
export function addGroup(name: string): string {
  const id = uid();
  commit('Add group', (d) => {
    const g: Group = { id, name, color: nextGroupColor(Object.values(d.groups).map((x) => x.color)) };
    d.groups[id] = g;
  });
  return id;
}

export function updateGroup(id: string, patch: Partial<Group>) {
  commit('Edit group', (d) => {
    if (d.groups[id]) Object.assign(d.groups[id], patch);
  });
}

export function deleteGroup(id: string) {
  commit('Delete group', (d) => {
    delete d.groups[id];
    for (const g of Object.values(d.guests)) if (g.groupId === id) g.groupId = null;
  });
}

export function addRule(r: Omit<Rule, 'id'>): string | null {
  if (r.a === r.b) {
    toast.warn('Pick two different guests.');
    return null;
  }
  const doc = getDoc();
  const dup = Object.values(doc.rules).find(
    (x) => ((x.a === r.a && x.b === r.b) || (x.a === r.b && x.b === r.a)) && x.kind === r.kind,
  );
  if (dup) {
    commit('Edit rule', (d) => {
      d.rules[dup.id].scope = r.scope;
    });
    return dup.id;
  }
  const opposite = Object.values(doc.rules).find(
    (x) => ((x.a === r.a && x.b === r.b) || (x.a === r.b && x.b === r.a)) && x.kind !== r.kind,
  );
  const id = uid();
  commit('Add rule', (d) => {
    if (opposite) delete d.rules[opposite.id];
    d.rules[id] = { ...r, id };
  });
  return id;
}

export function deleteRule(id: string) {
  commit('Delete rule', (d) => {
    delete d.rules[id];
  });
}

export function renamePlan(name: string) {
  commit('Rename plan', (d) => {
    d.name = name.slice(0, 120) || 'Our wedding';
  });
}

export function updateSettings(patch: Partial<PlanDoc['settings']>) {
  commit('Settings', (d) => {
    Object.assign(d.settings, patch);
  });
}

export function setBackdrop(b: PlanDoc['backdrop']) {
  commit(b ? 'Floor plan image' : 'Remove floor plan image', (d) => {
    d.backdrop = b;
    touchLayout(d);
  });
}

export function updateBackdrop(patch: Partial<NonNullable<PlanDoc['backdrop']>>) {
  commit('Floor plan image', (d) => {
    if (d.backdrop) Object.assign(d.backdrop, patch);
  });
}

export function replaceWholeDoc(next: PlanDoc, label: string) {
  commit(label, (d) => {
    Object.assign(d, next);
  });
}
