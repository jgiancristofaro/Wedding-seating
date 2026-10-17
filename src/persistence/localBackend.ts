// Browser-only backend (IndexedDB). Used when no Supabase project is configured, so the app works with zero setup.
// It mirrors the server's semantics (tokens, versions, snapshots) so the rest of the app is identical.
import { createStore, get, set, del, keys } from 'idb-keyval';
import { secureToken, uid } from '../lib/id';
import type { PlanDoc } from '../model/types';
import {
  BackendError,
  CLIENT_ID,
  MAX_ASSET_BYTES,
  type Backend,
  type CreatedPlan,
  type LoadedPlan,
  type SaveResult,
  type SnapshotMeta,
} from './backend';

interface StoredPlan {
  id: string;
  editToken: string;
  viewToken: string;
  doc: PlanDoc;
  version: number;
  updatedAt: string;
  lastSnapshotAt: number;
  snapshots: { id: string; version: number; label: string; createdAt: string; doc: PlanDoc }[];
}

const plans = createStore('wedding-seating-local', 'plans');
const assets = createStore('wedding-seating-assets', 'assets');

async function findByToken(token: string): Promise<{ p: StoredPlan; role: 'edit' | 'view' } | null> {
  for (const k of await keys(plans)) {
    const p = await get<StoredPlan>(k, plans);
    if (!p) continue;
    if (p.editToken === token) return { p, role: 'edit' };
    if (p.viewToken === token) return { p, role: 'view' };
  }
  return null;
}

const clone = <T>(v: T): T => structuredClone(v);

function snap(p: StoredPlan, label: string) {
  p.snapshots.unshift({
    id: uid(),
    version: p.version,
    label,
    createdAt: new Date().toISOString(),
    doc: clone(p.doc),
  });
  p.snapshots = p.snapshots.slice(0, 30);
}

export class LocalBackend implements Backend {
  kind = 'local' as const;
  private channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('wedding-seating') : null;

  async createPlan(doc: PlanDoc): Promise<CreatedPlan> {
    const p: StoredPlan = {
      id: uid(16),
      editToken: secureToken(),
      viewToken: secureToken(),
      doc: clone(doc),
      version: 1,
      updatedAt: new Date().toISOString(),
      lastSnapshotAt: 0,
      snapshots: [],
    };
    await set(p.id, p, plans);
    return { planId: p.id, editToken: p.editToken, viewToken: p.viewToken, version: 1 };
  }

  async loadPlan(token: string): Promise<LoadedPlan> {
    const hit = await findByToken(token);
    if (!hit) throw new BackendError('not_found', 'Plan not found');
    const { p, role } = hit;
    return {
      planId: p.id,
      role,
      doc: clone(p.doc),
      version: p.version,
      viewToken: role === 'edit' ? p.viewToken : null,
      updatedAt: p.updatedAt,
    };
  }

  async savePlan(editToken: string, doc: PlanDoc, baseVersion: number): Promise<SaveResult> {
    const hit = await findByToken(editToken);
    if (!hit || hit.role !== 'edit') throw new BackendError('forbidden', 'This link cannot edit the plan');
    const p = hit.p;
    if (p.version !== baseVersion) return { ok: false, version: p.version, doc: clone(p.doc) };
    p.doc = clone(doc);
    p.version += 1;
    p.updatedAt = new Date().toISOString();
    if (Date.now() - p.lastSnapshotAt > 10 * 60_000) {
      snap(p, 'Autosave');
      p.lastSnapshotAt = Date.now();
    }
    await set(p.id, p, plans);
    return { ok: true, version: p.version };
  }

  async createSnapshot(editToken: string, label: string) {
    const hit = await findByToken(editToken);
    if (!hit || hit.role !== 'edit') throw new BackendError('forbidden', 'Not allowed');
    snap(hit.p, label);
    await set(hit.p.id, hit.p, plans);
  }

  async listSnapshots(editToken: string): Promise<SnapshotMeta[]> {
    const hit = await findByToken(editToken);
    if (!hit || hit.role !== 'edit') throw new BackendError('forbidden', 'Not allowed');
    return hit.p.snapshots.map((s) => ({
      id: s.id,
      version: s.version,
      label: s.label,
      createdAt: s.createdAt,
      guests: Object.keys(s.doc.guests ?? {}).length,
      tables: Object.keys(s.doc.tables ?? {}).length,
    }));
  }

  async getSnapshot(editToken: string, id: string): Promise<PlanDoc> {
    const hit = await findByToken(editToken);
    const s = hit?.role === 'edit' ? hit.p.snapshots.find((x) => x.id === id) : undefined;
    if (!s) throw new BackendError('not_found', 'Snapshot not found');
    return clone(s.doc);
  }

  async putAsset(editToken: string, blob: Blob): Promise<string> {
    const hit = await findByToken(editToken);
    if (!hit || hit.role !== 'edit') throw new BackendError('forbidden', 'Not allowed');
    if (blob.size > MAX_ASSET_BYTES) throw new BackendError('too_large', 'Image too large');
    const id = uid(16);
    await set(id, { planId: hit.p.id, blob }, assets);
    return id;
  }

  async getAsset(_token: string, assetId: string): Promise<Blob> {
    const a = await get<{ blob: Blob }>(assetId, assets);
    if (!a) throw new BackendError('not_found', 'Image not found');
    return a.blob;
  }

  subscribe(planId: string, onVersion: (v: number, from: string) => void) {
    const ch = this.channel;
    if (!ch) return () => {};
    const handler = (e: MessageEvent) => {
      const m = e.data as { planId: string; version: number; from: string };
      if (m?.planId === planId && m.from !== CLIENT_ID) onVersion(m.version, m.from);
    };
    ch.addEventListener('message', handler);
    return () => ch.removeEventListener('message', handler);
  }

  announce(planId: string, version: number) {
    this.channel?.postMessage({ planId, version, from: CLIENT_ID });
  }

  /** Test/maintenance helper. */
  async deletePlan(id: string) {
    await del(id, plans);
  }
}
