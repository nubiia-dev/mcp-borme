import {
  OpenMercantilClient,
  QueryParams,
  encodePathSegment as seg,
} from '../openmercantil-client.js';
import { cleanResponse } from '../domain/shape.js';
import {
  companySlugOnlySchema,
  getCompanyCnmvSchema,
  getCompanyContractsSchema,
  getCompanyGrantsSchema,
  getCompanyTedSchema,
} from '../validation.js';
import { defineTool } from './define.js';

/**
 * Per-company data from other public sources linked to the same legal entity
 * (public procurement, grants, stock-market filings, Wikidata, Banco de
 * España sector ratios). Coverage is partial by design: an empty result is
 * never proof that nothing exists upstream.
 */
export function getCompanySourceTools(client: OpenMercantilClient) {
  const fetchCompany = async (slug: string, suffix: string, query: QueryParams = {}) =>
    cleanResponse(await client.get(`/api/v1/company/${seg(slug)}${suffix}`, query));

  return {
    borme_get_company_contracts: defineTool({
      description:
        'Public procurement notices (PLACSP, contrataciondelestado.es) linked to the company ' +
        'by CIF: object, buyer, supplier, CPV codes, procedure, typed amounts (budget, ' +
        'estimated, award) and phase. The link is documentary and does not prove payment or ' +
        'executed spend; amounts of different kinds are never summed. Default 10, max 100.',
      schema: getCompanyContractsSchema,
      handler: async (args) => fetchCompany(args.slug, '/contracts', { limit: args.limit }),
    }),

    borme_get_company_grants: defineTool({
      description:
        'Public grants and subsidies (BDNS) awarded to the company, in integer cents of the ' +
        'awarded amount (never payments). Up to 200 attested rows. May answer 503 ' +
        '`projection_unavailable` when the integrations projection is offline: that is not ' +
        'evidence of "no grants".',
      schema: getCompanyGrantsSchema,
      handler: async (args) => fetchCompany(args.slug, '/grants', { limit: args.limit }),
    }),

    borme_get_company_ted: defineTool({
      description:
        'European public procurement notices (TED) linked to the company NIF: publication ' +
        'number and date, buyer and the official notice URL. Rows do not prove payment or ' +
        'current contractual status. May answer 503 when the integrations projection is offline.',
      schema: getCompanyTedSchema,
      handler: async (args) => fetchCompany(args.slug, '/ted', { limit: args.limit }),
    }),

    borme_get_company_cnmv: defineTool({
      description:
        'Stock-market (CNMV) listing tuple of the company and its most recent regulatory ' +
        'events. Use it to check whether a company is listed. Empty coverage is not proof of ' +
        'non-listing. May answer 503 when the integrations projection is offline.',
      schema: getCompanyCnmvSchema,
      handler: async (args) => fetchCompany(args.slug, '/cnmv', { limit: args.limit }),
    }),

    borme_get_company_wikidata: defineTool({
      description:
        'Wikidata identifiers of the company: Q-id, entity URL, ticker and inception date ' +
        '(CC0 subset only; no labels, logos or websites). Useful to link the company to other ' +
        'datasets. May answer 503 when the integrations projection is offline.',
      schema: companySlugOnlySchema,
      handler: async (args) => fetchCompany(args.slug, '/wikidata'),
    }),

    borme_get_company_bde: defineTool({
      description:
        'Banco de España (Central de Balances) sector ratios for the company’s two-digit ' +
        'CNAE: sector benchmarking such as net margin, ROA and ROE. It is NOT the company’s ' +
        'own financial statements. `coverage_status` tells whether the sector is projected; ' +
        'when it is not, `metrics` is empty.',
      schema: companySlugOnlySchema,
      handler: async (args) => fetchCompany(args.slug, '/bde'),
    }),

    borme_get_company_sources: defineTool({
      description:
        'Coverage of the four external integrations for a company (BDNS grants, CNMV, TED, ' +
        'Wikidata): which are available or empty, with licence metadata. Call it before the ' +
        'individual integration tools to know which ones have data. May answer 503 when the ' +
        'integrations projection is offline.',
      schema: companySlugOnlySchema,
      handler: async (args) => fetchCompany(args.slug, '/sources'),
    }),
  };
}
