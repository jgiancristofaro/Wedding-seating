import { CloudOff, Eye, RefreshCw } from 'lucide-react';
import { getSyncEngine, useSync } from '../../persistence/sync';
import { usePlan } from '../../store/planStore';
import { useSession } from '../../store/sessionStore';

export function SyncBanner() {
  const { status, message } = useSync();
  const role = usePlan((s) => s.role);
  const backend = useSession((s) => s.plan?.backendKind);
  if (role === 'view')
    return (
      <div
        className="flex items-center justify-center gap-2 bg-sunken px-3 py-1.5 text-xs text-muted"
        role="note"
      >
        <Eye size={14} /> You’re viewing this plan. Search for your name to find your seat.
      </div>
    );
  if (status === 'offline' || status === 'error')
    return (
      <div
        className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs ${status === 'error' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-ink'}`}
        role="alert"
      >
        <CloudOff size={14} /> {message ?? 'Offline — your changes are kept on this device.'}
        <button
          className="ml-2 inline-flex items-center gap-1 font-semibold underline"
          onClick={() => void getSyncEngine()?.flush()}
        >
          <RefreshCw size={12} /> Retry now
        </button>
      </div>
    );
  if (backend === 'local') return null;
  return null;
}
