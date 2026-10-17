import { lazy, Suspense, useRef, useState } from 'react';
import {
  Box,
  Music,
  Mic,
  Wine,
  UtensilsCrossed,
  Disc3,
  Camera,
  LogIn,
  Cake,
  Gift,
  Type,
  DoorOpen,
  Hand,
  ImagePlus,
  Magnet,
  MousePointer2,
  Ruler,
  Trash2,
  Wand2,
  Minus as WallIcon,
  RectangleHorizontal,
  ArrowRight,
} from 'lucide-react';
import { cx, Segmented, Spinner, Switch } from '../../components/ui';
import { useIsMobile } from '../../lib/useMedia';
import { ELEMENT_DEFAULTS, SHAPE_DEFAULTS } from '../../model/factory';
import type { ElementKind, TableShape, ViewLayers } from '../../model/types';
import { addElement, addTable, setBackdrop, updateBackdrop, updateSettings } from '../../store/actions';
import { usePlan } from '../../store/planStore';
import { useSession } from '../../store/sessionStore';
import { toast } from '../../store/toastStore';
import { useUi, type Tool } from '../../store/uiStore';
import { getBackend } from '../../persistence/index';
import { BackendError } from '../../persistence/backend';
import { Canvas } from '../canvas/Canvas';
import { contentBounds } from '../canvas/bounds';
import { Inspector } from '../seating/Inspector';
import { SampleLayoutHint } from '../seating/SeatingTab';
import { cacheImage } from './useBackdropImage';
import { CalibrationDialog, CalibrationOverlay, useCalibration } from './Calibration';
import { DetectionOverlay, useDetection } from './Detection';

const Preview3D = lazy(() => import('../three/Preview3D'));

const TABLE_ICONS: Record<TableShape, React.ReactNode> = {
  round: <circle cx="12" cy="12" r="7" />,
  oval: <ellipse cx="12" cy="12" rx="9" ry="6" />,
  rect: <rect x="3" y="8" width="18" height="8" rx="1.5" />,
  square: <rect x="5" y="5" width="14" height="14" rx="1.5" />,
  head: <rect x="2" y="9" width="20" height="6" rx="1.5" />,
  sweetheart: <rect x="7" y="9" width="10" height="6" rx="1.5" />,
};
const VENUE: ElementKind[] = [
  'danceFloor',
  'stage',
  'bar',
  'buffet',
  'dj',
  'photoBooth',
  'entrance',
  'cake',
  'gifts',
  'label',
];
const VENUE_ICONS: Partial<Record<ElementKind, typeof Box>> = {
  danceFloor: Music,
  stage: Mic,
  bar: Wine,
  buffet: UtensilsCrossed,
  dj: Disc3,
  photoBooth: Camera,
  entrance: LogIn,
  cake: Cake,
  gifts: Gift,
  label: Type,
};

function viewCenter() {
  const v = useUi.getState().viewport;
  const el = document.querySelector('[data-testid="canvas"]') as HTMLElement | null;
  return {
    x: ((el?.clientWidth ?? 800) / 2 - v.x) / v.zoom,
    y: ((el?.clientHeight ?? 600) / 2 - v.y) / v.zoom,
  };
}

function PaletteButton({
  label,
  icon,
  data,
  onClick,
  testId,
}: {
  label: string;
  icon: React.ReactNode;
  data: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-ws-item', data);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-[64px] min-w-[72px] flex-col items-center justify-center gap-1 rounded-xl border border-line bg-surface px-2 py-2 text-xs text-ink transition hover:-translate-y-0.5 hover:border-accent hover:shadow-soft"
      title={`Click to add, or drag onto the plan`}
    >
      {icon}
      <span className="leading-tight">{label}</span>
    </button>
  );
}

