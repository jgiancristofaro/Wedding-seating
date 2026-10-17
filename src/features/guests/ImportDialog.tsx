import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { cx, Dialog, Segmented } from '../../components/ui';
import { parseDelimited, readFileText, type ParsedTable } from '../../import/csv';
import {
  applyImport,
  buildCandidates,
  reviewCandidates,
  type ConflictChoice,
  type ReviewRow,
} from '../../import/importPlan';
import {
  autoMap,
  detectZola,
  FIELDS,
  mappingProblems,
  type FieldKey,
  type Mapping,
} from '../../import/mapping';
import { fullName } from '../../model/names';
import { commit, getDoc } from '../../store/planStore';
import { toast } from '../../store/toastStore';
import { downloadSampleCsv } from './GuestsTab';

type Step = 'source' | 'map' | 'review';
const MAX_FILE = 5 * 1024 * 1024;

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('source');
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<Mapping>([]);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [choices, setChoices] = useState<Record<number, ConflictChoice>>({});
  const [defaultChoice, setDefaultChoice] = useState<ConflictChoice>('incoming');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('source');
    setTable(null);
    setPaste('');
    setError(null);
    setChoices({});
  };
  const close = () => {
    reset();
    onClose();
  };

  const load = (text: string) => {
    const t = parseDelimited(text);
    if (t.rows.length === 0) {
      setError(
        'We couldn’t find any rows. Make sure the file is a CSV (in Excel: File → Save As → CSV UTF-8).',
      );
      return;
    }
    if (t.rows.length > 2000) {
      setError(`That’s ${t.rows.length} rows — the limit is 2,000 guests per import.`);
      return;
    }
    setError(null);
    setTable(t);
    setMapping(autoMap(t.headers, t.rows));
    setStep('map');
  };

  const onFile = async (f: File) => {
    if (/\.(xlsx|xls|numbers|ods)$/i.test(f.name)) {
      setError(
        'Spreadsheet files can’t be read directly. Export as CSV, or copy the cells and paste them below.',
      );
      return;
    }
    if (f.size > MAX_FILE) {
      setError('That file is larger than 5 MB. Is it really a guest list?');
      return;
    }
    try {
      load(await readFileText(f));
    } catch {
      setError('That file couldn’t be read. Try exporting it again as CSV.');
    }
  };

  const problems = useMemo(() => mappingProblems(mapping), [mapping]);
  const isZola = useMemo(() => (table ? detectZola(table.headers) : false), [table]);
  const review: ReviewRow[] = useMemo(() => {
    if (step !== 'review' || !table) return [];
    return reviewCandidates(buildCandidates(table.rows, mapping), getDoc());
  }, [step, table, mapping]);
  const stats = useMemo(() => {
    const s = { new: 0, update: 0, same: 0, duplicate: 0, invalid: 0 };
    for (const r of review) s[r.status]++;
    return s;
  }, [review]);
  const preview = useMemo(
    () => (table ? buildCandidates(table.rows.slice(0, 6), mapping) : []),
    [table, mapping],
  );

  const doImport = () => {
    const sum = commit('Import guests', (d) =>
      applyImport(d, review, (r) => choices[r.c.row] ?? defaultChoice),
    );
    if (sum)
      toast.success(
        `Imported ${sum.added} new guest${sum.added === 1 ? '' : 's'}${sum.updated ? `, updated ${sum.updated}` : ''}.`,
      );
    close();
  };

  const footer =
    step === 'map' ? (
      <>
        <button className="btn-ghost mr-auto" onClick={() => setStep('source')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button
          className="btn-primary"
          disabled={problems.length > 0}
          onClick={() => setStep('review')}
          data-testid="import-next"
        >
          Review {table?.rows.length} rows
        </button>
      </>
    ) : step === 'review' ? (
      <>
        <button className="btn-ghost mr-auto" onClick={() => setStep('map')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button
          className="btn-primary"
          disabled={stats.new + stats.update === 0 && stats.same === 0}
          onClick={doImport}
          data-testid="import-confirm"
        >
          <Check size={16} /> Import {stats.new} new{stats.update ? ` · update ${stats.update}` : ''}
        </button>
      </>
    ) : undefined;

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      testId="import-dialog"
      title={
        step === 'source'
          ? 'Import guests'
          : step === 'map'
            ? 'Match your columns'
            : 'Review before importing'
      }
      description={
        step === 'source'
          ? 'CSV or tab-separated, any column order. Existing guests are merged by name, never wiped.'
          : step === 'map'
            ? 'We guessed what each column means — fix anything that looks off.'
            : 'Nothing is changed until you press Import.'
      }
      footer={footer}
    >
      {step === 'source' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) void onFile(f);
            }}
            className={cx(
              'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              drag ? 'border-accent bg-accent-soft' : 'border-line bg-sunken/50',
            )}
          >
            <FileSpreadsheet size={32} className="text-accent" />
            <p className="mt-3 font-medium">Drop a CSV file here</p>
            <p className="text-sm text-muted">or</p>
            <button className="btn-primary mt-2" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Choose a file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="hidden"
              data-testid="import-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1.5" htmlFor="paste-area">
              <ClipboardPaste size={12} /> Or paste rows from a spreadsheet
            </label>
            <textarea
              id="paste-area"
              className="input min-h-[110px] py-2 font-mono text-xs"
              placeholder={'Name\tGroup\tDietary\nJane Smith\tFamily\tVegetarian'}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                onClick={downloadSampleCsv}
              >
                <Download size={14} /> Sample template
              </button>
              <button className="btn-secondary" disabled={!paste.trim()} onClick={() => load(paste)}>
                Use pasted rows
              </button>
            </div>
          </div>
          {error && (
            <p
              className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
              role="alert"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}
        </div>
      )}

      {step === 'map' && table && (
        <div className="space-y-4">
          {isZola && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm" role="note" data-testid="zola-note">
              <strong>Zola guest list recognised.</strong> Partners, plus-ones, additional guests and children
              on each row are added as one household that sits together. “Guest” placeholders become unnamed
              plus-ones; contact details aren’t imported.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-1 pr-3">Your column</th>
                  <th className="py-1 pr-3">Examples</th>
                  <th className="py-1">Means</th>
                </tr>
              </thead>
              <tbody>
                {table.headers.map((h, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-2 pr-3 font-medium">{h}</td>
                    <td className="max-w-[14rem] truncate py-2 pr-3 text-muted">
                      {table.rows
                        .slice(0, 3)
                        .map((r) => r[i])
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="py-2">
                      <select
                        className={cx('input h-9 min-h-0', mapping[i] === 'ignore' && 'text-muted')}
                        value={mapping[i]}
                        aria-label={`Field for column ${h}`}
                        onChange={(e) =>
                          setMapping((m) => m.map((x, j) => (j === i ? (e.target.value as FieldKey) : x)))
                        }
                      >
                        {FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      {FIELDS.find((f) => f.key === mapping[i])?.help && (
                        <div className="mt-0.5 text-[11px] text-muted">
                          {FIELDS.find((f) => f.key === mapping[i])?.help}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {problems.length > 0 && (
            <ul className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {problems.length === 0 && (
            <div>
              <div className="label">Preview</div>
              <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                {preview.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                    <span className={cx('font-medium', !c.firstName && !c.lastName && 'text-danger')}>
                      {fullName(c)}
                    </span>
                    {c.generated && (
                      <span className="chip bg-sunken text-muted">
                        {c.isChild ? 'child' : c.firstName.startsWith('Guest') ? 'plus-one' : 'household'}
                      </span>
                    )}
                    {c.group && <span className="chip bg-accent-soft text-accent">{c.group}</span>}
                    {c.rsvp && <span className="text-xs text-muted">{c.rsvp}</span>}
                    {c.dietary.map((d) => (
                      <span key={d} className="chip bg-sage/15 text-sage">
                        {d}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4" data-testid="import-review">
          <div className="flex flex-wrap gap-2 text-sm">
            <Stat n={stats.new} label="new" tone="ok" />
            <Stat n={stats.update} label="changed" tone="warn" />
            <Stat n={stats.same} label="already in list" />
            <Stat n={stats.duplicate} label="duplicates skipped" />
            <Stat n={stats.invalid} label="rows without a name" tone={stats.invalid ? 'danger' : undefined} />
          </div>
          {stats.update > 0 && (
            <div className="rounded-xl border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  These guests are already in your list with different details
                </div>
                <Segmented
                  label="Default for conflicts"
                  size="sm"
                  value={defaultChoice}
                  onChange={(v) => {
                    setDefaultChoice(v);
                    setChoices({});
                  }}
                  options={[
                    { value: 'incoming', label: 'Use imported' },
                    { value: 'existing', label: 'Keep current' },
                  ]}
                />
              </div>
              <ul className="max-h-56 space-y-2 overflow-auto text-sm">
                {review
                  .filter((r) => r.status === 'update')
                  .map((r, i) => {
                    const ch = choices[r.c.row] ?? defaultChoice;
                    return (
                      <li key={`${r.c.row}-${i}`} className="rounded-lg bg-sunken/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{fullName(r.c)}</span>
                          <Segmented
                            label={`Conflict choice for ${fullName(r.c)}`}
                            size="sm"
                            value={ch}
                            onChange={(v) => setChoices((c) => ({ ...c, [r.c.row]: v }))}
                            options={[
                              { value: 'incoming', label: 'Imported' },
                              { value: 'existing', label: 'Current' },
                            ]}
                          />
                        </div>
                        {r.diffs.map((d) => (
                          <div key={d.field} className="mt-1 text-xs text-muted">
                            <span className="capitalize">{d.field}</span>: <s>{d.existing || '—'}</s> →{' '}
                            <strong className="text-ink">{d.incoming}</strong>
                          </div>
                        ))}
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
          {review.some((r) => r.status === 'invalid' || r.status === 'duplicate') && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Rows that will be skipped</summary>
              <ul className="mt-2 space-y-1">
                {review
                  .filter((r) => r.status === 'invalid' || r.status === 'duplicate')
                  .map((r, i) => (
                    <li key={`${r.c.row}-${i}`} className="text-muted">
                      Row {r.c.row}: {fullName(r.c)} — {r.message}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {review.some((r) => r.status === 'new' && r.message) && (
            <ul className="space-y-1 rounded-lg bg-sunken/60 px-3 py-2 text-sm" data-testid="import-notes">
              {review
                .filter((r) => r.status === 'new' && r.message)
                .map((r, i) => (
                  <li key={`${r.c.row}-${i}`}>
                    Row {r.c.row}: <strong>{fullName(r.c)}</strong> — {r.message}
                  </li>
                ))}
            </ul>
          )}
          <p className="text-xs text-muted">
            Households and plus-ones are linked so they move together on the seating chart.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <span
      className={cx(
        'chip px-3 py-1 text-sm',
        tone === 'ok' && 'bg-ok/10 text-ok',
        tone === 'warn' && 'bg-warn/10 text-warn',
        tone === 'danger' && 'bg-danger-soft text-danger',
        !tone && 'bg-sunken text-muted',
      )}
    >
      <strong>{n}</strong> {label}
    </span>
  );
}
