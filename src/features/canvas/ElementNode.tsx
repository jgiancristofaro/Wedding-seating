import { memo } from 'react';
import { ELEMENT_DEFAULTS, isSegment } from '../../model/factory';
import type { FloorElement } from '../../model/types';

const BOX_STYLE: Partial<Record<FloorElement['kind'], string>> = {
  stage: 'fill-sunken stroke-muted',
  danceFloor: 'fill-[url(#dance)] stroke-muted',
  bar: 'fill-accent-soft stroke-accent',
  buffet: 'fill-accent-soft stroke-accent',
  dj: 'fill-sunken stroke-muted',
  photoBooth: 'fill-sunken stroke-muted',
  entrance: 'fill-sage/15 stroke-sage',
  cake: 'fill-accent-soft stroke-accent',
  gifts: 'fill-accent-soft stroke-accent',
  label: 'fill-transparent stroke-transparent',
};

function ElementNodeImpl({
  e,
  selected,
  interactive,
}: {
  e: FloorElement;
  selected: boolean;
  interactive: boolean;
}) {
  const common = {
    'data-item': interactive ? e.id : undefined,
    'data-kind': 'element',
    className: interactive ? 'cursor-move' : 'pointer-events-none',
  };
  if (isSegment(e.kind)) {
    const x2 = e.x2 ?? e.x;
    const y2 = e.y2 ?? e.y;
    const len = Math.hypot(x2 - e.x, y2 - e.y);
    const ang = (Math.atan2(y2 - e.y, x2 - e.x) * 180) / Math.PI;
    return (
      <g {...common} aria-label={ELEMENT_DEFAULTS[e.kind].label}>
        {/* fat invisible hit area */}
        <line x1={e.x} y1={e.y} x2={x2} y2={y2} stroke="transparent" strokeWidth={Math.max(30, e.w + 20)} />
        {e.kind === 'wall' && (
          <line
            x1={e.x}
            y1={e.y}
            x2={x2}
            y2={y2}
            className={selected ? 'stroke-accent' : 'stroke-ink/80'}
            strokeWidth={e.w}
            strokeLinecap="square"
          />
        )}
        {e.kind === 'window' && (
          <g transform={`translate(${e.x} ${e.y}) rotate(${ang})`}>
            <rect
              x={0}
              y={-e.w / 2}
              width={len}
              height={e.w}
              className={`fill-surface ${selected ? 'stroke-accent' : 'stroke-ink/70'}`}
              strokeWidth={2}
            />
            <line x1={0} y1={0} x2={len} y2={0} className="stroke-ink/50" strokeWidth={2} />
          </g>
        )}
        {e.kind === 'door' && (
          <g transform={`translate(${e.x} ${e.y}) rotate(${ang})`}>
            <rect x={0} y={-e.w / 2 - 1} width={len} height={e.w + 2} className="fill-canvas" />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={-len}
              className={selected ? 'stroke-accent' : 'stroke-ink/70'}
              strokeWidth={3}
            />
            <path
              d={`M ${len} 0 A ${len} ${len} 0 0 0 0 ${-len}`}
              fill="none"
              className="stroke-ink/40"
              strokeWidth={2}
              strokeDasharray="6 5"
            />
          </g>
        )}
      </g>
    );
  }
  const label = e.label ?? ELEMENT_DEFAULTS[e.kind].label;
  const round = e.kind === 'cake';
  return (
    <g {...common} transform={`translate(${e.x} ${e.y}) rotate(${e.rotation})`} aria-label={label}>
      {round ? (
        <ellipse
          rx={e.w / 2}
          ry={e.h / 2}
          className={`${BOX_STYLE[e.kind]} ${selected ? '!stroke-accent' : ''}`}
          strokeWidth={selected ? 4 : 2}
        />
      ) : (
        <rect
          x={-e.w / 2}
          y={-e.h / 2}
          width={e.w}
          height={e.h}
          rx={e.kind === 'label' ? 4 : 10}
          className={`${BOX_STYLE[e.kind] ?? 'fill-sunken stroke-muted'} ${selected ? '!stroke-accent' : ''}`}
          strokeWidth={selected ? 4 : 2}
          strokeDasharray={
            e.kind === 'label' && selected ? '8 6' : e.kind === 'entrance' ? '10 6' : undefined
          }
        />
      )}
      <text
        textAnchor="middle"
        dy="0.35em"
        fontSize={Math.max(14, Math.min(30, Math.min(e.w, e.h) / 3.2))}
        transform={e.h > e.w * 1.6 ? 'rotate(-90)' : undefined}
        className="pointer-events-none select-none fill-muted font-medium uppercase"
        letterSpacing={2}
      >
        {label}
      </text>
    </g>
  );
}

export const ElementNode = memo(ElementNodeImpl);
