import type { PlanDoc, Role } from '../model/types';

export interface CreatedPlan {
  planId: string;
  editToken: string;
  viewToken: string;
  version: number;
}

export interface LoadedPlan {
  planId: string;
  role: Role;
  doc: PlanDoc;
  version: number;
  viewToken: string | null;
  updatedAt: string;
}

export type SaveResult = { ok: true; version: number } | { ok: false; version: number; doc: PlanDoc };

export interface SnapshotMeta {
  id: string;
  version: number;
  label: string;
  createdAt: string;
  guests: number;
  tables: number;
}

/** Errors the UI turns into friendly messages. */
export class BackendError extends Error {
  constructor(
    public code: 'not_found' | 'forbidden' | 'network' | 'too_large' | 'unavailable' | 'unknown',
    message: string,
  ) {
    super(message);
  }
}

export interface Backend {
  kind: 'cloud' | 'local';
  createPlan(doc: PlanDoc): Promise<CreatedPlan>;
  /** Resolves an edit or view token. Throws BackendError('not_found') for unknown tokens. */
  loadPlan(token: string): Promise<LoadedPlan>;
  savePlan(editToken: string, doc: PlanDoc, baseVersion: number): Promise<SaveResult>;
  createSnapshot(editToken: string, label: string): Promise<void>;
  listSnapshots(editToken: string): Promise<SnapshotMeta[]>;
  getSnapshot(editToken: string, id: string): Promise<PlanDoc>;
  putAsset(editToken: string, blob: Blob): Promise<string>;
  getAsset(token: string, assetId: string): Promise<Blob>;
  /** Realtime nudge: called with the new version when another client saves. Returns unsubscribe. */
  subscribe(planId: string, onVersion: (version: number, from: string) => void, onPresence?: (n: number) => void): () => void;
  announce(planId: string, version: number): void;
}

export const MAX_DOC_BYTES = 3 * 1024 * 1024;
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;

/** Identifies this browser tab in realtime messages so we ignore our own echoes. */
export const CLIENT_ID = Math.random().toString(36).slice(2);
