import type { PlanDoc } from '../model/types';
import type { OptimizerOptions, OptimizerResult } from './optimizer';

/** Run the optimizer in a Web Worker. Falls back to the main thread if workers are unavailable. */
export function runOptimizer(
  doc: PlanDoc,
  options: OptimizerOptions,
  onProgress: (p: number) => void,
): { promise: Promise<OptimizerResult>; cancel: () => void } {
  const input = {
    guests: Object.values(doc.guests).map((g) => ({
      id: g.id,
      groupId: g.groupId,
      partyId: g.partyId,
      locked: g.locked,
      tableId: g.tableId,
      seat: g.seat,
      rsvp: g.rsvp,
      firstName: g.firstName,
      lastName: g.lastName,
    })),
    tables: Object.values(doc.tables).map((t) => ({
      id: t.id,
      name: t.name,
      capacity: t.capacity,
      locked: t.locked,
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
      shape: t.shape,
    })),
    rules: Object.values(doc.rules),
    options,
  };
  let worker: Worker | null = null;
  const promise = new Promise<OptimizerResult>((resolve, reject) => {
    try {
      worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      import('./optimizer').then((m) => resolve(m.optimize(input, onProgress)), reject);
      return;
    }
    worker.onmessage = (e) => {
      const m = e.data as { type: string; p?: number; res?: OptimizerResult; message?: string };
      if (m.type === 'progress') onProgress(m.p!);
      else if (m.type === 'done') {
        resolve(m.res!);
        worker?.terminate();
      } else {
        reject(new Error(m.message));
        worker?.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(e.message || 'Optimizer failed'));
      worker?.terminate();
    };
    worker.postMessage(input);
  });
  return { promise, cancel: () => worker?.terminate() };
}
