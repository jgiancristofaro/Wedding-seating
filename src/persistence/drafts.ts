// Local draft cache: lets a plan reopen offline and keeps unsaved edits across reloads until they reach the server.
import { createStore, del, get, set } from 'idb-keyval';
import type { PlanDoc } from '../model/types';

export interface Draft {
  planId: string;
  role: 'edit' | 'view';
  doc: PlanDoc;
  /** last doc known to be on the server, used as merge base */
  baseDoc: PlanDoc;
  baseVersion: number;
  dirty: boolean;
  viewToken: string | null;
  savedAt: number;
}

const store = createStore('wedding-seating-drafts', 'drafts');

export async function readDraft(token: string): Promise<Draft | undefined> {
  try {
    return await get<Draft>(token, store);
  } catch {
    return undefined;
  }
}

export async function writeDraft(token: string, d: Draft) {
  try {
    await set(token, d, store);
  } catch {
    /* private mode etc. */
  }
}

export async function clearDraft(token: string) {
  try {
    await del(token, store);
  } catch {
    /* ignore */
  }
}
