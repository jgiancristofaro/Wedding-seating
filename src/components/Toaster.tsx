import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToasts } from '../store/toastStore';
import { cx } from './ui';

const ICON = { info: Info, success: CheckCircle2, error: XCircle, warn: AlertTriangle };

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] flex flex-col items-center gap-2 px-3 sm:bottom-5"
    >
      {toasts.map((t) => {
        const I = ICON[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="slide-up pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-lift"
          >
            <I
              size={18}
              className={cx(
                'shrink-0',
                t.kind === 'error' && 'text-danger',
                t.kind === 'warn' && 'text-warn',
                t.kind === 'success' && 'text-ok',
                t.kind === 'info' && 'text-accent',
              )}
              aria-hidden
            />
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                className="rounded-md px-2 py-1 font-semibold text-accent hover:bg-accent-soft"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              className="rounded p-1 text-muted hover:text-ink"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
