import { useEffect, useState } from 'react';
import { Check, Copy, Eye, Pencil, ShieldAlert } from 'lucide-react';
import { Dialog, Segmented } from '../../components/ui';
import { planUrl } from '../../lib/router';
import { useSession } from '../../store/sessionStore';
import { toast } from '../../store/toastStore';

export function CopyField({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    toast.success('Link copied');
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex gap-2">
      <input
        className="input font-mono text-xs"
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.target.select()}
        data-testid={testId}
      />
      <button className="btn-secondary shrink-0" onClick={copy}>
        {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function QrCode({ text, size = 168 }: { text: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('qrcode').then((q) =>
      q
        .toString(text, {
          type: 'svg',
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#24211d', light: '#ffffff' },
        })
        .then((s) => alive && setSvg(s)),
    );
    return () => {
      alive = false;
    };
  }, [text]);
  return (
    <div
      className="shrink-0 rounded-xl border border-line bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
      style={{ width: size, height: size }}
      role="img"
      aria-label="QR code for the link"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

export function SharePanel() {
  const plan = useSession((s) => s.plan);
  const [qrFor, setQrFor] = useState<'view' | 'edit'>('view');
  if (!plan) return null;
  const viewUrl = plan.viewToken ? planUrl(plan.viewToken, 'v') : null;
  const editUrl = plan.editToken ? planUrl(plan.editToken, 'e') : null;
  const qrUrl = qrFor === 'edit' && editUrl ? editUrl : (viewUrl ?? editUrl ?? window.location.href);
  return (
    <div className="space-y-5">
      {plan.backendKind === 'local' && (
        <div className="flex gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm" role="note">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-accent" />
          <span>
            Local mode: these links only work in this browser. Connect Supabase (see README) to share across
            devices — or export a JSON backup to move the plan.
          </span>
        </div>
      )}
      {editUrl && (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
            <Pencil size={14} className="text-accent" /> Edit link
            <span className="font-normal text-muted">— anyone with this can change the plan</span>
          </div>
          <CopyField label="Edit link" value={editUrl} testId="edit-link" />
        </div>
      )}
      {viewUrl && (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
            <Eye size={14} className="text-sage" /> View-only link
            <span className="font-normal text-muted">— safe to send to family and guests</span>
          </div>
          <CopyField label="View-only link" value={viewUrl} testId="view-link" />
        </div>
      )}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <QrCode text={qrUrl} />
        <div className="space-y-2 text-sm text-muted">
          {editUrl && viewUrl && (
            <Segmented
              label="QR code link"
              size="sm"
              value={qrFor}
              onChange={setQrFor}
              options={[
                { value: 'view', label: 'View link' },
                { value: 'edit', label: 'Edit link' },
              ]}
            />
          )}
          <p>Scan to open on a phone. Print the view-only QR at the venue so guests can find their seat.</p>
          <p className="text-xs">
            Keep the edit link private. Links can’t be revoked yet — make a new plan from a backup if one
            leaks.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share this plan"
      description="No accounts needed — the link is the key."
      testId="share-dialog"
    >
      <SharePanel />
    </Dialog>
  );
}
