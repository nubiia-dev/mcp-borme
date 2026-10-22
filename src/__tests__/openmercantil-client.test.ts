import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { OpenMercantilClient, encodePathSegment } from '../openmercantil-client.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

/** Same shape as a native fetch network failure: TypeError with the socket error in `cause`. */
function networkError(message: string, code?: string) {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(message), { code }) });
}

function res(status: number, body: string, headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
  };
}

describe('OpenMercantilClient', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('works without an API key (anonymous tier) and sends no auth header', async () => {
    fetchMock.mockResolvedValue(res(200, '{"ok":true}'));
    const client = new OpenMercantilClient();

    expect(client.authenticated).toBe(false);
    expect(await client.get('/api/v1/health')).toEqual({ ok: true });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openmercantil.es/api/v1/health');
    expect(options.method).toBe('GET');
    expect(options.headers['X-API-Key']).toBeUndefined();
  });

  it('sends the key in the X-API-Key header, never in the URL', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'));
    const client = new OpenMercantilClient('omk_secret');

    await client.get('/api/v1/search', { q: 'telefonica' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(client.authenticated).toBe(true);
    expect(url).not.toContain('omk_secret');
    expect(options.headers['X-API-Key']).toBe('omk_secret');
  });

  it('builds the query string: drops nullish values and empty arrays, joins arrays with commas', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'));
    const client = new OpenMercantilClient();

    await client.get('/api/v1/x', {
      a: 1,
      b: 'ñandú y más',
      c: undefined,
      d: null,
      e: [],
      slugs: ['one', 'two'],
      flag: false,
    });

    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      a: '1',
      b: 'ñandú y más',
      slugs: 'one,two',
      flag: 'false',
    });
  });

  it('never follows redirects, so the API key cannot be replayed to another host', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'));
    await new OpenMercantilClient('omk_secret').get('/api/v1/health');
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error');
  });

  it('turns a refused redirect into an explicit error', async () => {
    fetchMock.mockRejectedValue(networkError('unexpected redirect'));
    const error = (await new OpenMercantilClient('omk_secret')
      .get('/api/v1/health')
      .catch((e: Error) => e)) as Error;
    expect(error.message).toMatch(/refuses to follow/);
    expect(error.message).not.toContain('omk_secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['', '   ', '${user_config.openmercantil_api_key}'])(
    'treats the unset key %j as anonymous (no X-API-Key header)',
    async (key) => {
      fetchMock.mockResolvedValue(res(200, '{}'));
      const client = new OpenMercantilClient(key);
      await client.get('/x');
      expect(client.authenticated).toBe(false);
      expect(fetchMock.mock.calls[0][1].headers['X-API-Key']).toBeUndefined();
    }
  );

  it('honours a custom host and trims trailing slashes', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'));
    await new OpenMercantilClient('', { host: 'http://localhost:8080//' }).get('/api/v1/stats');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/api/v1/stats');
  });

  it('returns an empty object for an empty response body', async () => {
    fetchMock.mockResolvedValue(res(200, ''));
    expect(await new OpenMercantilClient().get('/x')).toEqual({});
  });

  it('rejects invalid JSON with a clear error', async () => {
    fetchMock.mockResolvedValue(res(200, '<html>oops</html>'));
    await expect(new OpenMercantilClient().get('/x')).rejects.toThrow(/invalid JSON/);
  });

  it('records the rate-limit headers of the latest response', async () => {
    fetchMock.mockResolvedValue(
      res(200, '{}', {
        'X-RateLimit-Limit': '200',
        'X-RateLimit-Remaining': '199',
        'X-RateLimit-Reset': '1792732428',
        'X-OpenMercantil-Plan': 'Free',
      })
    );
    const client = new OpenMercantilClient();
    await client.get('/x');
    expect(client.rateLimit).toEqual({
      limit: 200,
      remaining: 199,
      reset: 1792732428,
      plan: 'Free',
    });
  });

  it('extracts error/detail from JSON error bodies', async () => {
    fetchMock.mockResolvedValue(
      res(422, '{"error":"validation_failed","detail":"La longitud esta fuera de rango"}')
    );
    await expect(new OpenMercantilClient().get('/x')).rejects.toThrow(
      /\(422\): validation_failed: La longitud esta fuera de rango/
    );
  });

  describe('404 handling', () => {
    it('mentions the identity policy for company/person paths', async () => {
      fetchMock.mockResolvedValue(res(404, '{"error":"not_found"}'));
      await expect(new OpenMercantilClient().get('/api/v1/company/x')).rejects.toThrow(
        /identity policy/
      );
    });

    it('does not mention the identity policy for other paths', async () => {
      fetchMock.mockResolvedValue(res(404, '{"error":"Legal article not found"}'));
      const error = await new OpenMercantilClient()
        .get('/api/v1/legal/article/a/1')
        .catch((e: Error) => e);
      expect((error as Error).message).toMatch(/Legal article not found/);
      expect((error as Error).message).not.toMatch(/identity policy/);
    });
  });

  describe('auth errors', () => {
    it('explains 401/403 and points to the env var, without retrying', async () => {
      fetchMock.mockResolvedValue(res(401, '{"error":"unauthorized"}'));
      const client = new OpenMercantilClient('omk_bad');
      await expect(client.get('/x')).rejects.toThrow(/OPENMERCANTIL_API_KEY/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('rate limiting (429)', () => {
    it('waits for a short Retry-After and then succeeds', async () => {
      fetchMock
        .mockResolvedValueOnce(res(429, '{"error":"rate_limited"}', { 'Retry-After': '2' }))
        .mockResolvedValueOnce(res(200, '{"ok":1}'));
      const client = new OpenMercantilClient();
      const sleep = vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

      expect(await client.get('/x')).toEqual({ ok: 1 });
      expect(sleep).toHaveBeenCalledWith(2000);
    });

    it('does not block on a long Retry-After (daily quota): reports the anonymous limits', async () => {
      fetchMock.mockResolvedValue(
        res(429, '{"error":"daily_limit"}', {
          'Retry-After': '40000',
          'X-OpenMercantil-Plan': 'Free',
        })
      );
      const client = new OpenMercantilClient();
      const sleep = vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

      const error = (await client.get('/x').catch((e: Error) => e)) as Error;
      expect(error.message).toMatch(/rate limit reached \(plan: Free\)/);
      expect(error.message).toMatch(/Retry after 40000 seconds/);
      expect(error.message).toMatch(/60 requests\/minute and 200 requests\/day/);
      expect(sleep).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('with a key, says the account quota is exhausted', async () => {
      fetchMock.mockResolvedValue(res(429, '{}', { 'Retry-After': '3600' }));
      const client = new OpenMercantilClient('omk_k');
      await expect(client.get('/x')).rejects.toThrow(
        /quota of the configured OPENMERCANTIL_API_KEY/
      );
    });
  });

  it('retries 503 with backoff and gives up after max retries', async () => {
    fetchMock.mockResolvedValue(res(503, '{"error":"projection_unavailable"}'));
    const client = new OpenMercantilClient();
    vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

    await expect(client.get('/x')).rejects.toThrow(/503.*projection_unavailable/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries connection-setup network errors', async () => {
    const refused = networkError('refused', 'ECONNREFUSED');
    fetchMock.mockRejectedValueOnce(refused).mockResolvedValueOnce(res(200, '{"ok":1}'));
    const client = new OpenMercantilClient();
    vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

    expect(await client.get('/x')).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry ambiguous network errors', async () => {
    fetchMock.mockRejectedValue(networkError('reset', 'ECONNRESET'));
    await expect(new OpenMercantilClient().get('/x')).rejects.toThrow(/request failed: reset/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out without retrying', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(new OpenMercantilClient('', { timeoutMs: 5000 }).get('/x')).rejects.toThrow(
      /timed out after 5s/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('redacts the API key from every surfaced error text', async () => {
    fetchMock.mockResolvedValue(res(400, 'bad request for key omk_supersecret123'));
    const client = new OpenMercantilClient('omk_supersecret123');
    const error = (await client.get('/x').catch((e: Error) => e)) as Error;
    expect(error.message).toContain('[REDACTED]');
    expect(error.message).not.toContain('omk_supersecret123');
  });

  it('truncates very long error bodies', async () => {
    fetchMock.mockResolvedValue(res(500, 'x'.repeat(5000)));
    const error = (await new OpenMercantilClient().get('/x').catch((e: Error) => e)) as Error;
    expect(error.message.length).toBeLessThan(700);
    expect(error.message).toContain('[truncated]');
  });
});

describe('encodePathSegment', () => {
  it('percent-encodes characters that could alter the path', () => {
    expect(encodePathSegment('a/b?c#d')).toBe('a%2Fb%3Fc%23d');
    expect(encodePathSegment('telefonica-sa')).toBe('telefonica-sa');
  });
});
