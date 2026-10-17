import { useEffect } from 'react';
import { createStore, get, set } from 'idb-keyval';
import { getBackend } from '../../persistence/index';
import { usePlan } from '../../store/planStore';
import { useSession } from '../../store/sessionStore';

const cache = createStore('wedding-seating-image-cache', 'images');

/** Resolve doc.backdrop.assetId into an object URL (cloud -> IndexedDB cache for offline use). */
export function useBackdropImage() {
  const assetId = usePlan((s) => s.doc?.backdrop?.assetId ?? null);
  const plan = useSession((s) => s.plan);
  useEffect(() => {
    if (!assetId || !plan) return;
    const current = useSession.getState().backdropUrl;
    if (current?.assetId === assetId) return;
    let cancelled = false;
    (async () => {
      let blob = await get<Blob>(assetId, cache).catch(() => undefined);
      if (!blob) {
        try {
          blob = await (await getBackend()).getAsset(plan.token, assetId);
          await set(assetId, blob, cache).catch(() => undefined);
        } catch {
          return;
        }
      }
      if (cancelled || !blob) return;
      const prev = useSession.getState().backdropUrl;
      if (prev) URL.revokeObjectURL(prev.url);
      useSession.getState().set({ backdropUrl: { assetId, url: URL.createObjectURL(blob) } });
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId, plan]);
}

export async function cacheImage(assetId: string, blob: Blob) {
  await set(assetId, blob, cache).catch(() => undefined);
}
