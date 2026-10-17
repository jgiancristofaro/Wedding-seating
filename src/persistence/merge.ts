// Three-way merge of plan documents: per entity, per field, "my change wins, otherwise take theirs".
import { deepEqual } from '../lib/util';
import { resolveSeatCollisions } from '../model/ops';
import type { PlanDoc } from '../model/types';

type Rec = Record<string, Record<string, unknown>>;
const COLLECTIONS = ['guests', 'groups', 'tables', 'rules', 'elements'] as const;

function mergeObject<T extends object>(
  base: T | undefined,
  mine: T | undefined,
  theirs: T | undefined,
): T | undefined {
  if (deepEqual(mine, base)) return theirs; // I didn't touch it
  if (deepEqual(theirs, base)) return mine; // they didn't touch it
  if (mine === undefined) return undefined; // I deleted it
  if (theirs === undefined) return mine; // they deleted, I edited: keep my edit
  if (base === undefined) return mine; // both created the same id (practically impossible)
  const out: Record<string, unknown> = { ...(theirs as Record<string, unknown>) };
  const b = base as Record<string, unknown>;
  const m = mine as Record<string, unknown>;
  for (const k of new Set([...Object.keys(m), ...Object.keys(b)])) {
    if (!deepEqual(m[k], b[k])) {
      if (m[k] === undefined) delete out[k];
      else out[k] = m[k];
    }
  }
  return out as T;
}

export interface MergeOutcome {
  doc: PlanDoc;
  /** guests bumped from a seat because both sides seated someone there */
  bumped: string[];
}

export function merge3(base: PlanDoc, mine: PlanDoc, theirs: PlanDoc): MergeOutcome {
  const out: PlanDoc = { ...theirs };
  for (const c of COLLECTIONS) {
    const b = (base[c] ?? {}) as unknown as Rec;
    const m = (mine[c] ?? {}) as unknown as Rec;
    const t = (theirs[c] ?? {}) as unknown as Rec;
    const merged: Rec = {};
    for (const id of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)])) {
      const v = mergeObject(b[id], m[id], t[id]);
      if (v !== undefined) merged[id] = v;
    }
    (out as unknown as Record<string, Rec>)[c] = merged;
  }
  out.name = deepEqual(mine.name, base.name) ? theirs.name : mine.name;
  out.eventDate = deepEqual(mine.eventDate, base.eventDate) ? theirs.eventDate : mine.eventDate;
  out.backdrop = deepEqual(mine.backdrop, base.backdrop) ? theirs.backdrop : mine.backdrop;
  out.settings = mergeObject(base.settings, mine.settings, theirs.settings) ?? theirs.settings;
  const doc = structuredClone(out);
  // rules pointing at deleted guests
  for (const r of Object.values(doc.rules)) if (!doc.guests[r.a] || !doc.guests[r.b]) delete doc.rules[r.id];
  const bumped = resolveSeatCollisions(doc);
  return { doc, bumped };
}
