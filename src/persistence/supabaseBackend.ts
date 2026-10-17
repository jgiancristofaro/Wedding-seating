import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
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

function toError(e: unknown): BackendError {
  const err = e as { code?: string; message?: string; status?: number } | null;
  const msg = err?.message ?? String(e);
  if (err?.code === '42501' || /forbidden/.test(msg))
    return new BackendError('forbidden', 'This link cannot edit the plan.');
  if (/too_large/.test(msg)) return new BackendError('too_large', 'That is too large to save.');
  if (/Failed to fetch|NetworkError|network|fetch failed|Load failed/i.test(msg) || err?.status === 0)
    return new BackendError('network', 'You appear to be offline.');
  if (err?.status && err.status >= 500)
    return new BackendError('unavailable', 'The server is temporarily unavailable.');
  return new BackendError('unknown', msg);
}

function b64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export class SupabaseBackend implements Backend {
  kind = 'cloud' as const;
  private sb: SupabaseClient;
  private channels = new Map<string, RealtimeChannel>();

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    let res;
    try {
      res = await this.sb.rpc(fn, args);
    } catch (e) {
      throw toError(e);
    }
    if (res.error) throw toError({ ...res.error, status: res.status });
    return res.data as T;
  }

  async createPlan(doc: PlanDoc): Promise<CreatedPlan> {
    const r = await this.rpc<{ plan_id: string; edit_token: string; view_token: string; version: number }>(
      'create_plan',
      { p_name: doc.name, p_doc: doc },
    );
    return { planId: r.plan_id, editToken: r.edit_token, viewToken: r.view_token, version: r.version };
  }

  async loadPlan(token: string): Promise<LoadedPlan> {
    const r = await this.rpc<{
      plan_id: string;
      role: 'edit' | 'view';
      doc: PlanDoc;
      version: number;
      view_token: string | null;
      updated_at: string;
    } | null>('get_plan', { p_token: token });
    if (!r) throw new BackendError('not_found', 'Plan not found');
    return {
      planId: r.plan_id,
      role: r.role,
      doc: r.doc,
      version: Number(r.version),
      viewToken: r.view_token,
      updatedAt: r.updated_at,
    };
  }

  async savePlan(editToken: string, doc: PlanDoc, baseVersion: number): Promise<SaveResult> {
    const r = await this.rpc<{ ok: boolean; version: number; doc?: PlanDoc }>('save_plan', {
      p_edit_token: editToken,
      p_doc: doc,
      p_base_version: baseVersion,
    });
    return r.ok
      ? { ok: true, version: Number(r.version) }
      : { ok: false, version: Number(r.version), doc: r.doc! };
  }

  async createSnapshot(editToken: string, label: string) {
    await this.rpc('create_snapshot', { p_edit_token: editToken, p_label: label });
  }

  async listSnapshots(editToken: string): Promise<SnapshotMeta[]> {
    const r = await this.rpc<
      { id: number; version: number; label: string; created_at: string; guests: number; tables: number }[]
    >('list_snapshots', { p_edit_token: editToken });
    return (r ?? []).map((s) => ({
      id: String(s.id),
      version: s.version,
      label: s.label,
      createdAt: s.created_at,
      guests: s.guests,
      tables: s.tables,
    }));
  }

  async getSnapshot(editToken: string, id: string): Promise<PlanDoc> {
    return this.rpc<PlanDoc>('get_snapshot', { p_edit_token: editToken, p_snapshot_id: Number(id) });
  }

  async putAsset(editToken: string, blob: Blob): Promise<string> {
    if (blob.size > MAX_ASSET_BYTES) throw new BackendError('too_large', 'Image too large');
    const r = await this.rpc<{ id: string }>('put_asset', {
      p_edit_token: editToken,
      p_mime: blob.type || 'image/jpeg',
      p_data_b64: await b64(blob),
    });
    return r.id;
  }

  async getAsset(token: string, assetId: string): Promise<Blob> {
    const r = await this.rpc<{ mime: string; data: string } | null>('get_asset', {
      p_token: token,
      p_asset_id: assetId,
    });
    if (!r) throw new BackendError('not_found', 'Image not found');
    const bin = atob(r.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: r.mime });
  }

  // Realtime is only a "something changed" nudge; data is always fetched through the token-checked RPC,
  // so a forged broadcast can at worst trigger a harmless re-fetch.
  subscribe(planId: string, onVersion: (v: number, from: string) => void, onPresence?: (n: number) => void) {
    const ch = this.sb.channel(`plan:${planId}`, {
      config: { broadcast: { self: false }, presence: { key: CLIENT_ID } },
    });
    ch.on('broadcast', { event: 'saved' }, ({ payload }) => {
      const p = payload as { version: number; from: string };
      if (typeof p?.version === 'number' && p.from !== CLIENT_ID) onVersion(p.version, p.from);
    });
    ch.on('presence', { event: 'sync' }, () => onPresence?.(Object.keys(ch.presenceState()).length));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ at: Date.now() });
    });
    this.channels.set(planId, ch);
    return () => {
      this.channels.delete(planId);
      void this.sb.removeChannel(ch);
    };
  }

  announce(planId: string, version: number) {
    const ch = this.channels.get(planId);
    void ch?.send({ type: 'broadcast', event: 'saved', payload: { version, from: CLIENT_ID } });
  }
}
