// Validate + normalise documents coming from JSON backups, old versions or the network.
import { emptyDoc } from '../model/factory';
import type { PlanDoc } from '../model/types';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function normalizeDoc(input: unknown): PlanDoc {
  if (!isObj(input)) throw new Error('This file is not a seating plan backup.');
  const raw = isObj(input.doc) ? input.doc : input; // accept {doc: …} wrappers
  if (!isObj(raw.guests) && !isObj(raw.tables)) throw new Error('This file is not a seating plan backup.');
  const base = emptyDoc();
  const doc: PlanDoc = {
    ...base,
    name: typeof raw.name === 'string' ? raw.name : base.name,
    eventDate: typeof raw.eventDate === 'string' ? raw.eventDate : '',
    guests: (isObj(raw.guests) ? raw.guests : {}) as PlanDoc['guests'],
    groups: (isObj(raw.groups) ? raw.groups : {}) as PlanDoc['groups'],
    tables: (isObj(raw.tables) ? raw.tables : {}) as PlanDoc['tables'],
    rules: (isObj(raw.rules) ? raw.rules : {}) as PlanDoc['rules'],
    elements: (isObj(raw.elements) ? raw.elements : {}) as PlanDoc['elements'],
    backdrop: isObj(raw.backdrop) ? (raw.backdrop as unknown as PlanDoc['backdrop']) : null,
    settings: { ...base.settings, ...(isObj(raw.settings) ? raw.settings : {}) },
  };
  for (const [id, g] of Object.entries(doc.guests)) {
    if (!isObj(g)) {
      delete doc.guests[id];
      continue;
    }
    g.id = id;
    g.firstName = String(g.firstName ?? '');
    g.lastName = String(g.lastName ?? '');
    g.dietary = Array.isArray(g.dietary) ? g.dietary.map(String) : [];
    g.access = Array.isArray(g.access) ? g.access.map(String) : [];
    g.notes = String(g.notes ?? '');
    if (g.meal != null && typeof g.meal !== 'string') g.meal = String(g.meal);
    if (!g.meal) delete g.meal;
    g.rsvp = g.rsvp === 'attending' || g.rsvp === 'declined' ? g.rsvp : 'pending';
    g.groupId = g.groupId && doc.groups[g.groupId] ? g.groupId : null;
    g.partyId = g.partyId ?? null;
    g.locked = !!g.locked;
    if (!g.tableId || !doc.tables[g.tableId] || typeof g.seat !== 'number') {
      g.tableId = null;
      g.seat = null;
    }
  }
  for (const [id, t] of Object.entries(doc.tables)) {
    if (!isObj(t) || typeof t.x !== 'number' || typeof t.y !== 'number') {
      delete doc.tables[id];
      continue;
    }
    t.id = id;
    t.capacity = Math.max(0, Math.min(40, Math.round(Number(t.capacity) || 0)));
    t.rotation = Number(t.rotation) || 0;
    t.locked = !!t.locked;
  }
  for (const [id, r] of Object.entries(doc.rules)) {
    if (!isObj(r) || !doc.guests[r.a] || !doc.guests[r.b]) delete doc.rules[id];
  }
  return doc;
}
