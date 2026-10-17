import { useCallback, useState } from 'react';
import type { Segment } from '../../floorplan/detect';
import { addSegments } from '../../store/actions';
import { usePlan } from '../../store/planStore';
import { useSession } from '../../store/sessionStore';
import { toast } from '../../store/toastStore';
import { useUi } from '../../store/uiStore';

interface Suggestion {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  on: boolean;
}

function detectInWorker(img: ImageData): Promise<Segment[]> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(new URL('../../floorplan/detect.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      import('../../floorplan/detect').then((m) => resolve(m.detectWalls(img)), reject);
      return;
    }
    w.onmessage = (e) => {
      w.terminate();
      if (e.data.ok) resolve(e.data.segments);
      else reject(new Error(e.data.message));
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message));
    };
    w.postMessage({ width: img.width, height: img.height, data: img.data }, [img.data.buffer]);
  });
}

export function useDetection() {
  const [busy, setBusy] = useState(false);
  const [segments, setSegments] = useState<Suggestion[] | null>(null);

  const run = useCallback(async () => {
    const b = usePlan.getState().doc?.backdrop;
    const url = useSession.getState().backdropUrl;
    if (!b || !url) {
      toast.warn('Upload a floor plan image first.');
      return;
    }
    setBusy(true);
    try {
      const { imageDataFromUrl } = await import('../../floorplan/imageLoad');
      const { data, scale } = await imageDataFromUrl(url.url, 1000);
      const segs = await detectInWorker(data);
      const k = b.cmPerPx / scale;
      const out = segs.map((s) => ({
        x1: b.x + s.x1 * k,
        y1: b.y + s.y1 * k,
        x2: b.x + s.x2 * k,
        y2: b.y + s.y2 * k,
        on: true,
      }));
      if (!out.length)
        toast.info('No clear walls found. Use the Wall tool to trace them — it snaps to corners.');
      setSegments(out.length ? out : null);
    } catch {
      toast.error('Wall detection failed on this image. You can still trace walls by hand.');
    } finally {
      setBusy(false);
    }
  }, []);

  const toggle = useCallback(
    (i: number) => setSegments((s) => s && s.map((x, j) => (j === i ? { ...x, on: !x.on } : x))),
    [],
  );
  const discard = useCallback(() => setSegments(null), []);
  const accept = useCallback(() => {
    if (!segments) return;
    const chosen = segments.filter((s) => s.on).map((s) => ({ x: s.x1, y: s.y1, x2: s.x2, y2: s.y2 }));
    addSegments('wall', chosen);
    toast.success(`Added ${chosen.length} walls. Drag their ends to fine-tune.`);
    setSegments(null);
  }, [segments]);

  return { busy, segments, run, toggle, discard, accept };
}

export function DetectionOverlay({ state }: { state: ReturnType<typeof useDetection> }) {
  const z = useUi((s) => s.viewport.zoom);
  if (!state.segments) return null;
  return (
    <g>
      {state.segments.map((s, i) => (
        <g
          key={i}
          onClick={() => state.toggle(i)}
          className="cursor-pointer"
          role="checkbox"
          aria-checked={s.on}
          aria-label={`Suggested wall ${i + 1}`}
        >
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth={24 / z} />
          <line
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            className={s.on ? 'stroke-accent' : 'stroke-muted'}
            strokeOpacity={s.on ? 0.9 : 0.35}
            strokeWidth={(s.on ? 5 : 3) / z}
            strokeDasharray={`${10 / z} ${6 / z}`}
          />
        </g>
      ))}
    </g>
  );
}
