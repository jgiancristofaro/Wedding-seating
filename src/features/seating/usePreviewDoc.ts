import { useMemo } from 'react';
import type { PlanDoc } from '../../model/types';
import { usePlan } from '../../store/planStore';
import { useUi } from '../../store/uiStore';

/** The document as displayed: the real one, or with auto-seat preview assignments applied. */
export function useDisplayDoc(): PlanDoc {
  const doc = usePlan((s) => s.doc!);
  const preview = useUi((s) => s.preview);
  return useMemo(() => {
    if (!preview) return doc;
    const guests = { ...doc.guests };
    for (const [id, a] of Object.entries(preview)) {
      if (guests[id]) guests[id] = { ...guests[id], tableId: a?.tableId ?? null, seat: a?.seat ?? null };
    }
    return { ...doc, guests };
  }, [doc, preview]);
}
