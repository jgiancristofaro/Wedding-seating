// Realistic demo plan: ~120 guests, households, dietary/access needs and a dozen seating rules.
import { uid } from '../lib/id';
import { GROUP_COLORS } from '../lib/colors';
import { emptyDoc, makeElement, makeGuest, makeTable } from './factory';
import { splitName } from './names';
import type { Guest, PlanDoc, Rsvp } from './types';

type Row = [group: string, names: string, dietary?: string, access?: string, rsvp?: Rsvp, notes?: string];

const GROUPS: [key: string, name: string, mix?: boolean][] = [
  ['wp', 'Wedding party'],
  ['bf', "Bride's family"],
  ['gf', "Groom's family"],
  ['bfr', "Bride's friends"],
  ['gfr', "Groom's friends"],
  ['col', 'College friends'],
  ['bw', "Bride's work"],
  ['gw', "Groom's work"],
  ['ff', 'Family friends'],
  ['nb', 'Neighbours', true],
];

const ROWS: Row[] = [
  ['wp', 'Olivia Bennett + Daniel Park', '', '', 'attending', 'The couple'],
  ['wp', 'Sophie Bennett', 'Vegetarian', '', 'attending', 'Maid of honour'],
  ['wp', 'Marcus Park', '', '', 'attending', 'Best man'],
  ['wp', 'Hannah Lee + Tom Reyes'],
  ['wp', 'Grace Kim + Will Foster', 'Gluten-free'],
  ['wp', 'Jacob Moreno'],
  ['wp', 'Ava Thompson'],
  ['bf', 'Richard Bennett + Susan Bennett', '', '', 'attending', 'Parents of the bride'],
  ['bf', 'Rose Bennett', 'Dairy-free', 'Wheelchair', 'attending', 'Grandma — near the exit'],
  ['bf', 'Frank Bennett', '', '', 'attending', 'Uncle'],
  ['bf', 'Linda Bennett', 'Vegetarian', '', 'attending', 'Aunt (divorced from Frank)'],
  [
    'bf',
    'Paul Bennett + Maria Bennett + Leo Bennett + Mia Bennett',
    '',
    '',
    'attending',
    'Cousins with kids',
  ],
  ['bf', 'Karen Walsh + Steve Walsh'],
  ['bf', 'Emily Walsh', 'Vegan'],
  ['bf', 'Dorothy Hughes', '', 'Hearing', 'attending', 'Great-aunt'],
  ['bf', 'Nathan Bennett + Chloe Adams'],
  ['gf', 'James Park + Helen Park', '', '', 'attending', 'Parents of the groom'],
  ['gf', 'Soo-jin Park', 'Nut allergy', 'Limited mobility', 'attending', 'Grandmother'],
  ['gf', 'Andrew Park + Julia Park'],
  ['gf', 'Kevin Cho + Michelle Cho + Ethan Cho'],
  ['gf', 'Daniel Cho', 'Pescatarian'],
  ['gf', 'Grace Park', '', '', 'pending'],
  ['gf', 'Henry Lim + Joyce Lim'],
  ['gf', 'Samuel Park', 'Halal'],
  ['gf', 'Irene Yoon + David Yoon'],
  ['bfr', 'Isabella Cruz + Mateo Cruz', 'Vegetarian'],
  ['bfr', 'Zoe Mitchell'],
  ['bfr', 'Lily Chen + Jordan Price', 'Gluten-free'],
  ['bfr', 'Natalie Brooks', 'Vegan'],
  ['bfr', 'Amelia Ward + Guest', '', '', 'pending'],
  ['bfr', 'Harper Scott'],
  ['bfr', 'Ella Morgan + Lucas Morgan'],
  ['bfr', 'Madison Gray', 'Nut allergy'],
  ['bfr', 'Chloe Rivera', '', '', 'declined', 'Abroad that week'],
  ['gfr', 'Ryan Murphy + Kate Murphy'],
  ['gfr', 'Tyler Brooks'],
  ['gfr', 'Owen Hart + Priya Hart', 'Vegetarian'],
  ['gfr', 'Caleb Turner'],
  ['gfr', 'Isaac Wright + Nora Wright'],
  ['gfr', 'Liam Foster', '', '', 'pending'],
  ['gfr', 'Noah Bell + Sarah Bell', 'Kosher'],
  ['gfr', 'Mason Reid'],
  ['col', 'James Whitaker'],
  ['col', 'Ethan Cole + Ruby Cole'],
  ['col', 'Sofia Alvarez', 'Vegetarian'],
  ['col', 'Benjamin Ross + Alice Ross'],
  ['col', 'Mia Russo'],
  ['col', 'Aiden Shaw + Layla Shaw', 'Gluten-free'],
  ['col', 'Charlotte King'],
  ['col', 'Jack Howard', '', '', 'pending'],
  ['col', 'Evelyn Price'],
  ['bw', 'Laura Fischer + Mark Fischer'],
  ['bw', 'Rachel Green', 'Vegan'],
  ['bw', 'Diane Porter', '', '', 'attending', 'Her manager'],
  ['bw', 'Kevin Malone'],
  ['bw', 'Angela Martin', 'Vegetarian'],
  ['bw', 'Oscar Diaz + Robert Lipton'],
  ['gw', 'Victor Huang + Lisa Huang'],
  ['gw', 'Priya Nair', 'Vegetarian'],
  ['gw', 'Tom Becker'],
  ['gw', 'Sandra Ortiz + Luis Ortiz'],
  ['gw', 'Arjun Mehta', 'Vegetarian'],
  ['gw', 'Megan Doyle', '', '', 'declined'],
  ['ff', 'George Anders + Patricia Anders'],
  ['ff', 'Walter Kim + Eunice Kim', '', 'Limited mobility'],
  ['ff', 'Margaret Doyle'],
  ['ff', 'Bill Carter + Nancy Carter'],
  ['ff', 'Father Michael Ryan', '', '', 'attending', 'Officiant'],
  ['nb', 'Greg Holt + Tina Holt'],
  ['nb', 'Yuki Tanaka', 'Pescatarian'],
  ['nb', 'Omar Haddad + Leila Haddad', 'Halal'],
  ['nb', 'Peter Novak'],
  ['nb', 'Carla Mendes + Joao Mendes'],
  ['bf', 'Thomas Bennett + Clara Bennett'],
  ['gf', 'Minho Park + Jiwoo Park + Sora Park', '', '', 'pending'],
  ['bfr', 'Eva Lindqvist + Johan Lindqvist', 'Vegetarian'],
  ['gfr', 'Derek Shaw'],
  ['col', 'Hugo Martin + Inès Martin'],
  ['ff', 'Ruth Abrams', '', 'Wheelchair'],
];

