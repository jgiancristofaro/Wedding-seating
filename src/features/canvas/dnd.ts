// Guest drag-and-drop shared by the guest list (HTML) and the canvas (SVG).
// Uses pointer events + elementFromPoint hit-testing so one code path covers mouse, pen and touch.
// Touch starts a drag only after a long-press so normal scrolling keeps working.
import { seatGuests, unseatGuests } from '../../store/actions';
import { getDoc } from '../../store/planStore';
import { useUi, type DropTarget } from '../../store/uiStore';

export interface DragPayload {
  guestIds: string[];
  label: string;
  withParty: boolean;
}

const MOVE_THRESHOLD = 5;
const LONG_PRESS_MS = 350;

let active: {
  payload: DragPayload;
  ghost: HTMLDivElement;
  target: DropTarget | 'unseat' | null;
} | null = null;

function makeGhost(label: string, count: number): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.className =
    'pointer-events-none fixed left-0 top-0 z-[100] flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink shadow-lift';
  el.style.willChange = 'transform';
  el.innerHTML = `<span class="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs text-accent-ink">${count}</span><span class="ghost-label"></span><span class="ghost-target text-xs text-muted"></span>`;
  (el.querySelector('.ghost-label') as HTMLElement).textContent = label;
  document.body.appendChild(el);
  return el;
}

function hitTest(x: number, y: number): DropTarget | 'unseat' | null {
  const el = document.elementFromPoint(x, y) as Element | null;
  if (!el) return null;
  const drop = el.closest('[data-drop]') as HTMLElement | SVGElement | null;
  if (!drop) return null;
  if (drop.getAttribute('data-drop') === 'unseat') return 'unseat';
  const tableId = drop.getAttribute('data-table');
  if (!tableId) return null;
  const seat = drop.getAttribute('data-seat');
  return { tableId, seat: seat != null ? Number(seat) : null };
}

function sameTarget(a: DropTarget | 'unseat' | null, b: DropTarget | 'unseat' | null) {
  if (a === b) return true;
  if (!a || !b || a === 'unseat' || b === 'unseat') return false;
  return a.tableId === b.tableId && a.seat === b.seat;
}

const preventTouch = (e: TouchEvent) => e.cancelable && e.preventDefault();

function start(payload: DragPayload, x: number, y: number) {
  const ghost = makeGhost(payload.label, payload.guestIds.length);
  active = { payload, ghost, target: null };
  useUi.getState().set({ dragging: true, armed: [] });
  document.addEventListener('touchmove', preventTouch, { passive: false });
  document.body.style.userSelect = 'none';
  move(x, y);
  navigator.vibrate?.(8);
}

function move(x: number, y: number) {
  if (!active) return;
  active.ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  const t = hitTest(x, y);
  if (!sameTarget(t, active.target)) {
    active.target = t;
    useUi.getState().set({ dropTarget: t && t !== 'unseat' ? t : null });
    const doc = getDoc();
    const label =
      t === 'unseat'
        ? '→ unseat'
        : t
          ? `→ ${doc.tables[t.tableId]?.name ?? ''}${t.seat != null ? `, seat ${t.seat + 1}` : ''}`
          : '';
    (active.ghost.querySelector('.ghost-target') as HTMLElement).textContent = label;
  }
}

function finish(commit: boolean) {
  if (!active) return;
  const { payload, target, ghost } = active;
  active = null;
  ghost.remove();
  document.removeEventListener('touchmove', preventTouch);
  document.body.style.userSelect = '';
  useUi.getState().set({ dragging: false, dropTarget: null });
  if (!commit || !target) return;
  if (target === 'unseat') unseatGuests(payload.guestIds);
  else seatGuests(payload.guestIds, target.tableId, target.seat, payload.withParty);
}

/**
 * Call from onPointerDown of a draggable guest. Returns nothing; if the pointer is released without dragging,
 * `onTap` is called instead (used for tap-to-assign).
 */
export function guestPointerDown(
  e: React.PointerEvent | PointerEvent,
  payload: DragPayload,
  onTap?: () => void,
) {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const sx = e.clientX;
  const sy = e.clientY;
  const touch = e.pointerType === 'touch';
  let started = false;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (touch) {
    timer = setTimeout(() => {
      if (!cancelled) {
        started = true;
        start(payload, sx, sy);
      }
    }, LONG_PRESS_MS);
  }
  const onMove = (ev: PointerEvent) => {
    if (started) {
      move(ev.clientX, ev.clientY);
      return;
    }
    const d = Math.hypot(ev.clientX - sx, ev.clientY - sy);
    if (touch) {
      if (d > 8) cleanup(); // user is scrolling
    } else if (d > MOVE_THRESHOLD) {
      started = true;
      start(payload, ev.clientX, ev.clientY);
    }
  };
  const onUp = (ev: PointerEvent) => {
    const wasStarted = started;
    cleanup();
    if (wasStarted) finish(ev.type === 'pointerup');
    else if (ev.type === 'pointerup') onTap?.();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      cleanup();
      finish(false);
    }
  };
  function cleanup() {
    cancelled = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', onKey);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);
}

export const isDragging = () => !!active;
