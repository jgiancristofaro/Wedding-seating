import { BackendError } from './backend';

/** What PostgREST / supabase-js / fetch hand us when a call fails. */
export interface RawError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
}

const short = (s: string, n = 200) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Turn a raw failure into a BackendError with a human message and a technical `detail` line.
 * Only genuine connectivity problems are 'network'; wrong keys / missing database functions are 'config' so the
 * app says what is wrong instead of claiming to be offline.
 */
export function classifyError(e: unknown): BackendError {
  const err = (e && typeof e === 'object' ? e : {}) as RawError;
  const msg = err.message ?? String(e);
  const detail = short(
    [err.status ? `HTTP ${err.status}` : '', err.code ?? '', msg].filter(Boolean).join(' · '),
  );

  // Raised on purpose by our SQL functions when the token isn't an edit token.
  if (msg === 'forbidden') return new BackendError('forbidden', 'This link cannot edit the plan.', detail);
  if (/doc_too_large|asset_too_large|too_large/.test(msg))
    return new BackendError('too_large', 'That is too large to save.', detail);

  // Setup problems: bad key, wrong URL, SQL not run / not exposed, missing grants.
  if (
    err.status === 401 ||
    /invalid api key|invalid jwt|jwt (expired|malformed)|no api key/i.test(msg) ||
    /apikey/i.test(msg)
  )
    return new BackendError(
      'config',
      'Supabase rejected the API key. Check that VITE_SUPABASE_ANON_KEY is the anon/publishable key of the same project as VITE_SUPABASE_URL.',
      detail,
    );
  if (
    err.status === 404 ||
    /PGRST20[25]|42883|could not find the function|schema cache|does not exist/i.test(`${err.code} ${msg}`)
  )
    return new BackendError(
      'config',
      'The database isn’t set up yet (or the Supabase URL is wrong). Run supabase/migrations/0001_init.sql in the Supabase SQL editor.',
      detail,
    );
  if (err.code === '42501' || /permission denied/i.test(msg))
    return new BackendError(
      'config',
      'The database refused access to its functions. Re-run supabase/migrations/0001_init.sql so the grants are applied.',
      detail,
    );

  if (err.status && err.status >= 500)
    return new BackendError('unavailable', 'The server is temporarily unavailable.', detail);
  if (
    err.status === 0 ||
    /failed to fetch|networkerror|network request failed|fetch failed|load failed|timeout|timed out/i.test(
      msg,
    )
  )
    return new BackendError(
      'network',
      'Can’t reach the server. If your connection is fine, check that VITE_SUPABASE_URL is correct.',
      detail,
    );
  return new BackendError('unknown', 'The server returned an unexpected error.', detail);
}
