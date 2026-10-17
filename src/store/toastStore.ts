import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error' | 'warn';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
  ttl: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => number;
  dismiss: (id: number) => void;
}

let seq = 1;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    const toast: Toast = { ttl: t.kind === 'error' ? 7000 : 4000, ...t, id };
    set({ toasts: [...get().toasts.slice(-3), toast] });
    if (toast.ttl > 0) setTimeout(() => get().dismiss(id), toast.ttl);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  info: (message: string, action?: Toast['action']) => useToasts.getState().push({ kind: 'info', message, action }),
  success: (message: string, action?: Toast['action']) =>
    useToasts.getState().push({ kind: 'success', message, action }),
  error: (message: string) => useToasts.getState().push({ kind: 'error', message }),
  warn: (message: string) => useToasts.getState().push({ kind: 'warn', message }),
};
