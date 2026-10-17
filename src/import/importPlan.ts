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

/** Placeholder values meaning "an unnamed extra guest", e.g. Zola's partner "Guest" or plus-one "Yes". */
const UNNAMED = /^(guest|yes|y|true|tbd|tba|plus ?one|\+1|unknown|unnamed)$/i;
/** A cell that reads like a person's name rather than a count / yes-no. */
const looksLikeName = (v: string) =>
  /^[\p{L}][\p{L}'’.\- ]*$/u.test(v) && !UNNAMED.test(v) && !NONE.test(v) && !/^(maybe|no|n|false)$/i.test(v);
const NO_GROUP = /^(unknown|none|n\/?a|-|tbd|other)$/i;

/** A household member listed on the same row as the main guest. `null` = unnamed ("Guest of …"). */
type Member = { firstName: string; lastName: string; isChild: boolean } | null;

/** Rows -> candidates. Expands party sizes / plus-ones / partners / children into linked guests. */
export function buildCandidates(rows: string[][], mapping: Mapping): Candidate[] {
  const col = (r: string[], key: string) => {
    const i = mapping.indexOf(key as never);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };
  const colsOf = (key: string) => mapping.flatMap((k, i) => (k === key ? [i] : []));
  const extraCols = colsOf('extraGuest');
  const childFirstCols = colsOf('childFirst');
  const childLastCols = colsOf('childLast');
  const out: Candidate[] = [];
  rows.forEach((r, i) => {
    let first = col(r, 'firstName');
    let last = col(r, 'lastName');
    const full = col(r, 'fullName');
    if (full && !first && !last) ({ firstName: first, lastName: last } = splitName(full));
    else if (full && first && !last) last = splitName(full).lastName;
    const sideCell = col(r, 'side');
    const groupCell = col(r, 'group');
    const side = NO_GROUP.test(sideCell) ? '' : sideCell;
    const groupRaw = NO_GROUP.test(groupCell) ? '' : groupCell;
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

    // Everyone else on this row, in order: plus-one names, partner, additional guests, children.
    const members: Member[] = [];
    const named = (full: string, isChild = false): Member => ({ ...splitName(full), isChild });
    col(r, 'plusOneName')
      .split(/[;&]|\band\b|,(?=\s*\S+\s+\S+)/i)
      .map((s) => s.trim())
      .filter((s) => s && !NONE.test(s) && !/^(yes|y|true|\d+)$/i.test(s))
      .forEach((n) => members.push(named(n)));
    // Zola's upload template puts the plus-one's *name* in "Plus One" (or "Yes" for an unnamed one).
    const plusCell = col(r, 'plusOnes');
    let plus = num(plusCell);
    if (looksLikeName(plusCell)) {
      members.push(named(plusCell));
      plus = null;
    }
    const pf = col(r, 'partnerFirst');
    const pl = col(r, 'partnerLast');
    if ((pf || pl) && !(NONE.test(pf) && !pl)) {
      if (UNNAMED.test(pf) && !pl) members.push(null);
      else members.push({ firstName: pf, lastName: pl, isChild: false });
    }
    for (const ci of extraCols) {
      const v = (r[ci] ?? '').trim();
      if (!v || NONE.test(v)) continue;
      members.push(UNNAMED.test(v) ? null : named(v));
    }
    for (let k = 0; k < Math.max(childFirstCols.length, childLastCols.length); k++) {
      const cf = childFirstCols[k] != null ? (r[childFirstCols[k]] ?? '').trim() : '';
      const cl = childLastCols[k] != null ? (r[childLastCols[k]] ?? '').trim() : '';
      // a child listed without a surname takes the main guest's
      if (cf || cl) members.push({ firstName: cf, lastName: cl || (cf ? last : ''), isChild: true });
    }
    const size = num(col(r, 'partySize'));
    const extra = Math.min(12, Math.max(members.length, plus ?? 0, size != null ? size - 1 : 0));
    if (extra > 0) {
      if (!base.household) base.household = `row:${i}`;
      for (let k = 0; k < extra; k++) {
        const m = members[k] ?? null;
        out.push({
          ...base,
          firstName: m ? cap(m.firstName) : k === 0 ? 'Guest of' : `Guest ${k + 1} of`,
          lastName: m ? cap(m.lastName || '') : `${base.firstName} ${base.lastName}`.trim(),
          dietary: [],
          access: [],
          notes: '',
          isChild: m?.isChild ?? false,
          generated: true,
        });
      }
    }
  });
  return out;
}

const listStr = (a: string[]) => a.join(', ');

/**
 * Compare candidates with the existing guest list. Matches on normalised full name; when several guests share a
 * name, the one whose household overlaps the row's other people wins (so two "John Smith"s stay distinct).
 */
export function reviewCandidates(candidates: Candidate[], doc: PlanDoc): ReviewRow[] {
  const byName = new Map<string, Guest[]>();
  for (const g of Object.values(doc.guests)) {
    const k = nameKey(g);
    byName.set(k, [...(byName.get(k) ?? []), g]);
  }
  const partyKeys = new Map<string, Set<string>>();
  for (const g of Object.values(doc.guests)) {
    if (!g.partyId) continue;
    const set = partyKeys.get(g.partyId) ?? new Set<string>();
    set.add(nameKey(g));
    partyKeys.set(g.partyId, set);
  }
  // everyone named on each source row (main guest + companions)
  const rowKeys = new Map<number, string[]>();
  for (const c of candidates) rowKeys.set(c.row, [...(rowKeys.get(c.row) ?? []), nameKey(c)]);
  const companionsOf = (c: Candidate) => (rowKeys.get(c.row) ?? []).filter((k) => k !== nameKey(c));
  const usedExisting = new Set<string>();
  const pickExisting = (c: Candidate): Guest | undefined => {
    const options = (byName.get(nameKey(c)) ?? []).filter((g) => !usedExisting.has(g.id));
    if (options.length <= 1) return options[0];
    const mine = new Set(companionsOf(c));
    const score = (g: Guest) =>
      [...(g.partyId ? (partyKeys.get(g.partyId) ?? []) : [])].filter((k) => mine.has(k)).length;
    return options.reduce((best, g) => (score(g) > score(best) ? g : best), options[0]);
  };

  const groupName = (id: string | null) => (id ? (doc.groups[id]?.name ?? '') : '');
  const firstSeen = new Map<string, Candidate>();
  // main guests that won't be imported; their companions on the same row follow them
  const skippedRows = new Map<number, { status: 'invalid' | 'duplicate'; reason: string }>();
  return candidates.map((c): ReviewRow => {
    const skipped = c.generated ? skippedRows.get(c.row) : undefined;
    if (skipped)
      return {
        c,
        status: skipped.status,
        diffs: [],
        message: `Comes with a skipped row (${skipped.reason})`,
      };
    if (!c.firstName && !c.lastName) {
      if (!c.generated) skippedRows.set(c.row, { status: 'invalid', reason: 'no name' });
      return { c, status: 'invalid', diffs: [], message: 'No name' };
    }
    const key = nameKey(c);
    if (!c.generated) {
      const earlier = firstSeen.get(key);
      if (earlier) {
        const a = companionsOf(earlier).sort().join('|');
        const b = companionsOf(c).sort().join('|');
        // Same name but a different household → a different person (common in real lists: "Ron Smith" Sr. & Jr.)
        if (a === b) {
          skippedRows.set(c.row, { status: 'duplicate', reason: 'duplicate' });
          return { c, status: 'duplicate', diffs: [], message: `Same as row ${earlier.row}` };
        }
      } else firstSeen.set(key, c);
    }
    const ex = pickExisting(c);
    if (!ex) {
      const sameNameEarlier = !c.generated && firstSeen.get(key) !== c;
      return {
        c,
        status: 'new',
        diffs: [],
        message: sameNameEarlier
          ? `Same name as row ${firstSeen.get(key)!.row}, different household — added separately`
          : undefined,
      };
    }
    usedExisting.add(ex.id);
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
