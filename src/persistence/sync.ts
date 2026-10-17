// Autosave + realtime sync. Debounced saves with optimistic concurrency; on conflict we 3-way merge and retry.
// Network failures put us in "offline" mode: edits continue locally (drafted to IndexedDB) and are retried.
import { create } from 'zustand';
import { replaceDoc, usePlan } from '../store/planStore';
import { toast } from '../store/toastStore';
import type { PlanDoc, Role } from '../model/types';
import { BackendError, MAX_DOC_BYTES, type Backend } from './backend';
import { writeDraft } from './drafts';
import { merge3 } from './merge';

export type SyncStatus = 'saved' | 'saving' | 'pending' | 'offline' | 'error' | 'readonly';

interface SyncState {
  status: SyncStatus;
  lastSavedAt: number | null;
  peers: number;
  message: string | null;
  set: (p: Partial<SyncState>) => void;
}

export const useSync = create<SyncState>((set) => ({
  status: 'saved',
  lastSavedAt: null,
  peers: 1,
  message: null,
  set: (p) => set(p),
}));

const SAVE_DEBOUNCE = 900;

export class SyncEngine {
  private baseDoc: PlanDoc;
  private baseVersion: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight = false;
  private retryDelay = 2000;
  private stopped = false;
  private unsubs: (() => void)[] = [];

  constructor(
    private backend: Backend,
    private token: string,
    private planId: string,
    private role: Role,
    base: { doc: PlanDoc; version: number },
    private viewToken: string | null,
  ) {
    this.baseDoc = base.doc;
    this.baseVersion = base.version;
  }

  get version() {
    return this.baseVersion;
  }

  start(initialStatus: SyncStatus = 'saved') {
    useSync
      .getState()
      .set({ status: this.role === 'view' ? 'readonly' : initialStatus, message: null, peers: 1 });
    this.unsubs.push(
      usePlan.subscribe((s, prev) => {
        if (s.doc !== prev.doc && s.doc) this.onLocalChange();
      }),
    );
    this.unsubs.push(
      this.backend.subscribe(
        this.planId,
        (v) => void this.onRemoteVersion(v),
        (n) => useSync.getState().set({ peers: Math.max(1, n) }),
      ),
    );
    const online = () => this.schedule(0);
    const hidden = () => {
      if (document.visibilityState === 'hidden') void this.flush();
      else void this.onRemoteVersion(Number.MAX_SAFE_INTEGER, true);
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (this.isDirty()) {
        void this.flush();
        e.preventDefault();
      }
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('beforeunload', beforeUnload);
    this.unsubs.push(() => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('beforeunload', beforeUnload);
    });
    if (this.isDirty()) this.schedule(200);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  isDirty() {
    return this.role === 'edit' && usePlan.getState().doc !== this.baseDoc;
  }

  private onLocalChange() {
    this.writeDraftSoon();
    if (this.role !== 'edit') return;
    if (this.isDirty() && useSync.getState().status !== 'offline')
      useSync.getState().set({ status: 'pending' });
    this.schedule(SAVE_DEBOUNCE);
  }

  private writeDraftSoon() {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.writeDraftNow(), 250);
  }

  private writeDraftNow() {
    const doc = usePlan.getState().doc;
    if (!doc) return;
    void writeDraft(this.token, {
      planId: this.planId,
      role: this.role,
      doc,
      baseDoc: this.baseDoc,
      baseVersion: this.baseVersion,
      dirty: doc !== this.baseDoc,
      viewToken: this.viewToken,
      savedAt: Date.now(),
    });
  }

