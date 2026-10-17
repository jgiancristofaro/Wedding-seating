import { detectWalls } from './detect';

self.onmessage = (e: MessageEvent<{ width: number; height: number; data: Uint8ClampedArray }>) => {
  try {
    self.postMessage({ ok: true, segments: detectWalls(e.data) });
  } catch (err) {
    self.postMessage({ ok: false, message: (err as Error).message });
  }
};
