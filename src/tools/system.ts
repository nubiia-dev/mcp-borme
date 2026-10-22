import { OpenMercantilClient } from '../openmercantil-client.js';
import { cleanResponse } from '../domain/shape.js';
import { emptySchema } from '../validation.js';
import { defineTool } from './define.js';

/**
 * Service-level tools. They tell the assistant how fresh and how large the
 * dataset is, which matters because the BORME projection can lag behind the
 * official bulletin.
 */
export function getSystemTools(client: OpenMercantilClient) {
  return {
    borme_get_health: defineTool({
      description:
        'OpenMercantil service status and BORME freshness: `status` (ok/stale), ' +
        '`latest_borme_processed` (last bulletin date loaded), approximate company and event ' +
        'counts and degraded flags. Call it when a recent date or company seems missing, or ' +
        'before stating that something "has not been published yet".',
      schema: emptySchema,
      handler: async () => cleanResponse(await client.get('/api/v1/health')),
    }),

    borme_get_stats: defineTool({
      description:
        'Size of the public dataset: number of legal entities published and an approximate ' +
        'count of person mentions, with the build timestamp.',
      schema: emptySchema,
      handler: async () => cleanResponse(await client.get('/api/v1/stats')),
    }),

    borme_get_sources_freshness: defineTool({
      description:
        'Per-source freshness map (BORME, PLACSP, BDNS, CNMV, annual accounts...): last update ' +
        'time and status of each public source behind the data, including a global label. Use it ' +
        'to qualify how current an answer is. About 12 KB.',
      schema: emptySchema,
      handler: async () => cleanResponse(await client.get('/api/v1/sources/freshness')),
    }),
  };
}
