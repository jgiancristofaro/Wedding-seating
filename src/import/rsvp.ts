// Reconcile an RSVP export (e.g. Zola's "RSVP" CSV, one row per person and one column per event) with the guest list.
import { fullName, nameKey, splitName } from '../model/names';
import { makeGuest } from '../model/factory';
import type { Guest, PlanDoc, Rsvp } from '../model/types';
import type { ParsedTable } from './csv';

const STATUS = /^(attending|accepted|yes|declined|regrets|no|no response|awaiting|pending|maybe)$/i;
/** "Guest" rows stand for an unnamed plus-one of the person listed just before them. */
const PLACEHOLDER = /^(guest|plus ?one|\+1)$/i;
/** Free-text answers that mean "nothing to note". */
const NOTHING = /^(no(ne|pe|t really)?|nah|n\/?a|nil|nothing|-+|no restrictions?|no allergies)\W*$/i;

export interface RsvpColumns {
  first: number;
  last: number;
  /** single "Name" column when there are no first/last columns */
  full: number;
  /** event columns (header + index), e.g. Ceremony, Reception */
  events: { name: string; index: number }[];
  meal: number;
  diet: number;
}

function findCol(headers: string[], re: RegExp, skip: Set<number> = new Set()) {
  return headers.findIndex((h, i) => !skip.has(i) && re.test(h.trim()));
}

/** Detect the columns of an RSVP export. Returns null if this doesn't look like one. */
export function rsvpColumns(t: ParsedTable): RsvpColumns | null {
  const { headers, rows } = t;
  const first = findCol(headers, /^first[\s_-]*name$|^first$|^given name$/i);
  const last = findCol(headers, /^last[\s_-]*name$|^last$|^surname$/i);
  const full = first < 0 ? findCol(headers, /^((full|guest)[\s_-]*)?name$/i) : -1;
  if (first < 0 && full < 0) return null;
  const events = headers
    .map((name, index) => ({ name: name.trim(), index }))
    .filter(({ index }) => {
      const vals = rows.map((r) => (r[index] ?? '').trim()).filter(Boolean);
      return vals.length > 0 && vals.filter((v) => STATUS.test(v)).length / vals.length >= 0.8;
    })
    .filter(({ index }) => index !== first && index !== last && index !== full);
  if (events.length === 0) return null;
  return {
    first,
    last,
    full,
    events,
    meal: findCol(headers, /meal|entr[eé]e|menu|dinner choice/i, new Set(events.map((e) => e.index))),
    diet: findCol(headers, /allerg|diet|restriction/i),
  };
}

/** True when the file is an RSVP export rather than a guest list (no partner / party-size columns). */
export function isRsvpFile(t: ParsedTable): boolean {
  const cols = rsvpColumns(t);
  if (!cols) return false;
  const h = t.headers.map((x) => x.trim().toLowerCase());
  const guestListOnly = h.some((x) =>
    /partner|plus one|additional guest|party size|total definitely|child \d|relationship|group|^side$|household/.test(
      x,
    ),
  );
  // A guest list may have a generic "RSVP" column; an RSVP export has a column per named event (Ceremony, Reception…).
  const namedEvents = cols.events.filter(
    (e) => !/rsvp|status|attend|response|reply|coming|confirm/i.test(e.name),
  );
  return !guestListOnly && namedEvents.length > 0;
}

/** Preferred event for seating: the reception, else the ceremony, else a dinner, else the first event column. */
export function defaultEvent(cols: RsvpColumns): number {
  const pick = (re: RegExp) => cols.events.find((e) => re.test(e.name));
  return (pick(/reception/i) ?? pick(/ceremony|wedding/i) ?? pick(/banquet|dinner/i) ?? cols.events[0]).index;
}

export function parseStatus(v: string): Rsvp | null {
  const s = v.trim().toLowerCase();
  if (!s) return null; // not invited to this event / no data — leave unchanged
  if (/^(attending|accepted|yes)$/.test(s)) return 'attending';
  if (/^(declined|regrets|no)$/.test(s)) return 'declined';
  return 'pending';
}

export interface RsvpPerson {
  row: number;
  firstName: string;
  lastName: string;
  placeholder: boolean;
  status: Rsvp | null;
  meal: string;
  dietNote: string;
}

export type MatchKind = 'name' | 'plusOne' | 'namedPlusOne';

export interface RsvpMatch {
  person: RsvpPerson;
  guestId: string;
  kind: MatchKind;
}

export interface RsvpPlan {
  people: RsvpPerson[];
  matches: RsvpMatch[];
  /** RSVP rows with no matching guest */
  unmatched: RsvpPerson[];
  /** guests that no RSVP row refers to */
  missing: string[];
}

export function readPeople(t: ParsedTable, cols: RsvpColumns, eventIndex: number): RsvpPerson[] {
  return t.rows.map((r, i) => {
    const cell = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '');
    let firstName = cell(cols.first);
    let lastName = cell(cols.last);
    if (cols.full >= 0) ({ firstName, lastName } = splitName(cell(cols.full)));
    const meal = cell(cols.meal);
    const diet = cell(cols.diet);
    return {
      row: i + 1,
      firstName,
      lastName,
      placeholder: PLACEHOLDER.test(firstName) && !lastName,
      status: parseStatus(cell(eventIndex)),
      meal: STATUS.test(meal) ? '' : meal,
      dietNote: NOTHING.test(diet) ? '' : diet,
    };
  });
}

const isUnnamed = (g: Guest) =>
  /^guest( \d+)? of$/i.test(g.firstName.trim()) || PLACEHOLDER.test(g.firstName.trim());