export default function LayoutTab() {
  const doc = usePlan((s) => s.doc!);
  const editable = usePlan((s) => s.role === 'edit');
  const tool = useUi((s) => s.tool);
  const selection = useUi((s) => s.selection);
  const show3d = useUi((s) => s.show3d);
  const plan = useSession((s) => s.plan);
  const mobile = useIsMobile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const calib = useCalibration();
  const detect = useDetection();
  const b = doc.backdrop;

  const setTool = (t: Tool) => useUi.getState().set({ tool: t, selection: [] });

  const upload = async (f: File) => {
    if (!plan?.editToken) return;
    setUploading(true);
    try {
      const { loadFloorPlanFile } = await import('../../floorplan/imageLoad');
      const img = await loadFloorPlanFile(f);
      const assetId = await (await getBackend()).putAsset(plan.editToken, img.blob);
      await cacheImage(assetId, img.blob);
      // Place it over the current content, assuming a ~24 m wide room until calibrated.
      const bounds = contentBounds(doc, false);
      const cmPerPx = 2400 / img.width;
      setBackdrop({
        assetId,
        natW: img.width,
        natH: img.height,
        x: bounds ? bounds.x + bounds.w / 2 - (img.width * cmPerPx) / 2 : 0,
        y: bounds ? bounds.y + bounds.h / 2 - (img.height * cmPerPx) / 2 : 0,
        cmPerPx,
        opacity: 0.6,
        calibrated: false,
      });
      updateSettings({ layers: 'both' });
      toast.success('Floor plan added. Next: set the scale so tables are life-size.', {
        label: 'Set scale',
        run: () => calib.start(),
      });
    } catch (e) {
      const msg =
        e instanceof BackendError
          ? e.code === 'too_large'
            ? 'That image is too large to store.'
            : 'Upload failed — check your connection.'
          : (e as Error).message;
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const tools: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
    {
      id: 'select',
      label: 'Select',
      icon: <MousePointer2 size={16} />,
      hint: 'Select & move (drag on empty space to box-select)',
    },
    { id: 'pan', label: 'Pan', icon: <Hand size={16} />, hint: 'Pan the view (or hold Space)' },
    {
      id: 'wall',
      label: 'Wall',
      icon: <WallIcon size={16} className="rotate-45" />,
      hint: 'Click to start, click again for each corner. Double-click or Esc to finish.',
    },
    { id: 'door', label: 'Door', icon: <DoorOpen size={16} />, hint: 'Click both ends of the door opening' },
    {
      id: 'window',
      label: 'Window',
      icon: <RectangleHorizontal size={16} />,
      hint: 'Click both ends of the window',
    },
  ];

  const palette = (
    <>
      <section>
        <h3 className="label">Tables</h3>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(SHAPE_DEFAULTS) as TableShape[]).map((s) => (
            <PaletteButton
              key={s}
              testId={`add-table-${s}`}
              label={SHAPE_DEFAULTS[s].label}
              data={`table:${s}`}
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  className="fill-accent-soft stroke-accent"
                  strokeWidth="1.5"
                  aria-hidden
                >
                  {TABLE_ICONS[s]}
                </svg>
              }
              onClick={() => {
                const c = viewCenter();
                addTable(s, c.x, c.y);
              }}
            />
          ))}
        </div>
      </section>
      <section>
        <h3 className="label">Venue</h3>
        <div className="grid grid-cols-3 gap-2">
          {VENUE.map((k) => (
            <PaletteButton
              key={k}
              label={ELEMENT_DEFAULTS[k].label}
              data={`element:${k}`}
              icon={(() => {
                const I = VENUE_ICONS[k] ?? Box;
                return <I size={18} className="text-muted" />;
              })()}
              onClick={() => {
                const c = viewCenter();
                useUi.getState().set({ selection: [addElement(k, c.x, c.y)] });
              }}
            />
          ))}
        </div>
      </section>
    </>
  );

  const backdropPanel = (
    <section className="space-y-3">
      <h3 className="label">Floor plan image</h3>
      {!b ? (
        <>
          <button
            className="btn-secondary w-full"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !editable}
            data-testid="upload-floorplan"
          >
            {uploading ? <Spinner /> : <ImagePlus size={16} />} Upload JPG, PNG or PDF
          </button>
          <p className="text-xs text-muted">
            We shrink it in your browser before saving. Then set the scale and trace walls on top.
          </p>
        </>
      ) : (
        <>
          <Segmented<ViewLayers>
            label="Show"
            size="sm"
            value={doc.settings.layers}
            onChange={(v) => updateSettings({ layers: v })}
            options={[
              { value: 'both', label: 'Both' },
              { value: 'image', label: 'Image' },
              { value: 'vector', label: 'Traced' },
            ]}
          />
          <label className="block">
            <span className="label">Image opacity</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={b.opacity}
              onChange={(e) => updateBackdrop({ opacity: Number(e.target.value) })}
              className="w-full accent-[rgb(var(--accent))]"
            />
          </label>
          <button
            className={cx('btn-secondary w-full', !b.calibrated && 'border-accent text-accent')}
            onClick={calib.start}
            data-testid="calibrate"
          >
            <Ruler size={16} /> {b.calibrated ? 'Re-set scale' : 'Set scale (2 clicks)'}
          </button>
          <button className="btn-secondary w-full" onClick={detect.run} disabled={detect.busy}>
            {detect.busy ? <Spinner /> : <Wand2 size={16} />} Suggest walls from image
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 text-xs" onClick={() => fileRef.current?.click()}>
              Replace
            </button>
            <button className="btn-ghost flex-1 text-xs text-danger" onClick={() => setBackdrop(null)}>
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.heic,.heif"
        className="hidden"
        data-testid="floorplan-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
    </section>
  );

  return (
    <div className="flex h-full">
      {!mobile && (
        <aside
          className="flex w-[260px] shrink-0 flex-col gap-5 overflow-auto border-r border-line bg-surface p-4 scrollbar-thin"
          aria-label="Layout tools"
        >
          {palette}
          {backdropPanel}
          <section className="space-y-1">
            <Switch
              label="Snap to grid"
              checked={doc.settings.snap}
              onChange={(v) => updateSettings({ snap: v })}
            />
            <Segmented
              label="Units"
              size="sm"
              value={doc.settings.units}
              onChange={(v) => updateSettings({ units: v })}
              options={[
                { value: 'ft', label: 'Feet' },
                { value: 'm', label: 'Metres' },
              ]}
            />
          </section>
          <button className="btn-primary mt-auto" onClick={() => useUi.getState().set({ tab: 'seating' })}>
            Next: seat guests <ArrowRight size={16} />
          </button>
        </aside>
      )}
      <div className="relative min-w-0 flex-1">
        <Canvas
          mode="layout"
          doc={doc}
          readOnly={!editable}
          onToolClick={calib.click}
          overlay={
            <>
              <CalibrationOverlay state={calib} />
              <DetectionOverlay state={detect} />
            </>
          }
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="pointer-events-auto flex rounded-xl border border-line bg-surface p-1 shadow-soft"
              role="toolbar"
              aria-label="Drawing tools"
            >
              {tools.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  aria-pressed={tool === t.id}
                  title={t.hint}
                  className={cx(
                    'flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 text-sm',
                    tool === t.id ? 'bg-accent text-accent-ink' : 'text-ink hover:bg-sunken',
                  )}
                  data-testid={`tool-${t.id}`}
                >
                  {t.icon}
                  <span className="hidden lg:inline">{t.label}</span>
                </button>
              ))}
            </div>
            <button
              className={cx(
                'pointer-events-auto btn shadow-soft',
                doc.settings.snap ? 'bg-accent-soft text-accent' : 'border border-line bg-surface',
              )}
              onClick={() => updateSettings({ snap: !doc.settings.snap })}
              aria-pressed={doc.settings.snap}
              title="Snap to grid"
            >
              <Magnet size={16} />
            </button>
            <button
              className="pointer-events-auto btn-secondary ml-auto shadow-soft"
              onClick={() => useUi.getState().set({ show3d: true })}
              data-testid="open-3d"
            >
              <Box size={16} /> 3D preview
            </button>
          </div>
          {(tool === 'wall' || tool === 'door' || tool === 'window') && (
            <div
              className="pointer-events-auto self-start rounded-full bg-ink px-4 py-2 text-xs text-surface shadow-lift"
              role="status"
            >
              {tools.find((t) => t.id === tool)?.hint} Hold Alt to turn off snapping.
            </div>
          )}
          {calib.phase !== 'idle' && calib.phase !== 'enter' && (
            <div
              className="pointer-events-auto self-start rounded-full bg-ink px-4 py-2 text-xs text-surface shadow-lift"
              role="status"
            >
              {calib.phase === 'p1'
                ? 'Click the start of a wall or something you know the length of.'
                : 'Now click the other end.'}
              <button className="ml-3 underline" onClick={calib.cancel}>
                Cancel
              </button>
            </div>
          )}
          {detect.segments && <DetectionBar state={detect} />}
          <SampleLayoutHint />
        </div>
        {selection.length > 0 && (
          <div
            className={cx(
              'pointer-events-none absolute flex flex-col',
              mobile ? 'inset-x-2 bottom-28 max-h-[50%]' : 'bottom-3 right-3 top-16 w-80',
            )}
          >
            <div className="pointer-events-auto min-h-0">
              <Inspector doc={doc} editable={editable} mode="layout" />
            </div>
          </div>
        )}
        {mobile && (
          <div className="absolute inset-x-0 bottom-0 z-10 max-h-[45%] overflow-auto border-t border-line bg-surface p-3 shadow-lift">
            <details>
              <summary className="flex min-h-[44px] cursor-pointer items-center font-medium">
                Add tables, venue items & floor plan
              </summary>
              <div className="mt-3 space-y-4">
                {palette}
                {backdropPanel}
              </div>
            </details>
          </div>
        )}
        {calib.phase === 'enter' && <CalibrationDialog state={calib} />}
      </div>
      {show3d && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <Spinner size={28} />
            </div>
          }
        >
          <Preview3D onClose={() => useUi.getState().set({ show3d: false })} />
        </Suspense>
      )}
    </div>
  );
}

function DetectionBar({ state }: { state: ReturnType<typeof useDetection> }) {
  const n = state.segments?.filter((s) => s.on).length ?? 0;
  return (
    <div
      className="pointer-events-auto flex max-w-xl flex-wrap items-center gap-2 self-start rounded-2xl border border-accent/40 bg-surface p-3 text-sm shadow-lift"
      role="region"
      aria-label="Wall suggestions"
    >
      <Wand2 size={16} className="text-accent" />
      <span className="flex-1">
        <strong>{state.segments!.length} wall suggestions.</strong> Click a dashed line to include or skip it.
        Detection is approximate — fix anything with the wall tool.
      </span>
      <button className="btn-ghost h-9 min-h-0" onClick={state.discard}>
        Discard
      </button>
      <button className="btn-primary h-9 min-h-0" onClick={state.accept} disabled={!n}>
        Add {n} walls
      </button>
    </div>
  );
}
