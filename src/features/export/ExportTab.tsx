import { useRef, useState, type ReactNode } from 'react';
import { Archive, FileImage, FileSpreadsheet, FileText, History, Share2, Upload } from 'lucide-react';
import { Spinner, Switch } from '../../components/ui';
import { downloadBlob, slug } from '../../lib/util';
import { normalizeDoc } from '../../persistence/migrate';
import { replaceWholeDoc } from '../../store/actions';
import { usePlan } from '../../store/planStore';
import { useSession } from '../../store/sessionStore';
import { toast } from '../../store/toastStore';
import { HistoryDialog } from '../shell/HistoryDialog';
import { SharePanel } from '../shell/ShareDialog';
import { PAPERS, type Paper } from '../../export/pdf';

function Card({
  icon,
  title,
  children,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold leading-tight">{title}</h2>
          <p className="text-sm text-muted">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

async function backdropDataUrl(): Promise<string | null> {
  const u = useSession.getState().backdropUrl;
  if (!u) return null;
  const { blobToDataUrl } = await import('../../export/svgRender');
  return blobToDataUrl(await (await fetch(u.url)).blob());
}

export default function ExportTab() {
  const doc = usePlan((s) => s.doc!);
  const editable = usePlan((s) => s.role === 'edit');
  const [busy, setBusy] = useState<string | null>(null);
  const [paper, setPaper] = useState<Paper>(doc.settings.units === 'm' ? 'a4' : 'letter');
  const [sections, setSections] = useState({ overview: true, tables: true, lookup: true });
  const [names, setNames] = useState(true);
  const [withImage, setWithImage] = useState(true);
  const [history, setHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const base = slug(doc.name);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast.error(`Export failed: ${(e as Error).message || 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  };
  const btn = (key: string, label: string, fn: () => Promise<void>, primary = false) => (
    <button
      className={primary ? 'btn-primary' : 'btn-secondary'}
      disabled={!!busy}
      onClick={() => run(key, fn)}
      data-testid={`export-${key}`}
    >
      {busy === key && <Spinner />} {label}
    </button>
  );

  const restore = async (f: File) => {
    try {
      const next = normalizeDoc(JSON.parse(await f.text()));
      if (
        !window.confirm(
          `Replace this plan with “${next.name}” (${Object.keys(next.guests).length} guests)? You can undo this.`,
        )
      )
        return;
      replaceWholeDoc(next, 'Restore backup');
      toast.success('Backup restored.');
    } catch (e) {
      toast.error((e as Error).message || 'That file could not be read.');
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-5xl gap-5 p-4 sm:p-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <h1 className="font-display text-4xl font-semibold">Share & export</h1>
          <p className="text-sm text-muted">
            Everything you need for the venue, the printer and the family group chat.
          </p>
        </div>

        <Card
          icon={<Share2 size={18} />}
          title="Share"
          desc="Send the view-only link to family; keep the edit link for planners."
        >
          <SharePanel />
        </Card>

        <Card
          icon={<FileText size={18} />}
          title="Printable PDFs"
          desc="Seating chart, a page per table, and an alphabetical “find your seat” list."
        >
          <div className="space-y-3">
            <label className="block">
              <span className="label">Paper size</span>
              <select
                className="input"
                value={paper}
                onChange={(e) => setPaper(e.target.value as Paper)}
                aria-label="Paper size"
              >
                {PAPERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 sm:grid-cols-3">
              {(
                [
                  ['overview', 'Overview'],
                  ['tables', 'Table pages'],
                  ['lookup', 'Find your seat'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex min-h-[40px] items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sections[k]}
                    onChange={(e) => setSections((s) => ({ ...s, [k]: e.target.checked }))}
                    className="h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  {l}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {btn(
                'pdf',
                'Download seating chart',
                async () => {
                  if (!sections.overview && !sections.tables && !sections.lookup)
                    throw new Error('Pick at least one section.');
                  const { seatingChartPdf } = await import('../../export/pdf');
                  downloadBlob(
                    await seatingChartPdf(doc, {
                      paper,
                      ...sections,
                      backdropDataUrl: withImage ? await backdropDataUrl() : null,
                    }),
                    `${base}-seating-chart.pdf`,
                  );
                },
                true,
              )}
              {btn('placecards', 'Place cards', async () => {
                const { placeCardsPdf } = await import('../../export/pdf');
                downloadBlob(await placeCardsPdf(doc, paper), `${base}-place-cards.pdf`);
              })}
              {btn('tablecards', 'Table numbers', async () => {
                const { tableCardsPdf } = await import('../../export/pdf');
                downloadBlob(await tableCardsPdf(doc, paper), `${base}-table-numbers.pdf`);
              })}
            </div>
          </div>
        </Card>

        <Card
          icon={<FileImage size={18} />}
          title="Floor plan image"
          desc="High-resolution PNG or scalable SVG of the whole room."
        >
          <div className="mb-3 grid gap-1 sm:grid-cols-2">
            <Switch label="Guest names" checked={names} onChange={setNames} />
            {doc.backdrop && (
              <Switch label="Include floor plan photo" checked={withImage} onChange={setWithImage} />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {btn(
              'png',
              'Download PNG',
              async () => {
                const { renderPlanSvg, svgToPng } = await import('../../export/svgRender');
                const r = renderPlanSvg(doc, {
                  names,
                  backdropDataUrl: withImage ? await backdropDataUrl() : null,
                  title: true,
                });
                downloadBlob(await svgToPng(r.svg, r.width, r.height, 4000), `${base}-floor-plan.png`);
              },
              true,
            )}
            {btn('svg', 'Download SVG', async () => {
              const { renderPlanSvg } = await import('../../export/svgRender');
              const r = renderPlanSvg(doc, {
                names,
                backdropDataUrl: withImage ? await backdropDataUrl() : null,
                title: true,
              });
              downloadBlob(new Blob([r.svg], { type: 'image/svg+xml' }), `${base}-floor-plan.svg`);
            })}
          </div>
        </Card>

        <Card
          icon={<FileSpreadsheet size={18} />}
          title="Spreadsheets"
          desc="Guest list with table & seat, plus a roster per table — for caterers and the venue."
        >
          <div className="flex flex-wrap gap-2">
            {btn(
              'xlsx',
              'Excel (.xlsx)',
              async () => {
                const { toXlsx } = await import('../../export/tabular');
                downloadBlob(await toXlsx(doc), `${base}-guests.xlsx`);
              },
              true,
            )}
            {btn('csv', 'Guest list CSV', async () => {
              const { guestRows, toCsv } = await import('../../export/tabular');
              downloadBlob(
                new Blob([toCsv(guestRows(doc))], { type: 'text/csv;charset=utf-8' }),
                `${base}-guests.csv`,
              );
            })}
            {btn('roster', 'Table roster CSV', async () => {
              const { rosterRows, toCsv } = await import('../../export/tabular');
              downloadBlob(
                new Blob([toCsv(rosterRows(doc))], { type: 'text/csv;charset=utf-8' }),
                `${base}-tables.csv`,
              );
            })}
          </div>
        </Card>

        <Card
          icon={<Archive size={18} />}
          title="Backup"
          desc="A complete copy of the plan. Restore it here or start a new plan from it."
        >
          <div className="flex flex-wrap gap-2">
            {btn(
              'json',
              'Download backup (.json)',
              async () => {
                const { backupJson } = await import('../../export/tabular');
                downloadBlob(
                  new Blob([backupJson(doc)], { type: 'application/json' }),
                  `${base}-backup-${new Date().toISOString().slice(0, 10)}.json`,
                );
              },
              true,
            )}
            {editable && (
              <>
                <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
                  <Upload size={16} /> Restore from backup
                </button>
                <button className="btn-secondary" onClick={() => setHistory(true)}>
                  <History size={16} /> Version history
                </button>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              data-testid="restore-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restore(f);
                e.target.value = '';
              }}
            />
          </div>
        </Card>
      </div>
      {history && <HistoryDialog open onClose={() => setHistory(false)} />}
    </div>
  );
}
