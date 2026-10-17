import { describe, expect, it } from 'vitest';
import { classifyError } from './errors';

describe('classifyError', () => {
  it('only genuine connectivity failures are "network"', () => {
    expect(classifyError(new TypeError('Failed to fetch')).code).toBe('network');
    expect(classifyError({ message: 'Load failed' }).code).toBe('network');
    expect(classifyError({ message: '', status: 0 }).code).toBe('network');
  });

  it('a wrong or missing API key is a config problem, not "offline"', () => {
    const e = classifyError({ message: 'Invalid API key', status: 401, code: '' });
    expect(e.code).toBe('config');
    expect(e.message).toMatch(/anon\/publishable key/);
    expect(e.detail).toContain('HTTP 401');
  });

  it('PGRST125 (invalid path) points at the URL, not the database', () => {
    const e = classifyError({
      code: 'PGRST125',
      status: 404,
      message: 'Invalid path specified in request URL',
    });
    expect(e.code).toBe('config');
    expect(e.message).toMatch(/Project URL/);
    expect(e.message).not.toMatch(/0001_init/);
  });

  it('missing database functions / un-run SQL is a config problem', () => {
    expect(
      classifyError({
        code: 'PGRST202',
        status: 404,
        message: 'Could not find the function public.save_plan',
      }).code,
    ).toBe('config');
    expect(classifyError({ code: '42883', status: 404, message: 'function does not exist' }).code).toBe(
      'config',
    );
    expect(
      classifyError({ code: 'PGRST205', message: 'Could not find the table in the schema cache' }).code,
    ).toBe('config');
  });

  it('"permission denied" is a grants problem, but our own "forbidden" means a view-only link', () => {
    expect(
      classifyError({ code: '42501', status: 403, message: 'permission denied for function save_plan' }).code,
    ).toBe('config');
    expect(classifyError({ code: '42501', status: 403, message: 'forbidden' }).code).toBe('forbidden');
  });

  it('server outages are "unavailable" and size limits are "too_large"', () => {
    expect(classifyError({ status: 503, message: 'Service Unavailable' }).code).toBe('unavailable');
    expect(classifyError({ code: '22023', message: 'doc_too_large' }).code).toBe('too_large');
  });

  it('anything else is reported with its detail instead of being hidden', () => {
    const e = classifyError({ code: '22P02', status: 400, message: 'invalid input syntax for type bigint' });
    expect(e.code).toBe('unknown');
    expect(e.detail).toBe('HTTP 400 · 22P02 · invalid input syntax for type bigint');
  });
});
