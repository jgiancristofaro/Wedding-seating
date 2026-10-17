import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { PlanDoc } from '../../model/types';
import { detectConflicts, type Conflict } from '../../rules/conflicts';
import { centerOnPoint, useUi } from '../../store/uiStore';

const KIND_LABEL: Record<Conflict['kind'], string> = {
  overCapacity: 'Over capacity',
  together: 'Should sit together',
  apart: 'Must sit apart',
  partySplit: 'Household split',
  declinedSeated: 'Declined but seated',
};

export function ConflictsPanel({ doc, onClose }: { doc: PlanDoc; onClose: () => void }) {
  const report = detectConflicts(doc);
  const jump = (c: Conflict) => {
    const t = doc.tables[c.tableIds[0]];
    if (t) centerOnPoint(t.x, t.y, Math.max(useUi.getState().viewport.zoom, 0.7));
    useUi
      .getState()
      .set({ focusGuestId: c.guestIds[0] ?? null, selection: c.guestIds.length ? [] : c.tableIds });
  };
  return (
    <section
      className="slide-up flex max-h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
      aria-label="Conflicts"
      data-testid="conflicts-panel"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="font-display text-xl font-semibold">Conflicts</h2>
        <button className="icon-btn -mr-2 h-9 w-9" onClick={onClose} aria-label="Close conflicts">
          <X size={16} />
        </button>
      </header>
      {report.list.length === 0 ? (
        <p className="flex items-center gap-2 p-4 text-sm text-ok">
          <CheckCircle2 size={16} /> No conflicts. Every rule is respected.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto">
          {report.list.map((c) => (
            <li key={c.id}>
              <button
                className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-sunken"
                onClick={() => jump(c)}
                data-testid="conflict-item"
              >
                <AlertTriangle
                  size={16}
                  className={`mt-0.5 shrink-0 ${c.severity === 'error' ? 'text-danger' : 'text-warn'}`}
                  aria-hidden
                />
                <span>
                  <span
                    className={`block text-xs font-semibold uppercase tracking-wide ${c.severity === 'error' ? 'text-danger' : 'text-warn'}`}
                  >
                    {c.severity === 'error' ? 'Problem' : 'Heads-up'} · {KIND_LABEL[c.kind]}
                  </span>
                  {c.message}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
