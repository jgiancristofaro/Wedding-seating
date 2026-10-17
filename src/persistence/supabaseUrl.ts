// People paste these values from different Supabase pages, with stray quotes, spaces, paths or newlines.
// Normalise them so a slightly-off secret still works.

const clean = (v: string) =>
  v
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();

/** `https://<ref>.supabase.co` from whatever was pasted: the API URL, `.../rest/v1/`, a dashboard link, a bare ref… */
export function normalizeSupabaseUrl(input: string): string {
  let v = clean(input);
  if (!v) return '';
  const dash = /supabase\.com\/dashboard\/project\/([a-z0-9]{10,})/i.exec(v);
  if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
  if (/^[a-z0-9]{15,25}$/i.test(v)) return `https://${v.toLowerCase()}.supabase.co`; // just the project ref
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    // keep only the origin: the API paths (/rest/v1, /realtime/v1…) are added by the client
    return u.origin;
  } catch {
    return v;
  }
}

/** The anon key is a single token; drop quotes, spaces and line breaks from copy/paste. */
export function normalizeAnonKey(input: string): string {
  return clean(input).replace(/\s+/g, '');
}
