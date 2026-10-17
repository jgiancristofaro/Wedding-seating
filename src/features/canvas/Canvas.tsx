import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { normRect, rectsIntersect, rotate, snapAngle, snapTo, type Pt, type Rect } from '../../lib/geometry';
import { gridSize } from '../../lib/units';
import { isSegment } from '../../model/factory';
import { fullName } from '../../model/names';
import { tableReach } from '../../model/seats';
import { planIndex } from '../../model/selectors';
import type { FloorElement, PlanDoc, Table } from '../../model/types';
import { detectConflicts } from '../../rules/conflicts';
import {
  addElement,
  addSegments,
  addTable,
  deleteItems,
  duplicateItems,
  moveItems,
  seatGuests,
  unseatGuests,
  updateElement,
  updateTable,
} from '../../store/actions';
import { usePlan } from '../../store/planStore';
import { useSession } from '../../store/sessionStore';
import { toast } from '../../store/toastStore';
import { useUi, type Viewport } from '../../store/uiStore';
import { contentBounds, fitViewport, zoomAt } from './bounds';
import { guestPointerDown } from './dnd';
import { ElementNode } from './ElementNode';
import { Minimap } from './Minimap';
import { TableNode } from './TableNode';
import type { ElementKind, TableShape } from '../../model/types';

export interface CanvasProps {
  mode: 'seating' | 'layout';
  doc: PlanDoc;
  readOnly: boolean;
  /** extra world-space SVG content rendered above everything */
  overlay?: ReactNode;
  /** called on clicks while a custom tool (calibrate) is active */
  onToolClick?: (p: Pt) => void;
}

type Override = Partial<Table> & Partial<FloorElement>;
type Guide = { x?: number; y?: number };
type Gesture =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { type: 'pinch'; d0: number; mid0: Pt; v0: Viewport }
  | {
      type: 'move';
      ids: string[];
      start: Pt;
      origin: Record<string, Override>;
      primary: string;
      moved: boolean;
    }
  | { type: 'marquee'; start: Pt; add: boolean; moved: boolean }
  | { type: 'rotate'; id: string; c: Pt }
  | { type: 'resize'; id: string }
  | { type: 'endpoint'; id: string; which: 'p1' | 'p2' };
type Tap =
  | { kind: 'seat'; tableId: string; seat: number; guestId: string | null }
  | { kind: 'item'; id: string; itemKind: 'table' | 'element' }
  | { kind: 'background' };

const lodZoom = (z: number) => (z < 0.22 ? 0.2 : z < 0.27 ? 0.25 : z < 0.76 ? 0.5 : 1);
const HANDLE_PX = 10;

