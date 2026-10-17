import { useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  Copy,
  Lock,
  LockOpen,
  Move,
  Pencil,
  Trash2,
  UserMinus,
  X,
} from 'lucide-react';
import { GroupChip, Segmented } from '../../components/ui';
import { fromDisplay, toDisplay, unitLabel } from '../../lib/units';
import { ELEMENT_DEFAULTS, SHAPE_DEFAULTS, isSegment } from '../../model/factory';
import { fullName } from '../../model/names';
import type { PlanDoc, TableShape } from '../../model/types';
import { detectConflicts } from '../../rules/conflicts';
import {
  clearSeating,
  deleteItems,
  duplicateItems,
  moveItems,
  setLocked,
  unseatGuests,
  updateElement,
  updateTable,
} from '../../store/actions';
import { useUi } from '../../store/uiStore';
import { GuestEditor } from '../guests/GuestEditor';
import { RSVP_LABEL } from '../guests/GuestsTab';

function NumField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          className="input pr-8"
          step={step}
          min={min}
          max={max}
          value={draft ?? String(Math.round(value * 100) / 100)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft != null && draft !== '' && !isNaN(Number(draft))) {
              let v = Number(draft);
              if (min != null) v = Math.max(min, v);
              if (max != null) v = Math.min(max, v);
              onChange(v);
            }
            setDraft(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function Panel({
  title,
  children,
  onClose,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <section
      className="slide-up flex max-h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
      aria-label="Details"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="truncate font-display text-xl font-semibold">{title}</h2>
        <button className="icon-btn -mr-2 h-9 w-9" onClick={onClose} aria-label="Close details">
          <X size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">{children}</div>
    </section>
  );
}

export function Inspector({
  doc,
  editable,
  mode,
}: {
  doc: PlanDoc;
  editable: boolean;
  mode: 'seating' | 'layout';
}) {
  const selection = useUi((s) => s.selection);
  const focusGuestId = useUi((s) => s.focusGuestId);
  const [editGuest, setEditGuest] = useState<string | null>(null);
  const close = () => useUi.getState().set({ selection: [], focusGuestId: null });
  const units = doc.settings.units;

  const g = focusGuestId ? doc.guests[focusGuestId] : null;
  if (g && mode === 'seating') {
    const t = g.tableId ? doc.tables[g.tableId] : null;
    const grp = g.groupId ? doc.groups[g.groupId] : null;
    const conflicts = detectConflicts(doc).byGuest.get(g.id) ?? [];
    return (
      <Panel title={fullName(g)} onClose={close}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {grp && <GroupChip name={grp.name} color={grp.color} />}
          <span className="text-muted">{RSVP_LABEL[g.rsvp]}</span>
        </div>
        <p className="text-sm" data-testid="guest-seat-info">
          {t ? (
            <>
              Seated at <strong>{t.name}</strong>, seat {(g.seat ?? 0) + 1}
            </>
          ) : (
            <span className="text-muted">Not seated yet</span>
          )}
        </p>
        {(g.dietary.length > 0 || g.access.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {g.dietary.map((d) => (
              <span key={d} className="chip bg-sage/15 text-sage">
                {d}
              </span>
            ))}
            {g.access.map((d) => (
              <span key={d} className="chip bg-ink text-surface">
                {d}
              </span>
            ))}
          </div>
        )}
        {g.meal && (
          <p className="text-sm">
            Meal: <strong>{g.meal}</strong>
          </p>
        )}
        {g.notes && (
          <p className="whitespace-pre-line rounded-lg bg-sunken px-3 py-2 text-sm text-muted">{g.notes}</p>
        )}
        {conflicts.length > 0 && (
          <ul className="space-y-1 text-sm text-danger" role="list">
            {conflicts.map((c) => (
              <li key={c.id}>! {c.message}</li>
            ))}
          </ul>
        )}
        {editable && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => useUi.getState().set({ armed: [g.id] })}>
              <Move size={15} /> Move
            </button>
            {t && (
              <button className="btn-secondary" onClick={() => unseatGuests([g.id])}>
                <UserMinus size={15} /> Unseat
              </button>
            )}
            <button className="btn-secondary" onClick={() => setLocked([g.id], !g.locked)}>
              {g.locked ? <LockOpen size={15} /> : <Lock size={15} />} {g.locked ? 'Unlock' : 'Lock seat'}
            </button>
            <button className="btn-secondary" onClick={() => setEditGuest(g.id)}>
              <Pencil size={15} /> Edit
            </button>
          </div>
        )}
        {editGuest && <GuestEditor guestId={editGuest} onClose={() => setEditGuest(null)} />}
      </Panel>
    );
  }

  if (selection.length > 1 && editable) {
    const items = selection.map((id) => doc.tables[id] ?? doc.elements[id]).filter(Boolean);
    const align = (axis: 'x' | 'y') => {
      const avg = items.reduce((a, it) => a + it[axis], 0) / items.length;
      moveItems(
        items
          .filter((it) => !('locked' in it && it.locked) && !('x2' in it && it.x2 != null))
          .map((it) => ({ id: it.id, x: axis === 'x' ? avg : it.x, y: axis === 'y' ? avg : it.y })),
      );
    };
    return (
      <Panel title={`${items.length} selected`} onClose={close}>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={() => align('y')}>
            <AlignCenterHorizontal size={15} /> Align row
          </button>
          <button className="btn-secondary" onClick={() => align('x')}>
            <AlignCenterVertical size={15} /> Align column
          </button>
          <button className="btn-secondary" onClick={() => duplicateItems(selection)}>
            <Copy size={15} /> Duplicate
          </button>
          <button className="btn-danger" onClick={() => deleteItems(selection)}>
            <Trash2 size={15} /> Delete
          </button>
          <button className="btn-secondary col-span-2" onClick={() => setLocked(selection, true)}>
            <Lock size={15} /> Lock tables
          </button>
        </div>
        <p className="text-xs text-muted">
          Tip: drag any selected item to move them together. Shift-click to add or remove.
        </p>
      </Panel>
    );
  }

  const id = selection[0];
  const t = id ? doc.tables[id] : null;
  if (t) {
    const seated = Object.values(doc.guests)
      .filter((x) => x.tableId === t.id)
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
    return (
      <Panel title={t.name} onClose={close}>
        {editable && (
          <>
            <label className="block">
              <span className="label">Name</span>
              <input
                className="input"
                value={t.name}
                onChange={(e) => updateTable(t.id, { name: e.target.value })}
                data-testid="table-name"
              />
            </label>
            <label className="block">
              <span className="label">Shape</span>
              <select
                className="input"
                value={t.shape}
                onChange={(e) => {
                  const shape = e.target.value as TableShape;
                  const d = SHAPE_DEFAULTS[shape];
                  updateTable(t.id, { shape, w: d.w, h: d.h });
                }}
              >
                {Object.entries(SHAPE_DEFAULTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="label">Seats</span>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary h-11 w-11 px-0 text-lg"
                  onClick={() => updateTable(t.id, { capacity: Math.max(0, t.capacity - 1) })}
                  aria-label="One seat fewer"
                >
                  −
                </button>
                <span
                  className="w-10 text-center text-lg font-semibold"
                  aria-live="polite"
                  data-testid="capacity"
                >
                  {t.capacity}
                </span>
                <button
                  className="btn-secondary h-11 w-11 px-0 text-lg"
                  onClick={() => updateTable(t.id, { capacity: Math.min(40, t.capacity + 1) })}
                  aria-label="One more seat"
                >
                  +
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label={t.shape === 'round' ? 'Diameter' : 'Length'}
                value={toDisplay(t.w, units)}
                step={0.5}
                min={1}
                suffix={unitLabel(units)}
                onChange={(v) =>
                  updateTable(
                    t.id,
                    t.shape === 'round' || t.shape === 'square'
                      ? { w: fromDisplay(v, units), h: fromDisplay(v, units) }
                      : { w: fromDisplay(v, units) },
                  )
                }
              />
              {t.shape !== 'round' && t.shape !== 'square' && (
                <NumField
                  label="Width"
                  value={toDisplay(t.h, units)}
                  step={0.5}
                  min={1}
                  suffix={unitLabel(units)}
                  onChange={(v) => updateTable(t.id, { h: fromDisplay(v, units) })}
                />
              )}
              <NumField
                label="Rotation"
                value={t.rotation}
                step={15}
                suffix="°"
                onChange={(v) => updateTable(t.id, { rotation: ((v % 360) + 360) % 360 })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary" onClick={() => duplicateItems([t.id])}>
                <Copy size={15} /> Duplicate
              </button>
              <button className="btn-secondary" onClick={() => setLocked([t.id], !t.locked)}>
                {t.locked ? <LockOpen size={15} /> : <Lock size={15} />} {t.locked ? 'Unlock' : 'Lock'}
              </button>
              {seated.length > 0 && (
                <button className="btn-secondary" onClick={() => clearSeating([t.id])}>
                  <UserMinus size={15} /> Clear seats
                </button>
              )}
              <button className="btn-danger" onClick={() => deleteItems([t.id])}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
            {t.locked && (
              <p className="text-xs text-muted">
                Locked tables can’t be moved and auto-seat won’t change who sits here.
              </p>
            )}
          </>
        )}
        <div>
          <span className="label">
            Seated here ({seated.length}/{t.capacity})
          </span>
          {seated.length === 0 ? (
            <p className="text-sm text-muted">Empty — drag guests onto the chairs.</p>
          ) : (
            <ol className="space-y-0.5 text-sm">
              {seated.map((x) => (
                <li key={x.id} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs text-muted">{(x.seat ?? 0) + 1}</span>
                  <button
                    className="truncate hover:underline"
                    onClick={() => useUi.getState().set({ focusGuestId: x.id, selection: [] })}
                  >
                    {fullName(x)}
                  </button>
                  {x.dietary.length > 0 && (
                    <span className="chip bg-sage/15 text-[10px] text-sage">{x.dietary.join(', ')}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </Panel>
    );
  }

  const el = id ? doc.elements[id] : null;
  if (el && editable && mode === 'layout') {
    return (
      <Panel title={ELEMENT_DEFAULTS[el.kind].label} onClose={close}>
        {!isSegment(el.kind) && (
          <>
            <label className="block">
              <span className="label">Label</span>
              <input
                className="input"
                value={el.label ?? ELEMENT_DEFAULTS[el.kind].label}
                onChange={(e) => updateElement(el.id, { label: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label="Width"
                value={toDisplay(el.w, units)}
                step={0.5}
                min={0.5}
                suffix={unitLabel(units)}
                onChange={(v) => updateElement(el.id, { w: fromDisplay(v, units) })}
              />
              <NumField
                label="Depth"
                value={toDisplay(el.h, units)}
                step={0.5}
                min={0.5}
                suffix={unitLabel(units)}
                onChange={(v) => updateElement(el.id, { h: fromDisplay(v, units) })}
              />
              <NumField
                label="Rotation"
                value={el.rotation}
                step={15}
                suffix="°"
                onChange={(v) => updateElement(el.id, { rotation: ((v % 360) + 360) % 360 })}
              />
            </div>
          </>
        )}
        {isSegment(el.kind) && (
          <>
            <p className="text-sm text-muted">
              Length {toDisplay(Math.hypot((el.x2 ?? el.x) - el.x, (el.y2 ?? el.y) - el.y), units).toFixed(1)}{' '}
              {unitLabel(units)}. Drag the round handles to adjust; hold Alt to turn off snapping.
            </p>
            <Segmented
              label="Segment type"
              size="sm"
              value={el.kind}
              onChange={(k) => updateElement(el.id, { kind: k, w: ELEMENT_DEFAULTS[k].w })}
              options={[
                { value: 'wall', label: 'Wall' },
                { value: 'door', label: 'Door' },
                { value: 'window', label: 'Window' },
              ]}
            />
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={() => duplicateItems([el.id])}>
            <Copy size={15} /> Duplicate
          </button>
          <button className="btn-danger" onClick={() => deleteItems([el.id])}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </Panel>
    );
  }
  return null;
}
