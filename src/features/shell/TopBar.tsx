import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CloudOff,
  History,
  Home,
  LayoutGrid,
  Loader2,
  Menu,
  Moon,
  Redo2,
  Share2,
  Sun,
  Undo2,
  Users,
  Armchair,
  Download,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { cx } from '../../components/ui';
import { navigate } from '../../lib/router';
import { useTheme } from '../../lib/theme';
import { useSync } from '../../persistence/sync';
import { renamePlan, updateSettings } from '../../store/actions';
import { redo, undo, usePlan } from '../../store/planStore';
import { useUi, type Tab } from '../../store/uiStore';
import { ShareDialog } from './ShareDialog';
import { HistoryDialog } from './HistoryDialog';

const TABS: { id: Tab; label: string; icon: typeof Users; edit?: boolean }[] = [
  { id: 'guests', label: 'Guests', icon: Users, edit: true },
  { id: 'layout', label: 'Layout', icon: LayoutGrid, edit: true },
  { id: 'seating', label: 'Seating', icon: Armchair },
  { id: 'export', label: 'Export', icon: Download },
];

export function SaveStatus() {
  const { status, lastSavedAt, peers } = useSync();
  const map = {
    saved: { icon: <Check size={14} />, text: 'Saved', cls: 'text-ok' },
    pending: { icon: <Loader2 size={14} className="opacity-60" />, text: 'Unsaved', cls: 'text-muted' },
    saving: { icon: <Loader2 size={14} className="animate-spin" />, text: 'Saving…', cls: 'text-muted' },
    offline: { icon: <CloudOff size={14} />, text: 'Offline', cls: 'text-warn' },
    error: { icon: <AlertCircle size={14} />, text: 'Not saved', cls: 'text-danger' },
    readonly: { icon: <Eye size={14} />, text: 'View only', cls: 'text-muted' },
  }[status];
  return (
    <div
      className={cx('flex items-center gap-1.5 whitespace-nowrap text-xs font-medium', map.cls)}
      role="status"
      aria-live="polite"
      data-testid="save-status"
      data-status={status}
      title={lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString()}` : undefined}
    >
      {map.icon}
      <span className="hidden sm:inline">{map.text}</span>
      {peers > 1 && (
        <span
          className="ml-1 rounded-full bg-sage/15 px-1.5 py-0.5 text-[10px] text-sage"
          title="People with this plan open"
        >
          {peers} here
        </span>
      )}
    </div>
  );
}

function PlanName() {
  const name = usePlan((s) => s.doc!.name);
  const canEdit = usePlan((s) => s.role === 'edit');
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  useEffect(() => setVal(name), [name]);
  if (!canEdit || !editing)
    return (
      <button
        className="max-w-[40vw] truncate rounded-md px-1.5 py-1 text-left font-display text-xl font-semibold hover:bg-sunken sm:max-w-[16rem]"
        onClick={() => canEdit && setEditing(true)}
        title={canEdit ? 'Rename plan' : name}
        disabled={!canEdit}
      >
        {name}
      </button>
    );
  const done = () => {
    setEditing(false);
    if (val.trim() && val !== name) renamePlan(val.trim());
  };
  return (
    <input
      autoFocus
      className="input h-9 max-w-[16rem] font-display text-lg"
      value={val}
      aria-label="Plan name"
      onChange={(e) => setVal(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done();
        if (e.key === 'Escape') {
          setVal(name);
          setEditing(false);
        }
      }}
    />
  );
}

export function TopBar() {
  const tab = useUi((s) => s.tab);
  const role = usePlan((s) => s.role);
  const canUndo = usePlan((s) => s.past.length > 0);
  const canRedo = usePlan((s) => s.future.length > 0);
  const totalGuests = usePlan((s) => Object.keys(s.doc!.guests).length);
  const totalTables = usePlan((s) => Object.keys(s.doc!.tables).length);
  const counts = { total: totalGuests, tables: totalTables };
  const units = usePlan((s) => s.doc!.settings.units);
  const [share, setShare] = useState(false);
  const [history, setHistory] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dark, toggleTheme] = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const tabs = TABS.filter((t) => role === 'edit' || !t.edit);

  return (
    <header className="z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-2 sm:px-3">
        <button className="icon-btn shrink-0" onClick={() => navigate('/')} aria-label="All plans">
          <img src="./favicon.svg" alt="" className="h-7 w-7" />
        </button>
        <PlanName />
        <nav aria-label="Steps" className="mx-auto hidden md:block">
          <TabList tabs={tabs} tab={tab} />
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <SaveStatus />
          {role === 'edit' && (
            <>
              <button
                className="icon-btn hidden sm:inline-flex"
                onClick={() => undo()}
                disabled={!canUndo}
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 size={18} />
              </button>
              <button
                className="icon-btn hidden sm:inline-flex"
                onClick={() => redo()}
                disabled={!canRedo}
                aria-label="Redo"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 size={18} />
              </button>
            </>
          )}
          <button
            className="btn-primary ml-1 h-9 min-h-0 px-3"
            onClick={() => setShare(true)}
            data-testid="share-btn"
          >
            <Share2 size={16} /> <span className="hidden sm:inline">Share</span>
          </button>
          <div className="relative" ref={menuRef}>
            <button
              className="icon-btn"
              aria-label="More"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              <Menu size={18} />
            </button>
            {menu && (
              <div
                role="menu"
                className="fade-in absolute right-0 top-11 z-40 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-lift"
              >
                {role === 'edit' && (
                  <>
                    <MenuItem
                      icon={<Undo2 size={16} />}
                      onClick={() => undo()}
                      disabled={!canUndo}
                      className="sm:hidden"
                    >
                      Undo
                    </MenuItem>
                    <MenuItem
                      icon={<Redo2 size={16} />}
                      onClick={() => redo()}
                      disabled={!canRedo}
                      className="sm:hidden"
                    >
                      Redo
                    </MenuItem>
                    <MenuItem icon={<History size={16} />} onClick={() => (setHistory(true), setMenu(false))}>
                      Version history
                    </MenuItem>
                    <MenuItem
                      icon={
                        <span className="w-4 text-center text-xs font-bold">
                          {units === 'ft' ? 'ft' : 'm'}
                        </span>
                      }
                      onClick={() => updateSettings({ units: units === 'ft' ? 'm' : 'ft' })}
                    >
                      Units: {units === 'ft' ? 'feet' : 'metres'} (switch)
                    </MenuItem>
                  </>
                )}
                <MenuItem icon={dark ? <Sun size={16} /> : <Moon size={16} />} onClick={toggleTheme}>
                  {dark ? 'Light mode' : 'Dark mode'}
                </MenuItem>
                <MenuItem icon={<Home size={16} />} onClick={() => navigate('/')}>
                  All plans
                </MenuItem>
                <div className="mt-1 border-t border-line px-3 py-2 text-xs text-muted">
                  {counts.total} guests · {counts.tables} tables
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <nav aria-label="Steps" className="border-t border-line px-2 py-1.5 md:hidden">
        <TabList tabs={tabs} tab={tab} compact />
      </nav>
      <ShareDialog open={share} onClose={() => setShare(false)} />
      {history && <HistoryDialog open onClose={() => setHistory(false)} />}
    </header>
  );
}

function TabList({ tabs, tab, compact }: { tabs: typeof TABS; tab: Tab; compact?: boolean }) {
  return (
    <div role="tablist" className={cx('flex items-center gap-1', compact && 'justify-between')}>
      {tabs.map((t, i) => {
        const I = t.icon;
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            data-testid={`${compact ? 'm' : ''}tab-${t.id}`}
            onClick={() => useUi.getState().set({ tab: t.id, selection: [], tool: 'select' })}
            className={cx(
              'flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
              compact && 'flex-1 justify-center px-1',
              active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-sunken hover:text-ink',
            )}
          >
            <span
              className={cx(
                'hidden h-5 w-5 items-center justify-center rounded-full text-[11px] lg:flex',
                active ? 'bg-accent text-accent-ink' : 'bg-sunken text-muted',
              )}
            >
              {i + 1}
            </span>
            <I size={16} className="lg:hidden" aria-hidden />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  disabled,
  className,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex min-h-[40px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-sunken disabled:opacity-40',
        className,
      )}
    >
      <span className="text-muted">{icon}</span>
      {children}
    </button>
  );
}
