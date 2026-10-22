import { OpenMercantilClient, encodePathSegment as seg } from '../openmercantil-client.js';
import { cleanResponse } from '../domain/shape.js';
import { getPersonGraphSchema, getPersonSchema, searchPersonsSchema } from '../validation.js';
import { defineTool } from './define.js';

/**
 * Person tools. OpenMercantil exposes persons only as DOCUMENTARY MENTIONS in
 * the BORME: homonyms are possible, identity is never resolved and no DNI,
 * address or contact data is returned.
 */
export function getPersonTools(client: OpenMercantilClient) {
  return {
    borme_search_persons: defineTool({
      description:
        'Search people mentioned in the BORME by name (usually as officers: administrators, ' +
        'attorneys, auditors). Returns name mentions with `slug`, number of mentions and ' +
        'companies, and first/last seen. These are NOT identity profiles: two people with the ' +
        'same name share one slug. Use the slug with borme_get_person.',
      schema: searchPersonsSchema,
      handler: async (args) =>
        cleanResponse(await client.get('/api/v1/person/search', { q: args.q, limit: args.limit })),
    }),

    borme_get_person: defineTool({
      description:
        'Documentary report of the BORME mentions of a person slug: the companies and roles ' +
        'where the name appears, with dates. Does not infer identity or whether the person ' +
        'still holds a role. Withheld, ambiguous or absent identities answer 404.',
      schema: getPersonSchema,
      handler: async (args) => cleanResponse(await client.get(`/api/v1/persona/${seg(args.slug)}`)),
    }),

    borme_get_person_graph: defineTool({
      description:
        'Person-to-company graph built only from BORME mentions of a person slug: the ' +
        'companies connected to that name. Does not infer control, identity or vigency.',
      schema: getPersonGraphSchema,
      handler: async (args) =>
        cleanResponse(
          await client.get(`/api/v1/grafo/persona/${seg(args.slug)}`, { limit: args.limit })
        ),
    }),
  };
}
