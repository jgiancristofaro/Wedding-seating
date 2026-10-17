import { describe, expect, it } from 'vitest';
import { normalizeAnonKey, normalizeSupabaseUrl } from './supabaseUrl';

describe('normalizeSupabaseUrl', () => {
  const good = 'https://abcdefghijklmnopqrst.supabase.co';
  it('leaves a correct URL alone', () => expect(normalizeSupabaseUrl(good)).toBe(good));
  it('strips API paths pasted from the docs (the PGRST125 case)', () => {
    expect(normalizeSupabaseUrl(`${good}/rest/v1/`)).toBe(good);
    expect(normalizeSupabaseUrl(`${good}/rest/v1`)).toBe(good);
    expect(normalizeSupabaseUrl(`${good}/`)).toBe(good);
    expect(normalizeSupabaseUrl(`${good}/auth/v1?x=1#y`)).toBe(good);
  });
  it('removes quotes and whitespace and adds https', () => {
    expect(normalizeSupabaseUrl(`  "${good}"\n`)).toBe(good);
    expect(normalizeSupabaseUrl('abcdefghijklmnopqrst.supabase.co')).toBe(good);
  });
  it('accepts a bare project ref or a dashboard link', () => {
    expect(normalizeSupabaseUrl('abcdefghijklmnopqrst')).toBe(good);
    expect(
      normalizeSupabaseUrl('https://supabase.com/dashboard/project/abcdefghijklmnopqrst/settings/api'),
    ).toBe(good);
  });
  it('returns empty for empty input', () => expect(normalizeSupabaseUrl('  ')).toBe(''));
});

describe('normalizeAnonKey', () => {
  it('drops quotes, spaces and newlines', () => {
    expect(normalizeAnonKey(' "eyJhbGci.abc.def"\n')).toBe('eyJhbGci.abc.def');
    expect(normalizeAnonKey('eyJhbGci.abc\r\n.def')).toBe('eyJhbGci.abc.def');
  });
});