  private schedule(ms: number) {
    if (this.stopped || this.role !== 'edit') return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  /** Save now (if anything changed). */
  async flush(): Promise<void> {
    if (this.stopped || this.role !== 'edit' || this.inflight) return;
    const doc = usePlan.getState().doc;
    if (!doc || doc === this.baseDoc) {
      if (useSync.getState().status !== 'saved' && useSync.getState().status !== 'error')
        useSync.getState().set({ status: 'saved', message: null });
      return;
    }
    const size = JSON.stringify(doc).length;
    if (size > MAX_DOC_BYTES) {
      useSync.getState().set({
        status: 'error',
        message: 'This plan is too large to save to the cloud. Export a JSON backup.',
      });
      return;
    }
    this.inflight = true;
    useSync.getState().set({ status: 'saving' });
    try {
      const res = await this.backend.savePlan(this.token, doc, this.baseVersion);
      if (res.ok) {
        this.baseDoc = doc;
        this.baseVersion = res.version;
        this.retryDelay = 2000;
        this.backend.announce(this.planId, res.version);
        useSync
          .getState()
          .set({ status: this.isDirty() ? 'pending' : 'saved', lastSavedAt: Date.now(), message: null });
        this.writeDraftNow();
        if (this.isDirty()) this.schedule(SAVE_DEBOUNCE);
      } else {
        this.applyMerge(res.doc, res.version, 'Merged changes from another editor.');
        this.inflight = false;
        await this.flush();
        return;
      }
    } catch (e) {
      const err = e instanceof BackendError ? e : new BackendError('unknown', String(e));
      if (err.detail) console.warn('[sync] save failed:', err.code, err.detail);
      if (err.code === 'forbidden') {
        this.role = 'view';
        useSync.getState().set({ status: 'readonly', message: 'This link can no longer edit the plan.' });
      } else if (err.code === 'too_large') {
        useSync.getState().set({ status: 'error', message: err.message });
      } else {
        // Only a real connectivity problem is "offline". Setup problems (bad key, SQL not run…) are errors we can
        // name — the edits are still kept on this device and we keep retrying in case it gets fixed.
        const offline = err.code === 'network' || err.code === 'unavailable';
        const tail = err.detail ? ` (${err.detail})` : '';
        useSync.getState().set({
          status: offline ? 'offline' : 'error',
          message: offline
            ? err.code === 'network' && typeof navigator !== 'undefined' && navigator.onLine
              ? `${err.message}${tail}`
              : 'Offline — changes are kept on this device and will sync.'
            : `Not saved to the cloud: ${err.message}${tail} Your changes are kept on this device.`,
        });
        this.schedule(this.retryDelay);
        this.retryDelay = Math.min(30_000, this.retryDelay * 2);
      }
    } finally {
      this.inflight = false;
    }
  }

  private applyMerge(remote: PlanDoc, version: number, notice: string) {
    const mine = usePlan.getState().doc!;
    const { doc, bumped } = merge3(this.baseDoc, mine, remote);
    this.baseDoc = remote;
    this.baseVersion = version;
    replaceDoc(doc);
    toast.info(
      bumped.length ? `${notice} ${bumped.length} guest(s) were unseated because a seat was taken.` : notice,
    );
  }

  /** Another client saved. Pull and merge (or just adopt if we have no local edits). */
  private async onRemoteVersion(version: number, quiet = false) {
    if (this.stopped || version <= this.baseVersion) return;
    if (this.role === 'edit' && (this.inflight || this.isDirty())) {
      this.schedule(0); // our save will hit the conflict path and merge
      return;
    }
    try {
      const remote = await this.backend.loadPlan(this.token);
      if (remote.version <= this.baseVersion) return;
      if (this.isDirty()) this.applyMerge(remote.doc, remote.version, 'Merged changes from another editor.');
      else {
        this.baseDoc = remote.doc;
        this.baseVersion = remote.version;
        replaceDoc(remote.doc);
        if (!quiet) toast.info('Updated with changes made elsewhere.');
      }
      this.writeDraftNow();
    } catch {
      /* offline: will catch up later */
    }
  }

  async refresh() {
    await this.onRemoteVersion(Number.MAX_SAFE_INTEGER, true);
  }

  /** Called after restoring a snapshot etc. */
  async snapshot(label: string) {
    await this.flush();
    await this.backend.createSnapshot(this.token, label);
  }
}

let current: SyncEngine | null = null;
export const setSyncEngine = (e: SyncEngine | null) => (current = e);
export const getSyncEngine = () => current;
