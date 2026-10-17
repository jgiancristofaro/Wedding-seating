import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, Switch } from '../../components/ui';
import { GROUP_COLORS } from '../../lib/colors';
import { addGroup, deleteGroup, updateGroup } from '../../store/actions';
import { usePlan } from '../../store/planStore';

export function GroupsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = usePlan((s) => s.doc!);
  const [name, setName] = useState('');
  const counts = new Map<string, number>();
  for (const g of Object.values(doc.guests))
    if (g.groupId) counts.set(g.groupId, (counts.get(g.groupId) ?? 0) + 1);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Groups"
      description="Groups colour the seats and help auto-seat keep people together."
    >
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) addGroup(name.trim());
          setName('');
        }}
      >
        <input
          className="input"
          placeholder="New group, e.g. College friends"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New group name"
        />
        <button className="btn-primary" type="submit">
          <Plus size={16} /> Add
        </button>
      </form>
      <ul className="divide-y divide-line">
        {Object.values(doc.groups).map((g) => (
          <li key={g.id} className="py-3">
            <div className="flex items-center gap-2">
              <input
                className="input h-9 min-h-0 flex-1"
                value={g.name}
                onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                aria-label="Group name"
              />
              <span className="w-16 text-right text-xs text-muted">{counts.get(g.id) ?? 0} guests</span>
              <button
                className="icon-btn h-9 w-9 text-muted hover:text-danger"
                onClick={() => deleteGroup(g.id)}
                aria-label={`Delete group ${g.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div
              className="mt-2 flex flex-wrap items-center gap-1.5"
              role="radiogroup"
              aria-label={`Colour for ${g.name}`}
            >
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={g.color === c}
                  aria-label={c}
                  onClick={() => updateGroup(g.id, { color: c })}
                  className={`h-7 w-7 rounded-full border-2 ${g.color === c ? 'border-ink' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="mt-1 max-w-xs">
              <Switch
                label="Spread out (mix with others)"
                checked={!!g.mix}
                onChange={(v) => updateGroup(g.id, { mix: v || undefined })}
              />
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
