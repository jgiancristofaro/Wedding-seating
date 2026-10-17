import { describe, expect, it } from 'vitest';
import { emptyDoc, makeGuest } from '../model/factory';
import { decodeBytes, parseDelimited } from './csv';
import { applyImport, buildCandidates, parseList, parseRsvp, reviewCandidates, SAMPLE_CSV } from './importPlan';
import { autoMap, mappingProblems } from './mapping';

describe('parseDelimited', () => {
  it('handles quoted commas, embedded newlines and BOM', () => {
    const t = parseDelimited('﻿Name,Notes\n"Smith, Jane","line1\nline2"\nBob Lee,ok\n');
    expect(t.headers).toEqual(['Name', 'Notes']);
    expect(t.rows).toEqual([
      ['Smith, Jane', 'line1\nline2'],
      ['Bob Lee', 'ok'],
    ]);
  });
  it('detects tab-separated paste from a spreadsheet', () => {
    const t = parseDelimited('First\tLast\tRSVP\r\nAna\tGómez\tyes\r\n');
    expect(t.headers).toEqual(['First', 'Last', 'RSVP']);
    expect(t.rows[0]).toEqual(['Ana', 'Gómez', 'yes']);
  });
  it('detects semicolon CSV (European Excel)', () => {
    const t = parseDelimited('Name;Group\nA B;Family\n');
    expect(t.rows[0]).toEqual(['A B', 'Family']);
  });
  it('creates synthetic headers when the first row is data', () => {
    const t = parseDelimited('Jane Smith,2\nBob Lee,1\n');
    expect(t.syntheticHeaders).toBe(true);
    expect(t.rows.length).toBe(2);
  });
  it('pads ragged rows and skips blank lines', () => {
    const t = parseDelimited('Name,Group,Diet\nA B\n\n,,\nC D,x\n');
    expect(t.rows).toEqual([
      ['A B', '', ''],
      ['C D', 'x', ''],
    ]);
  });
});

describe('decodeBytes', () => {
  it('decodes UTF-8 with BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('José')]);
    expect(decodeBytes(bytes.buffer)).toBe('José');
  });
  it('falls back to Windows-1252 for legacy files', () => {
    const bytes = new Uint8Array([0x4a, 0x6f, 0x73, 0xe9]); // "José" in cp1252
    expect(decodeBytes(bytes.buffer)).toBe('José');
  });
  it('decodes UTF-16LE with BOM', () => {
    const s = 'Zoë';
    const buf = new Uint8Array(2 + s.length * 2);
    buf[0] = 0xff;
    buf[1] = 0xfe;
    for (let i = 0; i < s.length; i++) buf[2 + i * 2] = s.charCodeAt(i);
    expect(decodeBytes(buf.buffer)).toBe(s);
  });
});

describe('autoMap', () => {
  it('maps common header variants', () => {
    const m = autoMap(
      ['Guest Name', 'Party Size', 'Plus-one name', 'Side', 'Relationship', 'Meal choice', 'RSVP', 'Comments', 'Email'],
      [],
    );
    expect(m).toEqual(['fullName', 'partySize', 'plusOneName', 'side', 'group', 'dietary', 'rsvp', 'notes', 'ignore']);
  });
  it('maps first/last and household', () => {
    expect(autoMap(['First Name', 'Last Name', 'Household', 'Plus Ones', 'Dietary Restrictions'], [])).toEqual([
      'firstName',
      'lastName',
      'household',
      'plusOnes',
      'dietary',
    ]);
  });
  it('sniffs content when there are no headers', () => {
    const rows = [
      ['Jane Smith', 'yes', 'vegetarian'],
      ['Bob Lee', 'no', 'none'],
      ['Ann Ho', 'yes', 'gluten free'],
    ];
    expect(autoMap(['Column 1', 'Column 2', 'Column 3'], rows)).toEqual(['fullName', 'rsvp', 'dietary']);
  });
  it('reports missing name mapping and duplicates', () => {
    expect(mappingProblems(['ignore', 'group'])).toHaveLength(1);
    expect(mappingProblems(['fullName', 'group', 'group'])).toHaveLength(1);
    expect(mappingProblems(['fullName'])).toHaveLength(0);
  });
});

