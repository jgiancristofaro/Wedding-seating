import type { Backend } from './backend';
import { LocalBackend } from './localBackend';

let backend: Promise<Backend> | null = null;

export const cloudConfigured = () =>
  !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

/** Cloud backend when Supabase env vars were provided at build time, otherwise the browser-only backend. */
export function getBackend(): Promise<Backend> {
  if (!backend) {
    backend = cloudConfigured()
      ? import('./supabaseBackend').then(
          (m) => new m.SupabaseBackend(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY),
        )
      : Promise.resolve(new LocalBackend());
  }
  return backend;
}
