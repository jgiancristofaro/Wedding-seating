import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock, Eye, FileUp, Pencil, Sparkles, Trash2, Users } from 'lucide-react';
import { Spinner } from '../components/ui';
import type { PlanDoc } from '../model/types';
import { navigate } from '../lib/router';
import { useTheme } from '../lib/theme';
import { BackendError } from '../persistence/backend';
import { cloudConfigured, getBackend } from '../persistence/index';
import { normalizeDoc } from '../persistence/migrate';
import { forgetPlan, getRecent, type RecentPlan } from '../persistence/recent';
import { createPlan } from '../persistence/session';
import { toast } from '../store/toastStore';

export function Hero() {
  const seats = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 10;
    return { x: 100 + 70 * Math.cos(a), y: 100 + 70 * Math.sin(a), i };
  });
  const colors = ['#E8B4A6', '#A9C5B4', '#B7C4E0', '#E6CF9C', '#CDB4DB'];
  return (
    <svg viewBox="0 0 200 200" className="h-48 w-48 sm:h-56 sm:w-56" aria-hidden>
      <circle cx="100" cy="100" r="46" className="fill-surface stroke-line" strokeWidth="2" />
      <text
        x="100"
        y="98"
        textAnchor="middle"
        className="fill-ink font-display"
        fontSize="16"
        fontWeight="600"
      >
        Table 1
      </text>
      <text x="100" y="114" textAnchor="middle" className="fill-muted" fontSize="10">
        8 / 10
      </text>
      {seats.map((s) => (
        <circle
          key={s.i}
          cx={s.x}
          cy={s.y}
          r="13"
          fill={s.i < 8 ? colors[s.i % colors.length] : 'none'}
          className={s.i < 8 ? '' : 'stroke-line'}
          strokeDasharray={s.i < 8 ? undefined : '3 3'}
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

type CloudCheck =
  { state: 'checking' } | { state: 'ok' } | { state: 'fail'; message: string; detail?: string };

/** Tells the owner right away whether the Supabase keys and database setup actually work. */
function CloudStatus() {
  const [check, setCheck] = useState<CloudCheck>({ state: 'checking' });
  useEffect(() => {
    let alive = true;
    getBackend()
      .then((b) => b.ping())
      .then(
        (r) =>
          alive &&
          setCheck(
            r.ok ? { state: 'ok' } : { state: 'fail', message: r.error.message, detail: r.error.detail },
          ),
      )
      .catch((e) => alive && setCheck({ state: 'fail', message: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, []);
  if (check.state === 'checking')
    return (
      <p className="mb-8 text-sm text-muted" role="status">
        Checking cloud storage…
      </p>
    );
  if (check.state === 'ok')
    return (
      <p className="mb-8 flex items-center gap-2 text-sm text-ok" role="status" data-testid="cloud-ok">
        <Check size={14} /> Cloud storage connected — plans are saved online and can be shared.
      </p>
    );
  return (
    <div
      className="mb-8 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
      role="alert"
      data-testid="cloud-fail"
    >
      <strong>Cloud storage isn’t working.</strong> {check.message}
      {check.detail && <div className="mt-1 break-words font-mono text-xs opacity-80">{check.detail}</div>}
      <div className="mt-1 text-xs opacity-80">Plans made now are still saved on this device.</div>
    </div>
  );
}

export function Home() {
  const [busy, setBusy] = useState<null | 'new' | 'demo' | 'file'>(null);
  const [recent, setRecent] = useState<RecentPlan[]>(() => getRecent());
  const fileRef = useRef<HTMLInputElement>(null);
  const [dark, toggleTheme] = useTheme();

  const start = async (kind: 'new' | 'demo', doc?: PlanDoc) => {
    setBusy(doc ? 'file' : kind);
    try {
      await createPlan({ demo: kind === 'demo', doc });
    } catch (e) {
      const msg =
        e instanceof BackendError && (e.code === 'network' || e.code === 'unavailable')
          ? 'We couldn’t reach the server to create your plan. Check your connection and try again.'
          : `Couldn’t create the plan: ${(e as Error).message}`;
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const restore = async (f: File) => {
    try {
      const doc = normalizeDoc(JSON.parse(await f.text()));
      await start('new', doc);
    } catch (e) {
      toast.error((e as Error).message || 'That file could not be read.');
    }
  };

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <img src="./favicon.svg" alt="" className="h-7 w-7" />
          <span className="font-display text-xl font-semibold">Seating Plan</span>
        </div>
        <button className="btn-ghost" onClick={toggleTheme} aria-pressed={dark}>
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16">
        <section className="grid items-center gap-8 py-8 sm:grid-cols-[1fr_auto] sm:py-14">
          <div>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Seat everyone you love,
              <br />
              <span className="italic text-accent">beautifully.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Import your guest list, arrange the room, then drag guests to their seats. Share one link with
              family — no accounts, no installs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className="btn-primary h-12 px-5 text-base"
                onClick={() => start('new')}
                disabled={!!busy}
                data-testid="create-plan"
              >
                {busy === 'new' ? <Spinner /> : <Pencil size={18} />} Start a new plan
              </button>
              <button
                className="btn-secondary h-12 px-5 text-base"
                onClick={() => start('demo')}
                disabled={!!busy}
                data-testid="load-demo"
              >
                {busy === 'demo' ? <Spinner /> : <Sparkles size={18} />} Try the demo wedding
              </button>
            </div>
            <button
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp size={14} /> Restore from a JSON backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restore(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="hidden justify-center sm:flex">
            <Hero />
          </div>
        </section>

        {cloudConfigured() && <CloudStatus />}

        {!cloudConfigured() && (
          <div
            className="mb-8 rounded-xl border border-line bg-sunken px-4 py-3 text-sm text-muted"
            role="note"
          >
            <strong className="text-ink">Local mode.</strong> Plans are saved in this browser only. To share
            links across devices, connect a free Supabase project (see the README).
          </div>
        )}

        {recent.length > 0 && (
          <section aria-labelledby="recent-h">
            <h2
              id="recent-h"
              className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted"
            >
              <Clock size={14} /> Your recent plans
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {recent.map((r) => (
                <li key={r.token} className="card group flex items-center gap-3 p-3 pl-4">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => navigate(`/${r.role === 'edit' ? 'e' : 'v'}/${r.token}`)}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      {r.role === 'edit' ? <Pencil size={16} /> : <Eye size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.name}</div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span>{r.role === 'edit' ? 'Can edit' : 'View only'}</span>·
                        {r.guests != null && (
                          <span className="inline-flex items-center gap-1">
                            <Users size={11} /> {r.guests}
                          </span>
                        )}
                        <span>· {new Date(r.openedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <ArrowRight
                      size={16}
                      className="text-muted transition-transform group-hover:translate-x-0.5"
                    />
                  </button>
                  <button
                    className="icon-btn text-muted"
                    aria-label={`Remove ${r.name} from recent plans`}
                    title="Remove from this list (the plan itself is not deleted)"
                    onClick={() => {
                      forgetPlan(r.token);
                      setRecent(getRecent());
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-14 grid gap-6 text-sm sm:grid-cols-4">
          {[
            ['1 · Guests', 'Drop in a CSV or paste from a spreadsheet. Columns are matched for you.'],
            ['2 · Layout', 'Add tables, trace your venue’s floor plan, preview it in 3D.'],
            [
              '3 · Seating',
              'Drag guests to seats, set who sits together or apart, or auto-seat in one click.',
            ],
            ['4 · Export', 'Print charts, place cards and “find your seat” lists. Share a link.'],
          ].map(([t, d]) => (
            <div key={t}>
              <div className="font-display text-xl font-semibold">{t}</div>
              <p className="mt-1 text-muted">{d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
