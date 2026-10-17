export type FieldKey =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'partySize'
  | 'plusOnes'
  | 'plusOneName'
  | 'household'
  | 'group'
  | 'side'
  | 'dietary'
  | 'access'
  | 'rsvp'
  | 'notes'
  | 'child'
  | 'table'
  | 'ignore';

export const FIELDS: { key: FieldKey; label: string; help: string }[] = [
  { key: 'fullName', label: 'Full name', help: '“Jane Smith” or “Smith, Jane”' },
  { key: 'firstName', label: 'First name', help: '' },
  { key: 'lastName', label: 'Last name', help: '' },
  { key: 'partySize', label: 'Party size', help: 'Total people incl. this guest (2 = guest + 1)' },
  { key: 'plusOnes', label: 'Plus-ones', help: 'Extra guests: 1, 2, yes/no' },
  { key: 'plusOneName', label: 'Plus-one name', help: 'Name(s) of the plus-one' },
  { key: 'household', label: 'Household', help: 'Rows with the same value stay together' },
  { key: 'group', label: 'Group', help: 'Family, College friends, Work…' },
  { key: 'side', label: 'Side', help: 'Bride / Groom / Both' },
  { key: 'dietary', label: 'Dietary', help: 'Vegetarian, gluten-free…' },
  { key: 'access', label: 'Accessibility', help: 'Wheelchair, hearing…' },
  { key: 'rsvp', label: 'RSVP', help: 'Yes / No / Pending' },
  { key: 'notes', label: 'Notes', help: '' },
  { key: 'child', label: 'Child', help: 'yes/no or age' },
  { key: 'table', label: 'Table', help: 'Pre-assigned table name' },
  { key: 'ignore', label: 'Don’t import', help: '' },
];

const SYNONYMS: [FieldKey, RegExp][] = [
  ['plusOneName', /plus[\s_-]*one[\s_-]*names?|^\+1[\s_-]*names?|partner|companion|^date$/i],
  ['firstName', /^(first|given|fore)[\s_-]*(name)?$|^fname$|^first$/i],
  ['lastName', /^(last|family|sur)[\s_-]*(name)?$|^lname$|^surname$/i],
  ['fullName', /^((full|guest|display)[\s_-]*)?name$|^guest$|^invitee|^attendee/i],
  [
    'partySize',
    /party[\s_-]*size|^size$|#[\s_-]*(in[\s_-]*party|guests)|number[\s_-]*of[\s_-]*(guests|people)|^total|head[\s_-]*count|^count$|^seats$/i,
  ],
  ['plusOnes', /plus[\s_-]*ones?$|^\+1s?$|^plus$|additional[\s_-]*guests|^extra/i],
  ['household', /household|family[\s_-]*(id|name)?$|^party$|party[\s_-]*(id|name)|invitation|^invite/i],
  ['side', /^side$|bride[\s_-]*or[\s_-]*groom|^whose|guest[\s_-]*of$/i],
  ['group', /group|relation|category|circle|^tag|^type$|connection|^how/i],
  ['dietary', /diet|meal|food|allerg|restriction|entree|menu/i],
  ['access', /access|mobility|wheel|special[\s_-]*needs|disab/i],
  ['rsvp', /rsvp|attend|status|response|coming|confirmed/i],
  ['notes', /note|comment|remark|info/i],
  ['child', /child|kid|^age$|minor/i],
  ['table', /^table|table[\s_-]*(no|number|name|#)/i],
];

export type Mapping = FieldKey[];

/** Guess a field for each column from its header, then refine from the cell contents. */
export function autoMap(headers: string[], rows: string[][]): Mapping {
  const used = new Set<FieldKey>();
  const out: Mapping = headers.map((h) => {
    const name = h.trim();
    for (const [key, re] of SYNONYMS) {
      if (re.test(name) && !used.has(key)) {
        used.add(key);
        return key;
      }
    }
    return 'ignore';
  });

  // Content sniffing for headerless / unknown columns.
  out.forEach((k, i) => {
    if (k !== 'ignore') return;
    const sample = rows
      .slice(0, 30)
      .map((r) => r[i] ?? '')
      .filter(Boolean);
    if (sample.length === 0) return;
    const frac = (re: RegExp) => sample.filter((s) => re.test(s)).length / sample.length;
    let guess: FieldKey | null = null;
    if (frac(/^(yes|no|y|n|attending|declined|pending|accepted|maybe|tbd|confirmed|regrets?)$/i) > 0.7)
      guess = 'rsvp';
    else if (frac(/veg|vegan|gluten|nut|kosher|halal|dairy|allerg|none/i) > 0.5) guess = 'dietary';
    else if (frac(/^(bride|groom|both|mutual)('?s)?( side)?$/i) > 0.7) guess = 'side';
    else if (frac(/^\d{1,2}$/) > 0.8) guess = 'partySize';
    else if (frac(/^[\p{L}'’.-]+(\s+[\p{L}'’.-]+)+$/u) > 0.7) guess = 'fullName';
    else if (frac(/^[\p{L}'’.-]+$/u) > 0.8 && !used.has('firstName')) guess = 'firstName';
    if (guess && !used.has(guess)) {
      used.add(guess);
      out[i] = guess;
    }
  });

  // If we have first+last, a "name" column is probably redundant; if only fullName, fine.
  if (!out.includes('fullName') && out.includes('firstName') && !out.includes('lastName')) {
    const idx = out.findIndex((k, i) => k === 'ignore' && /^[\p{L}'’.-]+$/u.test(rows[0]?.[i] ?? ''));
    if (idx >= 0) out[idx] = 'lastName';
  }
  return out;
}

export function mappingProblems(m: Mapping): string[] {
  const p: string[] = [];
  if (!m.includes('fullName') && !m.includes('firstName') && !m.includes('lastName')) {
    p.push('Choose which column holds guest names.');
  }
  const counts = new Map<FieldKey, number>();
  for (const k of m) if (k !== 'ignore') counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const [k, n] of counts) {
    if (n > 1) p.push(`“${FIELDS.find((f) => f.key === k)?.label}” is mapped to ${n} columns.`);
  }
  return p;
}
