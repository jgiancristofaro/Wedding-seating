// Zola guest lists (made-up data in the two layouts Zola uses: the upload template and the full export).
import { describe, expect, it } from 'vitest';
import { emptyDoc } from '../model/factory';
import { fullName } from '../model/names';
import type { PlanDoc } from '../model/types';
import { parseDelimited } from './csv';
import { applyImport, buildCandidates, reviewCandidates } from './importPlan';
import { autoMap, detectZola, mappingProblems } from './mapping';

const TEMPLATE = `Name,Plus One,Email Address,Phone Number,Street Address 1,Street Address 2,City,State/Region,Postal Code,Additional Guest 1,Additional Guest 2
Ada Lovelace,Charles Babbage,ada@example.com,5550001111,1 Main St,Apt 1,London,NY,10001,Byron Lovelace,Annabella Lovelace
Grace Hopper,Yes,grace@example.com,5550002222,2 Main St,,Arlington,VA,22201,,
Alan Turing,,alan@example.com,,3 Main St,,Wilmslow,NY,10002,,
`;

const H =
  'Total Definitely Invited,Total Maybe Invited,Title,First Name,Last Name,Suffix,Partner Title,Partner First Name,Partner Last Name,Partner Suffix,Relationship To Couple,Email Address,Phone Number,Street Address,Street Address (line 2),City,State / Region,Zip / Postal Code,Country,Child 1 First Name,Child 1 Last Name,Child 2 First Name,Child 2 Last Name';
const EXPORT = `${H}
2,,Mrs.,Marie,Curie,,Mr.,Pierre,Curie,,Bride's Family,marie@example.com,,1 Rue,,Paris,NY,10003,,,,,
2,,,Rosalind,Franklin,,,Guest,,,Unknown,ros@example.com,,,,,,,,,,,
1,,Mr.,Niels,Bohr,,,,,,Groom's Friend,niels@example.com,,,,,,,,,,,
4,,Mr.,Carl,Sagan,,Ms.,Ann,Druyan,,Groom's Family,carl@example.com,,,,Ithaca,NY,14850,,Sasha,Sagan,Sam,
2,,,Ron,Weasley,,,Hermione,Granger,,Unknown,ron@example.com,,,,,,,,,,,
2,,,Ron,Weasley,,,Molly,Weasley,,Unknown,ronsr@example.com,,,,,,,,,,,
`;

function importInto(doc: PlanDoc, csv: string) {
  const t = parseDelimited(csv);
  const m = autoMap(t.headers, t.rows);
  const review = reviewCandidates(buildCandidates(t.rows, m), doc);
  const sum = applyImport(doc, review, () => 'incoming');
  return { t, m, review, sum };
}
const households = (doc: PlanDoc) => {
  const p = new Map<string, string[]>();
  for (const g of Object.values(doc.guests))
    if (g.partyId) p.set(g.partyId, [...(p.get(g.partyId) ?? []), fullName(g)]);
  return [...p.values()].map((x) => x.sort());
};

describe('Zola upload template', () => {
  it('maps columns: Plus One holds a name, Additional Guest columns add household members', () => {
    const t = parseDelimited(TEMPLATE);
    const m = autoMap(t.headers, t.rows);
    expect(detectZola(t.headers)).toBe(true);
    expect(m).toEqual([
      'fullName',
      'plusOnes',
      'ignore',
      'ignore',
      'ignore',
      'ignore',
      'ignore',
      'ignore',
      'ignore',
      'extraGuest',
      'extraGuest',
    ]);
    expect(mappingProblems(m)).toEqual([]);
  });

  it('imports families as linked households', () => {
    const doc = emptyDoc();
    const { sum } = importInto(doc, TEMPLATE);
    expect(sum.added).toBe(7);
    const hh = households(doc);
    expect(hh).toContainEqual(['Ada Lovelace', 'Annabella Lovelace', 'Byron Lovelace', 'Charles Babbage']);
    expect(hh).toContainEqual(['Grace Hopper', 'Guest of Grace Hopper']);
    expect(Object.values(doc.guests).find((g) => g.firstName === 'Alan')!.partyId).toBeNull();
  });
});

describe('Zola export', () => {
  it('maps partner and child columns, ignores titles/contact details', () => {
    const t = parseDelimited(EXPORT);
    const m = autoMap(t.headers, t.rows);
    const at = (h: string) => m[t.headers.indexOf(h)];
    expect(detectZola(t.headers)).toBe(true);
    expect(at('Total Definitely Invited')).toBe('partySize');
    expect(at('Total Maybe Invited')).toBe('ignore');
    expect(at('Partner Title')).toBe('ignore');
    expect(at('Partner First Name')).toBe('partnerFirst');
    expect(at('Partner Last Name')).toBe('partnerLast');
    expect(at('Relationship To Couple')).toBe('group');
    expect(at('Child 1 First Name')).toBe('childFirst');
    expect(at('Child 2 Last Name')).toBe('childLast');
    expect(at('State / Region')).toBe('ignore');
    expect(mappingProblems(m)).toEqual([]);
  });

  it('creates partners, unnamed guests and children; total matches the invited count', () => {
    const doc = emptyDoc();
    const { sum, t } = importInto(doc, EXPORT);
    const invited = t.rows.reduce((a, r) => a + Number(r[0]), 0);
    expect(sum.added).toBe(invited); // 13
    const hh = households(doc);
    expect(hh).toContainEqual(['Marie Curie', 'Pierre Curie']);
    expect(hh).toContainEqual(['Guest of Rosalind Franklin', 'Rosalind Franklin']);
    expect(hh).toContainEqual(['Ann Druyan', 'Carl Sagan', 'Sam Sagan', 'Sasha Sagan']);
    const sam = Object.values(doc.guests).find((g) => g.firstName === 'Sam')!;
    expect(sam.isChild).toBe(true); // child without a surname takes the main guest's
    // "Unknown" relationship is not a group; real ones are
    expect(
      Object.values(doc.groups)
        .map((g) => g.name)
        .sort(),
    ).toEqual(["Bride's Family", "Groom's Family", "Groom's Friend"]);
  });

  it('keeps two same-name guests from different households apart', () => {
    const doc = emptyDoc();
    const { review } = importInto(doc, EXPORT);
    const rons = Object.values(doc.guests).filter((g) => fullName(g) === 'Ron Weasley');
    expect(rons).toHaveLength(2);
    expect(rons[0].partyId).not.toBe(rons[1].partyId);
    expect(review.find((r) => r.c.row === 6 && !r.c.generated)!.message).toMatch(/different household/);
  });

  it('re-importing the same export changes nothing', () => {
    const doc = emptyDoc();
    importInto(doc, EXPORT);
    const before = structuredClone(doc.guests);
    const { review, sum } = importInto(doc, EXPORT);
    expect(sum.added).toBe(0);
    expect(review.every((r) => r.status === 'same')).toBe(true);
    expect(doc.guests).toEqual(before);
  });
});

describe('skipped rows take their companions with them', () => {
  it('does not import the plus-one of a duplicate or nameless row', () => {
    const doc = emptyDoc();
    const csv = 'Name,Party Size\nBo Peep,2\nBo Peep,2\n,2\n';
    const { sum, review } = importInto(doc, csv);
    expect(sum.added).toBe(2); // Bo Peep + Guest of Bo Peep, once
    expect(review.filter((r) => r.status === 'duplicate')).toHaveLength(2);
    expect(review.filter((r) => r.status === 'invalid')).toHaveLength(2);
  });
});
