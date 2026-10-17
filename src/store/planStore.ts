import { applyPatches, enablePatches, produce, type Patch } from 'immer';
import { create } from 'zustand';
import type { PlanDoc, Role } from '../model/types';

enablePatches();

const HISTORY_LIMIT = 50;

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  /** consecutive edits with the same key within a short window collapse into one undo step (typing) */
  key?: string;
  at: number;
}

export interface PlanState {
  doc: PlanDoc | null;
  role: Role;
  planId: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Bumped on every local edit (used by the sync engine). */
  localRevision: number;
}

export const usePlan = create<PlanState>(() => ({
  doc: null,
  role: 'edit',
  planId: null,
  past: [],
  future: [],
  localRevision: 0,
}));

export const getDoc = (): PlanDoc => {
  const d = usePlan.getState().doc;
  if (!d) throw new Error('No plan loaded');
  return d;
};

export function loadDoc(doc: PlanDoc, role: Role, planId: string | null) {
  usePlan.setState({ doc, role, planId, past: [], future: [], localRevision: 0 });
}

/**
 * Apply an undoable edit. The recipe may return `false` to abort without recording history.
 * Returns whatever the recipe returned (handy for passing results out).
 */
export function commit<T = void>(
  label: string,
  recipe: (d: PlanDoc) => T,
  coalesceKey?: string,
): T | undefined {
  const st = usePlan.getState();
  if (!st.doc || st.role !== 'edit') return undefined;
  let result: T | undefined;
  let patches: Patch[] = [];
  let inverse: Patch[] = [];
  const next = produce(
    st.doc,
    (d) => {
      result = recipe(d as PlanDoc);
      if ((result as unknown) === false) return;
    },
    (p, ip) => {
      patches = p;
      inverse = ip;
    },
  );
  if ((result as unknown) === false || patches.length === 0) return result;
  const now = Date.now();
  const last = st.past[st.past.length - 1];
  let past: HistoryEntry[];
  if (coalesceKey && last?.key === coalesceKey && now - last.at < 1500) {
    past = [
      ...st.past.slice(0, -1),
      { ...last, patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse], at: now },
    ];
  } else {
    past = [...st.past, { label, patches, inverse, key: coalesceKey, at: now }];
  }
  if (past.length > HISTORY_LIMIT) past.shift();
  usePlan.setState({ doc: next, past, future: [], localRevision: st.localRevision + 1 });
  return result;
}

function step(from: 'past' | 'future') {
  const st = usePlan.getState();
  const stack = st[from];
  if (!st.doc || stack.length === 0 || st.role !== 'edit') return null;
  const entry = stack[stack.length - 1];
  try {
    const next = applyPatches(st.doc, from === 'past' ? entry.inverse : entry.patches);
    const rest = stack.slice(0, -1);
    usePlan.setState(
      from === 'past'
        ? { doc: next, past: rest, future: [...st.future, entry], localRevision: st.localRevision + 1 }
        : { doc: next, future: rest, past: [...st.past, entry], localRevision: st.localRevision + 1 },
    );
    return entry.label;
  } catch {
    // The patch no longer applies (e.g. a collaborator deleted the entity) — drop history rather than corrupt.
    usePlan.setState({ past: [], future: [] });
    return null;
  }
}

export const undo = () => step('past');
export const redo = () => step('future');

/** Replace the document from outside (remote update / merge). Keeps history; undo will fail gracefully. */
export function replaceDoc(doc: PlanDoc, opts: { local?: boolean } = {}) {
  const st = usePlan.getState();
  usePlan.setState({ doc, localRevision: opts.local ? st.localRevision + 1 : st.localRevision });
}
