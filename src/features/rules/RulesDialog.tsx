import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, Segmented } from '../../components/ui';
import { fullName } from '../../model/names';
import type { RuleKind, RuleScope } from '../../model/types';
import { addRule, deleteRule } from '../../store/actions';
import { usePlan } from '../../store/planStore';
import { detectConflicts } from '../../rules/conflicts';
import { GuestPicker } from './GuestPicker';

export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = usePlan((s) => s.doc!);
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [kind, setKind] = useState<RuleKind>('apart');
  const [scope, setScope] = useState<RuleScope>('table');
  const rules = Object.values(doc.rules);
  const report = detectConflicts(doc);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Seating rules"
      description="Tell the planner who must — or must not — sit together. Broken rules show in red."
      testId="rules-dialog"
    >
      <div className="rounded-xl border border-line bg-sunken/50 p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <GuestPicker
            value={a}
            onChange={setA}
            exclude={b ? [b] : []}
            placeholder="First guest…"
            label="First guest"
          />
          <div className="flex items-center justify-center">
            <Segmented
              label="Rule type"
              size="sm"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'together', label: 'sits with' },
                { value: 'apart', label: 'not with' },
              ]}
            />
          </div>
          <GuestPicker
            value={b}
            onChange={setB}
            exclude={a ? [a] : []}
            placeholder="Second guest…"
            label="Second guest"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented
            label="Rule scope"
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'table', label: 'Same table', title: 'Applies to sitting at the same table' },
              {
                value: 'nearby',
                label: 'Nearby tables',
                title:
                  kind === 'apart'
                    ? 'Not at the same or a neighbouring table'
                    : 'Same or a neighbouring table is fine',
              },
            ]}
          />
          <button
            className="btn-primary"
            disabled={!a || !b}
            data-testid="add-rule"
            onClick={() => {
              if (a && b) addRule({ a, b, kind, scope });
              setA(null);
              setB(null);
            }}
          >
            <Plus size={16} /> Add rule
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          No rules yet. Add the ones that matter — exes, feuding relatives, inseparable friends.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {rules.map((r) => {
            const broken = report.list.some((c) => c.id === `rule:${r.id}`);
            const ga = doc.guests[r.a];
            const gb = doc.guests[r.b];
            return (
              <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                <span
                  className={`chip ${r.kind === 'together' ? 'bg-sage/15 text-sage' : 'bg-danger-soft text-danger'}`}
                >
                  {r.kind === 'together' ? 'Together' : 'Apart'}
                </span>
                <span className="min-w-0 flex-1">
                  <strong>{ga ? fullName(ga) : '?'}</strong> {r.kind === 'together' ? 'with' : 'not with'}{' '}
                  <strong>{gb ? fullName(gb) : '?'}</strong>
                  <span className="text-muted"> · {r.scope === 'table' ? 'same table' : 'nearby'}</span>
                  {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                </span>
                {broken && <span className="chip bg-danger text-white">! Broken</span>}
                <button
                  className="icon-btn h-9 w-9 text-muted hover:text-danger"
                  onClick={() => deleteRule(r.id)}
                  aria-label="Delete rule"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
