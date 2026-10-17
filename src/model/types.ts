// Core plan document. All lengths are in centimetres ("world units").

export type Rsvp = 'attending' | 'pending' | 'declined';

export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  groupId: string | null;
  /** Guests sharing a partyId form a household / plus-one unit that moves together. */
  partyId: string | null;
  rsvp: Rsvp;
  dietary: string[];
  /** Accessibility needs, e.g. "wheelchair", "hearing". */
  access: string[];
  notes: string;
  /** Meal choice from RSVPs, e.g. "Short rib". */
  meal?: string;
  isChild?: boolean;
  tableId: string | null;
  /** Seat index around the table. Index >= capacity means overflow. */
  seat: number | null;
  locked: boolean;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  /** Optimizer: spread this group across tables rather than keeping it together. */
  mix?: boolean;
}

export type TableShape = 'round' | 'rect' | 'square' | 'oval' | 'head' | 'sweetheart';

export interface Table {
  id: string;
  name: string;
  shape: TableShape;
  x: number;
  y: number;
  /** width / diameter in cm */
  w: number;
  /** depth in cm (same as w for round/square) */
  h: number;
  rotation: number;
  capacity: number;
  locked: boolean;
}

export type RuleKind = 'together' | 'apart';
export type RuleScope = 'table' | 'nearby';

export interface Rule {
  id: string;
  kind: RuleKind;
  scope: RuleScope;
  a: string;
  b: string;
  note?: string;
}

export type ElementKind =
  | 'wall'
  | 'door'
  | 'window'
  | 'stage'
  | 'danceFloor'
  | 'bar'
  | 'buffet'
  | 'dj'
  | 'photoBooth'
  | 'entrance'
  | 'cake'
  | 'gifts'
  | 'label';

export interface FloorElement {
  id: string;
  kind: ElementKind;
  /** For segment kinds (wall/door/window): start point. For box kinds: centre. */
  x: number;
  y: number;
  /** Segment end point (segment kinds only). */
  x2?: number;
  y2?: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
}

export interface Backdrop {
  assetId: string;
  /** Natural size of the stored (downscaled) image in pixels. */
  natW: number;
  natH: number;
  /** World position of the image's top-left corner. */
  x: number;
  y: number;
  /** Calibration: centimetres per image pixel. */
  cmPerPx: number;
  opacity: number;
  calibrated: boolean;
}

export type Units = 'ft' | 'm';
export type ViewLayers = 'both' | 'image' | 'vector';

export interface PlanSettings {
  units: Units;
  snap: boolean;
  layers: ViewLayers;
  /** Show guest first names instead of initials on chairs (when zoomed in). */
  showNames: boolean;
  includePending: boolean;
  /** True while the auto-generated starter layout is untouched by the user. */
  sampleLayout?: boolean;
}

export interface PlanDoc {
  schemaVersion: 1;
  name: string;
  eventDate: string;
  guests: Record<string, Guest>;
  groups: Record<string, Group>;
  tables: Record<string, Table>;
  rules: Record<string, Rule>;
  elements: Record<string, FloorElement>;
  backdrop: Backdrop | null;
  settings: PlanSettings;
}

export type Role = 'edit' | 'view';