/**
 * Match RSVP rows to guests. Zola lists each household together, so the rows around a person are used to tell apart
 * guests who share a name, and "Guest" rows are matched to the unnamed plus-one of the person just before them.
 */
export function planRsvp(doc: PlanDoc, people: RsvpPerson[]): RsvpPlan {
  const guests = Object.values(doc.guests);
  const byName = new Map<string, Guest[]>();
  for (const g of guests) byName.set(nameKey(g), [...(byName.get(nameKey(g)) ?? []), g]);
  const party = (g: Guest | undefined) =>
    g?.partyId ? guests.filter((x) => x.partyId === g.partyId) : g ? [g] : [];
  const used = new Set<string>();
  const matches: RsvpMatch[] = [];
  const unmatched: RsvpPerson[] = [];
  let prev: Guest | undefined;

  people.forEach((p, i) => {
    if (!p.firstName && !p.lastName) return;
    const take = (g: Guest, kind: MatchKind) => {
      used.add(g.id);
      matches.push({ person: p, guestId: g.id, kind });
      prev = g;
    };
    const freePlusOne = () => party(prev).find((g) => isUnnamed(g) && !used.has(g.id));

    if (p.placeholder) {
      const g = freePlusOne();
      if (g) take(g, 'plusOne');
      else {
        unmatched.push(p);
        prev = undefined;
      }
      return;
    }
    const options = (byName.get(nameKey(p)) ?? []).filter((g) => !used.has(g.id));
    if (options.length) {
      // neighbours on the RSVP sheet are usually the same household
      const near = new Set(
        people
          .slice(Math.max(0, i - 3), i + 4)
          .filter((q) => q !== p && !q.placeholder)
          .map((q) => nameKey(q)),
      );
      const score = (g: Guest) =>
        (prev && g.partyId && prev.partyId === g.partyId ? 3 : 0) +
        party(g).filter((m) => m.id !== g.id && near.has(nameKey(m))).length;
      take(
        options.reduce((best, g) => (score(g) > score(best) ? g : best), options[0]),
        'name',
      );
      return;
    }
    // A plus-one whose name was filled in on the RSVP: still "Guest of …" on the guest list.
    const g = freePlusOne();
    if (g) take(g, 'namedPlusOne');
    else {
      unmatched.push(p);
      prev = undefined;
    }
  });

  const matched = new Set(matches.map((m) => m.guestId));
  return { people, matches, unmatched, missing: guests.filter((g) => !matched.has(g.id)).map((g) => g.id) };
}

export interface RsvpOptions {
  meals: boolean;
  dietNotes: boolean;
  /** give plus-ones the name entered on the RSVP */
  renamePlusOnes: boolean;
  /** free the seats of guests who declined (locked guests keep theirs) */
  unseatDeclined: boolean;
  /** add RSVP rows that aren't on the guest list as new guests */
  addUnmatched: boolean;
}

export interface RsvpChange {
  guestId: string;
  name: string;
  from: Rsvp;
  to: Rsvp;
}

/** The RSVP status changes the plan would make (for the review screen). */
export function rsvpChanges(doc: PlanDoc, plan: RsvpPlan): RsvpChange[] {
  return plan.matches
    .filter((m) => m.person.status && doc.guests[m.guestId] && doc.guests[m.guestId].rsvp !== m.person.status)
    .map((m) => ({
      guestId: m.guestId,
      name: fullName(doc.guests[m.guestId]),
      from: doc.guests[m.guestId].rsvp,
      to: m.person.status!,
    }));
}

export interface RsvpSummary {
  updated: number;
  unseated: number;
  renamed: number;
  added: number;
}

/** Apply the plan (inside an immer recipe). Never deletes guests. */
export function applyRsvp(doc: PlanDoc, plan: RsvpPlan, o: RsvpOptions): RsvpSummary {
  const sum: RsvpSummary = { updated: 0, unseated: 0, renamed: 0, added: 0 };
  for (const m of plan.matches) {
    const g = doc.guests[m.guestId];
    if (!g) continue;
    const p = m.person;
    let changed = false;
    if (p.status && g.rsvp !== p.status) {
      g.rsvp = p.status;
      changed = true;
    }
    if (o.renamePlusOnes && m.kind === 'namedPlusOne') {
      g.firstName = p.firstName;
      g.lastName = p.lastName;
      sum.renamed++;
    }
    if (o.meals && p.meal && g.meal !== p.meal) {
      g.meal = p.meal;
      changed = true;
    }
    if (o.dietNotes && p.dietNote && !g.notes.includes(p.dietNote)) {
      g.notes = g.notes ? `${g.notes}\nRSVP: ${p.dietNote}` : `RSVP: ${p.dietNote}`;
      changed = true;
    }
    if (o.unseatDeclined && g.rsvp === 'declined' && g.tableId && !g.locked) {
      g.tableId = null;
      g.seat = null;
      sum.unseated++;
    }
    if (changed) sum.updated++;
  }
  if (o.addUnmatched) {
    for (const p of plan.unmatched) {
      if (p.placeholder) continue;
      const g = makeGuest({
        firstName: p.firstName,
        lastName: p.lastName,
        rsvp: p.status ?? 'pending',
        meal: o.meals && p.meal ? p.meal : undefined,
        notes: o.dietNotes && p.dietNote ? `RSVP: ${p.dietNote}` : '',
      });
      doc.guests[g.id] = g;
      sum.added++;
    }
  }
  return sum;
}
