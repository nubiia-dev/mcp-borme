import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getCompanyTools } from '../tools/companies.js';
import { getCompanySourceTools } from '../tools/company-sources.js';
import { getBulletinTools } from '../tools/bulletin.js';
import { getPersonTools } from '../tools/persons.js';
import { getSectorTools } from '../tools/sectors.js';
import { getLegalTools } from '../tools/legal.js';
import { getTenderTools } from '../tools/tenders.js';
import { getSystemTools } from '../tools/system.js';

const boilerplate = { _source_catalog: {}, _data_sources_used: [], _attributions: { borme: 'x' } };

describe('tool handlers', () => {
  let client: ReturnType<typeof createMockClient>;
  const get = () => client.get as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  describe('companies', () => {
    it('borme_search_companies -> /api/v1/search and strips boilerplate', async () => {
      get().mockResolvedValue({ items: [], ...boilerplate });
      const result = (await getCompanyTools(client).borme_search_companies.handler({
        q: 'telefonica',
      })) as Record<string, unknown>;

      expect(get()).toHaveBeenCalledWith('/api/v1/search', {
        q: 'telefonica',
        limit: 10,
        offset: 0,
      });
      expect(result._source_catalog).toBeUndefined();
      expect(result._attributions).toBeDefined();
    });

    it('borme_get_company -> /api/v1/company/{slug} and bounds the events', async () => {
      get().mockResolvedValue({
        company: { slug: 's' },
        events: Array.from({ length: 40 }, (_, i) => ({ id: i })),
      });
      const result = (await getCompanyTools(client).borme_get_company.handler({
        slug: 'telefonica-de-espana-sa',
      })) as { events: unknown[]; events_total: number };

      expect(get()).toHaveBeenCalledWith('/api/v1/company/telefonica-de-espana-sa');
      expect(result.events).toHaveLength(10);
      expect(result.events_total).toBe(40);
    });

    it('borme_compare_companies sends the slugs as an array', async () => {
      await getCompanyTools(client).borme_compare_companies.handler({ slugs: ['a-sl', 'b-sl'] });
      expect(get()).toHaveBeenCalledWith('/api/v1/companies/compare', { slugs: ['a-sl', 'b-sl'] });
    });

    it('borme_get_company_events -> /events with pagination', async () => {
      await getCompanyTools(client).borme_get_company_events.handler({
        slug: 'a-sl',
        year: 2024,
        page: 2,
        page_size: 5,
      });
      expect(get()).toHaveBeenCalledWith('/api/v1/company/a-sl/events', {
        year: 2024,
        page: 2,
        page_size: 5,
      });
    });

    it('borme_get_company_facts uses the /empresa alias', async () => {
      await getCompanyTools(client).borme_get_company_facts.handler({ slug: 'a-sl' });
      expect(get()).toHaveBeenCalledWith('/api/v1/empresa/a-sl/facts', { limit: 20 });
    });

    it('borme_get_company_timeline bounds events client-side', async () => {
      get().mockResolvedValue({ events: Array.from({ length: 60 }, (_, i) => ({ i })) });
      const result = (await getCompanyTools(client).borme_get_company_timeline.handler({
        slug: 'a-sl',
        limit: 5,
      })) as { events: unknown[]; events_total: number; events_truncated: boolean };
      expect(get()).toHaveBeenCalledWith('/api/v1/company/a-sl/timeline', {});
      expect(result.events).toHaveLength(5);
      expect(result.events_total).toBe(60);
      expect(result.events_truncated).toBe(true);
    });

    it.each([
      ['borme_get_company_officers', '/api/v1/company/a-sl/officers'],
      ['borme_get_company_activity', '/api/v1/company/a-sl/activity'],
    ] as const)('%s -> %s', async (tool, path) => {
      await getCompanyTools(client)[tool].handler({ slug: 'a-sl' });
      expect(get()).toHaveBeenCalledWith(path, {});
    });

    it('borme_get_company_relationships passes the filters', async () => {
      await getCompanyTools(client).borme_get_company_relationships.handler({
        slug: 'a-sl',
        type: 'officer',
        confidence: 'high',
      });
      expect(get()).toHaveBeenCalledWith('/api/v1/company/a-sl/relationships', {
        type: 'officer',
        confidence: 'high',
      });
    });

    it('borme_get_company_graph -> /api/v1/grafo/{slug}', async () => {
      await getCompanyTools(client).borme_get_company_graph.handler({ slug: 'a-sl' });
      expect(get()).toHaveBeenCalledWith('/api/v1/grafo/a-sl', { max_children: 10 });
    });

    it('borme_get_similar_companies -> /similar', async () => {
      await getCompanyTools(client).borme_get_similar_companies.handler({ slug: 'a-sl' });
      expect(get()).toHaveBeenCalledWith('/api/v1/company/a-sl/similar', { limit: 8 });
    });

    it('rejects an invalid slug before any request is made', async () => {
      await expect(
        getCompanyTools(client).borme_get_company.handler({ slug: '../admin' })
      ).rejects.toThrow(/Validation error/);
      expect(get()).not.toHaveBeenCalled();
    });
  });

  describe('company sources', () => {
    it.each([
      ['borme_get_company_contracts', '/contracts', { limit: 10 }],
      ['borme_get_company_grants', '/grants', { limit: 20 }],
      ['borme_get_company_ted', '/ted', { limit: 20 }],
      ['borme_get_company_cnmv', '/cnmv', { limit: 5 }],
      ['borme_get_company_wikidata', '/wikidata', {}],
      ['borme_get_company_bde', '/bde', {}],
      ['borme_get_company_sources', '/sources', {}],
    ] as const)('%s -> company/{slug}%s', async (tool, suffix, query) => {
      await getCompanySourceTools(client)[tool].handler({ slug: 'a-sl' });
      expect(get()).toHaveBeenCalledWith(`/api/v1/company/a-sl${suffix}`, query);
    });
  });

  describe('bulletin', () => {
    it('borme_get_daily_summary -> /daily/{date} and condenses the day', async () => {
      get().mockResolvedValue({
        date: '20260707',
        sections: { '1': { Madrid: Array.from({ length: 30 }, (_, i) => ({ i })) } },
        ...boilerplate,
      });
      const result = (await getBulletinTools(client).borme_get_daily_summary.handler({
        date: '2026-07-07',
        province: 'madrid',
      })) as { total_acts: number; returned_acts: number };

      expect(get()).toHaveBeenCalledWith('/api/v1/daily/2026-07-07');
      expect(result.total_acts).toBe(30);
      expect(result.returned_acts).toBe(10);
    });
  });

  describe('persons', () => {
    it('search / get / graph hit the right endpoints', async () => {
      const tools = getPersonTools(client);
      await tools.borme_search_persons.handler({ q: 'garcia lopez' });
      expect(get()).toHaveBeenLastCalledWith('/api/v1/person/search', {
        q: 'garcia lopez',
        limit: 10,
      });
      await tools.borme_get_person.handler({ slug: 'garcia-lopez' });
      expect(get()).toHaveBeenLastCalledWith('/api/v1/persona/garcia-lopez');
      await tools.borme_get_person_graph.handler({ slug: 'garcia-lopez' });
      expect(get()).toHaveBeenLastCalledWith('/api/v1/grafo/persona/garcia-lopez', { limit: 10 });
    });
  });

  describe('sectors', () => {
    it('list_sector_companies defaults sort=recent when a province is given', async () => {
      await getSectorTools(client).borme_list_sector_companies.handler({
        cnae: '62',
        province: 'Madrid',
      });
      expect(get()).toHaveBeenCalledWith('/api/v1/sector/62/companies', {
        limit: 20,
        offset: 0,
        sort: 'recent',
        province: 'Madrid',
      });
    });

    it('list_sector_companies leaves sort to the API default without a province', async () => {
      await getSectorTools(client).borme_list_sector_companies.handler({ cnae: 'J' });
      expect(get()).toHaveBeenCalledWith('/api/v1/sector/J/companies', {
        limit: 20,
        offset: 0,
        sort: undefined,
        province: undefined,
      });
    });

    it('ratios, cnae and tree', async () => {
      const tools = getSectorTools(client);
      await tools.borme_get_sector_ratios.handler({ cnae: '62' });
      expect(get()).toHaveBeenLastCalledWith('/api/v1/sector/62/ratios');
      await tools.borme_get_cnae.handler({ code: '62' });
      expect(get()).toHaveBeenLastCalledWith('/api/v1/cnae/62');
      await tools.borme_get_cnae_tree.handler({});
      expect(get()).toHaveBeenLastCalledWith('/api/v1/cnae/tree');
    });
  });

  describe('legal', () => {
    it('norms, norm, article', async () => {
      const tools = getLegalTools(client);
      await tools.borme_list_legal_norms.handler({});
      expect(get()).toHaveBeenLastCalledWith('/api/v1/legal/norms');
      await tools.borme_get_legal_norm.handler({ slug: 'codigo-de-comercio' });
      expect(get()).toHaveBeenLastCalledWith('/api/v1/legal/norm/codigo-de-comercio');
      await tools.borme_get_legal_article.handler({ norm: 'codigo-de-comercio', n: '160-bis' });
      expect(get()).toHaveBeenLastCalledWith('/api/v1/legal/article/codigo-de-comercio/160-bis');
    });

    it('act map picks the full or the single endpoint', async () => {
      const tools = getLegalTools(client);
      await tools.borme_get_act_map.handler({});
      expect(get()).toHaveBeenLastCalledWith('/api/v1/legal/act-map');
      await tools.borme_get_act_map.handler({ acto: 'constitucion' });
      expect(get()).toHaveBeenLastCalledWith('/api/v1/legal/act-map/constitucion');
    });
  });

  describe('tenders', () => {
    it('search forwards every filter', async () => {
      await getTenderTools(client).borme_search_tenders.handler({
        q: 'limpieza',
        open_only: true,
        published_from: '2026-01-01',
        limit: 5,
      });
      expect(get()).toHaveBeenCalledWith(
        '/api/v1/tenders',
        expect.objectContaining({
          q: 'limpieza',
          open_only: true,
          published_from: '2026-01-01',
          limit: 5,
        })
      );
    });

    it('get / stats / suppliers', async () => {
      const tools = getTenderTools(client);
      await tools.borme_get_tender.handler({ key: '81e28810c6b3502a' });
      expect(get()).toHaveBeenLastCalledWith('/api/v1/tenders/81e28810c6b3502a');
      await tools.borme_get_tender_stats.handler({});
      expect(get()).toHaveBeenLastCalledWith('/api/v1/tenders/stats');
      await tools.borme_list_tender_suppliers.handler({});
      expect(get()).toHaveBeenLastCalledWith('/api/v1/tenders/suppliers', { limit: 10 });
    });
  });

  describe('system', () => {
    it('health, stats, freshness', async () => {
      const tools = getSystemTools(client);
      await tools.borme_get_health.handler({});
      expect(get()).toHaveBeenLastCalledWith('/api/v1/health');
      await tools.borme_get_stats.handler({});
      expect(get()).toHaveBeenLastCalledWith('/api/v1/stats');
      await tools.borme_get_sources_freshness.handler({});
      expect(get()).toHaveBeenLastCalledWith('/api/v1/sources/freshness');
    });
  });
});
