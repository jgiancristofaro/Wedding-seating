import { useCallback, useState } from 'react';
import { Dialog, Switch } from '../../components/ui';
import { dist, type Pt } from '../../lib/geometry';
import { fromDisplay, unitLabel } from '../../lib/units';
import type { Units } from '../../model/types';
import { commit, usePlan } from '../../store/planStore';
import { toast } from '../../store/toastStore';
import { useUi } from '../../store/uiStore';

type Phase = 'idle' | 'p1' | 'p2' | 'enter';

export function useCalibration() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [p1, setP1] = useState<Pt | null>(null);
  const [p2, setP2] = useState<Pt | null>(null);
  const start = useCallback(() => {
    setP1(null);
    setP2(null);
    setPhase('p1');
    useUi.getState().set({ tool: 'calibrate', selection: [] });
  }, []);
  const cancel = useCallback(() => {
    setPhase('idle');
    setP1(null);
    setP2(null);
    useUi.getState().set({ tool: 'select' });
  }, []);
  const click = useCallback(
    (p: Pt) => {
      if (phase === 'p1') {
        setP1(p);
        setPhase('p2');
      } else if (phase === 'p2') {
        setP2(p);
        setPhase('enter');
        useUi.getState().set({ tool: 'select' });
      }
    },
    [phase],
  );
  return { phase, p1, p2, start, cancel, click };
}

export type CalibrationState = ReturnType<typeof useCalibration>;

export function CalibrationOverlay({ state }: { state: CalibrationState }) {
  const z = useUi((s) => s.viewport.zoom);
  if (state.phase === 'idle' || !state.p1) return null;
  const r = 7 / z;
  return (
    <g className="pointer-events-none">
      {state.p2 && (
        <line
          x1={state.p1.x}
          y1={state.p1.y}
          x2={state.p2.x}
          y2={state.p2.y}
          className="stroke-accent"
          strokeWidth={3 / z}
          strokeDasharray={`${8 / z} ${5 / z}`}
        />
      )}
      <circle
        cx={state.p1.x}
        cy={state.p1.y}
        r={r}
        className="fill-accent stroke-surface"
        strokeWidth={2 / z}
      />
      {state.p2 && (
        <circle
          cx={state.p2.x}
          cy={state.p2.y}
          r={r}
          className="fill-accent stroke-surface"
          strokeWidth={2 / z}
        />
      )}
    </g>
  );
}

export function CalibrationDialog({ state }: { state: CalibrationState }) {
  const units = usePlan((s) => s.doc!.settings.units);
  const hasLayout = usePlan(
    (s) => Object.keys(s.doc!.elements).length + Object.keys(s.doc!.tables).length > 0,
  );
  const [value, setValue] = useState('');
  const [u, setU] = useState<Units>(units);
  const [moveLayout, setMoveLayout] = useState(hasLayout);
  if (!state.p1 || !state.p2) return null;
  const measured = dist(state.p1, state.p2);
  const apply = () => {
    const v = Number(value);
    if (!(v > 0) || measured < 1) {
      toast.warn('Enter a length greater than zero.');
      return;
    }
    const real = fromDisplay(v, u);
    const f = real / measured;
    const o = state.p1!;
    commit('Set scale', (d) => {
      if (d.backdrop) {
        d.backdrop.cmPerPx *= f;
        d.backdrop.x = o.x + (d.backdrop.x - o.x) * f;
        d.backdrop.y = o.y + (d.backdrop.y - o.y) * f;
        d.backdrop.calibrated = true;
      }
      if (moveLayout) {
        for (const e of Object.values(d.elements)) {
          e.x = o.x + (e.x - o.x) * f;
          e.y = o.y + (e.y - o.y) * f;
          if (e.x2 != null && e.y2 != null) {
            e.x2 = o.x + (e.x2 - o.x) * f;
            e.y2 = o.y + (e.y2 - o.y) * f;
          }
        }
        for (const t of Object.values(d.tables)) {
          t.x = o.x + (t.x - o.x) * f;
          t.y = o.y + (t.y - o.y) * f;
        }
      }
    });
    toast.success('Scale set. Tables are now shown at real size.');
    state.cancel();
  };
  return (
    <Dialog
      open
      onClose={state.cancel}
      size="sm"
      title="How long is that?"
      description="Enter the real distance between the two points you clicked."
      footer={
        <>
          <button className="btn-ghost" onClick={state.cancel}>
            Cancel
          </button>
          <button className="btn-primary" onClick={apply} data-testid="calibrate-apply">
            Set scale
          </button>
        </>
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          className="input"
          placeholder="e.g. 40"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Real distance"
          data-testid="calibrate-input"
        />
        <select
          className="input w-28"
          value={u}
          onChange={(e) => setU(e.target.value as Units)}
          aria-label="Unit"
        >
          <option value="ft">{unitLabel('ft')}</option>
          <option value="m">{unitLabel('m')}</option>
        </select>
      </form>
      {hasLayout && (
        <div className="mt-3">
          <Switch
            label="Keep walls and tables lined up with the image"
            checked={moveLayout}
            onChange={setMoveLayout}
          />
          <p className="text-xs text-muted">Positions are rescaled; table sizes stay real.</p>
        </div>
      )}
    </Dialog>
  );
}
