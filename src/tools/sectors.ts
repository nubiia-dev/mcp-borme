import { OpenMercantilClient, encodePathSegment as seg } from '../openmercantil-client.js';
import { cleanResponse } from '../domain/shape.js';
import {
  emptySchema,
  getCnaeSchema,
  getSectorRatiosSchema,
  listSectorCompaniesSchema,
} from '../validation.js';
import { defineTool } from './define.js';

/** Sector tools, keyed on the CNAE-2009 activity classification. */
export function getSectorTools(client: OpenMercantilClient) {
  return {
    borme_list_sector_companies: defineTool({
      description:
        'List companies of a CNAE sector (1-4 characters: section letter, 2-digit division such ' +
        'as "62" for IT programming/consulting, or a longer code), optionally within one ' +
        'province. Sorted by BORME activity by default; with `province` use sort=recent ' +
        '(default) or oldest. Use for prospecting and market mapping; 20 per page, offset ' +
        'up to 1000. Find codes with borme_get_cnae_tree.',
      schema: listSectorCompaniesSchema,
      handler: async (args) =>
        cleanResponse(
          await client.get(`/api/v1/sector/${seg(args.cnae)}/companies`, {
            limit: args.limit,
            offset: args.offset,
            // The API only accepts recent/oldest together with a province.
            sort: args.sort ?? (args.province ? 'recent' : undefined),
            province: args.province,
          })
        ),
    }),

    borme_get_sector_ratios: defineTool({
      description:
        'Banco de España (Central de Balances) aggregate ratios for a two-digit CNAE division ' +
        'by year (net margin, ROA, ROE...). Sector benchmark only, never company-specific ' +
        'figures. `ratios` is empty when the sector is not in the reviewed aggregate.',
      schema: getSectorRatiosSchema,
      handler: async (args) =>
        cleanResponse(await client.get(`/api/v1/sector/${seg(args.cnae)}/ratios`)),
    }),

    borme_get_cnae: defineTool({
      description:
        'Metadata of a CNAE-2009 code: description, level, parent and number of companies. ' +
        'Works for section letters and two-digit divisions; longer codes may answer 404. Use it ' +
        'to confirm what a `cnae_code` from a company search means.',
      schema: getCnaeSchema,
      handler: async (args) => cleanResponse(await client.get(`/api/v1/cnae/${seg(args.code)}`)),
    }),

    borme_get_cnae_tree: defineTool({
      description:
        'The CNAE-2009 hierarchy (sections and divisions) with company counts, to look up the ' +
        'right sector code for borme_list_sector_companies or borme_get_sector_ratios. About ' +
        '13 KB: call it once, not per question.',
      schema: emptySchema,
      handler: async () => cleanResponse(await client.get('/api/v1/cnae/tree')),
    }),
  };
}
