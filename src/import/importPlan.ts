// Turns parsed rows + a column mapping into a reviewable import plan, then applies it as a merge.
import { nextGroupColor } from '../lib/colors';
import { uid } from '../lib/id';
import { makeGuest } from '../model/factory';
import { nameKey, splitName } from '../model/names';
import type { Guest, PlanDoc, Rsvp } from '../model/types';
import type { Mapping } from './mapping';

export interface Candidate {
  row: number;
  firstName: string;
  lastName: string;
  group: string;
  rsvp: Rsvp | null;
  dietary: string[];
  access: string[];
  notes: string;
  isChild: boolean;
  table: string;
  /** Key linking rows into one household (plus-ones share their host's key). */
  household: string;
  /** Generated from a party size / plus-one column rather than an explicit row. */
  generated: boolean;
}

export type CandidateStatus = 'new' | 'update' | 'same' | 'duplicate' | 'invalid';

export interface FieldDiff {
  field: 'group' | 'rsvp' | 'dietary' | 'access' | 'notes';
  existing: string;
  incoming: string;
}

export interface ReviewRow {
  c: Candidate;
  status: CandidateStatus;
  existingId?: string;
  diffs: FieldDiff[];
  message?: string;
}

const NONE = /^(none|n\/?a|no|-|–|nil|0|null|no restrictions?)$/i;

export function parseRsvp(v: string): Rsvp | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (/^(y|yes|attending|accepted?|confirmed|going|coming|true|1|✓|x)$/.test(s) || s.startsWith('yes'))
    return 'attending';
  if (/^(n|no|declined?|regrets?|not attending|not coming|false|0|cancel+ed)$/.test(s) || s.startsWith('no'))
    return 'declined';
  return 'pending';
}

const DIET_CANON: [RegExp, string][] = [
  [/vegan/i, 'Vegan'],
  [/veg(etarian|gie|ie)?$|vegetarian|^v$/i, 'Vegetarian'],
  [/pesc/i, 'Pescatarian'],
  [/gluten|celiac|coeliac|^gf$/i, 'Gluten-free'],
  [/nut|peanut/i, 'Nut allergy'],
  [/dairy|lactose|^df$/i, 'Dairy-free'],
  [/shellfish/i, 'Shellfish allergy'],
  [/kosher/i, 'Kosher'],
  [/halal/i, 'Halal'],
  [/kid|child/i, 'Kids meal'],
];

export function parseList(v: string, canon: [RegExp, string][] = DIET_CANON): string[] {
  if (!v.trim() || NONE.test(v.trim())) return [];
  const parts = v
    .split(/[,;/|]|\band\b|\+/i)
    .map((p) => p.trim())
    .filter((p) => p && !NONE.test(p));
  const out: string[] = [];
  for (const p of parts) {
    const hit = canon.find(([re]) => re.test(p));
    const val = hit ? hit[1] : p[0].toUpperCase() + p.slice(1);
    if (!out.includes(val)) out.push(val);
  }
  return out;
}

const ACCESS_CANON: [RegExp, string][] = [
  [/wheel/i, 'Wheelchair'],
  [/walk|cane|mobility|crutch/i, 'Limited mobility'],
  [/hear|deaf/i, 'Hearing'],
  [/sight|vision|blind/i, 'Vision'],
  [/high ?chair|infant|baby/i, 'High chair'],
];

function num(v: string): number | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (/^(yes|y|true)$/.test(s)) return 1;
  if (/^(no|n|false|none)$/.test(s)) return 0;
  const m = /\d+/.exec(s);
  return m ? Number(m[0]) : null;
}

const cap = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(\w)/, (c) => c.toUpperCase());

function sideLabel(v: string): string {
  const s = v.trim().toLowerCase();
  if (/^bride/.test(s)) return 'Bride';
  if (/^groom/.test(s)) return 'Groom';
  if (/^(both|mutual|shared|couple)/.test(s)) return 'Both';
  return cap(v);
}

