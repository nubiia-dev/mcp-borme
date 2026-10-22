import { OpenMercantilClient } from '../openmercantil-client.js';
import { summarizeDaily } from '../domain/shape.js';
import { getDailySummarySchema } from '../validation.js';
import { defineTool } from './define.js';

/** Daily BORME publication summary. */
export function getBulletinTools(client: OpenMercantilClient) {
  return {
    borme_get_daily_summary: defineTool({
      description:
        'What the BORME published on one date: every registry act grouped by BORME section ' +
        'and province (company, act type, company slug). The raw day can hold thousands of ' +
        'acts, so the response gives exact counts per section and province plus the first ' +
        '`limit` acts per province (default 10). Narrow with `province` and/or `section` ' +
        'before raising the limit. The BORME is not published on Sundays or national holidays ' +
        '(404), and this dataset may lag behind today: check borme_get_health ' +
        '(`latest_borme_processed`) if a recent date is missing.',
      schema: getDailySummarySchema,
      handler: async (args) => {
        const raw = await client.get(`/api/v1/daily/${args.date}`);
        return summarizeDaily(raw, {
          province: args.province,
          section: args.section,
          limit: args.limit,
        });
      },
    }),
  };
}
