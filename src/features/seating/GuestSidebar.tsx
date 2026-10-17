import { memo, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Link2, Lock, Search, Users } from 'lucide-react';
import { cx } from '../../components/ui';
import { NEUTRAL_SEAT } from '../../lib/colors';
import { fullName, nameKey } from '../../model/names';
import { isSeatable, planIndex } from '../../model/selectors';
import type { Guest, Group, PlanDoc, Table } from '../../model/types';
import { usePlan } from '../../store/planStore';
import { useUi, centerOnPoint } from '../../store/uiStore';
import { guestPointerDown } from '../canvas/dnd';

type Filter = 'unseated' | 'seated' | 'all';

interface Unit {
  key: string;
  members: Guest[];
}

function arm(ids: string[]) {
  const ui = useUi.getState();
  const same = ui.armed.length === ids.length && ids.every((id) => ui.armed.includes(id));
  ui.set({ armed: same ? [] : ids, focusGuestId: same ? null : ids[0] });
}

const GuestRow = memo(function GuestRow({
  g,
  group,
  table,
  armed,
  focused,
  editable,
  inParty,
}: {
  g: Guest;
  group: Group | undefined;
  table: Table | undefined;
  armed: boolean;
  focused: boolean;
  editable: boolean;
  inParty: boolean;
}) {
  const onFind = () => {
    useUi.getState().set({ focusGuestId: g.id });
    if (table) centerOnPoint(table.x, table.y);
  };
  return (
    <li className="cv-auto">
      <button
        type="button"
        data-testid="sidebar-guest"
        data-guest-id={g.id}
        aria-pressed={editable ? armed : undefined}
        aria-label={`${fullName(g)}${table ? `, seated at ${table.name}` : ', not seated'}${group ? `, ${group.name}` : ''}${g.dietary.length ? `, ${g.dietary.join(', ')}` : ''}${editable ? '. Press Enter to pick up, then choose a seat.' : ''}`}
        onPointerDown={(e) => {
          if (!editable) return;
          guestPointerDown(e, { guestIds: [g.id], label: fullName(g), withParty: false }, () => arm([g.id]));
        }}
        onClick={(e) => {
          // keyboard activation (pointer taps are handled via guestPointerDown)
          if (e.detail === 0) {
            if (editable) arm([g.id]);
            else onFind();
          } else if (!editable) onFind();
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={cx(
          'group flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors [-webkit-touch-callout:none]',
          editable && 'cursor-grab active:cursor-grabbing',
          armed ? 'bg-accent text-accent-ink' : focused ? 'bg-accent-soft' : 'hover:bg-sunken',
          inParty && 'pl-5',
        )}
      >
        {editable && (
          <GripVertical
            size={14}
            className={cx('shrink-0', armed ? 'opacity-80' : 'text-muted/50')}
            aria-hidden
          />
        )}
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-[#2a2520]"
          style={{ background: group?.color ?? NEUTRAL_SEAT }}
          aria-hidden
        >
          {(g.firstName[0] ?? '') + (g.lastName[0] ?? '')}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {fullName(g)}
          {g.rsvp === 'pending' && (
            <span className={cx('ml-1 text-xs', armed ? 'opacity-80' : 'text-muted')}>(awaiting)</span>
          )}
        </span>
        {g.locked && <Lock size={12} aria-hidden className="shrink-0 opacity-60" />}
        {g.dietary.length > 0 && (
          <span
            className={cx('chip shrink-0 px-1.5 text-[10px]', armed ? 'bg-white/20' : 'bg-sage/15 text-sage')}
            title={g.dietary.join(', ')}
          >
            {g.dietary[0].slice(0, 3)}
          </span>
        )}
        {g.access.length > 0 && (
          <span
            className={cx('chip shrink-0 px-1.5 text-[10px]', armed ? 'bg-white/20' : 'bg-ink text-surface')}
            title={g.access.join(', ')}
          >
            A
          </span>
        )}
        {table && (
          <span className={cx('shrink-0 text-xs', armed ? 'opacity-80' : 'text-muted')}>
            {table.name.replace(/^Table /, 'T')}
          </span>
        )}
      </button>
    </li>
  );
});

export function GuestSidebar({ doc, mobile }: { doc: PlanDoc; mobile: boolean }) {
  const editable = usePlan((s) => s.role === 'edit');
  const armed = useUi((s) => s.armed);
  const focusGuestId = useUi((s) => s.focusGuestId);
  const dragging = useUi((s) => s.dragging);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(editable ? 'unseated' : 'all');
  const [group, setGroup] = useState('all');
  const [diet, setDiet] = useState('all');
  const [open, setOpen] = useState(false);
  const index = planIndex(doc);
  const armedSet = useMemo(() => new Set(armed), [armed]);
  // on phones, get the sheet out of the way once a guest is picked so the seat can be tapped
  useEffect(() => {
    if (mobile && armed.length) setOpen(false);
  }, [mobile, armed]);

  const dietOptions = useMemo(
    () => [...new Set(Object.values(doc.guests).flatMap((g) => g.dietary))].sort(),
    [doc.guests],
  );

  const units: Unit[] = useMemo(() => {
    const k = q.trim().toLowerCase();
    const match = (g: Guest) =>
      (filter === 'all' || (filter === 'seated' ? !!g.tableId : !g.tableId)) &&
      (group === 'all' || g.groupId === group) &&
      (diet === 'all' || g.dietary.includes(diet)) &&
      (!k || nameKey(g).includes(k)) &&
      (filter !== 'unseated' || isSeatable(g, doc.settings.includePending));
    const out: Unit[] = [];
    const seen = new Set<string>();
    const all = Object.values(doc.guests).sort(
      (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
    );
    for (const g of all) {
      if (seen.has(g.id)) continue;
      if (g.partyId) {
        const members = (index.parties.get(g.partyId) ?? [g]).filter(match);
        members.forEach((m) => seen.add(m.id));
        if (members.length)
          out.push({
            key: g.partyId,
            members: members.sort(
              (a, b) => (a.firstName.startsWith('Guest') ? 1 : 0) - (b.firstName.startsWith('Guest') ? 1 : 0),
            ),
          });
      } else if (match(g)) {
        seen.add(g.id);
        out.push({ key: g.id, members: [g] });
      }
    }
    return out;
  }, [doc.guests, doc.settings.includePending, index.parties, q, filter, group, diet]);

  const shown = units.reduce((a, u) => a + u.members.length, 0);
  const header = (
    <div className="space-y-2 border-b border-line p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold">Guests</h2>
        <span className="text-xs text-muted" data-testid="seat-counts">
          <strong className="text-ink">{index.seatedCount}</strong> seated ·{' '}
          <strong className="text-ink">{index.unseatedCount}</strong> to seat ·{' '}
          {Object.keys(doc.guests).length} total
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div
          className="h-full rounded-full bg-sage transition-all"
          style={{
            width: `${(index.seatedCount / Math.max(1, index.seatedCount + index.unseatedCount)) * 100}%`,
          }}
        />
      </div>
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          className="input pl-9"
          placeholder={editable ? 'Search guests' : 'Find your name'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search guests"
          data-testid="sidebar-search"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['unseated', 'seated', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cx(
              'chip min-h-[32px] border px-3 text-xs capitalize',
              filter === f ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted',
            )}
          >
            {f === 'unseated' ? 'To seat' : f}
          </button>
        ))}
        <select
          className="input h-8 min-h-0 w-auto flex-1 py-0 text-xs"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          aria-label="Filter by group"
        >
          <option value="all">All groups</option>
          {Object.values(doc.groups).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {dietOptions.length > 0 && (
          <select
            className="input h-8 min-h-0 w-auto py-0 text-xs"
            value={diet}
            onChange={(e) => setDiet(e.target.value)}
            aria-label="Filter by dietary need"
          >
            <option value="all">Any diet</option>
            {dietOptions.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        )}
      </div>
      {editable && !mobile && (
        <p className="text-[11px] leading-snug text-muted">
          Drag a guest onto a seat or table — or click a guest, then click a seat.
        </p>
      )}
    </div>
  );

  const list = (
    <ul
      className={cx(
        'min-h-0 flex-1 space-y-0.5 overflow-auto p-2 scrollbar-thin',
        dragging && 'bg-accent-soft/30',
      )}
      data-drop="unseat"
      aria-label="Guest list"
    >
      {units.map((u) =>
        u.members.length > 1 ? (
          <li key={u.key} className="rounded-xl border border-line/70 bg-surface/60 p-0.5">
            <button
              type="button"
              className={cx(
                'flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-muted hover:bg-sunken',
                editable && 'cursor-grab',
                u.members.every((m) => armedSet.has(m.id)) && 'bg-accent text-accent-ink',
              )}
              aria-label={`Household of ${u.members.length}: ${u.members.map(fullName).join(', ')}. ${editable ? 'Press Enter to pick up together.' : ''}`}
              onPointerDown={(e) =>
                editable &&
                guestPointerDown(
                  e,
                  {
                    guestIds: u.members.map((m) => m.id),
                    label: `${u.members[0].lastName || fullName(u.members[0])} household`,
                    withParty: false,
                  },
                  () => arm(u.members.map((m) => m.id)),
                )
              }
              onClick={(e) => e.detail === 0 && editable && arm(u.members.map((m) => m.id))}
              onContextMenu={(e) => e.preventDefault()}
            >
              <Link2 size={13} /> Household · {u.members.length}
              {editable && <span className="ml-auto text-[10px] font-normal opacity-70">drag together</span>}
            </button>
            <ul>
              {u.members.map((g) => (
                <GuestRow
                  key={g.id}
                  g={g}
                  group={g.groupId ? doc.groups[g.groupId] : undefined}
                  table={g.tableId ? doc.tables[g.tableId] : undefined}
                  armed={armedSet.has(g.id)}
                  focused={focusGuestId === g.id}
                  editable={editable}
                  inParty
                />
              ))}
            </ul>
          </li>
        ) : (
          <GuestRow
            key={u.key}
            g={u.members[0]}
            group={u.members[0].groupId ? doc.groups[u.members[0].groupId] : undefined}
            table={u.members[0].tableId ? doc.tables[u.members[0].tableId] : undefined}
            armed={armedSet.has(u.members[0].id)}
            focused={focusGuestId === u.members[0].id}
            editable={editable}
            inParty={false}
          />
        ),
      )}
      {shown === 0 && (
        <li className="px-3 py-10 text-center text-sm text-muted">
          {filter === 'unseated' && !q ? (
            <>
              <Users className="mx-auto mb-2 text-sage" />
              Everyone has a seat. Lovely.
            </>
          ) : (
            'No guests match.'
          )}
        </li>
      )}
    </ul>
  );

  if (mobile)
    return (
      <div
        className={cx(
          'absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-line bg-surface shadow-lift transition-[height] duration-200',
          open ? 'h-[62%]' : 'h-[64px]',
          dragging && 'pointer-events-none opacity-40',
        )}
        data-testid="guest-sheet"
      >
        <button
          className="flex min-h-[56px] w-full shrink-0 items-center justify-between px-4"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="mx-auto mb-1 hidden h-1 w-10 rounded-full bg-line" />
            <Users size={16} /> Guests
            <span className="text-xs text-muted">
              {index.seatedCount} seated · {index.unseatedCount} to seat
            </span>
          </span>
          {open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
        {open && (
          <>
            {header}
            {list}
          </>
        )}
      </div>
    );

  return (
    <aside
      className="flex h-full w-[300px] shrink-0 flex-col border-r border-line bg-surface lg:w-[320px]"
      aria-label="Guest list"
    >
      {header}
      {list}
    </aside>
  );
}