export function Canvas({ mode, doc, readOnly, overlay, onToolClick }: CanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const vp = useUi((s) => s.viewport);
  const selection = useUi((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const armed = useUi((s) => s.armed);
  const dropTarget = useUi((s) => s.dropTarget);
  const focusGuestId = useUi((s) => s.focusGuestId);
  const centerOn = useUi((s) => s.centerOn);
  const planId = usePlan((s) => s.planId);
  const backdropUrl = useSession((s) => s.backdropUrl);
  const [over, setOver] = useState<Record<string, Override>>({});
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [draw, setDraw] = useState<{ start: Pt | null; cur: Pt | null }>({ start: null, cur: null });
  const gesture = useRef<Gesture | null>(null);
  const tap = useRef<Tap | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const spaceDown = useRef(false);
  const editable = !readOnly;
  const grid = gridSize(doc.settings.units);
  const layers = doc.settings.layers;

  const setVp = useCallback((v: Viewport) => useUi.getState().set({ viewport: v }), []);

  // ---- size + first fit
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!size.w || !planId) return;
    if (useUi.getState().fittedPlanId !== planId) {
      setVp(fitViewport(contentBounds(doc), size.w, size.h));
      useUi.getState().set({ fittedPlanId: planId });
    }
  }, [size.w, size.h, planId, doc, setVp]);
  useEffect(() => {
    if (!centerOn || !size.w) return;
    const z = centerOn.zoom ?? Math.max(useUi.getState().viewport.zoom, 0.8);
    setVp({ zoom: z, x: size.w / 2 - centerOn.x * z, y: size.h / 2 - centerOn.y * z });
  }, [centerOn, size.w, size.h, setVp]);

  // ---- derived
  const index = planIndex(doc);
  const report = detectConflicts(doc);
  const tables = useMemo(() => Object.values(doc.tables), [doc.tables]);
  const elements = useMemo(() => Object.values(doc.elements), [doc.elements]);
  const merged = (t: Table) => (over[t.id] ? { ...t, ...over[t.id] } : t);
  const mergedEl = (e: FloorElement) => (over[e.id] ? { ...e, ...over[e.id] } : e);
  const armedTables = useMemo(
    () => new Set(armed.map((id) => doc.guests[id]?.tableId).filter(Boolean)),
    [armed, doc.guests],
  );

  // ---- coordinate helpers
  const toWorld = useCallback((cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = useUi.getState().viewport;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }, []);

  const wallEndpoints = useMemo(() => {
    const pts: Pt[] = [];
    for (const e of elements)
      if (e.kind === 'wall' && e.x2 != null && e.y2 != null)
        pts.push({ x: e.x, y: e.y }, { x: e.x2, y: e.y2 });
    return pts;
  }, [elements]);

  const snapPoint = useCallback(
    (p: Pt, from: Pt | null, free: boolean): Pt => {
      const z = useUi.getState().viewport.zoom;
      const near = wallEndpoints.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < 16 / z);
      if (near) return near;
      if (free) return p;
      if (from) {
        const a = snapAngle(from, p, 15);
        const len = Math.hypot(a.x - from.x, a.y - from.y);
        const L = snapTo(len, doc.settings.snap ? grid / 2 : 5);
        const k = len ? L / len : 0;
        return { x: from.x + (a.x - from.x) * k, y: from.y + (a.y - from.y) * k };
      }
      return doc.settings.snap ? { x: snapTo(p.x, grid / 2), y: snapTo(p.y, grid / 2) } : p;
    },
    [wallEndpoints, doc.settings.snap, grid],
  );

  // ---- wheel zoom / pan (non-passive)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const v = useUi.getState().viewport;
      const isMouseWheel =
        e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && Number.isInteger(e.deltaY));
      if (e.ctrlKey || e.metaKey || isMouseWheel) {
        const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.0018));
        setVp(zoomAt(v, f, e.clientX - r.left, e.clientY - r.top));
      } else {
        setVp({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [setVp]);

  // space-to-pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,textarea,select,button')) {
        spaceDown.current = true;
        if (wrapRef.current) wrapRef.current.style.cursor = 'grab';
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        if (wrapRef.current) wrapRef.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // reset drawing when tool changes
  useEffect(() => setDraw({ start: null, cur: null }), [tool]);

  // ---- taps
  const handleTap = useCallback(
    (t: Tap) => {
      const ui = useUi.getState();
      if (t.kind === 'background') {
        ui.set({ selection: [], focusGuestId: null, armed: [] });
        return;
      }
      if (t.kind === 'seat') {
        if (ui.armed.length && editable) {
          if (seatGuests(ui.armed, t.tableId, t.seat)) ui.set({ armed: [], focusGuestId: ui.armed[0] });
          return;
        }
        if (t.guestId) ui.set({ focusGuestId: t.guestId, selection: [] });
        else ui.set({ selection: [t.tableId], focusGuestId: null });
        return;
      }
      if (t.kind === 'item' && t.itemKind === 'table' && ui.armed.length && editable && mode === 'seating') {
        if (seatGuests(ui.armed, t.id, null)) ui.set({ armed: [], focusGuestId: ui.armed[0] });
      }
    },
    [editable, mode],
  );

  // ---- pointer handling
  const startPan = (e: React.PointerEvent) => {
    const v = useUi.getState().viewport;
    gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    wrapRef.current?.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        type: 'pinch',
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        v0: useUi.getState().viewport,
      };
      tap.current = null;
      setOver({});
      setGuides([]);
      setMarquee(null);
      return;
    }
    if (pointers.current.size > 2) return;
    const target = e.target as Element;
    const world = toWorld(e.clientX, e.clientY);
    tap.current = null;

    if (e.button === 1 || spaceDown.current || tool === 'pan') {
      startPan(e);
      return;
    }
    if (editable && (tool === 'wall' || tool === 'door' || tool === 'window')) {
      const p = snapPoint(world, draw.start, e.altKey);
      if (!draw.start) setDraw({ start: p, cur: p });
      else {
        if (Math.hypot(p.x - draw.start.x, p.y - draw.start.y) > 10)
          addSegments(tool, [{ x: draw.start.x, y: draw.start.y, x2: p.x, y2: p.y }]);
        setDraw({ start: tool === 'wall' ? p : null, cur: p });
      }
      return;
    }
    if (tool === 'calibrate') {
      onToolClick?.(world);
      return;
    }

    const handle = target.closest('[data-handle]');
    if (handle && editable) {
      const id = handle.getAttribute('data-id')!;
      const kind = handle.getAttribute('data-handle')!;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      if (kind === 'rotate') {
        const it = doc.tables[id] ?? doc.elements[id];
        gesture.current = { type: 'rotate', id, c: { x: it.x, y: it.y } };
      } else if (kind === 'resize') gesture.current = { type: 'resize', id };
      else gesture.current = { type: 'endpoint', id, which: kind as 'p1' | 'p2' };
      return;
    }

    const seatEl = target.closest('[data-seat]');
    const itemEl = target.closest('[data-item]');
    if (seatEl && mode === 'seating') {
      const tableId = seatEl.getAttribute('data-table')!;
      const seat = Number(seatEl.getAttribute('data-seat'));
      const guestId = seatEl.getAttribute('data-guest');
      if (guestId && editable && doc.guests[guestId]) {
        if (e.pointerType === 'touch') startPan(e);
        const g = doc.guests[guestId];
        guestPointerDown(e, { guestIds: [guestId], label: fullName(g), withParty: false }, () => {
          gesture.current = null;
          handleTap({ kind: 'seat', tableId, seat, guestId });
        });
        return;
      }
      tap.current = { kind: 'seat', tableId, seat, guestId };
      if (!editable || e.pointerType === 'touch') {
        startPan(e);
        return;
      }
    }
    if (itemEl) {
      const id = itemEl.getAttribute('data-item')!;
      const itemKind = itemEl.getAttribute('data-kind') as 'table' | 'element';
      if (!tap.current) tap.current = { kind: 'item', id, itemKind };
      const sel = useUi.getState().selection;
      const isSel = sel.includes(id);
      const canMove = editable && (mode === 'layout' || itemKind === 'table');
      if (!canMove || (e.pointerType === 'touch' && !isSel)) {
        if (canMove && tap.current.kind === 'item')
          useUi.getState().set({ selection: [id], focusGuestId: null });
        startPan(e);
        return;
      }
      let next = sel;
      if (e.shiftKey || e.metaKey) next = isSel ? sel.filter((x) => x !== id) : [...sel, id];
      else if (!isSel) next = [id];
      useUi.getState().set({ selection: next, focusGuestId: null });
      const ids = next.filter((x) => (doc.tables[x] && !doc.tables[x].locked) || doc.elements[x]);
      if (!ids.includes(id)) return;
      const origin: Record<string, Override> = {};
      for (const x of ids) {
        const it = doc.tables[x] ?? doc.elements[x];
        origin[x] = { x: it.x, y: it.y, x2: doc.elements[x]?.x2, y2: doc.elements[x]?.y2 };
      }
      gesture.current = { type: 'move', ids, start: world, origin, primary: id, moved: false };
      return;
    }
    // background
    tap.current = { kind: 'background' };
    if (editable && ((mode === 'layout' && tool === 'select' && e.pointerType !== 'touch') || e.shiftKey)) {
      gesture.current = { type: 'marquee', start: world, add: e.shiftKey, moved: false };
    } else startPan(e);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if ((tool === 'wall' || tool === 'door' || tool === 'window') && draw.start) {
      setDraw((d) => ({ ...d, cur: snapPoint(toWorld(e.clientX, e.clientY), d.start, e.altKey) }));
    }
    if (!g || useUi.getState().dragging) return;
    const world = toWorld(e.clientX, e.clientY);
    const z = useUi.getState().viewport.zoom;
    switch (g.type) {
      case 'pinch': {
        if (pointers.current.size < 2) return;
        const [a, b] = [...pointers.current.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const r = svgRef.current!.getBoundingClientRect();
        const zoomed = zoomAt(g.v0, d / g.d0, g.mid0.x - r.left, g.mid0.y - r.top);
        setVp({ ...zoomed, x: zoomed.x + mid.x - g.mid0.x, y: zoomed.y + mid.y - g.mid0.y });
        return;
      }
      case 'pan': {
        const dx = e.clientX - g.sx;
        const dy = e.clientY - g.sy;
        if (!g.moved && Math.hypot(dx, dy) < 4) return;
        g.moved = true;
        tap.current = null;
        setVp({ ...useUi.getState().viewport, x: g.vx + dx, y: g.vy + dy });
        return;
      }
      case 'marquee': {
        if (!g.moved && Math.hypot(world.x - g.start.x, world.y - g.start.y) * z < 4) return;
        g.moved = true;
        tap.current = null;
        setMarquee(normRect(g.start.x, g.start.y, world.x, world.y));
        return;
      }
      case 'move': {
        let dx = world.x - g.start.x;
        let dy = world.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) * z < 4) return;
        if (!g.moved) (e.target as Element).setPointerCapture?.(e.pointerId);
        g.moved = true;
        tap.current = null;
        const o = g.origin[g.primary];
        const px = o.x! + dx;
        const py = o.y! + dy;
        const thr = 8 / z;
        const gs: Guide[] = [];
        let gx: number | null = null;
        let gy: number | null = null;
        for (const t of tables) {
          if (g.ids.includes(t.id)) continue;
          if (gx == null && Math.abs(t.x - px) < thr) gx = t.x;
          if (gy == null && Math.abs(t.y - py) < thr) gy = t.y;
        }
        if (gx != null) {
          dx = gx - o.x!;
          gs.push({ x: gx });
        } else if (doc.settings.snap && !e.altKey) dx = snapTo(px, grid / 2) - o.x!;
        if (gy != null) {
          dy = gy - o.y!;
          gs.push({ y: gy });
        } else if (doc.settings.snap && !e.altKey) dy = snapTo(py, grid / 2) - o.y!;
        const next: Record<string, Override> = {};
        for (const id of g.ids) {
          const s = g.origin[id];
          next[id] = { x: s.x! + dx, y: s.y! + dy };
          if (s.x2 != null) Object.assign(next[id], { x2: s.x2 + dx, y2: s.y2! + dy });
        }
        setOver(next);
        setGuides(gs);
        return;
      }
      case 'rotate': {
        let a = (Math.atan2(world.y - g.c.y, world.x - g.c.x) * 180) / Math.PI + 90;
        if (!e.altKey) a = snapTo(a, 15);
        a = ((a % 360) + 360) % 360;
        setOver({ [g.id]: { rotation: Math.round(a) } });
        return;
      }
      case 'resize': {
        const it = doc.tables[g.id] ?? doc.elements[g.id];
        const local = rotate({ x: world.x - it.x, y: world.y - it.y }, -it.rotation);
        const step = doc.settings.snap && !e.altKey ? 5 : 1;
        let w = Math.max(40, snapTo(Math.abs(local.x) * 2, step));
        let h = Math.max(30, snapTo(Math.abs(local.y) * 2, step));
        const t = doc.tables[g.id];
        if (
          (t && (t.shape === 'round' || t.shape === 'square')) ||
          (!t && doc.elements[g.id]?.kind === 'cake')
        )
          w = h = Math.max(w, h);
        if (t?.shape === 'round') w = h = Math.max(60, Math.hypot(local.x, local.y) * 2);
        if (t) {
          w = Math.min(w, 1500);
          h = Math.min(h, 600);
        }
        setOver({ [g.id]: { w: Math.round(w), h: Math.round(h) } });
        return;
      }
      case 'endpoint': {
        const e0 = doc.elements[g.id];
        const fixed = g.which === 'p1' ? { x: e0.x2!, y: e0.y2! } : { x: e0.x, y: e0.y };
        const p = snapPoint(world, fixed, e.altKey);
        setOver({ [g.id]: g.which === 'p1' ? { x: p.x, y: p.y } : { x2: p.x, y2: p.y } });
        return;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.type === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    if (g?.type === 'move' && g.moved) {
      const moves = g.ids.map((id) => ({ id, ...over[id] })).filter((m) => m.x != null) as {
        id: string;
        x: number;
        y: number;
        x2?: number;
        y2?: number;
      }[];
      if (moves.length) moveItems(moves);
    } else if (g?.type === 'marquee' && g.moved && marquee) {
      const hits = [
        ...tables.filter((t) => {
          const r = tableReach(t);
          return rectsIntersect(marquee, { x: t.x - r, y: t.y - r, w: 2 * r, h: 2 * r });
        }),
        ...(mode === 'layout'
          ? elements.filter((el) => {
              const b =
                el.x2 != null
                  ? normRect(el.x, el.y, el.x2, el.y2!)
                  : { x: el.x - el.w / 2, y: el.y - el.h / 2, w: el.w, h: el.h };
              return rectsIntersect(marquee, b);
            })
          : []),
      ].map((x) => x.id);
      const cur = useUi.getState().selection;
      useUi.getState().set({ selection: g.add ? [...new Set([...cur, ...hits])] : hits });
    } else if (g?.type === 'rotate' || g?.type === 'resize' || g?.type === 'endpoint') {
      const o = over[g.id];
      if (o) {
        if (doc.tables[g.id]) updateTable(g.id, o as Partial<Table>);
        else updateElement(g.id, o as Partial<FloorElement>);
      }
    }
    setOver({});
    setGuides([]);
    setMarquee(null);
    const t = tap.current;
    tap.current = null;
    if (t && e.type === 'pointerup' && !(g && 'moved' in g && g.moved)) handleTap(t);
  };

  // ---- keyboard
  const onKeyDown = (e: React.KeyboardEvent) => {
    const ui = useUi.getState();
    const target = e.target as Element;
    const seatEl = target.closest?.('[data-seat]');
    const tableEl = target.closest?.('[data-kind="table"]');
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (draw.start) setDraw({ start: null, cur: null });
      else if (ui.tool !== 'select') ui.set({ tool: 'select' });
      else ui.set({ selection: [], armed: [], focusGuestId: null });
      return;
    }
    if (e.key === 'Enter' && draw.start) {
      setDraw({ start: null, cur: null });
      return;
    }
    if (
      (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
      (seatEl || (tableEl && !ui.selection.length))
    ) {
      e.preventDefault();
      const tEl = (seatEl?.closest('[data-kind="table"]') ?? tableEl) as SVGGElement | null;
      if (!tEl) return;
      const seats = [...tEl.querySelectorAll<SVGGElement>('[data-seat]')];
      const cur = seatEl ? seats.indexOf(seatEl as SVGGElement) : -1;
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      seats[(cur + dir + seats.length) % seats.length]?.focus();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && (seatEl || tableEl)) {
      e.preventDefault();
      if (seatEl) {
        const tableId = seatEl.getAttribute('data-table')!;
        const seat = Number(seatEl.getAttribute('data-seat'));
        const guestId = seatEl.getAttribute('data-guest');
        if (ui.armed.length && editable) handleTap({ kind: 'seat', tableId, seat, guestId: null });
        else if (guestId && editable) {
          ui.set({ armed: [guestId], focusGuestId: guestId });
          toast.info(`Picked up ${fullName(doc.guests[guestId])}. Choose a seat and press Enter.`);
        } else handleTap({ kind: 'seat', tableId, seat, guestId });
      } else if (tableEl) {
        const id = tableEl.getAttribute('data-item')!;
        if (ui.armed.length && editable) handleTap({ kind: 'item', id, itemKind: 'table' });
        else ui.set({ selection: [id] });
      }
      return;
    }
    if (!editable) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && seatEl?.getAttribute('data-guest')) {
      unseatGuests([seatEl.getAttribute('data-guest')!]);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selection.length) {
      e.preventDefault();
      deleteItems(ui.selection);
      return;
    }
    if (mod && e.key.toLowerCase() === 'd' && ui.selection.length) {
      e.preventDefault();
      duplicateItems(ui.selection);
      return;
    }
    if (e.key.startsWith('Arrow') && ui.selection.length) {
      e.preventDefault();
      const step = (e.shiftKey ? 5 : 1) * (doc.settings.snap ? grid / 2 : 5);
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      moveItems(
        ui.selection
          .map((id) => {
            const it = doc.tables[id] ?? doc.elements[id];
            if (!it || (doc.tables[id]?.locked ?? false)) return null;
            const el = doc.elements[id] ?? {};
            return {
              id,
              x: it.x + dx,
              y: it.y + dy,
              x2: el.x2 != null ? el.x2 + dx : undefined,
              y2: el.y2 != null ? el.y2 + dy : undefined,
            };
          })
          .filter((m): m is NonNullable<typeof m> => !!m),
      );
      return;
    }
    if (e.key === 'r' && ui.selection.length === 1) {
      const t = doc.tables[ui.selection[0]];
      if (t) updateTable(t.id, { rotation: (t.rotation + (e.shiftKey ? -15 : 15) + 360) % 360 });
      const el = doc.elements[ui.selection[0]];
      if (el && !isSegment(el.kind)) updateElement(el.id, { rotation: (el.rotation + 15) % 360 });
      return;
    }
    if (e.key === '+' || e.key === '=') setVp(zoomAt(vp, 1.2, size.w / 2, size.h / 2));
    if (e.key === '-') setVp(zoomAt(vp, 1 / 1.2, size.w / 2, size.h / 2));
    if (e.key === '0') setVp(fitViewport(contentBounds(doc), size.w, size.h));
  };

  // ---- palette drops (HTML5 drag from the layout palette)
  const onDrop = (e: React.DragEvent) => {
    const data = e.dataTransfer.getData('application/x-ws-item');
    if (!data || !editable) return;
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY);
    const [kind, value] = data.split(':');
    const pt = doc.settings.snap ? { x: snapTo(p.x, grid / 2), y: snapTo(p.y, grid / 2) } : p;
    if (kind === 'table') addTable(value as TableShape, pt.x, pt.y);
    else useUi.getState().set({ selection: [addElement(value as ElementKind, pt.x, pt.y)] });
  };

  // ---- render helpers
  const z = vp.zoom;
  const lz = lodZoom(z);
  const view = { x: -vp.x / z, y: -vp.y / z, w: size.w / z, h: size.h / z };
  const gridStep = grid * (grid * z < 7 ? 10 : 1);
  const dropSeatFor = (tid: string) => (dropTarget?.tableId === tid ? (dropTarget.seat ?? -1) : null);
  const singleSel = selection.length === 1 && editable ? selection[0] : null;
  const selTable = singleSel && doc.tables[singleSel] ? merged(doc.tables[singleSel]) : null;
  const selEl = singleSel && doc.elements[singleSel] ? mergedEl(doc.elements[singleSel]) : null;
  const hr = HANDLE_PX / z;
  const backdrop = doc.backdrop;
  const showImage = layers !== 'vector' && backdrop && backdropUrl?.assetId === backdrop.assetId;
  const showVectors = layers !== 'image';
  const cursor =
    tool === 'wall' || tool === 'door' || tool === 'window' || tool === 'calibrate'
      ? 'crosshair'
      : tool === 'pan'
        ? 'grab'
        : 'default';

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-canvas outline-none"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onDragOver={(e) => e.dataTransfer.types.includes('application/x-ws-item') && e.preventDefault()}
      onDrop={onDrop}
      data-testid="canvas"
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor }}
        role="application"
        aria-label={`${mode === 'seating' ? 'Seating' : 'Floor plan'} canvas. Tab to a table, use arrow keys to move between seats and Enter to seat the selected guest.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => draw.start && setDraw({ start: null, cur: null })}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
            <path
              d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
              fill="none"
              className="stroke-grid"
              strokeWidth={1 / z}
            />
          </pattern>
          <pattern id="dance" width={60} height={60} patternUnits="userSpaceOnUse">
            <rect width={60} height={60} className="fill-surface" />
            <rect width={30} height={30} className="fill-sunken" />
            <rect x={30} y={30} width={30} height={30} className="fill-sunken" />
          </pattern>
        </defs>
        <g transform={`translate(${vp.x} ${vp.y}) scale(${z})`}>
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#grid)" />
          {showImage && (
            <image
              href={backdropUrl!.url}
              x={backdrop!.x}
              y={backdrop!.y}
              width={backdrop!.natW * backdrop!.cmPerPx}
              height={backdrop!.natH * backdrop!.cmPerPx}
              opacity={backdrop!.opacity}
              preserveAspectRatio="none"
              className="pointer-events-none"
            />
          )}
          {showVectors &&
            elements.map((el) => (
              <ElementNode
                key={el.id}
                e={mergedEl(el)}
                selected={selection.includes(el.id)}
                interactive={mode === 'layout' && editable}
              />
            ))}
          {tables.map((t) => (
            <TableNode
              key={t.id}
              table={merged(t)}
              seats={index.seating.get(t.id)}
              groups={doc.groups}
              conflicts={report.byTable.get(t.id)}
              guestConflicts={report.byGuest}
              selected={selection.includes(t.id)}
              dropSeat={dropSeatFor(t.id)}
              highlightGuest={
                focusGuestId && doc.guests[focusGuestId]?.tableId === t.id ? focusGuestId : null
              }
              armed={armedTables.has(t.id)}
              zoom={lz}
              showNames={doc.settings.showNames}
              dimmed={false}
            />
          ))}

          {/* guides */}
          {guides.map((g, i) =>
            g.x != null ? (
              <line
                key={i}
                x1={g.x}
                x2={g.x}
                y1={view.y}
                y2={view.y + view.h}
                className="stroke-accent"
                strokeWidth={1.5 / z}
                strokeDasharray={`${6 / z} ${4 / z}`}
              />
            ) : (
              <line
                key={i}
                y1={g.y}
                y2={g.y}
                x1={view.x}
                x2={view.x + view.w}
                className="stroke-accent"
                strokeWidth={1.5 / z}
                strokeDasharray={`${6 / z} ${4 / z}`}
              />
            ),
          )}
          {marquee && (
            <rect
              {...marquee}
              className="fill-accent/10 stroke-accent"
              strokeWidth={1 / z}
              strokeDasharray={`${4 / z} ${3 / z}`}
            />
          )}

          {/* selection handles */}
          {selTable && !selTable.locked && (
            <g transform={`translate(${selTable.x} ${selTable.y}) rotate(${selTable.rotation})`}>
              <line
                x1={0}
                y1={-tableReach(selTable) + 20}
                x2={0}
                y2={-tableReach(selTable) - 30}
                className="stroke-accent"
                strokeWidth={2 / z}
              />
              <circle
                data-handle="rotate"
                data-id={selTable.id}
                cy={-tableReach(selTable) - 30}
                r={hr}
                className="cursor-grab fill-surface stroke-accent"
                strokeWidth={2.5 / z}
              >
                <title>Rotate (hold Alt for free rotation)</title>
              </circle>
              <rect
                data-handle="resize"
                data-id={selTable.id}
                x={(selTable.shape === 'round' ? (selTable.w / 2) * Math.SQRT1_2 : selTable.w / 2) - hr}
                y={(selTable.shape === 'round' ? (selTable.w / 2) * Math.SQRT1_2 : selTable.h / 2) - hr}
                width={hr * 2}
                height={hr * 2}
                rx={3 / z}
                className="cursor-nwse-resize fill-accent stroke-surface"
                strokeWidth={2 / z}
              >
                <title>Resize</title>
              </rect>
            </g>
          )}
          {selEl && isSegment(selEl.kind) && (
            <g>
              <circle
                data-handle="p1"
                data-id={selEl.id}
                cx={selEl.x}
                cy={selEl.y}
                r={hr}
                className="cursor-move fill-surface stroke-accent"
                strokeWidth={2.5 / z}
              />
              <circle
                data-handle="p2"
                data-id={selEl.id}
                cx={selEl.x2}
                cy={selEl.y2}
                r={hr}
                className="cursor-move fill-surface stroke-accent"
                strokeWidth={2.5 / z}
              />
            </g>
          )}
          {selEl && !isSegment(selEl.kind) && (
            <g transform={`translate(${selEl.x} ${selEl.y}) rotate(${selEl.rotation})`}>
              <rect
                x={-selEl.w / 2}
                y={-selEl.h / 2}
                width={selEl.w}
                height={selEl.h}
                fill="none"
                className="stroke-accent"
                strokeWidth={1.5 / z}
                strokeDasharray={`${5 / z} ${4 / z}`}
              />
              <circle
                data-handle="rotate"
                data-id={selEl.id}
                cy={-selEl.h / 2 - 40 / z}
                r={hr}
                className="cursor-grab fill-surface stroke-accent"
                strokeWidth={2.5 / z}
              />
              <rect
                data-handle="resize"
                data-id={selEl.id}
                x={selEl.w / 2 - hr}
                y={selEl.h / 2 - hr}
                width={hr * 2}
                height={hr * 2}
                rx={3 / z}
                className="cursor-nwse-resize fill-accent stroke-surface"
                strokeWidth={2 / z}
              />
            </g>
          )}

          {/* wall drawing preview */}
          {draw.start && draw.cur && (
            <g className="pointer-events-none">
              <line
                x1={draw.start.x}
                y1={draw.start.y}
                x2={draw.cur.x}
                y2={draw.cur.y}
                className="stroke-accent"
                strokeWidth={tool === 'wall' ? 15 : 10}
                strokeOpacity={0.6}
                strokeLinecap="square"
              />
              <circle cx={draw.start.x} cy={draw.start.y} r={6 / z} className="fill-accent" />
              <text
                x={(draw.start.x + draw.cur.x) / 2}
                y={(draw.start.y + draw.cur.y) / 2 - 14 / z}
                fontSize={13 / z}
                textAnchor="middle"
                className="fill-accent font-semibold"
                style={{ paintOrder: 'stroke', stroke: 'rgb(var(--canvas))', strokeWidth: 4 / z }}
              >
                {formatLen(
                  Math.hypot(draw.cur.x - draw.start.x, draw.cur.y - draw.start.y),
                  doc.settings.units,
                )}
              </text>
            </g>
          )}
          {overlay}
        </g>
      </svg>

      {/* zoom controls + minimap */}
      <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-2">
        <Minimap doc={doc} size={size} />
        <div className="pointer-events-auto flex items-center rounded-xl border border-line bg-surface/95 shadow-soft">
          <button
            className="icon-btn h-11 w-11"
            aria-label="Zoom out"
            onClick={() => setVp(zoomAt(vp, 1 / 1.25, size.w / 2, size.h / 2))}
          >
            <Minus size={16} />
          </button>
          <button
            className="min-w-[3.5rem] text-xs font-medium text-muted"
            onClick={() => setVp(zoomAt(vp, 1 / vp.zoom, size.w / 2, size.h / 2))}
            title="Reset to 100%"
            aria-label="Reset zoom"
          >
            {Math.round(vp.zoom * 100)}%
          </button>
          <button
            className="icon-btn h-11 w-11"
            aria-label="Zoom in"
            onClick={() => setVp(zoomAt(vp, 1.25, size.w / 2, size.h / 2))}
          >
            <Plus size={16} />
          </button>
          <button
            className="icon-btn h-11 w-11 border-l border-line"
            aria-label="Fit everything in view"
            title="Fit to screen (0)"
            onClick={() => setVp(fitViewport(contentBounds(doc), size.w, size.h))}
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatLen(cm: number, units: 'ft' | 'm') {
  return units === 'm' ? `${(cm / 100).toFixed(2)} m` : `${(cm / 30.48).toFixed(1)} ft`;
}
