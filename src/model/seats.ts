import type { Table } from './types';

export interface SeatPos {
  x: number;
  y: number;
  /** angle in degrees pointing from the chair towards the table */
  angle: number;
}

export const CHAIR_R = 23; // chair radius in cm
const GAP = 30; // chair centre distance from table edge

/** Seat positions in table-local coordinates (before rotation), clockwise from the top-left. */
export function seatPositions(t: Pick<Table, 'shape' | 'w' | 'h'>, count: number): SeatPos[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  switch (t.shape) {
    case 'round':
    case 'oval': {
      const a = t.w / 2 + GAP;
      const b = (t.shape === 'round' ? t.w : t.h) / 2 + GAP;
      return Array.from({ length: n }, (_, i) => {
        const th = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = a * Math.cos(th);
        const y = b * Math.sin(th);
        return { x, y, angle: (Math.atan2(-y, -x) * 180) / Math.PI };
      });
    }
    case 'head':
    case 'sweetheart':
      return along(-t.w / 2, t.w / 2, -t.h / 2 - GAP, n, 90);
    case 'square': {
      const counts = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) counts[i % 4]++;
      return [
        ...along(-t.w / 2, t.w / 2, -t.h / 2 - GAP, counts[0], 90),
        ...alongY(-t.h / 2, t.h / 2, t.w / 2 + GAP, counts[1], 180),
        ...along(t.w / 2, -t.w / 2, t.h / 2 + GAP, counts[2], -90),
        ...alongY(t.h / 2, -t.h / 2, -t.w / 2 - GAP, counts[3], 0),
      ];
    }
    case 'rect':
    default: {
      const perSide = Math.max(1, Math.floor(t.w / 55));
      let ends = 0;
      if (n > perSide * 2) ends = Math.min(2, n - perSide * 2);
      const sides = n - ends;
      const top = Math.ceil(sides / 2);
      const bottom = sides - top;
      const out = [...along(-t.w / 2, t.w / 2, -t.h / 2 - GAP, top, 90)];
      if (ends >= 1) out.push({ x: t.w / 2 + GAP, y: 0, angle: 180 });
      out.push(...along(t.w / 2, -t.w / 2, t.h / 2 + GAP, bottom, -90));
      if (ends >= 2) out.push({ x: -t.w / 2 - GAP, y: 0, angle: 0 });
      return out;
    }
  }
}

function along(x0: number, x1: number, y: number, n: number, angle: number): SeatPos[] {
  return Array.from({ length: n }, (_, i) => ({ x: x0 + ((i + 0.5) * (x1 - x0)) / n, y, angle }));
}
function alongY(y0: number, y1: number, x: number, n: number, angle: number): SeatPos[] {
  return Array.from({ length: n }, (_, i) => ({ x, y: y0 + ((i + 0.5) * (y1 - y0)) / n, angle }));
}

/** Rough radius of the table including chairs — used for "nearby" checks and fit-to-view. */
export function tableReach(t: Pick<Table, 'w' | 'h'>): number {
  return Math.hypot(t.w, t.h) / 2 + GAP + CHAIR_R;
}

/** Seats i and j are neighbours at the table (wrap-around for round/oval). */
export function seatsAdjacent(t: Pick<Table, 'shape'>, cap: number, i: number, j: number): boolean {
  const d = Math.abs(i - j);
  if (d === 1) return true;
  return (t.shape === 'round' || t.shape === 'oval') && d === cap - 1;
}
