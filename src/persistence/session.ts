// Opening / creating plans: glue between backend, drafts, sync engine and the stores.
import { navigate } from '../lib/router';
import { addSampleLayout, emptyDoc } from '../model/factory';
import type { PlanDoc, Role } from '../model/types';
import { loadDoc } from '../store/planStore';
import { BackendError } from './backend';
import { readDraft, writeDraft } from './drafts';
import { getBackend } from './index';
import { merge3 } from './merge';
import { normalizeDoc } from './migrate';
import { rememberPlan } from './recent';
import { SyncEngine, setSyncEngine, getSyncEngine, type SyncStatus } from './sync';

export interface OpenedPlan {
  /** the token this plan was opened with (edit or view) */
  token: string;
  planId: string;
  role: Role;
  viewToken: string | null;
  editToken: string | null;
  backendKind: 'cloud' | 'local';
  notice: string | null;
}

export async function createPlan(opts: { demo?: boolean; doc?: PlanDoc } = {}): Promise<void> {
  const backend = await getBackend();
  let doc: PlanDoc;
  if (opts.doc) doc = opts.doc;
  else if (opts.demo) doc = (await import('../model/demo')).buildDemoDoc();
  else {
    doc = emptyDoc();
    addSampleLayout(doc);
  }
  const created = await backend.createPlan(doc);
  rememberPlan({
    token: created.editToken,
    role: 'edit',
    name: doc.name,
    backend: backend.kind,
    guests: Object.keys(doc.guests).length,
  });
  await writeDraft(created.editToken, {
    planId: created.planId,
    role: 'edit',
    doc,
    baseDoc: doc,
    baseVersion: created.version,
    dirty: false,
    viewToken: created.viewToken,
    savedAt: Date.now(),
  });
  navigate(`/e/${created.editToken}`);
}

export async function openPlan(token: string): Promise<OpenedPlan> {
  getSyncEngine()?.stop();
  setSyncEngine(null);
  const backend = await getBackend();
  const draft = await readDraft(token);
  let notice: string | null = null;
  let status: SyncStatus = 'saved';
  let doc: PlanDoc;
  let base: { doc: PlanDoc; version: number };
  let meta: { planId: string; role: Role; viewToken: string | null };

  try {
    const remote = await backend.loadPlan(token);
    const remoteDoc = normalizeDoc(remote.doc);
    meta = { planId: remote.planId, role: remote.role, viewToken: remote.viewToken };
    base = { doc: remoteDoc, version: remote.version };
    doc = remoteDoc;
    if (draft?.dirty && draft.role === 'edit' && remote.role === 'edit' && draft.planId === remote.planId) {
      // Unsaved edits from a previous session (e.g. closed while offline).
      if (draft.baseVersion === remote.version) doc = draft.doc;
      else {
        doc = merge3(draft.baseDoc, draft.doc, remoteDoc).doc;
        notice = 'Your offline edits were merged with newer changes.';
      }
    }
  } catch (e) {
    const err = e instanceof BackendError ? e : new BackendError('unknown', String(e));
    if ((err.code === 'network' || err.code === 'unavailable' || err.code === 'unknown') && draft) {
      meta = { planId: draft.planId, role: draft.role, viewToken: draft.viewToken };
      base = { doc: draft.baseDoc, version: draft.baseVersion };
      doc = draft.doc;
      status = 'offline';
      notice = 'You’re offline. Showing the copy saved on this device; edits will sync when you reconnect.';
    } else throw err;
  }

  loadDoc(doc, meta.role, meta.planId);
  const engine = new SyncEngine(backend, token, meta.planId, meta.role, base, meta.viewToken);
  setSyncEngine(engine);
  engine.start(status);
  rememberPlan({
    token,
    role: meta.role,
    name: doc.name,
    backend: backend.kind,
    guests: Object.keys(doc.guests).length,
  });
  return {
    token,
    planId: meta.planId,
    role: meta.role,
    viewToken: meta.viewToken,
    editToken: meta.role === 'edit' ? token : null,
    backendKind: backend.kind,
    notice,
  };
}

export function closePlan() {
  getSyncEngine()?.stop();
  setSyncEngine(null);
}
