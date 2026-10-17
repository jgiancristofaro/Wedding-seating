import { useState } from 'react';
import { AlertTriangle, LayoutGrid, Plus, Scale, Sparkles, Upload, X } from 'lucide-react';
import { cx } from '../../components/ui';
import { useIsMobile } from '../../lib/useMedia';
import { fullName } from '../../model/names';
import { detectConflicts } from '../../rules/conflicts';
import { addTable, clearSampleLayout, updateSettings } from '../../store/actions';
import { usePlan } from '../../store/planStore';
import { useUi } from '../../store/uiStore';
import { Canvas } from '../canvas/Canvas';
import { RulesDialog } from '../rules/RulesDialog';
import { AutoSeatDialog, PreviewBanner } from './AutoSeat';
import { ConflictsPanel } from './ConflictsPanel';
import { GuestSidebar } from './GuestSidebar';
import { Inspector } from './Inspector';
import { useDisplayDoc } from './usePreviewDoc';

export function ArmedBanner() {
  const armed = useUi((s) => s.armed);
  const guests = usePlan((s) => s.doc!.guests);
  if (!armed.length) return null;
  const first = guests[armed[0]];
  return (
    <div
      className="slide-up pointer-events-auto mx-auto flex items-center gap-3 rounded-full bg-ink px-4 py-2 text-sm text-surface shadow-lift"
      role="status"
      data-testid="armed-banner"
    >
      <span>
        Tap a seat or table for <strong>{first ? fullName(first) : 'guest'}</strong>
        {armed.length > 1 ? ` + ${armed.length - 1}` : ''}
      </span>
      <button
        className="rounded-full p-1 hover:bg-white/15"
        onClick={() => useUi.getState().set({ armed: [] })}
        aria-label="Cancel"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function SampleLayoutHint() {
  const sample = usePlan((s) => s.doc!.settings.sampleLayout);
  const editable = usePlan((s) => s.role === 'edit');
  if (!sample || !editable) return null;
  return (
    <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-line bg-surface/95 p-3 text-sm shadow-soft">
      <LayoutGrid size={18} className="mt-0.5 shrink-0 text-accent" />
      <div>
        <strong>This is a sample room</strong> so you can try things out. Edit it, or start from scratch.
        <div className="mt-2 flex gap-2">
          <button
            className="btn-secondary h-8 min-h-0"
            onClick={() => updateSettings({ sampleLayout: false })}
          >
            Keep it
          </button>
          <button className="btn-ghost h-8 min-h-0 text-danger" onClick={clearSampleLayout}>
            Clear layout
          </button>
        </div>
      </div>
    </div>
  );
}

export function SeatingTab() {
  const doc = useDisplayDoc();
  const editable = usePlan((s) => s.role === 'edit');
  const mobile = useIsMobile();
  const preview = useUi((s) => s.preview);
  const conflictsOpen = useUi((s) => s.conflictsOpen);
  const selection = useUi((s) => s.selection);
  const focusGuestId = useUi((s) => s.focusGuestId);
  const [autoOpen, setAutoOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const report = detectConflicts(doc);
  const noTables = Object.keys(doc.tables).length === 0;
  const noGuests = Object.keys(doc.guests).length === 0;
  const canEdit = editable && !preview;
  const armedCount = useUi((s) => s.armed.length);
  // on phones the card would cover the seats you need to tap while a guest is picked up
  const showInspector = (selection.length > 0 || !!focusGuestId) && !(mobile && armedCount > 0);

  return (
    <div className="flex h-full">
      {!mobile && <GuestSidebar doc={doc} mobile={false} />}
      <div className="relative min-w-0 flex-1">
        <Canvas mode="seating" doc={doc} readOnly={!canEdit} />

        {/* top toolbar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-start gap-2">
            {canEdit && (
              <div className="pointer-events-auto flex flex-wrap gap-2">
                <button
                  className="btn-primary shadow-soft"
                  onClick={() => setAutoOpen(true)}
                  disabled={noTables || noGuests}
                  data-testid="autoseat-open"
                >
                  <Sparkles size={16} /> Auto-seat
                </button>
                <button className="btn-secondary shadow-soft" onClick={() => setRulesOpen(true)}>
                  <Scale size={16} /> <span className="hidden sm:inline">Rules</span>
                </button>
                <button
                  className="btn-secondary shadow-soft"
                  onClick={() => {
                    const v = useUi.getState().viewport;
                    const el = document.querySelector('[data-testid="canvas"]') as HTMLElement | null;
                    addTable(
                      'round',
                      ((el?.clientWidth ?? 800) / 2 - v.x) / v.zoom,
                      ((el?.clientHeight ?? 600) / 2 - v.y) / v.zoom,
                    );
                  }}
                >
                  <Plus size={16} /> <span className="hidden sm:inline">Table</span>
                </button>
              </div>
            )}
            <button
              className={cx(
                'pointer-events-auto btn shadow-soft',
                report.errors
                  ? 'bg-danger text-white hover:brightness-110'
                  : report.warnings
                    ? 'border border-warn/40 bg-surface text-warn'
                    : 'border border-line bg-surface text-ok',
              )}
              onClick={() => useUi.getState().set({ conflictsOpen: !conflictsOpen })}
              aria-expanded={conflictsOpen}
              data-testid="conflicts-btn"
            >
              <AlertTriangle size={16} />
              {report.errors + report.warnings === 0
                ? 'No conflicts'
                : `${report.errors + report.warnings} conflict${report.errors + report.warnings === 1 ? '' : 's'}`}
            </button>
          </div>
          <ArmedBanner />
          {!preview && <SampleLayoutHint />}
          {(noTables || noGuests) && editable && (
            <div className="pointer-events-auto max-w-sm rounded-2xl border border-line bg-surface p-4 text-sm shadow-soft">
              {noGuests ? (
                <>
                  <strong className="font-display text-lg">Add your guests first</strong>
                  <p className="mt-1 text-muted">
                    Import a list or add people by hand, then come back to seat them.
                  </p>
                  <button
                    className="btn-primary mt-3"
                    onClick={() => useUi.getState().set({ tab: 'guests' })}
                  >
                    <Upload size={16} /> Go to guests
                  </button>
                </>
              ) : (
                <>
                  <strong className="font-display text-lg">No tables yet</strong>
                  <p className="mt-1 text-muted">
                    Add tables in the Layout step, or drop one in with the + Table button.
                  </p>
                  <button
                    className="btn-primary mt-3"
                    onClick={() => useUi.getState().set({ tab: 'layout' })}
                  >
                    <LayoutGrid size={16} /> Go to layout
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* right panels */}
        {(conflictsOpen || showInspector) && (
          <div
            className={cx(
              'pointer-events-none absolute flex flex-col gap-3',
              mobile ? 'inset-x-2 bottom-20 top-auto max-h-[55%]' : 'bottom-3 right-3 top-16 w-80',
            )}
          >
            {conflictsOpen && (
              <div className="pointer-events-auto min-h-0 shrink">
                <ConflictsPanel doc={doc} onClose={() => useUi.getState().set({ conflictsOpen: false })} />
              </div>
            )}
            {showInspector && (
              <div className="pointer-events-auto min-h-0 shrink">
                <Inspector doc={doc} editable={canEdit} mode="seating" />
              </div>
            )}
          </div>
        )}

        {preview && (
          <div
            className={cx('pointer-events-none absolute inset-x-0 px-3', mobile ? 'bottom-20' : 'bottom-16')}
          >
            <PreviewBanner />
          </div>
        )}
        {mobile && <GuestSidebar doc={doc} mobile />}
      </div>
      <AutoSeatDialog open={autoOpen} onClose={() => setAutoOpen(false)} />
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
