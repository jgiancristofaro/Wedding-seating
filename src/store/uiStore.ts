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
  set: (p) => set(p),
}));
