import { lazy, Suspense, useEffect, useState } from 'react';
import { FullPageSpinner } from '../App';
import { TopBar } from '../features/shell/TopBar';
import { SyncBanner } from '../features/shell/SyncBanner';
import { useBackdropImage } from '../features/layout/useBackdropImage';
import { BackendError } from '../persistence/backend';
import { closePlan, openPlan } from '../persistence/session';
import { redo, undo, usePlan } from '../store/planStore';
import { useSession } from '../store/sessionStore';
import { toast } from '../store/toastStore';
import { useUi } from '../store/uiStore';
import { NotFound } from './NotFound';
import { GuestsTab } from '../features/guests/GuestsTab';
import { SeatingTab } from '../features/seating/SeatingTab';

const LayoutTab = lazy(() => import('../features/layout/LayoutTab'));
const ExportTab = lazy(() => import('../features/export/ExportTab'));

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; title: string; message: string };

export default function PlanPage({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const tab = useUi((s) => s.tab);
  const hasDoc = usePlan((s) => !!s.doc);
  useBackdropImage();

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    openPlan(token)
      .then((p) => {
        if (cancelled) return;
        useSession.getState().set({ plan: p });
        const doc = usePlan.getState().doc!;
        const empty = Object.keys(doc.guests).length === 0;
        useUi.getState().set({
          tab: p.role === 'view' ? 'seating' : empty ? 'guests' : 'seating',
          selection: [],
          armed: [],
        });
        if (p.notice) toast.info(p.notice);
        setState({ kind: 'ready' });
      })
      .catch((e) => {
        if (cancelled) return;
        const err = e instanceof BackendError ? e : null;
        if (err?.code === 'not_found')
          setState({
            kind: 'error',
            title: 'We couldn’t find that plan',
            message:
              'The link may be mistyped, incomplete, or the plan was removed. Ask whoever shared it for a fresh link.',
          });
        else if (err?.code === 'network' || err?.code === 'unavailable')
          setState({
            kind: 'error',
            title: 'Can’t reach the server',
            message:
              'You seem to be offline (or the service is down) and this plan hasn’t been opened on this device before. Try again in a moment.',
          });
        else setState({ kind: 'error', title: 'Something went wrong', message: (e as Error).message });
      });
    return () => {
      cancelled = true;
      closePlan();
    };
  }, [token]);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const label = e.shiftKey ? redo() : undo();
        if (label) toast.info(`${e.shiftKey ? 'Redid' : 'Undid'}: ${label}`);
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        const label = redo();
        if (label) toast.info(`Redid: ${label}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (state.kind === 'error') return <NotFound title={state.title} message={state.message} />;
  if (state.kind === 'loading' || !hasDoc) return <FullPageSpinner label="Opening plan…" />;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar />
      <SyncBanner />
      <main className="relative min-h-0 flex-1" id="main">
        {tab === 'guests' && <GuestsTab />}
        {tab === 'seating' && <SeatingTab />}
        <Suspense fallback={<FullPageSpinner label="Loading…" />}>
          {tab === 'layout' && <LayoutTab />}
          {tab === 'export' && <ExportTab />}
        </Suspense>
      </main>
    </div>
  );
}
