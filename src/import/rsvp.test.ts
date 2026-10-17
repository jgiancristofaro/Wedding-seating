// RSVP reconciliation, using made-up data in the shape of Zola's RSVP export.
import { describe, expect, it } from 'vitest';
import { emptyDoc, makeGuest, makeTable } from '../model/factory';
import { fullName } from '../model/names';
import type { PlanDoc } from '../model/types';
import { parseDelimited } from './csv';
import {
  applyRsvp,
  defaultEvent,
  isRsvpFile,
  planRsvp,
  readPeople,
  rsvpChanges,
  rsvpColumns,
  type RsvpOptions,
} from './rsvp';

const RSVP = `Title,First Name,Last Name,Suffix,Welcome Dinner,Ceremony,What hotel are you staying at?,Cocktail Hour,Reception,Meal Choice,Food allergies or dietary restrictions?,After Party
Mrs.,Marie,Curie,,Attending,Attending,The Inn,,Attending,short rib,Nope :),
Mr.,Pierre,Curie,,Declined,Attending,The Inn,,Attending,arctic char,Nope :),
"",Rosalind,Franklin,,Attending,Attending,,,Attending,cavatelli (vegetarian),None,
"",Guest,,,Declined,Declined,,,Declined,,None,
Mr.,Niels,Bohr,,No Response,No Response,,,No Response,No Response,,
"",Ron,Weasley,,Declined,Attending,,,Attending,short rib,,
"",Hermione,Granger,,Declined,Attending,,,Attending,short rib,,
"",Ron,Weasley,,Attending,Declined,,,Declined,,,
"",Molly,Weasley,,Attending,Declined,,,Declined,,,
"",Ada,Lovelace,,Attending,Attending,,,Attending,cavatelli (vegetarian),Ada is allergic to nuts,
"",Charles,Babbage,,Attending,Attending,,,Attending,short rib,Ada is allergic to nuts,
"",Grace,Hopper,,Attending,Attending,,,Attending,short rib,,
"",Alan,Turing,,Attending,Attending,,,Attending,short rib,,
`;

/** Guest list as it would look after importing the matching Zola guest-list export. */
function guestList(): PlanDoc {
  const d = emptyDoc();
  const add = (first: string, last: string, party: string | null) => {
    const g = makeGuest({ firstName: first, lastName: last, partyId: party });
    d.guests[g.id] = g;
    return g;
  };
  add('Marie', 'Curie', 'p1');
  add('Pierre', 'Curie', 'p1');
  add('Rosalind', 'Franklin', 'p2');
  add('Guest of', 'Rosalind Franklin', 'p2');
  add('Niels', 'Bohr', null);
  add('Ron', 'Weasley', 'p3');
  add('Hermione', 'Granger', 'p3');
  add('Ron', 'Weasley', 'p4');
  add('Molly', 'Weasley', 'p4');
  add('Ada', 'Lovelace', 'p5');
  add('Charles', 'Babbage', 'p5');
  add('Grace', 'Hopper', 'p6');
  add('Guest of', 'Grace Hopper', 'p6'); // filled in as "Alan Turing" on the RSVP
  add('Kurt', 'Gödel', null); // not on the RSVP sheet
  return d;
}

const opts: RsvpOptions = {
  meals: true,
  dietNotes: true,
  renamePlusOnes: true,
  unseatDeclined: true,
  addUnmatched: false,
};
const find = (d: PlanDoc, name: string, party?: string) =>
  Object.values(d.guests).filter((g) => fullName(g) === name && (!party || g.partyId === party));

function plan(d: PlanDoc, csv = RSVP) {
  const t = parseDelimited(csv);
  const cols = rsvpColumns(t)!;
  return { t, cols, plan: planRsvp(d, readPeople(t, cols, defaultEvent(cols))) };
}

describe('RSVP file detection', () => {
  it('recognises an RSVP export and its event columns, not a guest list', () => {
    const t = parseDelimited(RSVP);
    expect(isRsvpFile(t)).toBe(true);
    const cols = rsvpColumns(t)!;
    expect(cols.events.map((e) => e.name)).toEqual(['Welcome Dinner', 'Ceremony', 'Reception']); // columns nobody answered aren't events;
    expect(t.headers[defaultEvent(cols)]).toBe('Reception');
    expect(t.headers[cols.meal]).toBe('Meal Choice');
    const guestListCsv =
      'Total Definitely Invited,First Name,Last Name,Partner First Name,Partner Last Name\n2,A,B,C,D\n';
    expect(isRsvpFile(parseDelimited(guestListCsv))).toBe(false);
    expect(isRsvpFile(parseDelimited('Name,Group\nA B,Family\n'))).toBe(false);
    // a normal guest list with a generic RSVP column must still import as a guest list
    expect(isRsvpFile(parseDelimited('First Name,Last Name,RSVP\nA,B,Yes\nC,D,No\n'))).toBe(false);
    expect(isRsvpFile(parseDelimited('First Name,Last Name,Attending?\nA,B,Attending\n'))).toBe(false);
  });
});

