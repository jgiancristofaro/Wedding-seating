import { uid } from '../lib/id';
import type { ElementKind, FloorElement, Guest, PlanDoc, Table, TableShape } from './types';

export const SHAPE_DEFAULTS: Record<TableShape, { w: number; h: number; capacity: number; label: string }> = {
  round: { w: 152, h: 152, capacity: 10, label: 'Round' },
  oval: { w: 240, h: 150, capacity: 10, label: 'Oval' },
  rect: { w: 244, h: 76, capacity: 8, label: 'Banquet' },
  square: { w: 150, h: 150, capacity: 8, label: 'Square' },
  head: { w: 488, h: 76, capacity: 10, label: 'Head table' },
  sweetheart: { w: 120, h: 60, capacity: 2, label: 'Sweetheart' },
};

export const SEGMENT_KINDS: ElementKind[] = ['wall', 'door', 'window'];
export const isSegment = (k: ElementKind) => SEGMENT_KINDS.includes(k);

export const ELEMENT_DEFAULTS: Record<ElementKind, { w: number; h: number; label: string }> = {
  wall: { w: 15, h: 0, label: 'Wall' },
  door: { w: 15, h: 90, label: 'Door' },
  window: { w: 12, h: 120, label: 'Window' },
  stage: { w: 488, h: 244, label: 'Stage' },
  danceFloor: { w: 488, h: 488, label: 'Dance floor' },
  bar: { w: 300, h: 76, label: 'Bar' },
  buffet: { w: 366, h: 76, label: 'Buffet' },
  dj: { w: 180, h: 90, label: 'DJ' },
  photoBooth: { w: 240, h: 240, label: 'Photo booth' },
  entrance: { w: 180, h: 50, label: 'Entrance' },
  cake: { w: 90, h: 90, label: 'Cake' },
  gifts: { w: 150, h: 70, label: 'Gifts' },
  label: { w: 220, h: 50, label: 'Label' },
};

export function emptyDoc(name = 'Our wedding'): PlanDoc {
  return {
    schemaVersion: 1,
    name,
    eventDate: '',
    guests: {},
    groups: {},
    tables: {},
    rules: {},
    elements: {},
    backdrop: null,
    settings: { units: 'ft', snap: true, layers: 'both', showNames: true, includePending: true },
  };
}

export function nextTableNumber(doc: Pick<PlanDoc, 'tables'>): number {
  let max = 0;
  for (const t of Object.values(doc.tables)) {
    const m = /(\d+)\s*$/.exec(t.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export function makeTable(shape: TableShape, x: number, y: number, name: string, over: Partial<Table> = {}): Table {
  const d = SHAPE_DEFAULTS[shape];
  return { id: uid(), name, shape, x, y, w: d.w, h: d.h, rotation: 0, capacity: d.capacity, locked: false, ...over };
}

export function makeElement(kind: ElementKind, x: number, y: number, over: Partial<FloorElement> = {}): FloorElement {
  const d = ELEMENT_DEFAULTS[kind];
  if (isSegment(kind)) {
    const len = kind === 'wall' ? 400 : d.h;
    return { id: uid(), kind, x: x - len / 2, y, x2: x + len / 2, y2: y, w: d.w, h: 0, rotation: 0, ...over };
  }
  return { id: uid(), kind, x, y, w: d.w, h: d.h, rotation: 0, label: kind === 'label' ? 'Label' : undefined, ...over };
}

export function makeGuest(over: Partial<Guest> = {}): Guest {
  return {
    id: uid(),
    firstName: '',
    lastName: '',
    groupId: null,
    partyId: null,
    rsvp: 'pending',
    dietary: [],
    access: [],
    notes: '',
    tableId: null,
    seat: null,
    locked: false,
    ...over,
  };
}

/** A starter room so a brand-new plan is never a blank canvas. Everything here can be deleted. */
export function addSampleLayout(doc: PlanDoc): void {
  const W = 2000;
  const H = 1500;
  const walls: [number, number, number, number][] = [
    [0, 0, W, 0],
    [W, 0, W, H],
    [W, H, 0, H],
    [0, H, 0, 0],
  ];
  for (const [x, y, x2, y2] of walls) {
    const e = makeElement('wall', 0, 0, { x, y, x2, y2 });
    doc.elements[e.id] = e;
  }
  const add = (e: FloorElement) => (doc.elements[e.id] = e);
  add(makeElement('door', 0, 0, { x: W / 2 - 90, y: H, x2: W / 2 + 90, y2: H }));
  add(makeElement('entrance', W / 2, H - 60));
  add(makeElement('danceFloor', W / 2, 640, { w: 500, h: 420 }));
  add(makeElement('dj', W / 2, 360, { w: 200, h: 80 }));
  add(makeElement('bar', 180, H - 200, { w: 76, h: 300, rotation: 0 }));
  add(makeElement('cake', W - 160, H - 160));

  const head = makeTable('head', W / 2, 160, 'Head table');
  doc.tables[head.id] = head;
  const spots = [
    [380, 420],
    [380, 760],
    [380, 1100],
    [W - 380, 420],
    [W - 380, 760],
    [W - 380, 1100],
    [W / 2 - 300, 1150],
    [W / 2 + 300, 1150],
  ];
  spots.forEach(([x, y], i) => {
    const t = makeTable('round', x, y, `Table ${i + 1}`);
    doc.tables[t.id] = t;
  });
  doc.settings.sampleLayout = true;
}
