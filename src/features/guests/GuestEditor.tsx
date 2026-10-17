import { useState } from 'react';
import { Link2, Lock, Plus, Trash2, Unlink, UserPlus, X } from 'lucide-react';
import { Dialog, Switch } from '../../components/ui';
import { fullName } from '../../model/names';
import type { Rsvp } from '../../model/types';
import {
  addGroup,
  addPlusOne,
  addRule,
  deleteRule,
  linkHousehold,
  removeGuests,
  unlinkHousehold,
  unseatGuests,
  updateGuest,
} from '../../store/actions';
import { usePlan } from '../../store/planStore';
import { GuestPicker } from '../rules/GuestPicker';

const DIETARY = [
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Gluten-free',
  'Dairy-free',
  'Nut allergy',
  'Shellfish allergy',
  'Kosher',
  'Halal',
  'Kids meal',
];
const ACCESS = ['Wheelchair', 'Limited mobility', 'Hearing', 'Vision', 'High chair'];

function TagEditor({
  values,
  options,
  onChange,
  label,
}: {
  values: string[];
  options: string[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  const [custom, setCustom] = useState('');
  const all = [...new Set([...options, ...values])];
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {all.map((o) => {
          const on = values.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? values.filter((v) => v !== o) : [...values, o])}
              className={`chip min-h-[32px] border px-3 text-sm ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}
            >
              {on && '✓ '}
              {o}
            </button>
          );
        })}
        <form
          className="inline-flex"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) onChange([...values, custom.trim()]);
            setCustom('');
          }}
        >
          <input
            className="input h-8 min-h-0 w-28 text-xs"
            placeholder="Other…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label={`Add ${label}`}
          />
        </form>
      </div>
    </fieldset>
  );
}

export function GuestEditor({ guestId, onClose }: { guestId: string; onClose: () => void }) {
  const doc = usePlan((s) => s.doc!);
  const g = doc.guests[guestId];
  const [ruleWith, setRuleWith] = useState<string | null>(null);
  const [ruleKind, setRuleKind] = useState<'together' | 'apart'>('apart');
  const [newGroup, setNewGroup] = useState('');
  const [linkTo, setLinkTo] = useState<string | null>(null);
  if (!g) return null;
  const household = g.partyId
    ? Object.values(doc.guests).filter((x) => x.partyId === g.partyId && x.id !== g.id)
    : [];
  const rules = Object.values(doc.rules).filter((r) => r.a === g.id || r.b === g.id);
  const table = g.tableId ? doc.tables[g.tableId] : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={fullName(g) === 'Unnamed guest' ? 'New guest' : fullName(g)}
      footer={
        <>
          <button className="btn-danger mr-auto" onClick={() => (removeGuests([g.id]), onClose())}>
            <Trash2 size={16} /> Delete guest
          </button>
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ge-first">
              First name
            </label>
            <input
              id="ge-first"
              autoFocus
              className="input"
              value={g.firstName}
              onChange={(e) => updateGuest(g.id, { firstName: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="ge-last">
              Last name
            </label>
            <input
              id="ge-last"
              className="input"
              value={g.lastName}
              onChange={(e) => updateGuest(g.id, { lastName: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="ge-rsvp">
              RSVP
            </label>
            <select
              id="ge-rsvp"
              className="input"
              value={g.rsvp}
              onChange={(e) => updateGuest(g.id, { rsvp: e.target.value as Rsvp })}
            >
              <option value="attending">Attending</option>
              <option value="pending">Awaiting reply</option>
              <option value="declined">Declined</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ge-group">
              Group
            </label>
            <select
              id="ge-group"
              className="input"
              value={g.groupId ?? ''}
              onChange={(e) => {
                if (e.target.value === '__new') setNewGroup(' ');
                else updateGuest(g.id, { groupId: e.target.value || null });
              }}
            >
              <option value="">No group</option>
              {Object.values(doc.groups).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
              <option value="__new">+ New group…</option>
            </select>
            {newGroup && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newGroup.trim()) updateGuest(g.id, { groupId: addGroup(newGroup.trim()) });
                  setNewGroup('');
                }}
              >
                <input
                  autoFocus
                  className="input"
                  placeholder="Group name"
                  value={newGroup.trimStart()}
                  onChange={(e) => setNewGroup(e.target.value)}
                  aria-label="New group name"
                />
                <button className="btn-secondary" type="submit">
                  Add
                </button>
              </form>
            )}
          </div>
        </div>

        <TagEditor
          label="Dietary"
          values={g.dietary}
          options={DIETARY}
          onChange={(v) => updateGuest(g.id, { dietary: v })}
        />
        <TagEditor
          label="Accessibility"
          values={g.access}
          options={ACCESS}
          onChange={(v) => updateGuest(g.id, { access: v })}
        />

        <div>
          <label className="label" htmlFor="ge-meal">
            Meal choice
          </label>
          <input
            id="ge-meal"
            className="input"
            value={g.meal ?? ''}
            placeholder="e.g. Short rib — filled in from RSVPs"
            onChange={(e) => updateGuest(g.id, { meal: e.target.value || undefined })}
          />
        </div>

        <div>
          <label className="label" htmlFor="ge-notes">
            Notes
          </label>
          <textarea
            id="ge-notes"
            className="input min-h-[70px] py-2"
            value={g.notes}
            onChange={(e) => updateGuest(g.id, { notes: e.target.value })}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Switch
            label="Child"
            checked={!!g.isChild}
            onChange={(v) => updateGuest(g.id, { isChild: v || undefined })}
          />
          <Switch
            label="Lock seat (auto-seat won’t move them)"
            checked={g.locked}
            onChange={(v) => updateGuest(g.id, { locked: v })}
          />
        </div>
        {table && (
          <div className="flex items-center justify-between rounded-lg bg-sunken px-3 py-2 text-sm">
            <span>
              {g.locked && <Lock size={12} className="mr-1 inline" />}Seated at <strong>{table.name}</strong>,
              seat {(g.seat ?? 0) + 1}
            </span>
            <button className="btn-ghost h-8 min-h-0" onClick={() => unseatGuests([g.id])}>
              Unseat
            </button>
          </div>
        )}

        <section>
          <h3 className="label">Household / plus-ones</h3>
          {household.length > 0 ? (
            <ul className="mb-2 space-y-1 text-sm">
              {household.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <Link2 size={14} className="text-muted" /> {fullName(m)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-sm text-muted">
              Not linked to anyone. Linked guests move together when you drag them.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={() => addPlusOne(g.id)}>
              <UserPlus size={16} /> Add plus-one
            </button>
            {g.partyId && (
              <button className="btn-ghost" onClick={() => unlinkHousehold(g.id)}>
                <Unlink size={16} /> Leave household
              </button>
            )}
            <div className="flex min-w-[14rem] flex-1 gap-2">
              <GuestPicker
                value={linkTo}
                onChange={setLinkTo}
                exclude={[g.id, ...household.map((h) => h.id)]}
                placeholder="Link with…"
              />
              <button
                className="btn-secondary"
                disabled={!linkTo}
                onClick={() => linkTo && (linkHousehold([g.id, linkTo]), setLinkTo(null))}
              >
                <Link2 size={16} />
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="label">Seating rules</h3>
          {rules.length > 0 && (
            <ul className="mb-2 space-y-1 text-sm">
              {rules.map((r) => {
                const other = doc.guests[r.a === g.id ? r.b : r.a];
                return (
                  <li key={r.id} className="flex items-center gap-2">
                    <span
                      className={`chip ${r.kind === 'together' ? 'bg-sage/15 text-sage' : 'bg-danger-soft text-danger'}`}
                    >
                      {r.kind === 'together' ? 'With' : 'Not with'}
                    </span>
                    {other ? fullName(other) : '?'}{' '}
                    <span className="text-xs text-muted">
                      ({r.scope === 'table' ? 'same table' : 'nearby'})
                    </span>
                    <button
                      className="ml-auto rounded p-1 text-muted hover:text-danger"
                      onClick={() => deleteRule(r.id)}
                      aria-label="Delete rule"
                    >
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-auto"
              value={ruleKind}
              onChange={(e) => setRuleKind(e.target.value as 'together' | 'apart')}
              aria-label="Rule type"
            >
              <option value="apart">Must not sit with</option>
              <option value="together">Must sit with</option>
            </select>
            <div className="min-w-[12rem] flex-1">
              <GuestPicker
                value={ruleWith}
                onChange={setRuleWith}
                exclude={[g.id]}
                placeholder="Choose a guest…"
              />
            </div>
            <button
              className="btn-secondary"
              disabled={!ruleWith}
              onClick={() => {
                if (ruleWith) addRule({ a: g.id, b: ruleWith, kind: ruleKind, scope: 'table' });
                setRuleWith(null);
              }}
            >
              <Plus size={16} /> Add rule
            </button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
