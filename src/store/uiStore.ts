import { create } from 'zustand';

export type Tab = 'guests' | 'layout' | 'seating' | 'export';
export type Tool = 'select' | 'pan' | 'wall' | 'door' | 'window' | 'calibrate';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface DropTarget {
  tableId: string;
  seat: number | null;
}

interface UiState {
  tab: Tab;
  viewport: Viewport;
  /** Selected tables / floor elements on the canvas. */
  selection: string[];
  /** Guests picked for tap-to-assign / keyboard assign. */
  armed: string[];
  dropTarget: DropTarget | null;
  dragging: boolean;
  tool: Tool;
  focusGuestId: string | null;
  sidebarOpen: boolean;
  conflictsOpen: boolean;
  show3d: boolean;
  /** plan id whose canvas has been auto-fitted already */
  fittedPlanId: string | null;
  /** ask the canvas to centre on a world point (nonce makes repeated requests distinct) */
  centerOn: { x: number; y: number; zoom?: number; nonce: number } | null;
  /** auto-seat preview: assignments rendered instead of the real ones until accepted/discarded */
  preview: Record<string, { tableId: string; seat: number } | null> | null;
  set: (p: Partial<UiState>) => void;
}

export const useUi = create<UiState>((set) => ({
  tab: 'seating',
  viewport: { x: 0, y: 0, zoom: 0.4 },
  selection: [],
  armed: [],
  dropTarget: null,
  dragging: false,
  tool: 'select',
  focusGuestId: null,
  sidebarOpen: true,
  conflictsOpen: false,
  show3d: false,
  fittedPlanId: null,
  centerOn: null,
  preview: null,
  set: (p) => set(p),
}));

let nonce = 0;
export function centerOnPoint(x: number, y: number, zoom?: number) {
  useUi.getState().set({ centerOn: { x, y, zoom, nonce: ++nonce } });
}
