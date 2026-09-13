import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, get, setAccessToken } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  beforeEach(() => setAccessToken('old'));
  afterEach(() => vi.restoreAllMocks());

  it('unwraps the data envelope and sends the access token', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { success: true, data: { hello: 'world' } }));
    expect(await get('/x')).toEqual({ hello: 'world' });
    expect((f.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBe('Bearer old');
  });

  it('turns error envelopes into ApiError with field issues', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(400, { success: false, error: { code: 'BAD_REQUEST', message: 'Check fields', details: { fields: [{ path: 'phone', message: 'Invalid' }] } } }));
    const err = (await get('/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.fields[0]).toEqual({ path: 'phone', message: 'Invalid' });
  });

  it('refreshes once when several requests get 401 at the same time, then retries them', async () => {
    let refreshes = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) { refreshes++; await new Promise((r) => setTimeout(r, 10)); return json(200, { success: true, data: { accessToken: 'new' } }); }
      const auth = (init!.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new' ? json(200, { success: true, data: u }) : json(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'x' } });
    });
    const out = await Promise.all([get('/a'), get('/b'), get('/c')]);
    expect(out).toHaveLength(3);
    expect(refreshes).toBe(1);
  });
});