/** Rows -> candidates. Expands party sizes / plus-ones into linked guests. */
export function buildCandidates(rows: string[][], mapping: Mapping): Candidate[] {
  const col = (r: string[], key: string) => {
    const i = mapping.indexOf(key as never);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };
  const out: Candidate[] = [];
  rows.forEach((r, i) => {
    let first = col(r, 'firstName');
    let last = col(r, 'lastName');
    const full = col(r, 'fullName');
    if (full && !first && !last) ({ firstName: first, lastName: last } = splitName(full));
    else if (full && first && !last) last = splitName(full).lastName;
    const side = col(r, 'side');
    const groupRaw = col(r, 'group');
    const group =
      side && groupRaw
        ? `${sideLabel(side)} · ${cap(groupRaw)}`
        : groupRaw
          ? cap(groupRaw)
          : side
            ? `${sideLabel(side)}'s side`.replace("Both's side", 'Both sides')
            : '';
    const childRaw = col(r, 'child');
    const isChild = !!childRaw && (/^(y|yes|true|child|kid)$/i.test(childRaw) || (num(childRaw) ?? 99) < 13);
    const hh = col(r, 'household');
    const base: Candidate = {
      row: i + 1,
      firstName: cap(first),
      lastName: cap(last),
      group,
      rsvp: parseRsvp(col(r, 'rsvp')),
      dietary: parseList(col(r, 'dietary')),
      access: parseList(col(r, 'access'), ACCESS_CANON),
      notes: col(r, 'notes'),
      isChild,
      table: col(r, 'table'),
      household: hh ? `hh:${hh.toLowerCase()}` : '',
      generated: false,
    };
    out.push(base);

    const plusNames = col(r, 'plusOneName')
      .split(/[;&]|\band\b|,(?=\s*\S+\s+\S+)/i)
      .map((s) => s.trim())
      .filter((s) => s && !NONE.test(s) && !/^(yes|y|true|\d+)$/i.test(s));
    const size = num(col(r, 'partySize'));
    const plus = num(col(r, 'plusOnes'));
    const extra = Math.min(12, Math.max(plusNames.length, plus ?? 0, size != null ? size - 1 : 0));
    if (extra > 0) {
      if (!base.household) base.household = `row:${i}`;
      for (let k = 0; k < extra; k++) {
        const n = plusNames[k] ? splitName(plusNames[k]) : null;
        out.push({
          ...base,
          firstName: n ? cap(n.firstName) : k === 0 ? 'Guest of' : `Guest ${k + 1} of`,
          lastName: n ? cap(n.lastName || '') : `${base.firstName} ${base.lastName}`.trim(),
          dietary: [],
          access: [],
          notes: '',
          isChild: false,
          generated: true,
        });
      }
    }
  });
  return out;
}

const listStr = (a: string[]) => a.join(', ');

/** Compare candidates with the existing guest list. Matches on normalised full name. */
export function reviewCandidates(candidates: Candidate[], doc: PlanDoc): ReviewRow[] {
  const existing = new Map<string, Guest>();
  for (const g of Object.values(doc.guests)) existing.set(nameKey(g), g);
  const groupName = (id: string | null) => (id ? (doc.groups[id]?.name ?? '') : '');
  const seen = new Set<string>();
  return candidates.map((c) => {
    if (!c.firstName && !c.lastName) return { c, status: 'invalid', diffs: [], message: 'No name' };
    const key = nameKey(c);
    if (seen.has(key) && !c.generated)
      return { c, status: 'duplicate', diffs: [], message: 'Appears earlier in this file' };
    seen.add(key);
    const ex = existing.get(key);
    if (!ex) return { c, status: 'new', diffs: [] };
    const diffs: FieldDiff[] = [];
    if (c.group && c.group.toLowerCase() !== groupName(ex.groupId).toLowerCase())
      diffs.push({ field: 'group', existing: groupName(ex.groupId), incoming: c.group });
    if (c.rsvp && c.rsvp !== ex.rsvp) diffs.push({ field: 'rsvp', existing: ex.rsvp, incoming: c.rsvp });
    if (c.dietary.length && listStr(c.dietary) !== listStr(ex.dietary))
      diffs.push({ field: 'dietary', existing: listStr(ex.dietary), incoming: listStr(c.dietary) });
    if (c.access.length && listStr(c.access) !== listStr(ex.access))
      diffs.push({ field: 'access', existing: listStr(ex.access), incoming: listStr(c.access) });
    if (c.notes && c.notes !== ex.notes)
      diffs.push({ field: 'notes', existing: ex.notes, incoming: c.notes });
    return { c, status: diffs.length ? 'update' : 'same', existingId: ex.id, diffs };
  });
}

