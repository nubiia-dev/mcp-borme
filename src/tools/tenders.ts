import { OpenMercantilClient, encodePathSegment as seg } from '../openmercantil-client.js';
import { cleanResponse } from '../domain/shape.js';
import {
  emptySchema,
  getTenderSchema,
  listTenderSuppliersSchema,
  searchTendersSchema,
} from '../validation.js';
import { defineTool } from './define.js';

/** Public procurement notices (PLACSP), complementing the company tools. */
export function getTenderTools(client: OpenMercantilClient) {
  return {
    borme_search_tenders: defineTool({
      description:
        'Search Spanish public procurement notices (PLACSP) by object/buyer text, CPV prefix, ' +
        'phase, province, buyer NIF, supplier CIF, open status, amount range (requires ' +
        'amount_kind) and publication dates. Cursor-paginated: pass back `cursor` for the next ' +
        'page. Constraints: free text cannot be combined with structured filters, and `cpv` ' +
        'combines only with the date filters (otherwise the API answers 422). Supplier names ' +
        'are not searchable; use supplier_cif.',
      schema: searchTendersSchema,
      handler: async (args) =>
        cleanResponse(
          await client.get('/api/v1/tenders', {
            q: args.q,
            cpv: args.cpv,
            phase: args.phase,
            province: args.province,
            buyer_nif: args.buyer_nif,
            supplier_cif: args.supplier_cif,
            open_only: args.open_only,
            amount_kind: args.amount_kind,
            min_amount_eur: args.min_amount_eur,
            max_amount_eur: args.max_amount_eur,
            published_from: args.published_from,
            published_to: args.published_to,
            limit: args.limit,
            cursor: args.cursor,
          })
        ),
    }),

    borme_get_tender: defineTool({
      description:
        'One procurement notice by `key` (from borme_search_tenders): buyer, supplier, lots, ' +
        'CPV codes, procedure, typed amounts and results. Monetary concepts (budget, estimated, ' +
        'award) are never mixed. Uncertain supplier identities are withheld.',
      schema: getTenderSchema,
      handler: async (args) => cleanResponse(await client.get(`/api/v1/tenders/${seg(args.key)}`)),
    }),

    borme_get_tender_stats: defineTool({
      description:
        'Coverage and freshness metrics of the procurement dataset (record counts, geography, ' +
        'documents). No monetary rollups. Use it to judge how complete tender data is.',
      schema: emptySchema,
      handler: async () => cleanResponse(await client.get('/api/v1/tenders/stats')),
    }),

    borme_list_tender_suppliers: defineTool({
      description:
        'Corporate suppliers ranked by number of public contract awards (only suppliers ' +
        'matched to a company by CIF; natural persons omitted; no monetary totals). Default 10, ' +
        'max 50.',
      schema: listTenderSuppliersSchema,
      handler: async (args) =>
        cleanResponse(await client.get('/api/v1/tenders/suppliers', { limit: args.limit })),
    }),
  };
}