const RULES: [a: string, b: string, kind: 'together' | 'apart', scope: 'table' | 'nearby', note: string][] = [
  ['Frank Bennett', 'Linda Bennett', 'apart', 'nearby', 'Divorced — keep well apart'],
  ['Rose Bennett', 'Dorothy Hughes', 'together', 'table', 'Sisters'],
  ['Soo-jin Park', 'James Park', 'together', 'nearby', 'Grandmother near her son'],
  ['James Whitaker', 'Ethan Cole', 'apart', 'table', 'Old rivalry'],
  ['Diane Porter', 'Kevin Malone', 'apart', 'table', 'Manager and report'],
  ['Zoe Mitchell', 'Harper Scott', 'together', 'table', 'Best friends'],
  ['Caleb Turner', 'Mason Reid', 'together', 'table', 'Roommates'],
  ['Emily Walsh', 'Natalie Brooks', 'together', 'table', 'Both vegan, close friends'],
  ['Father Michael Ryan', 'Richard Bennett', 'together', 'nearby', 'Officiant near family'],
  ['Tyler Brooks', 'Ryan Murphy', 'apart', 'table', 'Ex business partners'],
  ['Mia Russo', 'Charlotte King', 'together', 'table', 'Travel buddies'],
  ['Peter Novak', 'Greg Holt', 'apart', 'table', 'Fence dispute'],
];

