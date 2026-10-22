import {
  OpenMercantilClient,
  QueryParams,
  encodePathSegment as seg,
} from '../openmercantil-client.js';
import { cleanResponse, limitArray, trimCompanyReport } from '../domain/shape.js';
import {
  compareCompaniesSchema,
  companySlugOnlySchema,
  getCompanyEventsSchema,
  getCompanyFactsSchema,
  getCompanyGraphSchema,
  getCompanyRelationshipsSchema,
  getCompanySchema,
  getCompanyTimelineSchema,
  getSimilarCompaniesSchema,
  searchCompaniesSchema,
} from '../validation.js';
import { defineTool } from './define.js';

/**
 * Company tools: the core of the BORME. All read-only, all served by the
 * public `/api/v1` read plane. Typical flow:
 * `borme_search_companies` -> `borme_get_company` -> detail tools.
 */
export function getCompanyTools(client: OpenMercantilClient) {
  /** Fetches a company sub-resource and strips licence boilerplate. */
  const fetchCompany = async (slug: string, suffix = '', query: QueryParams = {}) =>
    cleanResponse(await client.get(`/api/v1/company/${seg(slug)}${suffix}`, query));

  return {
    borme_search_companies: defineTool({
      description:
        'Search Spanish companies (BORME / Registro Mercantil) by name, alias or exact CIF. ' +
        'ALWAYS the first step: it returns the `slug` that every other company tool needs, plus ' +
        'CIF, province, CNAE code, share capital (cents), first/last BORME appearance and number ' +
        'of registry acts. Name search is by name prefix, so start with the distinctive start of ' +
        'the legal name (e.g. "Telefónica de España"), not a descriptive phrase. Only legal ' +
        'entities are returned; DNI/NIE never match. Paginate with offset (max 1000).',
      schema: searchCompaniesSchema,
      handler: async (args) =>
        cleanResponse(
          await client.get('/api/v1/search', {
            q: args.q,
            limit: args.limit,
            offset: args.offset,
          })
        ),
    }),

    borme_get_company: defineTool({
      description:
        'Get the BORME report of one company by slug: identity (name, CIF, legal form, status, ' +
        'aliases), KPIs (number of acts, first/last seen), activity timeline by period, top ' +
        'event types and provinces, the most recent registry events, and current and historical ' +
        'officers. Use it for "tell me about company X". `events_limit` (default 10) bounds the ' +
        'event list; page the full history with borme_get_company_events. The report is ' +
        'documentary: it reflects BORME publications, not a certified registry extract.',
      schema: getCompanySchema,
      handler: async (args) =>
        trimCompanyReport(await client.get(`/api/v1/company/${seg(args.slug)}`), args.events_limit),
    }),

    borme_compare_companies: defineTool({
      description:
        'Compare exactly two companies side by side using the stable comparison projection ' +
        '(identity, province, CNAE, registry activity). Cheaper than fetching two full reports ' +
        'when the question is "which of these two ...". Both slugs must come from ' +
        'borme_search_companies.',
      schema: compareCompaniesSchema,
      handler: async (args) =>
        cleanResponse(await client.get('/api/v1/companies/compare', { slugs: args.slugs })),
    }),

    borme_get_company_events: defineTool({
      description:
        'List the BORME events (registry acts) of a company for one calendar year, paginated: ' +
        'date, section, province, act type (Nombramientos, Ceses, Ampliación de capital, ' +
        'Disolución...) and the act text. Defaults to the current year, 20 per page; check ' +
        '`total` and `pages` and use `year` to walk back through the history (data from 2009).',
      schema: getCompanyEventsSchema,
      handler: async (args) =>
        cleanResponse(
          await client.get(`/api/v1/company/${seg(args.slug)}/events`, {
            year: args.year,
            page: args.page,
            page_size: args.page_size,
          })
        ),
    }),

    borme_get_company_facts: defineTool({
      description:
        'Structured facts extracted from the BORME acts of a company, grouped by type ' +
        '(appointments, removals, capital changes, mergers, registered-office moves...) with ' +
        'person name and role when applicable, plus a `summary` with the count per type. Use it ' +
        'to answer "who was appointed / what changed" without reading raw act text.',
      schema: getCompanyFactsSchema,
      handler: async (args) =>
        cleanResponse(
          await client.get(`/api/v1/empresa/${seg(args.slug)}/facts`, { limit: args.limit })
        ),
    }),

    borme_get_company_timeline: defineTool({
      description:
        'Unified chronological timeline of a company combining BORME registry acts and public ' +
        'procurement awards (PLACSP), newest first, each entry with date, category, source, ' +
        'source URL and confidence. The `limit` (default 30) bounds the list; the response ' +
        'reports `events_total`. Amounts are source-reported awards, not proof of payment.',
      schema: getCompanyTimelineSchema,
      handler: async (args) =>
        limitArray(
          (await fetchCompany(args.slug, '/timeline')) as Record<string, unknown>,
          'events',
          args.limit
        ),
    }),

    borme_get_company_officers: defineTool({
      description:
        'Current and historical officers of a company as published in the BORME: ' +
        'administrators, attorneys (apoderados), auditors and similar roles with the date each ' +
        'was first seen. Documentary mentions only: no DNI, no contact data, and a mention does ' +
        'not prove the person still holds the role today. At most 500 mentions.',
      schema: companySlugOnlySchema,
      handler: async (args) => fetchCompany(args.slug, '/officers'),
    }),

    borme_get_company_relationships: defineTool({
      description:
        'Documented relationships between a company and other entities (officers, domicile, ' +
        'contracts, grants, IP assets, corporate links, mentions), each with source, date, ' +
        'confidence and evidence URL. Filter with `type` and `confidence`. Documentary only: ' +
        'a relationship does not imply control, responsibility or current validity.',
      schema: getCompanyRelationshipsSchema,
      handler: async (args) =>
        fetchCompany(args.slug, '/relationships', { type: args.type, confidence: args.confidence }),
    }),

    borme_get_company_graph: defineTool({
      description:
        'Corporate graph centred on a company: parents and children (group structure from ' +
        'GLEIF) with counts and coverage notes. Only entities that pass the OpenMercantil ' +
        'identity policy appear, so an empty graph does not mean the company has no group.',
      schema: getCompanyGraphSchema,
      handler: async (args) =>
        cleanResponse(
          await client.get(`/api/v1/grafo/${seg(args.slug)}`, { max_children: args.max_children })
        ),
    }),

    borme_get_company_activity: defineTool({
      description:
        'Monthly time series of BORME activity for a company (number of registry acts per ' +
        'month, `series: [{period: "2024-05", count: 2}]`). Useful to spot dormant companies ' +
        'or bursts of corporate activity.',
      schema: companySlugOnlySchema,
      handler: async (args) => fetchCompany(args.slug, '/activity'),
    }),

    borme_get_similar_companies: defineTool({
      description:
        'Companies in the same province and two-digit CNAE division, ranked by closeness of ' +
        'BORME act count. A documentary heuristic for finding peers or competitors, not a ' +
        'recommendation or a statement of any relationship.',
      schema: getSimilarCompaniesSchema,
      handler: async (args) => fetchCompany(args.slug, '/similar', { limit: args.limit }),
    }),
  };
}