export type ConflictChoice = 'incoming' | 'existing';

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: number;
}

/** Apply reviewed rows to the doc (inside an immer recipe). Never deletes existing guests. */
export function applyImport(
  doc: PlanDoc,
  review: ReviewRow[],
  choice: (row: ReviewRow) => ConflictChoice,
): ImportSummary {
  const sum: ImportSummary = { added: 0, updated: 0, skipped: 0 };
  const groupByName = new Map(Object.values(doc.groups).map((g) => [g.name.toLowerCase(), g.id]));
  const tableByName = new Map(Object.values(doc.tables).map((t) => [t.name.toLowerCase(), t.id]));
  const groupId = (name: string): string | null => {
    if (!name) return null;
    const k = name.toLowerCase();
    let id = groupByName.get(k);
    if (!id) {
      id = uid();
      doc.groups[id] = { id, name, color: nextGroupColor(Object.values(doc.groups).map((g) => g.color)) };
      groupByName.set(k, id);
    }
    return id;
  };
  const partyByHousehold = new Map<string, string>();
  const partyFor = (hh: string, existingParty: string | null) => {
    if (!hh) return existingParty;
    let p = partyByHousehold.get(hh);
    if (!p) {
      p = existingParty ?? uid();
      partyByHousehold.set(hh, p);
    }
    return p;
  };
  const taken = new Set(
    Object.values(doc.guests)
      .filter((g) => g.tableId)
      .map((g) => `${g.tableId}:${g.seat}`),
  );

  for (const r of review) {
    const c = r.c;
    if (r.status === 'invalid' || r.status === 'duplicate') {
      sum.skipped++;
      continue;
    }
    if (r.existingId) {
      const g = doc.guests[r.existingId];
      if (!g) continue;
      // existing guest joins the household of the imported row
      const party = partyFor(c.household, g.partyId);
      if (party && party !== g.partyId) g.partyId = party;
      if (r.status === 'update' && choice(r) === 'incoming') {
        for (const d of r.diffs) {
          if (d.field === 'group') g.groupId = groupId(c.group);
          if (d.field === 'rsvp' && c.rsvp) g.rsvp = c.rsvp;
          if (d.field === 'dietary') g.dietary = c.dietary;
          if (d.field === 'access') g.access = c.access;
          if (d.field === 'notes') g.notes = c.notes;
        }
        sum.updated++;
      } else sum.skipped++;
      continue;
    }
    const g = makeGuest({
      firstName: c.firstName,
      lastName: c.lastName,
      groupId: groupId(c.group),
      partyId: partyFor(c.household, null),
      rsvp: c.rsvp ?? 'pending',
      dietary: c.dietary,
      access: c.access,
      notes: c.notes,
      isChild: c.isChild || undefined,
    });
    if (c.table) {
      const tid = tableByName.get(c.table.toLowerCase()) ?? tableByName.get(`table ${c.table}`.toLowerCase());
      const t = tid ? doc.tables[tid] : null;
      if (t) {
        for (let s = 0; s < t.capacity; s++) {
          if (!taken.has(`${t.id}:${s}`)) {
            taken.add(`${t.id}:${s}`);
            g.tableId = t.id;
            g.seat = s;
            break;
          }
        }
      }
    }
    doc.guests[g.id] = g;
    sum.added++;
  }
  // Single-member parties are pointless.
  const counts = new Map<string, number>();
  for (const g of Object.values(doc.guests))
    if (g.partyId) counts.set(g.partyId, (counts.get(g.partyId) ?? 0) + 1);
  for (const g of Object.values(doc.guests)) if (g.partyId && counts.get(g.partyId) === 1) g.partyId = null;
  return sum;
}

export const SAMPLE_CSV = `Full Name,Party Size,Plus-one Name,Side,Group,Dietary,RSVP,Notes
"Smith, Jane",2,John Smith,Bride,Family,Vegetarian,Yes,Aunt — near the front please
Michael Chen,1,,Groom,College friends,Gluten-free,Yes,
Priya Patel,2,,Bride,Work,"Vegan, nut allergy",Pending,
Carlos Ruiz,1,,Groom,Family,,Yes,Uses a wheelchair
Emma O'Brien,1,,Both,Neighbours,,No,Sends regrets
`;