export function buildDemoDoc(): PlanDoc {
  const doc = emptyDoc('Olivia & Daniel');
  doc.eventDate = '2027-06-12';
  const gid = new Map<string, string>();
  GROUPS.forEach(([key, name, mix], i) => {
    const id = uid();
    gid.set(key, id);
    doc.groups[id] = { id, name, color: GROUP_COLORS[i % GROUP_COLORS.length], mix: mix || undefined };
  });
  const byName = new Map<string, Guest>();
  for (const [group, names, dietary = '', access = '', rsvp = 'attending', notes = ''] of ROWS) {
    const people = names.split('+').map((s) => s.trim());
    const party = people.length > 1 ? uid() : null;
    people.forEach((full, i) => {
      const isGuest = full === 'Guest';
      const n = isGuest ? { firstName: 'Guest of', lastName: people[0] } : splitName(full);
      const isChild = /^(Leo|Mia|Ethan) (Bennett|Cho)$/.test(full);
      const g = makeGuest({
        ...n,
        groupId: gid.get(group)!,
        partyId: party,
        rsvp,
        dietary: i === 0 && dietary ? dietary.split(',').map((s) => s.trim()) : isChild ? ['Kids meal'] : [],
        access: i === 0 && access ? [access] : [],
        notes: i === 0 ? notes : '',
        isChild: isChild || undefined,
      });
      doc.guests[g.id] = g;
      byName.set(full, g);
    });
  }
  for (const [a, b, kind, scope, note] of RULES) {
    const ga = byName.get(a);
    const gb = byName.get(b);
    if (!ga || !gb) continue;
    const id = uid();
    doc.rules[id] = { id, a: ga.id, b: gb.id, kind, scope, note };
  }

  // Room 24 m x 18 m
  const W = 2400;
  const H = 1800;
  for (const [x, y, x2, y2] of [
    [0, 0, W, 0],
    [W, 0, W, H],
    [W, H, 0, H],
    [0, H, 0, 0],
  ]) {
    const e = makeElement('wall', 0, 0, { x, y, x2, y2 });
    doc.elements[e.id] = e;
  }
  const add = (e: ReturnType<typeof makeElement>) => (doc.elements[e.id] = e);
  add(makeElement('door', 0, 0, { x: W / 2 - 100, y: H, x2: W / 2 + 100, y2: H }));
  add(makeElement('window', 0, 0, { x: 600, y: 0, x2: 800, y2: 0 }));
  add(makeElement('window', 0, 0, { x: 1600, y: 0, x2: 1800, y2: 0 }));
  add(makeElement('entrance', W / 2, H - 50));
  add(makeElement('danceFloor', W / 2, 820, { w: 560, h: 480 }));
  add(makeElement('dj', W / 2, 500, { w: 220, h: 80 }));
  add(makeElement('bar', 120, H - 400, { w: 76, h: 400 }));
  add(makeElement('buffet', W - 120, 900, { w: 76, h: 500 }));
  add(makeElement('cake', W - 220, H - 220));
  add(makeElement('photoBooth', 260, 260, { w: 220, h: 220 }));

  const sweet = makeTable('sweetheart', W / 2, 170, 'Sweetheart table', { locked: true });
  const head = makeTable('head', W / 2, 330, 'Head table', { w: 600, capacity: 10 });
  doc.tables[sweet.id] = sweet;
  doc.tables[head.id] = head;
  const cols = [480, 820, W - 820, W - 480];
  const rowsY = [620, 1000, 1380];
  let n = 1;
  for (const y of rowsY)
    for (const x of cols) {
      const t = makeTable('round', x, y, `Table ${n++}`);
      doc.tables[t.id] = t;
    }
  // The couple at the sweetheart table, wedding party at the head table.
  const couple = ['Olivia Bennett', 'Daniel Park'];
  couple.forEach((nm, i) => Object.assign(byName.get(nm)!, { tableId: sweet.id, seat: i, locked: true }));
  let s = 0;
  for (const g of Object.values(doc.guests)) {
    if (g.groupId === gid.get('wp') && !couple.includes(`${g.firstName} ${g.lastName}`)) {
      g.tableId = head.id;
      g.seat = s++;
    }
  }
  return doc;
}