describe('value parsing', () => {
  it('parses RSVP', () => {
    expect(parseRsvp('Yes')).toBe('attending');
    expect(parseRsvp('Accepted')).toBe('attending');
    expect(parseRsvp('regrets')).toBe('declined');
    expect(parseRsvp('maybe')).toBe('pending');
    expect(parseRsvp('')).toBe(null);
  });
  it('normalises dietary lists', () => {
    expect(parseList('veg; gluten free and nut allergy')).toEqual(['Vegetarian', 'Gluten-free', 'Nut allergy']);
    expect(parseList('N/A')).toEqual([]);
    expect(parseList('Vegan, no shellfish')).toEqual(['Vegan', 'Shellfish allergy']);
  });
});

describe('candidates + merge', () => {
  const t = parseDelimited(SAMPLE_CSV);
  const m = autoMap(t.headers, t.rows);
  it('expands parties into linked guests', () => {
    const c = buildCandidates(t.rows, m);
    const jane = c.find((x) => x.firstName === 'Jane')!;
    expect(jane.lastName).toBe('Smith');
    expect(jane.group).toBe('Bride · Family');
    const john = c.find((x) => x.firstName === 'John')!;
    expect(john.household).toBe(jane.household);
    expect(john.generated).toBe(true);
    // Priya: party size 2 without a plus-one name -> "Guest of Priya Patel"
    expect(c.find((x) => x.firstName === 'Guest of' && x.lastName === 'Priya Patel')).toBeTruthy();
    expect(c).toHaveLength(7);
  });

  it('imports, then re-import merges instead of duplicating', () => {
    const doc = emptyDoc();
    const c = buildCandidates(t.rows, m);
    const review = reviewCandidates(c, doc);
    expect(review.every((r) => r.status === 'new')).toBe(true);
    const sum = applyImport(doc, review, () => 'incoming');
    expect(sum.added).toBe(7);
    expect(Object.keys(doc.groups).length).toBe(5);
    const jane = Object.values(doc.guests).find((g) => g.firstName === 'Jane')!;
    const john = Object.values(doc.guests).find((g) => g.firstName === 'John')!;
    expect(jane.partyId).toBeTruthy();
    expect(jane.partyId).toBe(john.partyId);

    // second import with one change
    const t2 = parseDelimited(SAMPLE_CSV.replace('Gluten-free', 'Vegan'));
    const review2 = reviewCandidates(buildCandidates(t2.rows, m), doc);
    expect(review2.filter((r) => r.status === 'update')).toHaveLength(1);
    expect(review2.filter((r) => r.status === 'new')).toHaveLength(0);
    const keep = applyImport(doc, review2, () => 'existing');
    expect(keep.added).toBe(0);
    expect(Object.values(doc.guests).find((g) => g.firstName === 'Michael')!.dietary).toEqual(['Gluten-free']);
    applyImport(doc, review2, () => 'incoming');
    expect(Object.values(doc.guests).find((g) => g.firstName === 'Michael')!.dietary).toEqual(['Vegan']);
    expect(Object.keys(doc.guests)).toHaveLength(7);
  });

  it('flags duplicates within a file and invalid rows', () => {
    const doc = emptyDoc();
    const g = makeGuest({ firstName: 'Ann', lastName: 'Ho' });
    doc.guests[g.id] = g;
    const t3 = parseDelimited('Name,Group\nBob Lee,A\nbob  lee,A\n,A\nAnn Ho,\n');
    const r = reviewCandidates(buildCandidates(t3.rows, autoMap(t3.headers, t3.rows)), doc);
    expect(r.map((x) => x.status)).toEqual(['new', 'duplicate', 'invalid', 'same']);
  });
});
