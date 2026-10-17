import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, MailCheck, Upload } from 'lucide-react';
import { cx, Dialog, Switch } from '../../components/ui';
import { parseDelimited, readFileText, type ParsedTable } from '../../import/csv';
import {
  applyRsvp,
  defaultEvent,
  planRsvp,
  readPeople,
  rsvpChanges,
  rsvpColumns,
  type RsvpOptions,
} from '../../import/rsvp';
import { fullName } from '../../model/names';
import type { Rsvp } from '../../model/types';
import { commit, usePlan } from '../../store/planStore';
import { toast } from '../../store/toastStore';
import { RSVP_LABEL } from './GuestsTab';

const TONE: Record<Rsvp, string> = {
  attending: 'bg-ok/10 text-ok',
  declined: 'bg-danger-soft text-danger',
  pending: 'bg-sunken text-muted',
};

function prepare(t: ParsedTable): { table: ParsedTable | null; event: number; error: string | null } {
  const cols = rsvpColumns(t);
  if (!cols)
    return {
      table: null,
      event: -1,
      error:
        'This doesn’t look like an RSVP export — we need name columns and at least one event column with “Attending” / “Declined” answers. To add guests, use Import instead.',
    };
  return { table: t, event: defaultEvent(cols), error: null };
}

export function RsvpDialog({
  open,
  onClose,
  initialTable,
}: {
  open: boolean;
  onClose: () => void;
  initialTable?: ParsedTable | null;
}) {
  const doc = usePlan((s) => s.doc!);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [event, setEvent] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [o, setO] = useState<RsvpOptions>({
    meals: true,
    dietNotes: true,
    renamePlusOnes: true,
    unseatDeclined: true,
    addUnmatched: false,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (t: ParsedTable) => {
    const r = prepare(t);
    setError(r.error);
    setTable(r.table);
    setEvent(r.event);
  };

  useEffect(() => {
    const r = open && initialTable ? prepare(initialTable) : { table: null, event: -1, error: null };
    setTable(r.table);
    setEvent(r.event);
    setError(r.error);
  }, [open, initialTable]);

  const onFile = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) return setError('That file is larger than 5 MB.');
    try {
      load(parseDelimited(await readFileText(f)));
    } catch {
      setError('That file couldn’t be read. Try exporting it again as CSV.');
    }
  };

  const cols = useMemo(() => (table ? rsvpColumns(table) : null), [table]);
  const plan = useMemo(
    () => (table && cols && event >= 0 ? planRsvp(doc, readPeople(table, cols, event)) : null),
    [table, cols, event, doc],
  );
  const changes = useMemo(() => (plan ? rsvpChanges(doc, plan) : []), [plan, doc]);
  const tally = useMemo(() => {
    const t: Record<Rsvp, number> = { attending: 0, declined: 0, pending: 0 };
    for (const c of changes) t[c.to]++;
    return t;
  }, [changes]);
  const seatedDecliners = changes.filter((c) => c.to === 'declined' && doc.guests[c.guestId]?.tableId);
  const named = plan?.matches.filter((m) => m.kind === 'namedPlusOne') ?? [];
  const unmatchedPeople = plan?.unmatched.filter((p) => !p.placeholder) ?? [];
  const meals =
    plan?.matches.filter((m) => m.person.meal && doc.guests[m.guestId]?.meal !== m.person.meal).length ?? 0;

  const apply = () => {
    if (!plan) return;
    const sum = commit('Update RSVPs', (d) => applyRsvp(d, plan, o));
    if (sum) {
      const parts = [`${sum.updated} guest${sum.updated === 1 ? '' : 's'} updated`];
      if (sum.unseated) parts.push(`${sum.unseated} seat${sum.unseated === 1 ? '' : 's'} freed`);
      if (sum.renamed) parts.push(`${sum.renamed} plus-one${sum.renamed === 1 ? '' : 's'} named`);
      if (sum.added) parts.push(`${sum.added} added`);
      toast.success(`RSVPs updated: ${parts.join(', ')}. Undo is available.`);
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      testId="rsvp-dialog"
      title="Update RSVPs"
      description={
        table
          ? 'Review what will change. Nothing is saved until you press Update.'
          : 'Upload the RSVP export from Zola (or any CSV with a column per event). Guests are matched by name.'
      }
      footer={
        table ? (
          <>
            <button className="btn-ghost mr-auto" onClick={() => setTable(null)}>
              <ArrowLeft size={16} /> Choose another file
            </button>
            <button className="btn-primary" onClick={apply} data-testid="rsvp-apply">
              <Check size={16} /> Update {changes.length} RSVP{changes.length === 1 ? '' : 's'}
            </button>
          </>
        ) : undefined
      }
    >
      {!table && (
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
            <MailCheck size={32} className="text-accent" />
            <p className="mt-3 font-medium">Drop your RSVP CSV here</p>
            <p className="text-sm text-muted">In Zola: Guest List → RSVPs → Export</p>
            <button className="btn-primary mt-3" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Choose a file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="hidden"
              data-testid="rsvp-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
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

      {table && cols && plan && (
        <div className="space-y-5 text-sm" data-testid="rsvp-review">
          <label className="block">
            <span className="label">Use the answers for</span>
            <select
              className="input w-auto"
              value={event}
              onChange={(e) => setEvent(Number(e.target.value))}
              aria-label="Event to use for RSVPs"
              data-testid="rsvp-event"
            >
              {cols.events.map((e) => (
                <option key={e.index} value={e.index}>
                  {e.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">
              Pick the event you’re seating (usually the reception). Guests who declined it won’t need a seat;
              guests who haven’t replied still do.
            </span>
          </label>

          <div className="flex flex-wrap gap-2" data-testid="rsvp-summary">
            <span className="chip bg-ok/10 px-3 py-1 text-sm text-ok">
              <strong>{tally.attending}</strong> → attending
            </span>
            <span className="chip bg-danger-soft px-3 py-1 text-sm text-danger">
              <strong>{tally.declined}</strong> → declined
            </span>
            <span className="chip bg-sunken px-3 py-1 text-sm text-muted">
              <strong>{tally.pending}</strong> → awaiting reply
            </span>
            <span className="chip bg-sunken px-3 py-1 text-sm text-muted">
              <strong>{plan.matches.length - changes.length}</strong> already up to date
            </span>
          </div>

          {changes.length > 0 && (
            <details className="rounded-xl border border-line p-3" open={changes.length <= 12}>
              <summary className="cursor-pointer font-semibold">Changes ({changes.length})</summary>
              <ul className="mt-2 max-h-52 space-y-1 overflow-auto">
                {changes.map((c) => (
                  <li key={c.guestId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className={cx('chip', TONE[c.from])}>{RSVP_LABEL[c.from]}</span>→
                    <span className={cx('chip', TONE[c.to])}>{RSVP_LABEL[c.to]}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="grid gap-1 rounded-xl border border-line p-3">
            {seatedDecliners.length > 0 && (
              <Switch
                label={`Free the seats of ${seatedDecliners.length} guest${seatedDecliners.length === 1 ? '' : 's'} who declined`}
                checked={o.unseatDeclined}
                onChange={(v) => setO({ ...o, unseatDeclined: v })}
              />
            )}
            {meals > 0 && (
              <Switch
                label={`Save meal choices (${meals})`}
                checked={o.meals}
                onChange={(v) => setO({ ...o, meals: v })}
              />
            )}
            {cols.diet >= 0 && (
              <Switch
                label="Add dietary answers to guest notes"
                checked={o.dietNotes}
                onChange={(v) => setO({ ...o, dietNotes: v })}
              />
            )}
            {named.length > 0 && (
              <div>
                <Switch
                  label={`Name ${named.length} plus-one${named.length === 1 ? '' : 's'} from the RSVPs`}
                  checked={o.renamePlusOnes}
                  onChange={(v) => setO({ ...o, renamePlusOnes: v })}
                />
                <ul className="mb-1 ml-1 text-xs text-muted">
                  {named.map((m) => (
                    <li key={m.guestId}>
                      “{fullName(doc.guests[m.guestId])}” → {fullName(m.person)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {unmatchedPeople.length > 0 && (
              <div>
                <Switch
                  label={`Add ${unmatchedPeople.length} ${unmatchedPeople.length === 1 ? 'person' : 'people'} who aren’t on your guest list`}
                  checked={o.addUnmatched}
                  onChange={(v) => setO({ ...o, addUnmatched: v })}
                />
                <p className="mb-1 ml-1 text-xs text-muted" data-testid="rsvp-unmatched">
                  Not found: {unmatchedPeople.map(fullName).join(', ')}. If a name is spelled differently, fix
                  it on the Guests page and upload the RSVPs again.
                </p>
              </div>
            )}
          </div>

          {plan.missing.length > 0 && (
            <details>
              <summary className="cursor-pointer text-muted">
                {plan.missing.length} guest{plan.missing.length === 1 ? '' : 's'} on your list aren’t in this
                file — they’ll be left as they are
              </summary>
              <p className="mt-1 text-xs text-muted">
                {plan.missing.map((id) => fullName(doc.guests[id])).join(', ')}
              </p>
            </details>
          )}
        </div>
      )}
    </Dialog>
  );
}
