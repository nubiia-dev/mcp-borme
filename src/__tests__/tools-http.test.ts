import { describe, it, expect, vi, beforeEach } from 'vitest';

import { OpenMercantilClient } from '../openmercantil-client.js';
import { getCompanyTools } from '../tools/companies.js';
import { getBulletinTools } from '../tools/bulletin.js';
import { getLegalTools } from '../tools/legal.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
const res = (status: number, body: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  headers: { get: () => null },
});

describe('tools through the HTTP client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('builds the real URL, with the slug encoded and the key in the header', async () => {
    fetchMock.mockResolvedValue(res(200, '{"items":[]}'));
    const tools = getCompanyTools(new OpenMercantilClient('omk_key'));

    await tools.borme_get_company_events.handler({ slug: 'a-sl', year: 2025 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://openmercantil.es/api/v1/company/a-sl/events?year=2025&page=1&page_size=20'
    );
    expect(options.headers['X-API-Key']).toBe('omk_key');
  });

  it('compare serialises slugs as slugs=a,b', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'));
    await getCompanyTools(new OpenMercantilClient()).borme_compare_companies.handler({
      slugs: ['a-sl', 'b-sl'],
    });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('slugs')).toBe('a-sl,b-sl');
  });

  it('a 404 on a non-BORME day surfaces as a tool error', async () => {
    fetchMock.mockResolvedValue(res(404, '{"error":"No BORME for this date"}'));
    await expect(
      getBulletinTools(new OpenMercantilClient()).borme_get_daily_summary.handler({
        date: '2026-07-05',
      })
    ).rejects.toThrow(/No BORME for this date/);
  });

  it('encodes the article number so it cannot escape its path segment', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'));
    await getLegalTools(new OpenMercantilClient()).borme_get_legal_article.handler({
      norm: 'codigo-de-comercio',
      n: '160-bis',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://openmercantil.es/api/v1/legal/article/codigo-de-comercio/160-bis'
    );
  });
});
