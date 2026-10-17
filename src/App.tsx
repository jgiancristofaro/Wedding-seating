import { lazy, Suspense } from 'react';
import { Toaster } from './components/Toaster';
import { Spinner } from './components/ui';
import { useRoute } from './lib/router';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';

const PlanPage = lazy(() => import('./pages/PlanPage'));

export function App() {
  const route = useRoute();
  return (
    <>
      {route.name === 'home' && <Home />}
      {route.name === 'plan' && (
        <Suspense fallback={<FullPageSpinner label="Opening plan…" />}>
          <PlanPage key={route.token} token={route.token} />
        </Suspense>
      )}
      {route.name === 'notFound' && <NotFound />}
      <Toaster />
    </>
  );
}

export function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted" role="status">
      <Spinner size={24} />
      <span className="text-sm">{label}</span>
    </div>
  );
}
