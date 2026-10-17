import { useRef, useState } from 'react';
import { create } from 'zustand';
import { Check, Sparkles, X } from 'lucide-react';
import { Dialog, Segmented, Spinner, Switch } from '../../components/ui';
import type { OptimizerResult } from '../../optimizer/optimizer';
import { runOptimizer } from '../../optimizer/runOptimizer';
import { applyAssignments, updateGroup } from '../../store/actions';
import { usePlan } from '../../store/planStore';
import { toast } from '../../store/toastStore';
import { useUi } from '../../store/uiStore';

const useResult = create<{ result: OptimizerResult | null; set: (r: OptimizerResult | null) => void }>(
  (set) => ({
    result: null,
    set: (result) => set({ result }),
  }),
);

export function AutoSeatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = usePlan((s) => s.doc!);
  const anySeated = Object.values(doc.guests).some((g) => g.tableId && !g.locked);
  const [mode, setMode] = useState<'fill' | 'all'>(anySeated ? 'fill' : 'all');
  const [groupWeight, setGroupWeight] = useState(1);
  const [balanceWeight, setBalanceWeight] = useState(1);
  const [includePending, setIncludePending] = useState(doc.settings.includePending);
  const [progress, setProgress] = useState<number | null>(null);
  const cancelRef = useRef<() => void>(() => {});

  const run = async () => {
    if (!Object.keys(doc.tables).length) {
      toast.warn('Add some tables first (Layout step).');
      return;
    }
    setProgress(0);
    const { promise, cancel } = runOptimizer(
      doc,
      {
        mode,
        includePending,
        groupWeight,
        balanceWeight,
        mixGroups: Object.values(doc.groups)
          .filter((g) => g.mix)
          .map((g) => g.id),
        seed: Math.floor(Math.random() * 1e9),
      },
      setProgress,
    );
    cancelRef.current = cancel;
    try {
      const res = await promise;
      useResult.getState().set(res);
      useUi.getState().set({ preview: res.assignments, selection: [], focusGuestId: null, armed: [] });
      onClose();
    } catch (e) {
      toast.error(`Auto-seat failed: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        cancelRef.current();
        setProgress(null);
        onClose();
      }}
      title="Auto-seat"
      description="We’ll suggest an arrangement. You can preview it before anything changes."
      testId="autoseat-dialog"
      footer={
        progress == null ? (
          <button className="btn-primary" onClick={run} data-testid="autoseat-run">
            <Sparkles size={16} /> Suggest seating
          </button>
        ) : (
          <button className="btn-secondary" onClick={() => (cancelRef.current(), setProgress(null))}>
            Cancel
          </button>
        )
      }
    >
      {progress != null ? (
        <div className="py-6" role="status" aria-live="polite">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <Spinner /> Trying thousands of arrangements…
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <div>
            <span className="label">Who to seat</span>
            <Segmented
              label="Who to seat"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'fill', label: 'Only unseated guests' },
                { value: 'all', label: 'Rearrange everyone' },
              ]}
            />
            <p className="mt-1 text-xs text-muted">Locked guests and locked tables are never changed.</p>
          </div>
          <Switch
            label="Include guests who haven’t replied yet"
            checked={includePending}
            onChange={setIncludePending}
          />
          <label className="block">
            <span className="label">Keep groups together</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.25}
              value={groupWeight}
              onChange={(e) => setGroupWeight(Number(e.target.value))}
              className="w-full accent-[rgb(var(--accent))]"
            />
          </label>
          <label className="block">
            <span className="label">Balance table sizes</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.25}
              value={balanceWeight}
              onChange={(e) => setBalanceWeight(Number(e.target.value))}
              className="w-full accent-[rgb(var(--accent))]"
            />
          </label>
          {Object.keys(doc.groups).length > 0 && (
            <div>
              <span className="label">Groups to mix rather than cluster</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.values(doc.groups).map((g) => (
                  <button
                    key={g.id}
                    aria-pressed={!!g.mix}
                    onClick={() => updateGroup(g.id, { mix: !g.mix || undefined })}
                    className={`chip min-h-[32px] border px-3 ${g.mix ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted'}`}
                  >
                    {g.mix ? '✓ ' : ''}
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted">
            Must / must-not rules are treated as hard constraints; households always sit together when a table
            has room.
          </p>
        </div>
      )}
    </Dialog>
  );
}

export function PreviewBanner() {
  const preview = useUi((s) => s.preview);
  const result = useResult((s) => s.result);
  if (!preview || !result) return null;
  const discard = () => useUi.getState().set({ preview: null });
  const accept = () => {
    applyAssignments(preview);
    useUi.getState().set({ preview: null });
    toast.success(`Seating applied — ${result.stats.placed} guests placed. Undo is available.`);
  };
  return (
    <div
      className="slide-up pointer-events-auto mx-auto w-full max-w-2xl rounded-2xl border border-accent/40 bg-surface p-4 shadow-lift"
      role="region"
      aria-label="Auto-seat preview"
      data-testid="preview-banner"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-accent-soft text-accent">
          <span className="text-xl font-bold leading-none" data-testid="preview-score">
            {result.score}
          </span>
          <span className="text-[10px] uppercase">score</span>
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">Suggested seating (preview)</div>
          <div className="text-muted">
            {result.stats.placed} placed · {result.stats.rulesTotal - result.stats.rulesBroken}/
            {result.stats.rulesTotal} rules kept · groups together {Math.round(result.breakdown.groups * 100)}
            %
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={discard} data-testid="preview-discard">
            <X size={16} /> Discard
          </button>
          <button className="btn-primary" onClick={accept} data-testid="preview-accept">
            <Check size={16} /> Use this
          </button>
        </div>
      </div>
      {result.issues.length > 0 && (
        <details className="mt-3 text-sm" open={result.issues.length <= 3}>
          <summary className="cursor-pointer text-warn">
            What couldn’t be satisfied ({result.issues.length})
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            {result.issues.slice(0, 12).map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
