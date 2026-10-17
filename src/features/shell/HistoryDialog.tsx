import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { Dialog, Spinner } from '../../components/ui';
import type { SnapshotMeta } from '../../persistence/backend';
import { getBackend } from '../../persistence/index';
import { normalizeDoc } from '../../persistence/migrate';
import { getSyncEngine } from '../../persistence/sync';
import { replaceWholeDoc } from '../../store/actions';
import { useSession } from '../../store/sessionStore';
import { toast } from '../../store/toastStore';

export function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const token = useSession((s) => s.plan?.editToken);
  const [list, setList] = useState<SnapshotMeta[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setList(await (await getBackend()).listSnapshots(token));
    } catch {
      setError('Version history is unavailable while offline.');
    }
  }, [token]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const saveNow = async () => {
    setBusy('save');
    try {
      await getSyncEngine()?.snapshot('Saved version');
      toast.success('Version saved');
      await load();
    } catch {
      toast.error('Couldn’t save a version right now.');
    } finally {
      setBusy(null);
    }
  };

  const restore = async (s: SnapshotMeta) => {
    if (!token) return;
    setBusy(s.id);
    try {
      const b = await getBackend();
      const doc = normalizeDoc(await b.getSnapshot(token, s.id));
      await getSyncEngine()?.snapshot('Before restore');
      replaceWholeDoc(doc, 'Restore version');
      toast.success(
        `Restored the version from ${new Date(s.createdAt).toLocaleString()}. Undo is available.`,
      );
      onClose();
    } catch {
      toast.error('Couldn’t restore that version.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Version history"
      description="Snapshots are saved automatically every 10 minutes while you edit. The last 30 are kept."
      footer={
        <button className="btn-secondary" onClick={saveNow} disabled={!!busy}>
          {busy === 'save' ? <Spinner /> : <Save size={16} />} Save a version now
        </button>
      }
    >
      {error && <p className="text-sm text-danger">{error}</p>}
      {!list && !error && (
        <div className="flex justify-center py-8 text-muted">
          <Spinner />
        </div>
      )}
      {list && list.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No versions yet — keep editing, or save one now.
        </p>
      )}
      {list && list.length > 0 && (
        <ul className="divide-y divide-line">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{new Date(s.createdAt).toLocaleString()}</div>
                <div className="text-xs text-muted">
                  {s.label} · {s.guests} guests · {s.tables} tables
                </div>
              </div>
              <button className="btn-secondary" onClick={() => restore(s)} disabled={!!busy}>
                {busy === s.id ? <Spinner /> : <RotateCcw size={14} />} Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
