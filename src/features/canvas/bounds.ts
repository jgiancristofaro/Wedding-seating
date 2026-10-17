import type { Rect } from '../../lib/geometry';
import { tableReach } from '../../model/seats';
import type { PlanDoc } from '../../model/types';
import type { Viewport } from '../../store/uiStore';

export function contentBounds(
  doc: Pick<PlanDoc, 'tables' | 'elements' | 'backdrop'>,
  includeBackdrop = true,
): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number, r = 0) => {
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  };
  for (const t of Object.values(doc.tables)) add(t.x, t.y, tableReach(t));
  for (const e of Object.values(doc.elements)) {
    if (e.x2 != null && e.y2 != null) {
      add(e.x, e.y);
      add(e.x2, e.y2);
    } else add(e.x, e.y, Math.hypot(e.w, e.h) / 2);
  }
  if (includeBackdrop && doc.backdrop) {
    const b = doc.backdrop;
    add(b.x, b.y);
    add(b.x + b.natW * b.cmPerPx, b.y + b.natH * b.cmPerPx);
  }
  if (!isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function fitViewport(b: Rect | null, width: number, height: number, pad = 40): Viewport {
  if (!b || width <= 0 || height <= 0) return { x: width / 2, y: height / 2, zoom: 0.4 };
  const zoom = Math.max(
    0.05,
    Math.min(2, Math.min((width - pad * 2) / Math.max(b.w, 100), (height - pad * 2) / Math.max(b.h, 100))),
  );
  return { zoom, x: width / 2 - (b.x + b.w / 2) * zoom, y: height / 2 - (b.y + b.h / 2) * zoom };
}

export function zoomAt(v: Viewport, factor: number, sx: number, sy: number): Viewport {
  const zoom = Math.max(0.05, Math.min(4, v.zoom * factor));
  const k = zoom / v.zoom;
  return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
}
