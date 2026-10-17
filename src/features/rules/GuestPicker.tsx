import { useId, useMemo, useState } from 'react';
import { fullName, nameKey } from '../../model/names';
import { usePlan } from '../../store/planStore';
import { cx } from '../../components/ui';

/** Accessible combobox for choosing a guest by name. */
export function GuestPicker({
  value,
  onChange,
  exclude = [],
  placeholder = 'Search guests…',
  label,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  exclude?: string[];
  placeholder?: string;
  label?: string;
}) {
  const guests = usePlan((s) => s.doc!.guests);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const options = useMemo(() => {
    const k = q.trim().toLowerCase();
    return Object.values(guests)
      .filter((g) => !exclude.includes(g.id) && (!k || nameKey(g).includes(k)))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)))
      .slice(0, 30);
  }, [guests, q, exclude]);
  const selected = value ? guests[value] : null;
  const pick = (id: string) => {
    onChange(id);
    setQ('');
    setOpen(false);
  };
  return (
    <div className="relative w-full">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label ?? placeholder}
        aria-activedescendant={open && options[active] ? `${listId}-${options[active].id}` : undefined}
        className="input"
        placeholder={placeholder}
        value={open ? q : selected ? fullName(selected) : q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
          if (value) onChange(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && open && options[active]) {
            e.preventDefault();
            pick(options[active].id);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lift"
        >
          {options.map((g, i) => (
            <li
              key={g.id}
              id={`${listId}-${g.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(g.id);
              }}
              className={cx('cursor-pointer px-3 py-2 text-sm', i === active && 'bg-accent-soft')}
            >
              {fullName(g)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
