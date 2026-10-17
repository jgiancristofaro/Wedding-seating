import { memo } from 'react';
import { NEUTRAL_SEAT } from '../../lib/colors';
import { dietaryAbbrev, fullName, initials } from '../../model/names';
import { CHAIR_R, seatPositions } from '../../model/seats';
import type { Group, Guest, Table } from '../../model/types';
import type { Conflict } from '../../rules/conflicts';

export interface TableNodeProps {
  table: Table;
  seats: Map<number, Guest> | undefined;
  groups: Record<string, Group>;
  conflicts: Conflict[] | undefined;
  guestConflicts: Map<string, Conflict[]>;
  selected: boolean;
  /** seat index under the dragged guest; -1 = whole table */
  dropSeat: number | null;
  highlightGuest: string | null;
  armed: boolean;
  zoom: number;
  showNames: boolean;
  dimmed: boolean;
}

function TableNodeImpl(p: TableNodeProps) {
  const { table: t, seats, zoom } = p;
  const maxSeat = seats ? Math.max(-1, ...seats.keys()) : -1;
  const count = Math.max(t.capacity, maxSeat + 1);
  const pos = seatPositions(t, count);
  const filled = seats?.size ?? 0;
  const over = filled > t.capacity || maxSeat >= t.capacity;
  const hasError = !!p.conflicts?.some((c) => c.severity === 'error');
  const lod = zoom * CHAIR_R; // chair radius in screen px
  const showInitials = lod > 6;
  const showLabels = p.showNames && zoom > 0.75;
  const rot = t.rotation;
  const rad = (rot * Math.PI) / 180;
  const label = `${t.name}, ${filled} of ${t.capacity} seats${over ? ', over capacity' : ''}${t.locked ? ', locked' : ''}`;

  const body = (() => {
    const cls = `table-body ${hasError ? 'stroke-danger' : p.selected ? 'stroke-accent' : 'stroke-line'} fill-surface`;
    const sw = p.selected || hasError ? 4 : 2;
    if (t.shape === 'round') return <circle r={t.w / 2} className={cls} strokeWidth={sw} />;
    if (t.shape === 'oval') return <ellipse rx={t.w / 2} ry={t.h / 2} className={cls} strokeWidth={sw} />;
    return (
      <rect x={-t.w / 2} y={-t.h / 2} width={t.w} height={t.h} rx={8} className={cls} strokeWidth={sw} />
    );
  })();

  return (
    <g
      transform={`translate(${t.x} ${t.y}) rotate(${rot})`}
      data-item={t.id}
      data-kind="table"
      data-drop="table"
      data-table={t.id}
      tabIndex={0}
      role="group"
      aria-label={label}
      className="table-node outline-none"
      opacity={p.dimmed ? 0.35 : 1}
    >
      {/* drop glow for the whole table */}
      {p.dropSeat === -1 && (
        <circle
          r={Math.hypot(t.w, t.h) / 2 + 70}
          className="drop-glow fill-accent/10 stroke-accent"
          strokeWidth={4}
          strokeDasharray="14 10"
        />
      )}
      <circle
        data-focus-ring
        r={Math.hypot(t.w, t.h) / 2 + 64}
        fill="none"
        className="stroke-accent"
        strokeWidth={4}
      />
      {body}
      {pos.map((s, i) => {
        const g = seats?.get(i);
        const overflow = i >= t.capacity;
        const gc = g ? p.guestConflicts.get(g.id) : undefined;
        const conflicted = !!gc?.some((c) => c.severity === 'error') || overflow;
        const color = g
          ? g.groupId && p.groups[g.groupId]
            ? p.groups[g.groupId].color
            : NEUTRAL_SEAT
          : 'none';
        const isDrop = p.dropSeat === i;
        const focus = g && p.highlightGuest === g.id;
        const ox = s.x / (Math.hypot(s.x, s.y) || 1);
        const oy = s.y / (Math.hypot(s.x, s.y) || 1);
        // world-space outward direction for label anchoring
        const wx = ox * Math.cos(rad) - oy * Math.sin(rad);
        const anchor = wx > 0.35 ? 'start' : wx < -0.35 ? 'end' : 'middle';
        const lx = s.x + ox * (CHAIR_R + 12);
        const ly = s.y + oy * (CHAIR_R + 12);
        const seatLabel = `${t.name} seat ${i + 1}: ${g ? fullName(g) : 'empty'}${conflicted ? ', has a conflict' : ''}`;
        return (
          <g
            key={i}
            transform={`translate(${s.x} ${s.y})`}
            className="seat cursor-pointer"
            data-drop="seat"
            data-table={t.id}
            data-seat={i}
            data-guest={g?.id}
            tabIndex={-1}
            role="button"
            aria-label={seatLabel}
          >
            {(isDrop || focus) && (
              <circle
                r={CHAIR_R + 9}
                className={`${isDrop ? 'drop-glow fill-accent/20' : 'fill-none'} stroke-accent`}
                strokeWidth={4}
              />
            )}
            <circle
              r={CHAIR_R}
              className={`chair ${g ? 'stroke-ink/30' : overflow ? 'stroke-danger' : 'stroke-muted/50'}`}
              fill={color}
              strokeWidth={g ? 2 : 2.5}
              strokeDasharray={g ? undefined : '5 5'}
            />
            {conflicted && <circle r={CHAIR_R + 4} fill="none" className="stroke-danger" strokeWidth={4} />}
            <g transform={`rotate(${-rot})`}>
              {g && showInitials && (
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fontSize={16}
                  fontWeight={600}
                  fill="#2a2520"
                  className="pointer-events-none select-none"
                >
                  {initials(g)}
                </text>
              )}
              {g && (g.dietary.length > 0 || g.access.length > 0) && lod > 5 && (
                <g transform={`translate(${CHAIR_R - 2} ${-CHAIR_R + 2})`} className="pointer-events-none">
                  {g.access.length > 0 && (
                    <g transform="translate(-26 0)">
                      <rect x={-10} y={-9} width={20} height={18} rx={5} className="fill-ink" />
                      <text
                        textAnchor="middle"
                        dy="0.35em"
                        fontSize={11}
                        fontWeight={700}
                        className="fill-surface"
                      >
                        A
                      </text>
                    </g>
                  )}
                  {g.dietary.length > 0 && (
                    <>
                      <rect x={-12} y={-9} width={24} height={18} rx={9} className="fill-sage" />
                      <text
                        textAnchor="middle"
                        dy="0.35em"
                        fontSize={10}
                        fontWeight={700}
                        className="fill-surface"
                      >
                        {dietaryAbbrev(g.dietary[0])}
                      </text>
                    </>
                  )}
                </g>
              )}
              {conflicted && lod > 5 && (
                <g transform={`translate(${-CHAIR_R + 2} ${-CHAIR_R + 2})`} className="pointer-events-none">
                  <circle r={10} className="fill-danger" />
                  <text textAnchor="middle" dy="0.35em" fontSize={14} fontWeight={800} fill="#fff">
                    !
                  </text>
                </g>
              )}
            </g>
            {g && showLabels && (
              <text
                transform={`translate(${lx - s.x} ${ly - s.y}) rotate(${-rot})`}
                textAnchor={anchor}
                dy="0.35em"
                fontSize={13}
                className="pointer-events-none select-none fill-ink"
                style={{ paintOrder: 'stroke', stroke: 'rgb(var(--canvas))', strokeWidth: 4 }}
              >
                {g.firstName.length > 12 ? g.firstName.slice(0, 11) + '…' : g.firstName}
              </text>
            )}
            <title>{seatLabel}</title>
          </g>
        );
      })}
      <g transform={`rotate(${-rot})`} className="pointer-events-none select-none">
        <text
          textAnchor="middle"
          y={t.shape === 'head' || t.shape === 'sweetheart' || t.shape === 'rect' ? -2 : -6}
          fontSize={t.shape === 'sweetheart' ? 15 : 20}
          fontWeight={600}
          className="fill-ink font-display"
        >
          {t.name.length > 16 ? t.name.slice(0, 15) + '…' : t.name}
        </text>
        <text
          textAnchor="middle"
          y={t.shape === 'head' || t.shape === 'sweetheart' || t.shape === 'rect' ? 18 : 20}
          fontSize={15}
          fontWeight={600}
          className={over ? 'fill-danger' : filled === t.capacity ? 'fill-ok' : 'fill-muted'}
        >
          {over ? '! ' : ''}
          {filled}/{t.capacity}
          {t.locked ? ' 🔒' : ''}
        </text>
      </g>
    </g>
  );
}

export const TableNode = memo(TableNodeImpl);
