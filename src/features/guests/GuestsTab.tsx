import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Download,
  Link2,
  Lock,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Scale,
} from 'lucide-react';
import { cx, EmptyState, GroupChip } from '../../components/ui';
import { downloadBlob } from '../../lib/util';
import { SAMPLE_CSV } from '../../import/importPlan';
import { fullName, nameKey } from '../../model/names';
import type { Guest, Rsvp } from '../../model/types';
import { addGuest, linkHousehold, removeGuests, updateGuest, updateGuests } from '../../store/actions';
import { usePlan } from '../../store/planStore';
import { useUi } from '../../store/uiStore';
import { ImportDialog } from './ImportDialog';
import { GuestEditor } from './GuestEditor';
import { GroupsDialog } from './GroupsDialog';
import { RulesDialog } from '../rules/RulesDialog';
import { splitName } from '../../model/names';

export const RSVP_LABEL: Record<Rsvp, string> = {
  attending: 'Attending',
  pending: 'Awaiting reply',
  declined: 'Declined',
};

export function downloadSampleCsv() {
  downloadBlob(
    new Blob(['\uFEFF' + SAMPLE_CSV], { type: 'text/csv;charset=utf-8' }),
    'guest-list-template.csv',
  );
}

export function GuestsTab() {
  const doc = usePlan((s) => s.doc!);
  const [importOpen, setImportOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [rsvp, setRsvp] = useState<'all' | Rsvp>('all');
  const [group, setGroup] = useState<string>('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [quick, setQuick] = useState('');

  const guests = useMemo(() => Object.values(doc.guests), [doc.guests]);
  const groups = useMemo(
    () => Object.values(doc.groups).sort((a, b) => a.name.localeCompare(b.name)),
    [doc.groups],
  );
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    const isPlus = (g: Guest) => (g.firstName.startsWith('Guest') ? 1 : 0);
    // households stay adjacent, ordered by their host's surname
    const hostKey = new Map<string, string>();
    for (const g of guests) {
      if (!g.partyId) continue;
      const cur = hostKey.get(g.partyId);
      const key = (isPlus(g) ? '~' : '') + g.lastName + g.firstName;
      if (!cur || key < cur) hostKey.set(g.partyId, key);
    }
    const sortKey = (g: Guest) =>
      g.partyId ? hostKey.get(g.partyId)!.replace(/^~/, '') + '\u0000' + g.partyId : g.lastName + g.firstName;
    return guests
      .filter(
        (g) =>
          (rsvp === 'all' || g.rsvp === rsvp) &&
          (group === 'all' || (group === 'none' ? !g.groupId : g.groupId === group)),
      )
      .filter((g) => !k || nameKey(g).includes(k) || g.notes.toLowerCase().includes(k))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || isPlus(a) - isPlus(b));
  }, [guests, q, rsvp, group]);

  const counts = useMemo(
    () => ({
      attending: guests.filter((g) => g.rsvp === 'attending').length,
      pending: guests.filter((g) => g.rsvp === 'pending').length,
      declined: guests.filter((g) => g.rsvp === 'declined').length,
    }),
    [guests],
  );

  const selected = [...sel].filter((id) => doc.guests[id]);
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const quickAdd = () => {
    const name = quick.trim();
    if (!name) return;
    addGuest(splitName(name));
    setQuick('');
  };

  const dialogs = (
    <>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <GroupsDialog open={groupsOpen} onClose={() => setGroupsOpen(false)} />
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      {editing && doc.guests[editing] && <GuestEditor guestId={editing} onClose={() => setEditing(null)} />}
    </>
  );

  if (guests.length === 0)
    return (
      <div className="h-full overflow-auto">
        <EmptyState
          icon={<Users size={26} />}
          title="Add your guest list"
          actions={
            <>
              <button
                className="btn-primary h-12 px-5 text-base"
                onClick={() => setImportOpen(true)}
                data-testid="import-open"
              >
                <Upload size={18} /> Import guests
              </button>
              <button
                className="btn-secondary h-12 px-5"
                onClick={() => setEditing(addGuest({ firstName: '' }))}
              >
                <UserPlus size={18} /> Add one by one
              </button>
            </>
          }
        >
          Drop in a CSV from your spreadsheet or RSVP site, or paste rows straight from Excel or Google
          Sheets. We’ll match the columns for you.
          <div className="mt-4">
            <button
              className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline"
              onClick={downloadSampleCsv}
            >
              <Download size={14} /> Download a sample template
            </button>
          </div>
        </EmptyState>
        {dialogs}
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-surface px-3 py-3 sm:px-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h1 className="font-display text-3xl font-semibold leading-none">Guests</h1>
            <p className="mt-1 text-xs text-muted" data-testid="guest-counts">
              {guests.length} total · {counts.attending} attending · {counts.pending} awaiting ·{' '}
              {counts.declined} declined
            </p>
          </div>
          <button className="btn-secondary" onClick={() => setImportOpen(true)} data-testid="import-open">
            <Upload size={16} /> Import
          </button>
          <button className="btn-secondary" onClick={() => setGroupsOpen(true)}>
            <Tags size={16} /> Groups
          </button>
          <button className="btn-secondary" onClick={() => setRulesOpen(true)} data-testid="rules-open">
            <Scale size={16} /> Seating rules{' '}
            <span className="text-muted">{Object.keys(doc.rules).length}</span>
          </button>
          <button
            className="btn-primary"
            onClick={() =>
              useUi.getState().set({ tab: Object.keys(doc.tables).length ? 'seating' : 'layout' })
            }
          >
            Next: {Object.keys(doc.tables).length ? 'seat guests' : 'lay out tables'} <ArrowRight size={16} />
          </button>
        </div>
        <div className="mx-auto mt-3 flex max-w-6xl flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              className="input pl-9"
              placeholder="Search guests"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search guests"
            />
          </div>
          <select
            className="input w-auto"
            value={rsvp}
            onChange={(e) => setRsvp(e.target.value as typeof rsvp)}
            aria-label="Filter by RSVP"
          >
            <option value="all">All RSVPs</option>
            <option value="attending">Attending</option>
            <option value="pending">Awaiting reply</option>
            <option value="declined">Declined</option>
          </select>
          <select
            className="input w-auto"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            aria-label="Filter by group"
          >
            <option value="all">All groups</option>
            <option value="none">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              quickAdd();
            }}
          >
            <input
              className="input w-44"
              placeholder="Quick add: full name"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              aria-label="New guest name"
              data-testid="quick-add"
            />
            <button className="btn-secondary" type="submit" aria-label="Add guest">
              <Plus size={16} />
            </button>
          </form>
        </div>
      </div>

      {selected.length > 0 && (
        <div
          className="slide-up border-b border-line bg-accent-soft px-3 py-2 sm:px-5"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 text-sm">
            <strong>{selected.length} selected</strong>
            <select
              className="input h-9 min-h-0 w-auto"
              value=""
              aria-label="Set group for selected"
              onChange={(e) =>
                e.target.value &&
                updateGuests(selected, { groupId: e.target.value === 'none' ? null : e.target.value })
              }
            >
              <option value="">Set group…</option>
              <option value="none">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select
              className="input h-9 min-h-0 w-auto"
              value=""
              aria-label="Set RSVP for selected"
              onChange={(e) => e.target.value && updateGuests(selected, { rsvp: e.target.value as Rsvp })}
            >
              <option value="">Set RSVP…</option>
              <option value="attending">Attending</option>
              <option value="pending">Awaiting reply</option>
              <option value="declined">Declined</option>
            </select>
            {selected.length > 1 && (
              <button className="btn-secondary h-9 min-h-0" onClick={() => linkHousehold(selected)}>
                <Link2 size={14} /> Link as household
              </button>
            )}
            <button
              className="btn-danger h-9 min-h-0"
              onClick={() => (removeGuests(selected), setSel(new Set()))}
            >
              <Trash2 size={14} /> Delete
            </button>
            <button className="btn-ghost h-9 min-h-0" onClick={() => setSel(new Set())}>
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <table
          className="mx-auto w-full max-w-6xl border-separate border-spacing-0 text-sm"
          data-testid="guest-table"
        >
          <thead className="sticky top-0 z-10 bg-bg text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-10 border-b border-line px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  checked={filtered.length > 0 && filtered.every((g) => sel.has(g.id))}
                  onChange={(e) => setSel(e.target.checked ? new Set(filtered.map((g) => g.id)) : new Set())}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
              </th>
              <th className="border-b border-line px-2 py-2">Name</th>
              <th className="hidden border-b border-line px-2 py-2 md:table-cell">Group</th>
              <th className="border-b border-line px-2 py-2">RSVP</th>
              <th className="hidden border-b border-line px-2 py-2 lg:table-cell">Needs</th>
              <th className="hidden border-b border-line px-2 py-2 sm:table-cell">Table</th>
              <th className="w-24 border-b border-line px-2 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g, i) => {
              const prev = filtered[i - 1];
              const inParty = !!g.partyId && prev?.partyId === g.partyId;
              const grp = g.groupId ? doc.groups[g.groupId] : null;
              const table = g.tableId ? doc.tables[g.tableId] : null;
              return (
                <tr
                  key={g.id}
                  className={cx('cv-auto group hover:bg-sunken/60', sel.has(g.id) && 'bg-accent-soft/60')}
                  data-testid="guest-row"
                >
                  <td className="border-b border-line/60 px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={sel.has(g.id)}
                      onChange={() => toggle(g.id)}
                      aria-label={`Select ${fullName(g)}`}
                      className="h-4 w-4 accent-[rgb(var(--accent))]"
                    />
                  </td>
                  <td className="border-b border-line/60 px-2 py-1.5">
                    <button
                      className="flex min-h-[36px] items-center gap-2 text-left"
                      onClick={() => setEditing(g.id)}
                    >
                      {inParty && (
                        <span
                          className="ml-1 h-5 w-3 rounded-bl-md border-b-2 border-l-2 border-line"
                          aria-hidden
                        />
                      )}
                      <span className={cx('font-medium', g.rsvp === 'declined' && 'text-muted line-through')}>
                        {fullName(g)}
                      </span>
                      {g.partyId && !inParty && (
                        <span className="chip bg-sunken text-muted" title="Household — moves together">
                          <Link2 size={11} /> household
                        </span>
                      )}
                      {g.isChild && <span className="chip bg-sunken text-muted">child</span>}
                      {g.locked && <Lock size={12} className="text-muted" aria-label="Locked" />}
                    </button>
                  </td>
                  <td className="hidden border-b border-line/60 px-2 py-1.5 md:table-cell">
                    {grp ? (
                      <GroupChip name={grp.name} color={grp.color} />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="border-b border-line/60 px-2 py-1.5">
                    <select
                      className="h-8 rounded-md border border-transparent bg-transparent px-1 text-sm hover:border-line"
                      value={g.rsvp}
                      onChange={(e) => updateGuest(g.id, { rsvp: e.target.value as Rsvp })}
                      aria-label={`RSVP for ${fullName(g)}`}
                    >
                      <option value="attending">Attending</option>
                      <option value="pending">Awaiting</option>
                      <option value="declined">Declined</option>
                    </select>
                  </td>
                  <td className="hidden border-b border-line/60 px-2 py-1.5 lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {g.dietary.map((d) => (
                        <span key={d} className="chip bg-sage/15 text-sage">
                          {d}
                        </span>
                      ))}
                      {g.access.map((d) => (
                        <span key={d} className="chip bg-accent-soft text-accent">
                          {d}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="hidden border-b border-line/60 px-2 py-1.5 text-muted sm:table-cell">
                    {table ? `${table.name} · seat ${(g.seat ?? 0) + 1}` : '—'}
                  </td>
                  <td className="whitespace-nowrap border-b border-line/60 px-1 py-1.5 text-right">
                    <button
                      className="icon-btn h-9 w-9"
                      onClick={() => setEditing(g.id)}
                      aria-label={`Edit ${fullName(g)}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-btn h-9 w-9 text-muted hover:text-danger"
                      onClick={() => removeGuests([g.id])}
                      aria-label={`Delete ${fullName(g)}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">No guests match your filters.</p>
        )}
      </div>
      {dialogs}
    </div>
  );
}
