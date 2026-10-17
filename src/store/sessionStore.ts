import { create } from 'zustand';
import type { OpenedPlan } from '../persistence/session';

interface SessionState {
  plan: OpenedPlan | null;
  /** object URL for the floor plan image, keyed by asset id */
  backdropUrl: { assetId: string; url: string } | null;
  set: (p: Partial<SessionState>) => void;
}

export const useSession = create<SessionState>((set) => ({
  plan: null,
  backdropUrl: null,
  set: (p) => set(p),
}));