describe('matching', () => {
  it('matches everyone, including "Guest" rows and same-name guests in different households', () => {
    const d = guestList();
    const { plan: p } = plan(d);
    expect(p.unmatched).toEqual([]);
    expect(p.missing.map((id) => fullName(d.guests[id]))).toEqual(['Kurt Gödel']);
    const byRow = (row: number) => p.matches.find((m) => m.person.row === row)!;
    expect(d.guests[byRow(4).guestId].lastName).toBe('Rosalind Franklin'); // Guest row -> "Guest of Rosalind Franklin"
    expect(byRow(4).kind).toBe('plusOne');
    expect(d.guests[byRow(6).guestId].partyId).toBe('p3'); // Ron with Hermione
    expect(d.guests[byRow(8).guestId].partyId).toBe('p4'); // Ron with Molly
    expect(byRow(13).kind).toBe('namedPlusOne'); // Alan Turing filled in for Grace's plus-one
  });

  it('uses the chosen event (Reception by default) for the status', () => {
    const d = guestList();
    const { plan: p } = plan(d);
    applyRsvp(d, p, opts);
    expect(find(d, 'Pierre Curie')[0].rsvp).toBe('attending'); // declined the welcome dinner only
    expect(find(d, 'Ron Weasley', 'p3')[0].rsvp).toBe('attending');
    expect(find(d, 'Ron Weasley', 'p4')[0].rsvp).toBe('declined');
    expect(find(d, 'Niels Bohr')[0].rsvp).toBe('pending');
    expect(find(d, 'Guest of Rosalind Franklin')[0].rsvp).toBe('declined');
    expect(find(d, 'Kurt Gödel')[0].rsvp).toBe('pending'); // untouched
  });
});

describe('applying', () => {
  it('sets meals, adds real dietary notes, names plus-ones and frees declined seats', () => {
    const d = guestList();
    const t = makeTable('round', 0, 0, 'Table 1');
    d.tables[t.id] = t;
    const molly = find(d, 'Molly Weasley')[0];
    Object.assign(molly, { tableId: t.id, seat: 0 });
    const lockedRon = find(d, 'Ron Weasley', 'p4')[0];
    Object.assign(lockedRon, { tableId: t.id, seat: 1, locked: true });
    const { plan: p } = plan(d);
    const sum = applyRsvp(d, p, opts);
    expect(sum.unseated).toBe(1);
    expect(molly.tableId).toBeNull();
    expect(lockedRon.tableId).toBe(t.id); // locked guests keep their seat
    expect(find(d, 'Marie Curie')[0].meal).toBe('short rib');
    expect(find(d, 'Niels Bohr')[0].meal).toBeUndefined(); // "No Response" is not a meal
    expect(find(d, 'Marie Curie')[0].notes).toBe(''); // "Nope :)" is not a note
    expect(find(d, 'Ada Lovelace')[0].notes).toBe('RSVP: Ada is allergic to nuts');
    expect(find(d, 'Alan Turing')).toHaveLength(1);
    expect(find(d, 'Alan Turing')[0].partyId).toBe('p6');
    expect(sum.renamed).toBe(1);
  });

  it('is idempotent: running the same file again changes nothing', () => {
    const d = guestList();
    applyRsvp(d, plan(d).plan, opts);
    const before = structuredClone(d.guests);
    const again = plan(d).plan;
    expect(rsvpChanges(d, again)).toEqual([]);
    applyRsvp(d, again, opts);
    expect(d.guests).toEqual(before);
  });

  it('respects options and can add people missing from the guest list', () => {
    const d = guestList();
    const csv = RSVP + '"",Lise,Meitner,,Attending,Attending,,,Attending,short rib,Vegan,\n';
    const { plan: p } = plan(d, csv);
    expect(p.unmatched.map(fullName)).toEqual(['Lise Meitner']);
    const sum = applyRsvp(d, p, {
      meals: false,
      dietNotes: false,
      renamePlusOnes: false,
      unseatDeclined: false,
      addUnmatched: true,
    });
    expect(sum.added).toBe(1);
    expect(find(d, 'Lise Meitner')[0].rsvp).toBe('attending');
    expect(find(d, 'Marie Curie')[0].meal).toBeUndefined();
    expect(find(d, 'Guest of Grace Hopper')).toHaveLength(1); // not renamed
  });
});
