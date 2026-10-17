import { optimize, type OptimizerInput } from './optimizer';

self.onmessage = (e: MessageEvent<OptimizerInput>) => {
  try {
    let last = 0;
    const res = optimize(e.data, (p) => {
      if (p - last > 0.02 || p === 1) {
        last = p;
        self.postMessage({ type: 'progress', p });
      }
    });
    self.postMessage({ type: 'done', res });
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message });
  }
};
