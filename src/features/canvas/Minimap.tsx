import { memo, useRef } from 'react';
import type { PlanDoc } from '../../model/types';
import { useUi } from '../../store/uiStore';
import { contentBounds } from './bounds';

const W = 150;
const H = 100;

function MinimapImpl({ doc, size }: { doc: PlanDoc; size: { w: number; h: number } }) {
  const vp = useUi((s) => s.viewport);
  const ref = useRef<SVGSVGElement>(null);
  const b = contentBounds(doc);
  if (!b || size.w < 500) return null;
  const pad = 200;
  const bx = b.x - pad;
  const by = b.y - pad;
  const bw = b.w + pad * 2;
  const bh = b.h + pad * 2;
  const s = Math.min(W / bw, H / bh);
  const view = { x: -vp.x / vp.zoom, y: -vp.y / vp.zoom, w: size.w / vp.zoom, h: size.h / vp.zoom };
  const go = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const wx = (e.clientX - r.left - (W - bw * s) / 2) / s + bx;
    const wy = (e.clientY - r.top - (H - bh * s) / 2) / s + by;
    const z = useUi.getState().viewport.zoom;
    useUi.getState().set({ viewport: { zoom: z, x: size.w / 2 - wx * z, y: size.h / 2 - wy * z } });
  };
  return (
    <svg
      ref={ref}
      width={W}
      height={H}
      className="pointer-events-auto hidden cursor-pointer rounded-xl border border-line bg-surface/95 shadow-soft md:block"
      aria-label="Minimap: click to move the view"
      role="img"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        go(e);
      }}
      onPointerMove={(e) => e.buttons && go(e)}
    >
      <g
        transform={`translate(${(W - bw * s) / 2} ${(H - bh * s) / 2}) scale(${s}) translate(${-bx} ${-by})`}
      >
        {Object.values(doc.elements).map((e) =>
          e.x2 != null ? (
            <line
              key={e.id}
              x1={e.x}
              y1={e.y}
              x2={e.x2}
              y2={e.y2}
              className="stroke-muted"
              strokeWidth={e.kind === 'wall' ? 30 : 15}
            />
          ) : (
            <rect
              key={e.id}
              x={e.x - e.w / 2}
              y={e.y - e.h / 2}
              width={e.w}
              height={e.h}
              className="fill-sunken"
            />
          ),
        )}
        {Object.values(doc.tables).map((t) => (
          <circle key={t.id} cx={t.x} cy={t.y} r={Math.max(t.w, t.h) / 2 + 40} className="fill-accent/60" />
        ))}
        <rect
          x={view.x}
          y={view.y}
          width={view.w}
          height={view.h}
          fill="none"
          className="stroke-ink"
          strokeWidth={2 / s}
        />
      </g>
    </svg>
  );
}

export const Minimap = memo(MinimapImpl);
