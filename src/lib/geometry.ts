export interface Pt {
  x: number;
  y: number;
}

export function rotate(p: Pt, deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export const snapTo = (v: number, step: number) => Math.round(v / step) * step;

/** Snap a segment end so its angle is a multiple of `stepDeg` from the start. */
export function snapAngle(start: Pt, end: Pt, stepDeg = 15): Pt {
  const len = dist(start, end);
  const ang = Math.atan2(end.y - start.y, end.x - start.x);
  const step = (stepDeg * Math.PI) / 180;
  const a = Math.round(ang / step) * step;
  return { x: start.x + Math.cos(a) * len, y: start.y + Math.sin(a) * len };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsIntersect(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function normRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}
